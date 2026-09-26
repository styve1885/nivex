import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SETUP_MINUTES } from "./brand";

/**
 * Neon (Postgres) via HTTP. Une seule connexion logique par instance
 * serverless, et un bootstrap de schéma idempotent exécuté au plus une
 * fois par instance.
 */

function connectionString(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export function isDbConfigured(): boolean {
  return Boolean(connectionString());
}

let _sql: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = connectionString();
  if (!url) throw new DbNotConfiguredError();
  _sql = neon(url);
  return _sql;
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DbNotConfiguredError";
  }
}

let _schema: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!_schema) _schema = bootstrap().catch((e) => { _schema = null; throw e; });
  return _schema;
}

async function bootstrap() {
  const q = sql();

  await q`
    CREATE TABLE IF NOT EXISTS nivex_settings (
      id              integer PRIMARY KEY DEFAULT 1,
      owner_email     text,
      owner_name      text,
      owner_picture   text,
      refresh_token   text,
      calendar_id     text        NOT NULL DEFAULT 'primary',
      timezone        text        NOT NULL DEFAULT 'America/Toronto',
      business_name   text        NOT NULL DEFAULT 'NIVEX',
      hourly_rate     integer     NOT NULL DEFAULT 5000,   -- suit DEFAULT_HOURLY_RATE (settings.ts)
      currency        text        NOT NULL DEFAULT 'CAD',
      min_minutes     integer     NOT NULL DEFAULT 120,
      buffer_minutes  integer     NOT NULL DEFAULT 30,
      lead_hours      integer     NOT NULL DEFAULT 24,
      horizon_days    integer     NOT NULL DEFAULT 45,
      slot_step       integer     NOT NULL DEFAULT 30,
      first_hour_free boolean     NOT NULL DEFAULT true,
      paused          boolean     NOT NULL DEFAULT false,
      hours           jsonb,
      service_area    jsonb,
      services        jsonb,
      connected_at    timestamptz,
      updated_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT nivex_settings_singleton CHECK (id = 1)
    )`;

  await q`
    CREATE TABLE IF NOT EXISTS nivex_bookings (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ref              text UNIQUE NOT NULL,
      manage_token     text UNIQUE NOT NULL,
      locale           text        NOT NULL DEFAULT 'fr',
      status           text        NOT NULL DEFAULT 'confirmed',
      client_name      text        NOT NULL,
      client_email     text        NOT NULL,
      client_phone     text        NOT NULL,
      address          text        NOT NULL,
      city             text        NOT NULL,
      postal_code      text        NOT NULL,
      notes            text,
      items            jsonb       NOT NULL DEFAULT '[]'::jsonb,
      starts_at        timestamptz NOT NULL,
      ends_at          timestamptz NOT NULL,
      duration_minutes integer     NOT NULL,
      estimate_cents   integer     NOT NULL DEFAULT 0,
      currency         text        NOT NULL DEFAULT 'CAD',
      first_hour_free  boolean     NOT NULL DEFAULT false,
      google_event_id  text,
      email_sent       boolean     NOT NULL DEFAULT false,
      created_at       timestamptz NOT NULL DEFAULT now(),
      cancelled_at     timestamptz
    )`;

  await q`CREATE INDEX IF NOT EXISTS nivex_bookings_starts_idx ON nivex_bookings (starts_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS nivex_bookings_email_idx  ON nivex_bookings (lower(client_email))`;

  /*
   * Garde-fou anti double-réservation.
   *
   * L'index unique empêche deux rendez-vous à la même heure pile. Il ne
   * suffit pas : 10 h–13 h et 11 h–12 h ont des heures de début
   * différentes mais se chevauchent. La contrainte d'exclusion ci-dessous
   * ferme la course pour de bon — deux requêtes concurrentes ne peuvent
   * plus insérer des plages qui se recoupent.
   */
  await q`
    CREATE UNIQUE INDEX IF NOT EXISTS nivex_bookings_active_slot_idx
    ON nivex_bookings (starts_at)
    WHERE status IN ('confirmed', 'pending')`;

  await q`
    DO $$ BEGIN
      ALTER TABLE nivex_bookings
        ADD CONSTRAINT nivex_bookings_no_overlap
        EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
        WHERE (status IN ('confirmed', 'pending'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN duplicate_table  THEN NULL;
    END $$`;

  /*
   * L'artisan s'installe un quart d'heure avant et range un quart d'heure
   * après. Deux séances qui se touchent pile — 13 h–15 h puis 15 h–17 h —
   * ne se chevauchent pas sur le papier, mais se chevauchent dans la vraie
   * vie : il range chez l'un pendant qu'il devrait s'installer chez
   * l'autre. La contrainte porte donc sur le temps réellement occupé.
   *
   * Elle remplace la précédente plutôt que de s'y ajouter : plus stricte,
   * elle la contient. Si des rendez-vous déjà pris se touchent de trop
   * près, l'ajout échoue — on laisse alors l'ancienne garde en place et on
   * le consigne, plutôt que de refuser de démarrer.
   *
   * L'intervalle est écrit en toutes lettres parce qu'un paramètre ne
   * s'interpole pas dans un bloc DO. La garde ci-dessous empêche qu'il
   * s'écarte de SETUP_MINUTES sans qu'on s'en aperçoive.
   */
  if (SETUP_MINUTES !== 15) {
    throw new Error(
      `SETUP_MINUTES vaut ${SETUP_MINUTES} : la contrainte nivex_bookings_no_overlap_setup ` +
      "est écrite pour 15 minutes. Mettez les deux d'accord, et renommez la contrainte pour " +
      "que la nouvelle version remplace l'ancienne.",
    );
  }

  await q`
    DO $$ BEGIN
      ALTER TABLE nivex_bookings
        ADD CONSTRAINT nivex_bookings_no_overlap_setup
        EXCLUDE USING gist (
          tstzrange(starts_at - interval '15 minutes', ends_at + interval '15 minutes') WITH &&
        )
        WHERE (status IN ('confirmed', 'pending'));
      ALTER TABLE nivex_bookings DROP CONSTRAINT IF EXISTS nivex_bookings_no_overlap;
    EXCEPTION
      WHEN duplicate_object     THEN NULL;
      WHEN duplicate_table      THEN NULL;
      WHEN exclusion_violation  THEN NULL;
    END $$`;

  /* Messages du formulaire de contact. Conservés même si l'envoi du
     courriel échoue : rien ne doit se perdre. */
  await q`
    CREATE TABLE IF NOT EXISTS nivex_messages (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      locale     text        NOT NULL DEFAULT 'fr',
      name       text        NOT NULL,
      email      text,
      phone      text,
      subject    text,
      body       text        NOT NULL,
      email_sent boolean     NOT NULL DEFAULT false,
      read_at    timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  /* Le courriel n'est plus obligatoire : une demande de créneau peut
     n'arriver qu'avec un nom et un numéro de téléphone. Migration en place
     pour les bases créées avant cette règle. */
  await q`ALTER TABLE nivex_messages ALTER COLUMN email DROP NOT NULL`;

  await q`CREATE INDEX IF NOT EXISTS nivex_messages_created_idx ON nivex_messages (created_at DESC)`;

  /* Journal d'audit léger — utile pour comprendre après coup. */
  await q`
    CREATE TABLE IF NOT EXISTS nivex_events (
      id         bigserial PRIMARY KEY,
      kind       text        NOT NULL,
      detail     jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
}

export async function logEvent(kind: string, detail?: unknown) {
  try {
    await ensureSchema();
    await sql()`INSERT INTO nivex_events (kind, detail) VALUES (${kind}, ${JSON.stringify(detail ?? null)}::jsonb)`;
  } catch {
    /* le journal ne doit jamais faire échouer une requête */
  }
}

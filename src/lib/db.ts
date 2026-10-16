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
      travel_policy   jsonb,
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
   * l'autre. La garde porte donc sur le temps réellement occupé.
   *
   * Elle passe par une fonction déclarée IMMUTABLE parce qu'une contrainte
   * d'exclusion indexe son expression, et qu'un index refuse tout ce qui
   * ne l'est pas. Or `timestamptz - interval` est seulement STABLE aux
   * yeux de Postgres : l'intervalle pourrait contenir des mois ou des
   * jours, dont la durée dépend du fuseau. Ici il ne contient que des
   * minutes, qui durent la même chose partout — la déclaration est donc
   * exacte, et non un passe-droit.
   *
   * Tout ceci est un confort, pas une fondation : la ligne de défense qui
   * compte reste la contrainte simple posée plus haut. Un échec ici ne
   * doit donc jamais empêcher le site de démarrer.
   */
  try {
    /* Les minutes sont écrites en toutes lettres : à l'intérieur d'un corps
       de fonction, un paramètre ne s'interpole pas — il s'y confondrait avec
       les arguments de la fonction elle-même. Si la constante change, on ne
       pose rien plutôt que de poser une garde mensongère. */
    if (SETUP_MINUTES !== 15) {
      throw new Error(`SETUP_MINUTES vaut ${SETUP_MINUTES} ; nivex_occupied est écrite pour 15 minutes.`);
    }

    await q`
      CREATE OR REPLACE FUNCTION nivex_occupied(starts_at timestamptz, ends_at timestamptz)
      RETURNS tstzrange
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
        SELECT tstzrange(
          starts_at - make_interval(mins => 15),
          ends_at   + make_interval(mins => 15)
        )
      $fn$`;

    await q`
      DO $$ BEGIN
        ALTER TABLE nivex_bookings
          ADD CONSTRAINT nivex_bookings_no_overlap_setup
          EXCLUDE USING gist (nivex_occupied(starts_at, ends_at) WITH &&)
          WHERE (status IN ('confirmed', 'pending'));
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END $$`;
  } catch (e) {
    /* Une base sans droit de créer des fonctions, une version de Postgres
       récalcitrante, des rendez-vous déjà trop serrés : aucune de ces
       raisons ne justifie de fermer la maison. */
    console.warn("[nivex] garde anti-chevauchement élargie non posée :", (e as Error).message);
  }

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

  /*
   * Provenance d'une réservation.
   *
   * Ces colonnes arrivent après coup : la table existe déjà en production,
   * et les rendez-vous déjà pris n'ont évidemment pas de provenance. Elles
   * sont donc toutes facultatives, et un ancien rendez-vous se lit comme
   * « provenance inconnue » plutôt que de faire échouer la lecture.
   */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS heard_from     text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS utm_source     text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS utm_medium     text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS utm_campaign   text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS referrer       text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS landing_page   text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS first_seen_at  timestamptz`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS visit_count    integer`;

  /* Frais de déplacement.
   *
   * Dans leur propre colonne, et non fondus dans l'estimation : ils ne sont
   * pas du temps de repassage, l'offre « première heure offerte » n'a donc
   * aucune prise sur eux, et le client comme l'artisan doivent pouvoir lire
   * la ligne séparément. Le libellé de la zone est recopié avec eux — un
   * tarif qui change plus tard ne doit pas réécrire l'histoire d'une
   * réservation déjà prise. */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS travel_fee_cents integer NOT NULL DEFAULT 0`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS travel_zone      text`;

  /* La grille des zones et des frais, réglée depuis /admin.
   *
   * La colonne garde son nom d'origine : elle a porté successivement des
   * zones à frais, une politique de temps de trajet, puis les trois cercles
   * d'aujourd'hui. La renommer obligerait à migrer pour un gain cosmétique,
   * et `readZonePolicy` reconnaît déjà la forme qu'elle doit avoir. */
  await q`ALTER TABLE nivex_settings ADD COLUMN IF NOT EXISTS travel_policy jsonb`;

  /*
   * Journal anonyme des visites.
   *
   * Ce qu'on ne trouvera pas dans cette table : aucune adresse IP, aucun
   * identifiant de visiteur, aucune empreinte d'appareil, aucune clé qui
   * permettrait de recoller deux lignes entre elles. La ville est celle que
   * l'hébergeur déduit du réseau, à la ville près — elle sert à savoir si le
   * quartier répond, pas à retrouver quelqu'un.
   *
   * Une ligne par page vue, sans clé primaire parlante : `bigserial` donne
   * l'ordre d'arrivée, et c'est tout ce dont l'onglet Visites a besoin.
   */
  await q`
    CREATE TABLE IF NOT EXISTS nivex_visits (
      id         bigserial PRIMARY KEY,
      path       text        NOT NULL,
      source     text        NOT NULL DEFAULT 'direct',
      referrer   text,
      device     text        NOT NULL DEFAULT 'ordinateur',
      city       text,
      region     text,
      country    text,
      locale     text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  await q`CREATE INDEX IF NOT EXISTS nivex_visits_created_idx ON nivex_visits (created_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS nivex_visits_source_idx  ON nivex_visits (source)`;
}

export async function logEvent(kind: string, detail?: unknown) {
  try {
    await ensureSchema();
    await sql()`INSERT INTO nivex_events (kind, detail) VALUES (${kind}, ${JSON.stringify(detail ?? null)}::jsonb)`;
  } catch {
    /* le journal ne doit jamais faire échouer une requête */
  }
}

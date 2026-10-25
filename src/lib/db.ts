import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { DEFAULT_ZONE_POLICY, describeChanges, mergeZonesAB, type ZonePolicy } from "./travel";
import { DATACENTER_CITIES, PERSONAL_PATH } from "./attribution";

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
      hourly_rate     integer     NOT NULL DEFAULT 5500,   -- suit DEFAULT_HOURLY_RATE (settings.ts)
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
   * Le temps réellement occupé par une séance, ligne par ligne.
   *
   * `setup_minutes` dit combien de minutes l'artisan passe sur place hors du
   * temps réservé, avant et après la séance. Zéro depuis le 22 octobre 2026 :
   * l'installation et le rangement sont compris dans la séance, et le créneau
   * bloqué est la séance elle-même. Quinze pour les rendez-vous pris avant,
   * et pour les abonnés dont la case « arrivée 15 min avant » est cochée :
   * deux séances qui se touchent pile — 13 h–15 h puis 15 h–17 h — se
   * chevaucheraient dans la vraie vie, l'artisan rangeant chez l'un pendant
   * qu'il devrait s'installer chez l'autre.
   *
   * La valeur par défaut reste quinze : une ligne écrite sans la préciser —
   * par l'ancienne version, le temps d'un déploiement — garde le déroulement
   * qu'on lui a promis. Le code d'aujourd'hui l'écrit toujours.
   */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS setup_minutes integer NOT NULL DEFAULT 15`;

  /*
   * La garde porte sur ce temps occupé. Elle passe par une fonction déclarée
   * IMMUTABLE parce qu'une contrainte d'exclusion indexe son expression, et
   * qu'un index refuse tout ce qui ne l'est pas. Or `timestamptz - interval`
   * est seulement STABLE aux yeux de Postgres : l'intervalle pourrait
   * contenir des mois ou des jours, dont la durée dépend du fuseau. Ici il ne
   * contient que des minutes, qui durent la même chose partout — la
   * déclaration est donc exacte, et non un passe-droit.
   *
   * Tout ceci est un confort, pas une fondation : la ligne de défense qui
   * compte reste la contrainte simple posée plus haut. Un échec ici ne doit
   * donc jamais empêcher le site de démarrer.
   */
  try {
    await q`
      CREATE OR REPLACE FUNCTION nivex_occupied(starts_at timestamptz, ends_at timestamptz, setup_minutes integer)
      RETURNS tstzrange
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
        SELECT tstzrange(
          starts_at - make_interval(mins => setup_minutes),
          ends_at   + make_interval(mins => setup_minutes)
        )
      $fn$`;

    /* Seule la garde déjà posée se tait. Tout autre refus — des rendez-vous
       déjà trop serrés, en tête — remonte jusqu'au `catch` ci-dessous et s'y
       consigne : avalé dans la base, il laissait la garde absente sans que
       rien ne le dise, et retentée en vain à chaque démarrage. */
    await q`
      DO $$ BEGIN
        ALTER TABLE nivex_bookings
          ADD CONSTRAINT nivex_bookings_no_overlap_occupied
          EXCLUDE USING gist (nivex_occupied(starts_at, ends_at, setup_minutes) WITH &&)
          WHERE (status IN ('confirmed', 'pending'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN duplicate_table  THEN NULL;
      END $$`;

    /* L'ancienne garde comptait un quart d'heure autour de toute séance. Elle
       ne tombe qu'une fois la nouvelle en place : si celle-ci échoue, le
       `catch` saute ces lignes et l'ancienne reste. */
    await q`ALTER TABLE nivex_bookings DROP CONSTRAINT IF EXISTS nivex_bookings_no_overlap_setup`;
    await q`DROP FUNCTION IF EXISTS nivex_occupied(timestamptz, timestamptz)`;
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
  /* Le prénom du lien de recommandation suivi, et le nom que la personne
     écrit elle-même sous « Qui vous a recommandé ? ». */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS referral       text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS referred_by    text`;

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
   * zones à frais, une politique de temps de trajet, trois cercles de
   * préfixes, et aujourd'hui des secteurs rattachés à des zones. La renommer
   * obligerait à migrer pour un gain cosmétique, et `readZonePolicy` exige
   * déjà la forme qu'elle doit avoir. */
  await q`ALTER TABLE nivex_settings ADD COLUMN IF NOT EXISTS travel_policy jsonb`;

  /* L'historique de l'onglet « Zones et frais » : une ligne par changement. */
  await q`
    CREATE TABLE IF NOT EXISTS nivex_zone_history (
      id         bigserial PRIMARY KEY,
      summary    text        NOT NULL,
      author     text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  /*
   * La bascule vers les secteurs, écrite une seule fois.
   *
   * Toute grille enregistrée sous une forme antérieure — les trois cercles,
   * ou rien — est remplacée par la grille par défaut, et la bascule se note
   * dans l'historique. Une grille déjà à la forme 2 n'est jamais touchée :
   * la condition ne la retient pas, et un second passage ne fait rien. C'est
   * ce qui rend l'instruction idempotente, et ce qui garantit qu'une valeur
   * réglée depuis /admin ne sera pas écrasée au démarrage suivant.
   */
  await q`
    WITH migre AS (
      UPDATE nivex_settings
      SET travel_policy = ${JSON.stringify(DEFAULT_ZONE_POLICY)}::jsonb, updated_at = now()
      WHERE id = 1 AND (travel_policy IS NULL OR travel_policy->>'version' IS DISTINCT FROM '2')
      RETURNING 1
    )
    INSERT INTO nivex_zone_history (summary, author)
    SELECT ${MIGRATION_NOTE}, 'migration' FROM migre`;

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

  /* Le reste de l'étiquette de campagne, le prénom d'un lien de
     recommandation, et le motif qui fait d'une visite celle d'un robot. Les
     visites d'avant n'ont rien de tout cela : elles se lisent sans campagne,
     sans recommandation, et humaines. */
  await q`ALTER TABLE nivex_visits ADD COLUMN IF NOT EXISTS medium   text`;
  await q`ALTER TABLE nivex_visits ADD COLUMN IF NOT EXISTS campaign text`;
  await q`ALTER TABLE nivex_visits ADD COLUMN IF NOT EXISTS referral text`;
  await q`ALTER TABLE nivex_visits ADD COLUMN IF NOT EXISTS robot    text`;

  /* Les visites venues d'un centre de données avant que le journal ne sache
     les reconnaître. La règle est celle de `isDatacenterVisit`, que les
     nouvelles visites suivent dès leur écriture ; une ligne déjà marquée
     n'est plus retenue, et un second passage ne change rien. Un échec ne
     ferme pas la maison : ce n'est qu'un marquage. */
  try {
    await q`
      UPDATE nivex_visits SET robot = 'centre'
      WHERE robot IS NULL AND upper(country) = 'US' AND source = 'direct'
        AND referral IS NULL AND device = 'ordinateur'
        AND lower(city) = ANY(${[...DATACENTER_CITIES]}::text[])`;
  } catch (e) {
    console.warn("[nivex] visites de centres de données non marquées :", (e as Error).message);
  }

  /* Les liens personnels de réservation et d'abonnement se comptaient avant
     que le journal ne les écarte (`isPrivatePath`), et leur adresse porte le
     jeton du rendez-vous. Ces lignes s'effacent ; il n'en entre plus, et un
     second passage ne trouve rien. Un échec ne ferme pas la maison. */
  try {
    await q`DELETE FROM nivex_visits WHERE path ~ ${PERSONAL_PATH}::text`;
    /* Le même jeton a pu entrer par le référent : du 15 au 18 octobre 2026, la
       mesure envoyait le référent brut, et une page du site ouverte depuis un
       lien personnel le gardait. Seul le référent s'efface, la visite reste. */
    await q`
      UPDATE nivex_visits SET referrer = NULL
      WHERE referrer ~ ${`^https?://[^/]+${PERSONAL_PATH.slice(1)}`}::text`;
  } catch (e) {
    console.warn("[nivex] liens personnels non effacés du journal :", (e as Error).message);
  }

  /*
   * Abonnements.
   *
   * Un abonnement ne porte que ce qui ne se déduit pas : la formule telle
   * qu'elle était à la souscription, le montant du cycle et les frais par
   * visite figés ce jour-là — le tarif est garanti douze mois, une hausse du
   * taux horaire ne doit pas les toucher —, la grille des dates et les
   * paiements reçus. Le cycle en cours, le rang d'une visite, la fin des
   * douze mois se recalculent à partir des visites (cycles.ts).
   *
   * Chaque visite reste une ligne de nivex_bookings : la contrainte de
   * non-chevauchement la protège comme n'importe quel rendez-vous, et le
   * moteur de créneaux la voit sans rien savoir des abonnements.
   */
  await q`
    CREATE TABLE IF NOT EXISTS nivex_subscriptions (
      id                uuid PRIMARY KEY,
      ref               text UNIQUE NOT NULL,
      manage_token      text UNIQUE NOT NULL,
      locale            text        NOT NULL DEFAULT 'fr',
      status            text        NOT NULL DEFAULT 'active',
      plan_key          text        NOT NULL,
      plan_name         text        NOT NULL,
      visits_per_cycle  integer     NOT NULL,
      every_weeks       integer     NOT NULL,
      minutes_per_visit integer     NOT NULL,
      grid_anchor       text        NOT NULL,
      grid_hm           text        NOT NULL,
      client_name       text        NOT NULL,
      client_email      text        NOT NULL,
      client_phone      text        NOT NULL,
      address           text        NOT NULL,
      city              text        NOT NULL,
      postal_code       text        NOT NULL,
      notes             text,
      cycle_cents       integer     NOT NULL,
      travel_fee_cents  integer     NOT NULL DEFAULT 0,
      travel_zone       text,
      currency          text        NOT NULL DEFAULT 'CAD',
      start_cycle       integer     NOT NULL DEFAULT 1,
      start_done        integer     NOT NULL DEFAULT 0,
      paid_cycles       jsonb       NOT NULL DEFAULT '{}'::jsonb,
      pending_makeups   integer     NOT NULL DEFAULT 0,
      notice_series     integer     NOT NULL DEFAULT 0,
      created_by        text        NOT NULL DEFAULT 'client',
      created_at        timestamptz NOT NULL DEFAULT now(),
      ended_at          timestamptz
    )`;

  await q`CREATE INDEX IF NOT EXISTS nivex_subscriptions_email_idx ON nivex_subscriptions (lower(client_email))`;

  /* Le montant encaissé de chaque cycle, noté avec le paiement : des frais
     changés ensuite ne réécrivent pas un cycle déjà reçu. Les cycles payés
     avant n'en ont pas, et se lisent au montant du jour. */
  await q`ALTER TABLE nivex_subscriptions ADD COLUMN IF NOT EXISTS paid_amounts jsonb NOT NULL DEFAULT '{}'::jsonb`;

  /* Le lien entre une visite et son abonnement. Facultatif : une séance
   * ponctuelle n'en a pas, et toutes celles d'avant n'en avaient pas.
   * `done_at` est posé par le bouton « visite effectuée » — c'est lui qui
   * fait avancer le compteur du cycle, pas l'heure qui passe. */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS subscription_id  uuid`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS series_no        integer`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS makeup           boolean NOT NULL DEFAULT false`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS done_at          timestamptz`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS google_series_id text`;

  /* Le rappel par texto, noté à part du courriel : l'un peut partir sans
     l'autre, et une séance ponctuelle ne reçoit que le texto. */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS sms_reminded_at  timestamptz`;
  await q`CREATE INDEX IF NOT EXISTS nivex_bookings_subscription_idx ON nivex_bookings (subscription_id) WHERE subscription_id IS NOT NULL`;

  /* Le remerciement après la séance : le lien d'avis de la fiche Google,
     collé dans Réglages, et l'heure où la demande est partie. Une seule par
     client : la date posée sur une de ses lignes suffit à ne plus le
     relancer. */
  await q`ALTER TABLE nivex_settings ADD COLUMN IF NOT EXISTS review_url      text`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS review_asked_at timestamptz`;

  /* L'arrivée d'un abonné : quinze minutes avant pour ceux d'avant le
     22 octobre 2026 (voir `setup_minutes` plus haut), zéro pour les autres.
     Ses visites à venir en héritent. */
  await q`ALTER TABLE nivex_subscriptions ADD COLUMN IF NOT EXISTS setup_minutes integer NOT NULL DEFAULT 15`;

  /* Le texto « je serai chez vous », programmé chez Twilio deux heures avant
     l'arrivée : l'heure prévue réserve l'envoi, l'identifiant du message
     permet de l'annuler quand la séance bouge. */
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS sms_soon_at  timestamptz`;
  await q`ALTER TABLE nivex_bookings ADD COLUMN IF NOT EXISTS sms_soon_sid text`;

  /*
   * Les migrations de données qui ne s'écrivent qu'une fois.
   *
   * Un réglage enregistré l'emporte sur le code, et `bootstrap()` repasse à
   * chaque instance froide : une mise à jour écrite ici sans garde
   * ramènerait sa valeur chaque fois que l'artisan la change. Le nom inscrit
   * dans cette table la rend unique, et l'écriture se fait dans la même
   * instruction que l'inscription.
   */
  await q`
    CREATE TABLE IF NOT EXISTS nivex_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

  /* Les pages déjà signalées à IndexNow, avec la date envoyée : la suivante
     ne renvoie que ce qui a changé (lib/indexnow.ts). Rien de personnel.

     `IF NOT EXISTS` ne protège pas d'une création simultanée : la première
     construction qui pose la table le fait depuis plusieurs ouvriers à la
     fois, et le perdant reçoit une violation d'unicité sur le catalogue
     (pg_type), ce qui faisait échouer la construction. Le bloc l'absorbe :
     la table existe alors, posée par l'autre. */
  await q`
    DO $$ BEGIN
      CREATE TABLE IF NOT EXISTS nivex_indexnow (
        url          text PRIMARY KEY,
        updated      text        NOT NULL,
        submitted_at timestamptz NOT NULL DEFAULT now()
      );
    EXCEPTION
      WHEN unique_violation THEN NULL;
      WHEN duplicate_table  THEN NULL;
    END $$`;

  /* L'empreinte du contenu public tiré des réglages, et le jour où elle a
     changé (lib/freshness.ts) : une seule ligne. Même garde que la table
     d'IndexNow contre les constructions simultanées. */
  await q`
    DO $$ BEGIN
      CREATE TABLE IF NOT EXISTS nivex_public_content (
        id          int         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        fingerprint text        NOT NULL,
        changed_on  text        NOT NULL DEFAULT '',
        checked_at  timestamptz NOT NULL DEFAULT now()
      );
    EXCEPTION
      WHEN unique_violation THEN NULL;
      WHEN duplicate_table  THEN NULL;
    END $$`;

  /* Le taux horaire passe de 50 $ à 55 $ le 22 octobre 2026. Seulement s'il
     valait encore 50 $ : un autre taux est un choix de l'artisan. */
  await q`
    WITH done AS (
      INSERT INTO nivex_migrations (name) VALUES ('tarif-2026-55')
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    )
    UPDATE nivex_settings SET hourly_rate = 5500, updated_at = now()
    WHERE id = 1 AND hourly_rate = 5000 AND EXISTS (SELECT 1 FROM done)`;

  /* Le 23 octobre 2026, deux zones au lieu de trois : la zone A absorbe la
     zone B, sans frais ; la zone C devient la zone B, à 15 $ et 10 $
     (`mergeZonesAB`). Les réservations et les abonnements gardent les frais
     qu'ils portent. La grille ne change que si elle est encore celle qu'on
     vient de lire : un enregistrement depuis /admin au même instant
     l'emporte, et la migration repasse au démarrage suivant. Une grille
     sans zone C n'a rien à transformer : la migration s'inscrit seule. */
  const zonesDone = (await q`SELECT 1 FROM nivex_migrations WHERE name = 'zones-2026-ab'`).length > 0;
  if (!zonesDone) {
    const row = (await q`SELECT travel_policy FROM nivex_settings WHERE id = 1`)[0] as { travel_policy?: unknown } | undefined;
    const before = row?.travel_policy;
    const after = mergeZonesAB(before);
    if (!after) {
      await q`INSERT INTO nivex_migrations (name) VALUES ('zones-2026-ab') ON CONFLICT (name) DO NOTHING`;
    } else {
      const changes = [ZONES_NOTE, ...describeChanges(before as ZonePolicy, after)];
      await q`
        WITH upd AS (
          UPDATE nivex_settings SET travel_policy = ${JSON.stringify(after)}::jsonb, updated_at = now()
          WHERE id = 1 AND travel_policy = ${JSON.stringify(before)}::jsonb
            AND NOT EXISTS (SELECT 1 FROM nivex_migrations WHERE name = 'zones-2026-ab')
          RETURNING 1
        ), done AS (
          INSERT INTO nivex_migrations (name) SELECT 'zones-2026-ab' FROM upd
          ON CONFLICT (name) DO NOTHING
          RETURNING name
        )
        INSERT INTO nivex_zone_history (summary, author)
        SELECT value, 'migration'
        FROM jsonb_array_elements_text(${JSON.stringify(changes)}::jsonb) WITH ORDINALITY
        WHERE EXISTS (SELECT 1 FROM done)
        ORDER BY ordinality`;
    }
  }
}

/* La première ligne de l'historique de la migration des zones. */
const ZONES_NOTE = "Deux zones au lieu de trois : la zone A réunit les anciennes zones A et B, sans frais ; "
  + "l'ancienne zone C devient la zone B, à 15 $ sous 3 h et 10 $ à partir de 3 h.";

/* La note de la bascule, écrite depuis la grille qu'elle pose. */
const MIGRATION_NOTE = (() => {
  const $ = (c: number) => `${c / 100} $`;
  const zones = DEFAULT_ZONE_POLICY.zones.map((z) =>
    `${z.nameFr} (${z.shortFeeCents === z.longFeeCents ? $(z.shortFeeCents) : `${$(z.shortFeeCents)} / ${$(z.longFeeCents)}`})`);
  return `Grille remplacée par les ${DEFAULT_ZONE_POLICY.sectors.length} secteurs du profil Google : ${zones.join(", ")}.`;
})();

export async function logEvent(kind: string, detail?: unknown) {
  try {
    await ensureSchema();
    await sql()`INSERT INTO nivex_events (kind, detail) VALUES (${kind}, ${JSON.stringify(detail ?? null)}::jsonb)`;
  } catch {
    /* le journal ne doit jamais faire échouer une requête */
  }
}

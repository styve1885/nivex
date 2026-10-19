import { createHash } from "node:crypto";
import { ensureSchema, sql } from "./db";
import { deleteEvent, ownerAccessToken } from "./google";
import { getSettingsStrict } from "./settings";
import { purgeOldVisits } from "./visits";

/**
 * Les durées de conservation que promet la politique de confidentialité,
 * tenues par la tâche quotidienne.
 *
 * Le journal technique s'efface après douze mois, un message du formulaire
 * après deux ans. Un rendez-vous ne s'efface pas : trois ans après la séance
 * — après la dernière visite, pour un abonnement —, il est anonymisé. Restent
 * la date, la durée, les prestations, les montants et la zone, pour la
 * comptabilité, et la famille de la provenance pour le bilan par source.
 * Partent le nom, le téléphone, l'adresse, les précisions et ce qui
 * retraçait la visite sur le site.
 *
 * Du courriel ne reste qu'une empreinte. Elle ne se relit pas, mais elle
 * tient la première heure offerte à une fois par client : effacer la ligne,
 * ou le courriel tout entier, la rendrait de nouveau offerte.
 *
 * Chaque étape est idempotente : une ligne déjà traitée ne répond plus aux
 * conditions, et un second passage le même jour ne trouve rien.
 */

export const EVENTS_RETENTION_MONTHS = 12;
export const MESSAGES_RETENTION_YEARS = 2;
export const BOOKINGS_RETENTION_YEARS = 3;

/** Le début d'un courriel anonymisé. Aucune adresse réelle ne commence ainsi. */
const ERASED = "efface:";
const ERASED_NAME = "Client effacé";

/**
 * L'empreinte qui remplace un courriel anonymisé.
 *
 * Salée par le secret de session : qui n'a que la base ne peut pas vérifier
 * qu'une adresse y figure. Changer `SESSION_SECRET` rend les anciennes
 * empreintes muettes ; la première heure redeviendrait offerte à ces
 * clients-là, rien de plus.
 */
export function erasedEmail(email: string): string {
  const salt = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || "nivex";
  return ERASED + createHash("sha256").update(`${salt}:${email.trim().toLowerCase()}`, "utf8").digest("hex");
}

type Row = Record<string, unknown>;

/** Ce que la purge a fait, pour le journal. */
export type Purged = { events: number; messages: number; visits: number; subscriptions: number; bookings: number };

export async function purgeExpired(): Promise<Purged> {
  await ensureSchema();
  const q = sql();
  const count = (rows: unknown) => Number((rows as Row[])[0]?.n ?? 0);

  const events = count(await q`
    WITH d AS (
      DELETE FROM nivex_events WHERE created_at < now() - make_interval(months => ${EVENTS_RETENTION_MONTHS}) RETURNING 1
    ) SELECT count(*)::int AS n FROM d`);

  const messages = count(await q`
    WITH d AS (
      DELETE FROM nivex_messages WHERE created_at < now() - make_interval(years => ${MESSAGES_RETENTION_YEARS}) RETURNING 1
    ) SELECT count(*)::int AS n FROM d`);

  /* Le journal des visites s'efface aussi au passage d'une visite sur
     cinquante ; ici, il tient ses douze mois même quand personne ne vient. */
  const visits = await purgeOldVisits();

  /* Les abonnements d'abord : trois ans après la dernière visite posée, qu'ils
     aient été clos ou qu'on ait oublié de le faire. Un abonnement qui a
     encore une visite à venir ne répond jamais à la condition. */
  const subs = (await q`
    SELECT s.id, s.client_email FROM nivex_subscriptions s
    WHERE s.client_email NOT LIKE ${`${ERASED}%`}
      AND coalesce((SELECT max(b.starts_at) FROM nivex_bookings b WHERE b.subscription_id = s.id), s.created_at)
          < now() - make_interval(years => ${BOOKINGS_RETENTION_YEARS})
    LIMIT 200`) as Row[];
  if (subs.length > 0) {
    const list = subs.map((r) => ({ id: r.id as string, erased: erasedEmail(String(r.client_email)) }));
    await q`
      UPDATE nivex_subscriptions x SET
        status = 'ended',
        ended_at = coalesce(x.ended_at, (SELECT max(b.starts_at) FROM nivex_bookings b WHERE b.subscription_id = x.id), now()),
        client_name = ${ERASED_NAME}, client_email = r.erased, client_phone = '',
        address = '', city = '', postal_code = '', notes = NULL
      FROM jsonb_to_recordset(${JSON.stringify(list)}::jsonb) AS r(id uuid, erased text)
      WHERE x.id = r.id`;
  }

  /* Puis les rendez-vous : les séances ponctuelles de plus de trois ans, et
     les visites des abonnements anonymisés, y compris ceux d'un passage
     précédent qui n'aurait pas tout pris. De la provenance restent l'étiquette
     de campagne, la réponse à « Comment avez-vous connu NIVEX ? », le prénom
     du lien de recommandation et le domaine du site d'où venait le client :
     de quoi tenir le bilan par source, rien qui le désigne. */
  const rows = (await q`
    SELECT id, client_email FROM nivex_bookings
    WHERE client_email NOT LIKE ${`${ERASED}%`}
      AND ((subscription_id IS NULL AND starts_at < now() - make_interval(years => ${BOOKINGS_RETENTION_YEARS}))
        OR subscription_id IN (SELECT id FROM nivex_subscriptions WHERE client_email LIKE ${`${ERASED}%`}))
    LIMIT 2000`) as Row[];
  if (rows.length > 0) {
    const list = rows.map((r) => ({ id: r.id as string, erased: erasedEmail(String(r.client_email)) }));
    await q`
      UPDATE nivex_bookings x SET
        client_name = ${ERASED_NAME}, client_email = r.erased, client_phone = '',
        address = '', city = '', postal_code = '', notes = NULL,
        referrer = substring(x.referrer from '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]+'),
        landing_page = NULL, first_seen_at = NULL, visit_count = NULL, referred_by = NULL
      FROM jsonb_to_recordset(${JSON.stringify(list)}::jsonb) AS r(id uuid, erased text)
      WHERE x.id = r.id`;
  }

  return { events, messages, visits, subscriptions: subs.length, bookings: rows.length };
}

/**
 * Les copies dans l'agenda de l'artisan. L'événement d'une séance porte le
 * nom, l'adresse, le téléphone et les précisions du client : il s'efface
 * quand la ligne est anonymisée, sans avis à personne. Pour un abonnement,
 * c'est l'événement récurrent de la série qui part, ses occurrences avec lui.
 *
 * Sans Google branché, ou si l'appel échoue, l'identifiant reste en base et
 * la tâche réessaie le lendemain. L'agenda se lit en mode strict : un agenda
 * par défaut répondrait « introuvable », que Google compte comme un succès,
 * et l'identifiant s'effacerait avec l'événement toujours en place.
 */
export async function purgeCalendarCopies(): Promise<number> {
  const at = await ownerAccessToken().catch(() => null);
  if (!at) return 0;
  const { calendarId } = await getSettingsStrict();
  const q = sql();
  const rows = (await q`
    SELECT id, google_event_id, google_series_id FROM nivex_bookings
    WHERE client_email LIKE ${`${ERASED}%`}
      AND (google_event_id IS NOT NULL OR google_series_id IS NOT NULL)
    LIMIT 200`) as Row[];
  if (rows.length === 0) return 0;

  const master = (r: Row) => (r.google_series_id ? String(r.google_series_id) : null);
  const targets = [...new Set(rows.map((r) => master(r) ?? String(r.google_event_id)))];
  const gone = new Set<string>();
  for (const id of targets) {
    try {
      await deleteEvent(at, calendarId, id, { notify: false });
      gone.add(id);
    } catch {
      /* Le lendemain. */
    }
  }

  const cleared = rows.filter((r) => gone.has(master(r) ?? String(r.google_event_id))).map((r) => r.id as string);
  if (cleared.length > 0) {
    await q`UPDATE nivex_bookings SET google_event_id = NULL, google_series_id = NULL WHERE id = ANY(${cleared}::uuid[])`;
  }
  return gone.size;
}

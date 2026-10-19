import { z } from "zod";
import { ensureSchema, sql, logEvent } from "./db";
import { bookingRef, token } from "./crypto";
import { getSettings, getSettingsStrict, type Settings } from "./settings";
import {
  bookingGroup, clip, heardFromText, isHeardFrom, isStoredHeardFrom, referrerHost, refName,
  type SourceGroup, type StoredHeardFrom,
} from "./attribution";
import { estimateCents, estimateMinutes, loadBusy, slotIsFree } from "./availability";
import { bookable, evaluateZone } from "./travel";
import { createEvent, deleteEvent, ownerAccessToken, sendGmail, siteOrigin, GoogleError } from "./google";
import { clientCancellation, clientConfirmation, ownerNotification, type BookingEmailData } from "./email";
import { formatDateTime, minutesToText, formatMoney } from "./time";
import { canSubscriberChange } from "./cycles";
import { ownerSmsNumber, sendSms, SMS, smsWhen } from "./sms";
import { contactEmail, CANCEL_WINDOW_HOURS, FIRST_FREE_MIN_MINUTES, PHONE, REQUEST_INBOX, SETUP_MINUTES } from "./brand";

/* ============================ Schéma d'entrée ============================ */

const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export const BookingInput = z.object({
  locale: z.enum(["fr", "en"]).default("fr"),
  items: z.array(z.object({ key: z.string().min(1).max(40), qty: z.number().int().min(1).max(200) })).min(1).max(20),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().min(4).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(POSTAL).max(10),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  startsAt: z.string().datetime({ offset: true }),
  consent: z.literal(true),
  hp: z.string().max(0).optional(),          // pot de miel anti-robot

  /* « Comment nous avez-vous connus ? » — facultatif, et volontairement une
     liste fermée : une réponse libre finirait par contenir des choses qu'on
     n'a pas demandées. C'est `isHeardFrom` qui tranche plus bas ; ici on se
     contente d'accepter une chaîne, pour la raison dite juste après. */
  heardFrom: z.unknown().optional(),
  /* « Qui vous a recommandé ? » — gardé seulement avec la réponse
     « La recommandation d'un proche ». */
  referredBy: z.unknown().optional(),

  /* Provenance relevée par le navigateur à la première visite. Elle arrive
     avec le formulaire et pas avant : tant que la personne n'a rien demandé,
     le serveur n'en sait rien.
     
     Aucune contrainte de forme ici, et c'est délibéré. Ces champs viennent du
     navigateur du visiteur : une étiquette de campagne à rallonge, un référent
     de huit cents caractères, un compteur abîmé par une extension. Un schéma
     strict répondrait 400 et la personne ne pourrait plus réserver — elle
     perdrait sa séance pour un renseignement de marketing. La provenance est
     un agrément : elle se nettoie dans `cleanOrigin`, champ par champ, et ce
     qui ne tient pas est jeté plutôt que refusé. */
  attribution: z.unknown().optional(),
});

export type BookingInputType = z.infer<typeof BookingInput>;

export type Booking = {
  id: string; ref: string; manageToken: string; locale: "fr" | "en"; status: string;
  clientName: string; clientEmail: string; clientPhone: string;
  address: string; city: string; postalCode: string; notes: string | null;
  items: { key: string; label: string; qty: number }[];
  startsAt: Date; endsAt: Date; durationMinutes: number;
  estimateCents: number; currency: string; firstHourFree: boolean;
  /* Les frais de route, à part de l'estimation : voir travel.ts. */
  travelFeeCents: number; travelZone: string | null;
  googleEventId: string | null; emailSent: boolean;
  createdAt: Date; cancelledAt: Date | null;
  /* D'où vient ce client — vide pour les rendez-vous pris avant la mesure. */
  origin: BookingOrigin;
  /* Une visite d'abonnement : vide pour une séance ponctuelle. */
  subscriptionId: string | null; seriesNo: number | null; makeup: boolean;
  doneAt: Date | null; reminderSentAt: Date | null; googleSeriesId: string | null;
};

/**
 * La provenance telle qu'elle est relue en base.
 *
 * `heardFrom` est la réponse donnée à la main ; le reste a été relevé par le
 * navigateur. Les deux se complètent plus qu'ils ne se recoupent : une carte
 * remise en main propre ne laisse aucune trace technique, et une campagne
 * étiquetée ne dit pas pourquoi la personne a cliqué.
 */
export type BookingOrigin = {
  heardFrom: StoredHeardFrom | null;
  /** Le nom écrit sous « Qui vous a recommandé ? ». */
  referredBy: string | null;
  /** Le prénom du lien de recommandation suivi (?ref=). */
  referral: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landing: string | null;
  firstSeenAt: Date | null;
  visits: number | null;
};

type Row = Record<string, unknown>;

export function hydrate(r: Row): Booking {
  return {
    id: r.id as string, ref: r.ref as string, manageToken: r.manage_token as string,
    locale: (r.locale as "fr" | "en") ?? "fr", status: r.status as string,
    clientName: r.client_name as string, clientEmail: r.client_email as string, clientPhone: r.client_phone as string,
    address: r.address as string, city: r.city as string, postalCode: r.postal_code as string,
    notes: (r.notes as string) ?? null,
    items: (r.items as Booking["items"]) ?? [],
    startsAt: new Date(r.starts_at as string), endsAt: new Date(r.ends_at as string),
    durationMinutes: Number(r.duration_minutes), estimateCents: Number(r.estimate_cents),
    currency: r.currency as string, firstHourFree: r.first_hour_free === true,
    travelFeeCents: Number(r.travel_fee_cents ?? 0),
    travelZone: (r.travel_zone as string) ?? null,
    googleEventId: (r.google_event_id as string) ?? null,
    emailSent: r.email_sent === true,
    createdAt: new Date(r.created_at as string),
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at as string) : null,
    origin: {
      heardFrom: isStoredHeardFrom(r.heard_from) ? r.heard_from : null,
      referredBy: (r.referred_by as string) ?? null,
      referral: (r.referral as string) ?? null,
      source: (r.utm_source as string) ?? null,
      medium: (r.utm_medium as string) ?? null,
      campaign: (r.utm_campaign as string) ?? null,
      referrer: (r.referrer as string) ?? null,
      landing: (r.landing_page as string) ?? null,
      firstSeenAt: r.first_seen_at ? new Date(r.first_seen_at as string) : null,
      visits: r.visit_count == null ? null : Number(r.visit_count),
    },
    subscriptionId: (r.subscription_id as string) ?? null,
    seriesNo: r.series_no == null ? null : Number(r.series_no),
    makeup: r.makeup === true,
    doneAt: r.done_at ? new Date(r.done_at as string) : null,
    reminderSentAt: r.reminder_sent_at ? new Date(r.reminder_sent_at as string) : null,
    googleSeriesId: (r.google_series_id as string) ?? null,
  };
}

export class BookingError extends Error {
  constructor(
    public code:
      | "not_connected" | "slot_taken" | "invalid_slot" | "paused"
      | "unknown_service" | "out_of_area",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BookingError";
  }
}

/* ============================ Création ============================ */

export async function createBooking(input: BookingInputType, host?: string | null): Promise<Booking> {
  /* Lus strictement : une base muette lève une erreur ici, au lieu de
     laisser réserver une maison en pause, au tarif et dans les zones par
     défaut. */
  const settings = await getSettingsStrict();

  /* Seule la mise en pause ferme vraiment la porte : c'est une décision de
     l'artisan. Un compte Google injoignable, lui, ne doit pas empêcher un
     client de réserver — le rendez-vous s'inscrit en base, qui porte la
     garantie de non-chevauchement, et l'agenda comme les courriels suivent
     dès qu'ils le peuvent. Un incident chez Google ne ferme pas la maison. */
  if (settings.paused) throw new BookingError("paused");

  const accessToken = await ownerAccessToken().catch(() => null);

  // On ne fait jamais confiance aux durées ni aux prix venus du navigateur.
  const known = new Set(settings.services.filter((s) => s.enabled).map((s) => s.key));
  const items = input.items.filter((i) => known.has(i.key));
  if (items.length === 0) throw new BookingError("unknown_service");

  const durationMinutes = estimateMinutes(items, settings);
  if (durationMinutes <= 0) throw new BookingError("unknown_service");

  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  /* Occupations connues : l'agenda quand il répond, la base sinon. */
  const busy = await loadBusy({
    accessToken, settings,
    timeMin: new Date(start.getTime() - 24 * 3600_000),
    timeMax: new Date(end.getTime() + 24 * 3600_000),
  }).catch(() => []);
  if (!slotIsFree(input.startsAt, durationMinutes, busy, settings)) throw new BookingError("invalid_slot");

  await ensureSchema();
  const firstHourFree =
    settings.firstHourFree
    && durationMinutes >= FIRST_FREE_MIN_MINUTES
    && (await isFirstBooking(input.email));
  const cents = estimateCents(durationMinutes, settings, firstHourFree);

  /* La zone, décidée ici et jamais reprise du navigateur — comme la durée et
     le prix. Le tunnel a déjà posé la même question en chemin, mais c'est cet
     appel-ci qui engage la maison : entre les deux, un réglage a pu changer.
     Et les frais se calculent sur la durée réservée, pas sur le temps
     facturé : une heure offerte ne raccourcit pas la route. */
  const verdict = evaluateZone(input.postalCode, durationMinutes, settings.zonePolicy);
  if (!bookable(verdict)) throw new BookingError("out_of_area");

  const labelled = items.map((i) => {
    const svc = settings.services.find((s) => s.key === i.key)!;
    return { key: i.key, label: input.locale === "en" ? svc.en : svc.fr, qty: i.qty };
  });

  const ref = bookingRef();
  const manageToken = token(24);
  const provenance = cleanOrigin(input);

  let rows: Row[];
  try {
    rows = (await sql()`
      INSERT INTO nivex_bookings (
        ref, manage_token, locale, status, client_name, client_email, client_phone,
        address, city, postal_code, notes, items, starts_at, ends_at,
        duration_minutes, estimate_cents, currency, first_hour_free,
        travel_fee_cents, travel_zone,
        heard_from, utm_source, utm_medium, utm_campaign,
        referrer, landing_page, first_seen_at, visit_count, referral, referred_by
      ) VALUES (
        ${ref}, ${manageToken}, ${input.locale}, 'confirmed', ${input.name}, ${input.email}, ${input.phone},
        ${input.address}, ${input.city}, ${input.postalCode.toUpperCase()}, ${input.notes || null},
        ${JSON.stringify(labelled)}::jsonb, ${start.toISOString()}, ${end.toISOString()},
        ${durationMinutes}, ${cents}, ${settings.currency}, ${firstHourFree},
        ${verdict.feeCents}, ${verdict.labelFr},
        ${provenance.heardFrom}, ${provenance.source}, ${provenance.medium}, ${provenance.campaign},
        ${provenance.referrer}, ${provenance.landing}, ${provenance.firstSeenAt}, ${provenance.visits},
        ${provenance.referral}, ${provenance.referredBy}
      ) RETURNING *`) as Row[];
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    // 23505 : index unique · 23P01 : contrainte d'exclusion (chevauchement)
    if (/duplicate key|unique|conflicting key value|exclusion constraint|23P01/i.test(msg)) {
      throw new BookingError("slot_taken");
    }
    throw e;
  }

  const booking = hydrate(rows[0]);
  const origin = siteOrigin(host);

  /* — Agenda Google : l'invitation part vers le client — */
  if (accessToken) try {
    const ev = await createEvent(accessToken, {
      calendarId: settings.calendarId,
      ...calendarEvent(booking, origin, settings.timezone),
      timeZone: settings.timezone,
      attendeeEmail: booking.clientEmail,
      attendeeName: booking.clientName,
    });
    await sql()`UPDATE nivex_bookings SET google_event_id = ${ev.id} WHERE id = ${booking.id}`;
    booking.googleEventId = ev.id;
  } catch (e) {
    // La réservation existe : on la garde, l'artisan sera prévenu par courriel.
    await logEvent("calendar_insert_failed", { ref, error: String((e as Error).message).slice(0, 500) });
  } else {
    await logEvent("calendar_skipped", { ref, reason: "no_access_token" });
  }

  /* — Courriels (au mieux : jamais bloquants) — */
  booking.emailSent = await sendBookingEmails(booking, settings, origin).catch(() => false);

  /* — Textos : la confirmation au client, l'alerte à l'artisan (au mieux) — */
  const whenClient = smsWhen(booking.startsAt, settings.timezone, booking.locale);
  await Promise.all([
    sendSms(booking.clientPhone, SMS.bookingConfirmed(booking.locale, whenClient,
      `${origin}/${booking.locale}/reservation/${booking.manageToken}`), ref),
    sendSms(ownerSmsNumber(), SMS.owner.newBooking(booking.clientName,
      smsWhen(booking.startsAt, settings.timezone, "fr"), booking.city), ref),
  ]);

  await logEvent("booking_created", {
    ref, startsAt: booking.startsAt.toISOString(), durationMinutes,
    calendar: Boolean(booking.googleEventId), email: booking.emailSent,
  });
  return booking;
}

/**
 * Le temps réellement occupé : la séance, plus l'installation avant et le
 * rangement après. C'est ce bloc-là qui ne doit jamais en croiser un autre :
 * la contrainte d'exclusion le garde, le moteur de créneaux le compte
 * (`withSetup`), et les événements d'une série d'abonnement, sans invité,
 * le réservent tel quel. L'événement d'une séance ponctuelle, lui, porte
 * les heures réservées : voir `calendarEvent`.
 */
export function occupiedBlock(b: Pick<Booking, "startsAt" | "endsAt">): { start: Date; end: Date } {
  return {
    start: new Date(b.startsAt.getTime() - SETUP_MINUTES * 60_000),
    end: new Date(b.endsAt.getTime() + SETUP_MINUTES * 60_000),
  };
}

/**
 * La provenance, ramenée à ce qui est écrivable en base.
 *
 * Tout vient du navigateur du visiteur, donc rien n'est cru sur parole : les
 * longueurs sont bornées, la date est relue comme une vraie date, et la
 * source se replie sur le domaine du référent quand aucune campagne n'est
 * étiquetée. Une provenance absente n'est pas une erreur — un visiteur qui
 * refuse le stockage de son navigateur doit pouvoir réserver comme un autre.
 */
export function cleanOrigin(input: Pick<BookingInputType, "heardFrom" | "referredBy" | "attribution">): {
  heardFrom: string | null; referredBy: string | null; referral: string | null;
  source: string | null; medium: string | null;
  campaign: string | null; referrer: string | null; landing: string | null;
  firstSeenAt: string | null; visits: number | null;
} {
  /* Rien n'est garanti : ni que `attribution` soit un objet, ni qu'un de ses
     champs soit du bon type. `clip` renvoie null pour tout ce qui n'est pas
     une chaîne, ce qui suffit à traverser n'importe quelle saleté. */
  const a = (typeof input.attribution === "object" && input.attribution !== null
    ? input.attribution
    : {}) as Record<string, unknown>;

  const referrer = clip(a.referrer, 500);

  const rawVisits = Number(a.visits);
  const visits = Number.isFinite(rawVisits) && rawVisits > 0
    ? Math.min(Math.round(rawVisits), 10_000)
    : null;

  /* Une date venue du navigateur peut être n'importe quoi, y compris une
     date du futur. On la refuse plutôt que de l'écrire. */
  let firstSeenAt: string | null = null;
  const seen = clip(a.firstSeen, 60);
  if (seen) {
    const d = new Date(seen);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 60_000) {
      firstSeenAt = d.toISOString();
    }
  }

  const heardFrom = isHeardFrom(input.heardFrom) ? input.heardFrom : null;
  /* Un nom écrit à la main : sans retour à la ligne ni caractère de
     contrôle, et seulement sous la réponse à laquelle il appartient. */
  const referredBy = heardFrom === "recommandation"
    ? clip(typeof input.referredBy === "string" ? input.referredBy.replace(/\p{Cc}+/gu, " ") : null, 80)
    : null;

  return {
    heardFrom,
    referredBy,
    referral: refName(a.ref),
    source: clip(a.source, 120) ?? referrerHost(referrer),
    medium: clip(a.medium, 120),
    campaign: clip(a.campaign, 200),
    referrer,
    landing: clip(a.landing, 400),
    firstSeenAt,
    visits,
  };
}

const EVENT_TEXT = {
  fr: {
    summary: (n: string) => `NIVEX — Repassage à domicile · ${n}`,
    session: "Séance", ironing: (d: string) => `${d} de repassage`,
    setup: `Votre repasseur arrive ${SETUP_MINUTES} minutes avant le début de votre séance pour s'installer, sans frais : vos heures réservées sont entièrement consacrées au repassage.`,
    address: "Adresse", client: "Client", phone: "Téléphone", email: "Courriel",
    items: "Prestations", estimate: "Estimation", free: "première heure offerte",
    travel: "Frais de déplacement", total: "Total estimé", notes: "Précisions",
    ref: "Référence", manage: "Gérer ma réservation",
    kv: (k: string, v: string) => `${k} : ${v}`,
  },
  en: {
    summary: (n: string) => `NIVEX — In-home ironing · ${n}`,
    session: "Session", ironing: (d: string) => `${d} of ironing`,
    setup: `Your presser arrives ${SETUP_MINUTES} minutes before your session begins to set up, at no charge: the hours you booked are given entirely to ironing.`,
    address: "Address", client: "Client", phone: "Phone", email: "Email",
    items: "Services", estimate: "Estimate", free: "first hour free",
    travel: "Travel fee", total: "Estimated total", notes: "Notes",
    ref: "Reference", manage: "Manage my booking",
    kv: (k: string, v: string) => `${k}: ${v}`,
  },
} as const;

/**
 * L'événement d'agenda d'une séance ponctuelle.
 *
 * Le client y est invité, et Google le lui envoie tel quel : il est donc
 * écrit dans sa langue, aux heures de sa confirmation, et ne garde rien de
 * ce qui ne regarde que l'artisan — ni la provenance, ni le lien vers
 * l'espace artisan, que la fiche de mission porte déjà. L'artisan, lui, le
 * lit dans son propre agenda : nom, téléphone, adresse, prestations et
 * montant y restent.
 *
 * Le quart d'heure d'installation n'est plus dans les heures de
 * l'événement, il est dit en toutes lettres. Le temps réellement occupé
 * reste protégé là où il se décide : le moteur de créneaux compte
 * l'installation et le rangement autour de chaque réservation en base, et
 * la contrainte d'exclusion les garde à l'écriture.
 */
export function calendarEvent(b: Booking, origin: string, tz: string): {
  summary: string; description: string; location: string; start: string; end: string;
} {
  const l = b.locale === "en" ? "en" : "fr";
  const t = EVENT_TEXT[l];
  const money = (cents: number) => formatMoney(cents, b.currency, l);
  const lines: string[] = [
    t.kv(t.session, `${formatDateTime(b.startsAt, tz, l)} — ${t.ironing(minutesToText(b.durationMinutes, l))}.`),
    t.setup,
    "",
    t.kv(t.address, `${b.address}, ${b.city}, QC ${b.postalCode}`),
    t.kv(t.client, b.clientName),
    t.kv(t.phone, b.clientPhone),
    t.kv(t.email, b.clientEmail),
    "",
    t.kv(t.items, ""),
    ...b.items.map((i) => `  • ${i.label} × ${i.qty}`),
    t.kv(t.estimate, `${money(b.estimateCents)}${b.firstHourFree ? ` (${t.free})` : ""}`),
  ];
  if (b.travelFeeCents > 0) {
    lines.push(
      t.kv(`${t.travel}${b.travelZone ? ` (${b.travelZone})` : ""}`, money(b.travelFeeCents)),
      t.kv(t.total, money(b.estimateCents + b.travelFeeCents)),
    );
  }
  if (b.notes) lines.push("", t.kv(t.notes, b.notes));
  lines.push(
    "",
    t.kv(t.ref, b.ref),
    t.kv(t.manage, `${origin}/${b.locale}/reservation/${b.manageToken}`),
    `NIVEX · ${PHONE} · ${contactEmail()}`,
  );
  return {
    summary: t.summary(b.clientName),
    description: lines.map((x) => x.trimEnd()).join("\n"),
    location: `${b.address}, ${b.city}, QC ${b.postalCode}`,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
  };
}

function emailData(b: Booking, s: Settings, origin: string): BookingEmailData {
  return {
    ref: b.ref, locale: b.locale, clientName: b.clientName, clientEmail: b.clientEmail,
    clientPhone: b.clientPhone, address: b.address, city: b.city, postalCode: b.postalCode,
    notes: b.notes, items: b.items.map((i) => ({ label: i.label, qty: i.qty })),
    startsAt: b.startsAt, durationMinutes: b.durationMinutes, estimateCents: b.estimateCents,
    currency: b.currency, firstHourFree: b.firstHourFree, timezone: s.timezone,
    travelFeeCents: b.travelFeeCents, travelZone: b.travelZone,
    manageUrl: `${origin}/${b.locale}/reservation/${b.manageToken}`,
    siteUrl: origin, businessPhone: PHONE,
    businessEmail: contactEmail(),
    /* Le courriel ne parle de l'invitation que si elle est réellement partie. */
    invited: Boolean(b.googleEventId),
    /* Seule la notification de l'artisan s'en sert ; le gabarit du client
       ignore ce champ. */
    origin: {
      heardFromLabel: heardFromText(b.origin),
      source: b.origin.source,
      campaign: b.origin.campaign,
      firstSeenAt: b.origin.firstSeenAt,
      visits: b.origin.visits,
    },
  };
}

/** Renvoie vrai quand la confirmation du client est effectivement partie. */
async function sendBookingEmails(b: Booking, s: Settings, origin: string): Promise<boolean> {
  /* Un courriel qui ne part pas doit laisser une trace lisible : sans le
     motif, on ne sait pas s'il faut reconnecter un compte ou corriger une
     adresse. Le journal le garde, /api/health le résume. */
  let at: string | null = null;
  try {
    at = await ownerAccessToken();
  } catch (e) {
    const detail = e instanceof GoogleError
      ? `${e.op} — HTTP ${e.status} · ${e.body.slice(0, 300)}`
      : String((e as Error).message).slice(0, 300);
    await logEvent("email_skipped", { ref: b.ref, reason: "token_refused", detail });
    return false;
  }
  if (!at) {
    await logEvent("email_skipped", { ref: b.ref, reason: "no_refresh_token" });
    return false;
  }
  const d = emailData(b, s, origin);
  const fromName = s.businessName || "NIVEX";

  const client = clientConfirmation(d);
  const owner = ownerNotification(d);

  /* Deux destinataires, deux envois distincts : la boîte de la maison doit
     recevoir sa fiche de mission même si l'adresse du client rebondit. */
  const [toClient, toOwner] = await Promise.allSettled([
    sendGmail(at, { to: b.clientEmail, toName: b.clientName, subject: client.subject, html: client.html, text: client.text, fromName, replyTo: contactEmail() }),
    sendGmail(at, { to: REQUEST_INBOX, subject: owner.subject, html: owner.html, text: owner.text, fromName, replyTo: b.clientEmail }),
  ]);

  if (toOwner.status === "rejected") {
    await logEvent("owner_email_failed", { ref: b.ref, error: String(toOwner.reason).slice(0, 400) });
  }

  const ok = toClient.status === "fulfilled";
  if (ok) await sql()`UPDATE nivex_bookings SET email_sent = true WHERE id = ${b.id}`.catch(() => {});
  else await logEvent("email_failed", { ref: b.ref, error: String((toClient as PromiseRejectedResult).reason).slice(0, 400) });
  return ok;
}

/**
 * Rattrapage d'un rendez-vous resté muet.
 *
 * Quand le lien avec Google se rompt, la réservation s'écrit quand même
 * mais ni l'agenda ni les courriels ne suivent. Une fois le compte
 * rebranché, ceci répare l'un et l'autre — sans jamais recréer un
 * événement qui existe déjà.
 */
export async function resendBooking(b: Booking, host?: string | null): Promise<{
  emailSent: boolean; calendarAdded: boolean; error: string | null;
}> {
  /* Une visite d'abonnement appartient à une série : la rattraper seule
     créerait un second événement à côté de son occurrence. On rattrape la
     série entière. */
  if (b.subscriptionId) {
    const { resendSubscription } = await import("./subscriptions");
    return resendSubscription(b.subscriptionId, host);
  }
  const settings = await getSettings();
  const origin = siteOrigin(host);

  let at: string | null = null;
  try {
    at = await ownerAccessToken();
  } catch (e) {
    return { emailSent: false, calendarAdded: false, error: describeGoogle(e) };
  }
  if (!at) return { emailSent: false, calendarAdded: false, error: "Aucun compte Google branché." };

  let calendarAdded = Boolean(b.googleEventId);
  if (!b.googleEventId && b.status !== "cancelled") {
    try {
      const ev = await createEvent(at, {
        calendarId: settings.calendarId,
        ...calendarEvent(b, origin, settings.timezone),
        timeZone: settings.timezone,
        attendeeEmail: b.clientEmail,
        attendeeName: b.clientName,
      });
      await sql()`UPDATE nivex_bookings SET google_event_id = ${ev.id} WHERE id = ${b.id}`;
      b.googleEventId = ev.id;
      calendarAdded = true;
    } catch (e) {
      await logEvent("calendar_backfill_failed", { ref: b.ref, error: describeGoogle(e).slice(0, 400) });
    }
  }

  /* Le courriel ne repart que s'il n'est jamais parti : réparer l'agenda ne
     doit pas valoir au client une seconde confirmation, ni à la maison une
     seconde fiche de mission. L'invitation, elle, part avec l'événement. */
  const emailSent = b.emailSent || await sendBookingEmails(b, settings, origin).catch(() => false);
  await logEvent("booking_resent", { ref: b.ref, emailSent, calendarAdded });

  return {
    emailSent, calendarAdded,
    error: !emailSent
      ? "Le courriel n'est toujours pas parti. Vérifiez la connexion Google."
      : !calendarAdded && b.status !== "cancelled"
        ? "L'inscription à l'agenda a de nouveau échoué."
        : null,
  };
}

function describeGoogle(e: unknown): string {
  if (e instanceof GoogleError) return `${e.op} — HTTP ${e.status} · ${e.body.slice(0, 300)}`;
  return String((e as Error)?.message ?? e).slice(0, 300);
}

async function isFirstBooking(email: string): Promise<boolean> {
  const rows = (await sql()`
    SELECT 1 FROM nivex_bookings
    WHERE lower(client_email) = ${email.toLowerCase()} AND status <> 'cancelled'
    LIMIT 1`) as Row[];
  return rows.length === 0;
}

/* ============================ Lecture ============================ */

export async function findById(id: string): Promise<Booking | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT * FROM nivex_bookings WHERE id = ${id} LIMIT 1`) as Row[];
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function findByManageToken(t: string): Promise<Booking | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT * FROM nivex_bookings WHERE manage_token = ${t} LIMIT 1`) as Row[];
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function listBookings(opts: { scope?: "upcoming" | "past" | "all"; limit?: number } = {}): Promise<Booking[]> {
  await ensureSchema();
  const limit = Math.min(opts.limit ?? 200, 500);
  const now = new Date().toISOString();
  let rows: Row[];
  if (opts.scope === "past") {
    rows = (await sql()`SELECT * FROM nivex_bookings WHERE starts_at < ${now} ORDER BY starts_at DESC LIMIT ${limit}`) as Row[];
  } else if (opts.scope === "all") {
    rows = (await sql()`SELECT * FROM nivex_bookings ORDER BY starts_at DESC LIMIT ${limit}`) as Row[];
  } else {
    /* Une série d'abonnement pose six mois de visites d'un coup : quatre
       abonnés suffiraient à remplir la liste. Elle montre donc les trois
       prochaines semaines de chacun ; l'onglet Abonnés montre le reste. */
    rows = (await sql()`
      SELECT * FROM nivex_bookings
      WHERE starts_at >= ${now}
        AND (subscription_id IS NULL OR starts_at < now() + interval '21 days')
      ORDER BY starts_at ASC LIMIT ${limit}`) as Row[];
  }
  return rows.map(hydrate);
}

/**
 * Les chiffres du tableau de bord.
 *
 * Le mois est celui de Montréal, et il est borné des deux côtés : le
 * serveur vit en UTC, et une séance du 31 au soir y tombait déjà le mois
 * suivant — sans borne haute, « ce mois-ci » comptait en plus tous les mois
 * à venir, six mois de visites d'abonnés compris. Les bornes se calculent à
 * l'heure murale puis se reconvertissent : ajouter un mois à un instant le
 * ferait en UTC. « À venir » suit la règle de la liste voisine (trois
 * semaines de visites d'abonnés), et un client n'est « servi » qu'une fois
 * sa séance passée.
 */
export async function stats(tz = "America/Toronto") {
  await ensureSchema();
  const now = new Date().toISOString();
  const rows = (await sql()`
    WITH m AS (
      SELECT date_trunc('month', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}                     AS m0,
             (date_trunc('month', now() AT TIME ZONE ${tz}) + interval '1 month') AT TIME ZONE ${tz} AS m1
    )
    SELECT
      count(*) FILTER (WHERE status = 'confirmed' AND starts_at >= ${now}
        AND (subscription_id IS NULL OR starts_at < now() + interval '21 days'))                   AS upcoming,
      count(*) FILTER (WHERE status = 'confirmed' AND starts_at >= m.m0 AND starts_at < m.m1)      AS this_month,
      count(*) FILTER (WHERE status = 'cancelled')                                                 AS cancelled,
      count(*)                                                                                     AS total,
      /* Les frais de route comptent : c'est de l'argent encaissé. Une visite
         d'abonné en porte zéro, ses frais sont dans le cycle payé. */
      coalesce(sum(estimate_cents + travel_fee_cents) FILTER (
        WHERE status <> 'cancelled' AND starts_at >= m.m0 AND starts_at < m.m1), 0)               AS month_cents,
      count(DISTINCT lower(client_email)) FILTER (
        WHERE status <> 'cancelled' AND starts_at < ${now})                                        AS clients
    FROM nivex_bookings, m`) as Row[];
  const r = rows[0] ?? {};

  /* Une visite d'abonnement vaut zéro en base : le cycle se paie d'un coup,
     à sa première visite. Les revenus du mois comptent donc les cycles
     encaissés ce mois-ci, à la date où l'artisan a noté le paiement. */
  const paid = (await sql()`
    WITH m AS (
      SELECT date_trunc('month', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}                     AS m0,
             (date_trunc('month', now() AT TIME ZONE ${tz}) + interval '1 month') AT TIME ZONE ${tz} AS m1
    )
    SELECT coalesce(sum(s.cycle_cents + s.travel_fee_cents * s.visits_per_cycle), 0) AS cents
    FROM nivex_subscriptions s, jsonb_each_text(s.paid_cycles) p, m
    WHERE p.value::timestamptz >= m.m0 AND p.value::timestamptz < m.m1`.catch(() => [{ cents: 0 }])) as Row[];

  return {
    upcoming: Number(r.upcoming ?? 0), thisMonth: Number(r.this_month ?? 0),
    cancelled: Number(r.cancelled ?? 0), total: Number(r.total ?? 0),
    monthCents: Number(r.month_cents ?? 0) + Number(paid[0]?.cents ?? 0), clients: Number(r.clients ?? 0),
  };
}

/**
 * D'où viennent les clients : une ligne par séance ponctuelle prise en ligne,
 * séances annulées exclues, et une par abonnement pris en ligne. La
 * provenance d'un abonnement est écrite sur la visite posée la première ;
 * on cherche donc la visite qui la porte, et non la plus proche par la
 * date — une première visite déplacée après la deuxième faisait passer
 * l'abonnement en « Direct ». Les abonnés entrés à la main par l'artisan ne
 * sont pas des arrivées du site.
 */
export async function bookingSources(): Promise<{ createdAt: Date; group: SourceGroup }[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT b.created_at, b.heard_from, b.referral, b.utm_source, b.referrer
    FROM nivex_bookings b
    WHERE b.subscription_id IS NULL AND b.status <> 'cancelled'
    UNION ALL
    SELECT s.created_at, f.heard_from, f.referral, f.utm_source, f.referrer
    FROM nivex_subscriptions s
    LEFT JOIN LATERAL (
      SELECT x.heard_from, x.referral, x.utm_source, x.referrer
      FROM nivex_bookings x
      WHERE x.subscription_id = s.id
      ORDER BY (x.heard_from IS NULL AND x.referral IS NULL AND x.utm_source IS NULL AND x.referrer IS NULL),
               x.series_no, x.starts_at
      LIMIT 1
    ) f ON true
    WHERE s.created_by = 'client'`) as Row[];
  return rows.map((r) => ({
    createdAt: new Date(r.created_at as string),
    group: bookingGroup({
      heardFrom: isStoredHeardFrom(r.heard_from) ? r.heard_from : null,
      referral: (r.referral as string) ?? null,
      source: (r.utm_source as string) ?? null,
      referrer: (r.referrer as string) ?? null,
    }),
  }));
}

/* ============================ Annulation ============================ */

export async function cancelBooking(b: Booking, by: "client" | "owner"): Promise<void> {
  /* Une visite d'abonnement ne s'annule pas comme une séance : elle sort du
     compte du cycle, une visite la remplace en fin de série, et l'agenda
     perd une occurrence plutôt qu'un événement. */
  if (b.subscriptionId) {
    const { cancelVisit } = await import("./subscriptions");
    await cancelVisit(b, by);
    return;
  }
  const settings = await getSettings();
  await ensureSchema();
  await sql()`UPDATE nivex_bookings SET status = 'cancelled', cancelled_at = now() WHERE id = ${b.id}`;

  const at = await ownerAccessToken().catch(() => null);
  const origin = siteOrigin();

  /* Au mieux, quelle que soit l'erreur : l'annulation est déjà écrite, et
     une coupure réseau vers Google ne doit priver personne de l'avis qui
     suit — ni le client de sa confirmation, ni l'artisan de son texto. */
  if (at && b.googleEventId) {
    await deleteEvent(at, settings.calendarId, b.googleEventId)
      .catch((e) => logEvent("calendar_delete_failed", { ref: b.ref, error: describeGoogle(e) }));
  }

  if (at) {
    const d = emailData(b, settings, origin);
    const fromName = settings.businessName || "NIVEX";
    const cc = clientCancellation(d);
    const on = ownerNotification(d, true);
    await Promise.allSettled([
      // Le client est prévenu dans tous les cas.
      sendGmail(at, {
        to: b.clientEmail, toName: b.clientName, subject: cc.subject,
        html: cc.html, text: cc.text, fromName, replyTo: contactEmail(),
      }),
      // L'artisan, seulement quand l'annulation ne vient pas de lui.
      settings.ownerEmail && by === "client"
        ? sendGmail(at, { to: settings.ownerEmail, subject: on.subject, html: on.html, text: on.text, fromName })
        : Promise.resolve(null),
    ]);
  }

  /* Celui qui n'a pas annulé l'apprend aussi par texto. */
  if (by === "owner") {
    await sendSms(b.clientPhone, SMS.bookingCancelled(b.locale, smsWhen(b.startsAt, settings.timezone, b.locale)), b.ref);
  } else {
    await sendSms(ownerSmsNumber(), SMS.owner.cancelled(b.clientName, smsWhen(b.startsAt, settings.timezone, "fr")), b.ref);
  }

  await logEvent("booking_cancelled", { ref: b.ref, by });
}

/**
 * Le client peut-il encore annuler lui-même ?
 *
 * Deux règles : une séance ponctuelle jusqu'à `CANCEL_WINDOW_HOURS` avant,
 * une visite d'abonnement jusqu'à 23 h 59 la veille, à l'heure de Montréal.
 */
export function canSelfCancel(b: Booking, tz = "America/Toronto"): boolean {
  if (b.status !== "confirmed") return false;
  if (b.subscriptionId) return !b.doneAt && canSubscriberChange(b.startsAt, tz);
  return b.startsAt.getTime() - Date.now() > CANCEL_WINDOW_HOURS * 3600_000;
}

export { formatDateTime };

import { z } from "zod";
import { ensureSchema, sql, logEvent } from "./db";
import { bookingRef, token } from "./crypto";
import { getSettings, inServiceArea, type Settings } from "./settings";
import { estimateCents, estimateMinutes, loadBusy, slotIsFree } from "./availability";
import { createEvent, deleteEvent, ownerAccessToken, sendGmail, siteOrigin, GoogleError } from "./google";
import { clientCancellation, clientConfirmation, ownerNotification, type BookingEmailData } from "./email";
import { formatDateTime, minutesToText, formatMoney } from "./time";
import { contactEmail, CANCEL_WINDOW_HOURS, FIRST_FREE_MIN_MINUTES, PHONE, REQUEST_INBOX } from "./brand";

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
});

export type BookingInputType = z.infer<typeof BookingInput>;

export type Booking = {
  id: string; ref: string; manageToken: string; locale: "fr" | "en"; status: string;
  clientName: string; clientEmail: string; clientPhone: string;
  address: string; city: string; postalCode: string; notes: string | null;
  items: { key: string; label: string; qty: number }[];
  startsAt: Date; endsAt: Date; durationMinutes: number;
  estimateCents: number; currency: string; firstHourFree: boolean;
  googleEventId: string | null; emailSent: boolean;
  createdAt: Date; cancelledAt: Date | null;
};

type Row = Record<string, unknown>;

function hydrate(r: Row): Booking {
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
    googleEventId: (r.google_event_id as string) ?? null,
    emailSent: r.email_sent === true,
    createdAt: new Date(r.created_at as string),
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at as string) : null,
  };
}

export class BookingError extends Error {
  constructor(public code: "not_connected" | "slot_taken" | "invalid_slot" | "paused" | "unknown_service", message?: string) {
    super(message ?? code);
    this.name = "BookingError";
  }
}

/* ============================ Création ============================ */

export async function createBooking(input: BookingInputType, host?: string | null): Promise<Booking> {
  const settings = await getSettings();

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

  const labelled = items.map((i) => {
    const svc = settings.services.find((s) => s.key === i.key)!;
    return { key: i.key, label: input.locale === "en" ? svc.en : svc.fr, qty: i.qty };
  });

  const ref = bookingRef();
  const manageToken = token(24);

  let rows: Row[];
  try {
    rows = (await sql()`
      INSERT INTO nivex_bookings (
        ref, manage_token, locale, status, client_name, client_email, client_phone,
        address, city, postal_code, notes, items, starts_at, ends_at,
        duration_minutes, estimate_cents, currency, first_hour_free
      ) VALUES (
        ${ref}, ${manageToken}, ${input.locale}, 'confirmed', ${input.name}, ${input.email}, ${input.phone},
        ${input.address}, ${input.city}, ${input.postalCode.toUpperCase()}, ${input.notes || null},
        ${JSON.stringify(labelled)}::jsonb, ${start.toISOString()}, ${end.toISOString()},
        ${durationMinutes}, ${cents}, ${settings.currency}, ${firstHourFree}
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
      summary: `NIVEX — ${booking.clientName}`,
      description: eventDescription(booking, origin),
      location: `${booking.address}, ${booking.city}, QC ${booking.postalCode}`,
      start: booking.startsAt.toISOString(),
      end: booking.endsAt.toISOString(),
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

  await logEvent("booking_created", {
    ref, startsAt: booking.startsAt.toISOString(), durationMinutes,
    calendar: Boolean(booking.googleEventId), email: booking.emailSent,
  });
  return booking;
}

function eventDescription(b: Booking, origin: string): string {
  const lines = [
    `Client : ${b.clientName}`,
    `Téléphone : ${b.clientPhone}`,
    `Courriel : ${b.clientEmail}`,
    "",
    "Prestations :",
    ...b.items.map((i) => `  • ${i.label} × ${i.qty}`),
    "",
    `Durée estimée : ${minutesToText(b.durationMinutes, "fr")}`,
    `Estimation : ${formatMoney(b.estimateCents, b.currency, "fr")}${b.firstHourFree ? " (1re heure offerte)" : ""}`,
  ];
  if (b.notes) lines.push("", `Précisions du client : ${b.notes}`);
  lines.push("", `Référence : ${b.ref}`, `Tableau de bord : ${origin}/admin`);
  return lines.join("\n");
}

function emailData(b: Booking, s: Settings, origin: string): BookingEmailData {
  return {
    ref: b.ref, locale: b.locale, clientName: b.clientName, clientEmail: b.clientEmail,
    clientPhone: b.clientPhone, address: b.address, city: b.city, postalCode: b.postalCode,
    notes: b.notes, items: b.items.map((i) => ({ label: i.label, qty: i.qty })),
    startsAt: b.startsAt, durationMinutes: b.durationMinutes, estimateCents: b.estimateCents,
    currency: b.currency, firstHourFree: b.firstHourFree, timezone: s.timezone,
    manageUrl: `${origin}/${b.locale}/reservation/${b.manageToken}`,
    siteUrl: origin, businessPhone: PHONE,
    businessEmail: contactEmail(s),
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
    sendGmail(at, { to: b.clientEmail, toName: b.clientName, subject: client.subject, html: client.html, text: client.text, fromName, replyTo: contactEmail(s) }),
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
    rows = (await sql()`SELECT * FROM nivex_bookings WHERE starts_at >= ${now} ORDER BY starts_at ASC LIMIT ${limit}`) as Row[];
  }
  return rows.map(hydrate);
}

export async function stats() {
  await ensureSchema();
  const now = new Date().toISOString();
  const rows = (await sql()`
    SELECT
      count(*) FILTER (WHERE status = 'confirmed' AND starts_at >= ${now})                         AS upcoming,
      count(*) FILTER (WHERE status = 'confirmed' AND starts_at >= date_trunc('month', now()))     AS this_month,
      count(*) FILTER (WHERE status = 'cancelled')                                                 AS cancelled,
      count(*)                                                                                     AS total,
      coalesce(sum(estimate_cents) FILTER (
        WHERE status <> 'cancelled' AND starts_at >= date_trunc('month', now())), 0)               AS month_cents,
      count(DISTINCT lower(client_email)) FILTER (WHERE status <> 'cancelled')                     AS clients
    FROM nivex_bookings`) as Row[];
  const r = rows[0] ?? {};
  return {
    upcoming: Number(r.upcoming ?? 0), thisMonth: Number(r.this_month ?? 0),
    cancelled: Number(r.cancelled ?? 0), total: Number(r.total ?? 0),
    monthCents: Number(r.month_cents ?? 0), clients: Number(r.clients ?? 0),
  };
}

/* ============================ Annulation ============================ */

export async function cancelBooking(b: Booking, by: "client" | "owner"): Promise<void> {
  const settings = await getSettings();
  await ensureSchema();
  await sql()`UPDATE nivex_bookings SET status = 'cancelled', cancelled_at = now() WHERE id = ${b.id}`;

  const at = await ownerAccessToken().catch(() => null);
  const origin = siteOrigin();

  if (at && b.googleEventId) {
    await deleteEvent(at, settings.calendarId, b.googleEventId).catch((e) => {
      if (!(e instanceof GoogleError)) throw e;
      return logEvent("calendar_delete_failed", { ref: b.ref, error: e.message.slice(0, 400) });
    });
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
        html: cc.html, text: cc.text, fromName, replyTo: settings.ownerEmail ?? undefined,
      }),
      // L'artisan, seulement quand l'annulation ne vient pas de lui.
      settings.ownerEmail && by === "client"
        ? sendGmail(at, { to: settings.ownerEmail, subject: on.subject, html: on.html, text: on.text, fromName })
        : Promise.resolve(null),
    ]);
  }

  await logEvent("booking_cancelled", { ref: b.ref, by });
}

/** Le client peut-il encore annuler lui-même ? */
export function canSelfCancel(b: Booking): boolean {
  return b.status === "confirmed"
    && b.startsAt.getTime() - Date.now() > CANCEL_WINDOW_HOURS * 3600_000;
}

export { formatDateTime, inServiceArea };

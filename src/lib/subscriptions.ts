import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureSchema, sql, logEvent } from "./db";
import { bookingRef, token } from "./crypto";
import { getSettings, type Settings } from "./settings";
import { PLANS, type Plan } from "./pricing";
import { computeSlots, loadBusy, loadBusyRange, slotProblem } from "./availability";
import { bookable, evaluateZone } from "./travel";
import {
  createEvent, createRecurringEvent, deleteEvent, listInstances, ownerAccessToken, patchEvent,
  sendGmail, siteOrigin, GoogleError,
} from "./google";
import {
  ownerVisitChanged, seriesNotice, subscriptionConfirmation, subscriptionEnded,
  subscriptionOwnerNotification, visitChanged, visitReminder,
  type SubscriptionEmailData, type VisitChange, type VisitEmailData,
} from "./email";
import { cleanOrigin, hydrate, occupiedBlock, type Booking } from "./bookings";
import { ownerSmsNumber, sendSms, SMS, smsWhen } from "./sms";
import { rhythmPhrase } from "./email";
import {
  canSubscriberChange, cycleAmount, gridDate, gridDates, gridFrom, gridIndexAfter, quoteCycle,
  seriesConflicts, seriesOfCycle, seriesSpanEnd, startOffset, viewSubscription, visitsToEndOfSeries,
  type Grid, type SeriesConflict, type SubscriptionView, type VisitNumber,
} from "./cycles";
import {
  contactEmail, MAKEUP_SEARCH_STEPS, PHONE, REQUEST_INBOX, SERIES_CYCLES, SETUP_MINUTES, TERM_SERIES,
} from "./brand";
import { addDaysToKey, dateKey, formatMoney, formatTimeIn, fromWall, parseDateKey, parseHM } from "./time";

/**
 * Les abonnements : la série posée, puis tout ce qui la retouche.
 *
 * Les décisions — quelles dates, quel rang, quel montant — viennent de
 * cycles.ts. Ce module les applique à la base, à l'agenda et aux courriels,
 * dans cet ordre et avec la même hiérarchie que pour une séance : la base
 * porte la garantie et a toujours le dernier mot ; l'agenda et les courriels
 * suivent au mieux, et leur échec laisse une trace au journal plutôt que de
 * défaire ce qui est écrit.
 */

const DAY = 86_400_000;

/* ============================ Types ============================ */

export type Subscription = {
  id: string; ref: string; manageToken: string; locale: "fr" | "en";
  status: "active" | "ended";
  planKey: string; planName: string;
  perCycle: number; everyWeeks: number; minutesPerVisit: number;
  gridAnchor: string; gridHm: string;
  clientName: string; clientEmail: string; clientPhone: string;
  address: string; city: string; postalCode: string; notes: string | null;
  cycleCents: number; feePerVisitCents: number; travelZone: string | null; currency: string;
  startCycle: number; startDone: number;
  paidCycles: Record<string, string>;
  pendingMakeups: number; noticeSeries: number;
  createdBy: "client" | "owner"; createdAt: Date; endedAt: Date | null;
};

type Row = Record<string, unknown>;

function hydrateSub(r: Row): Subscription {
  return {
    id: r.id as string, ref: r.ref as string, manageToken: r.manage_token as string,
    locale: (r.locale as "fr" | "en") ?? "fr",
    status: r.status === "ended" ? "ended" : "active",
    planKey: r.plan_key as string, planName: r.plan_name as string,
    perCycle: Number(r.visits_per_cycle), everyWeeks: Number(r.every_weeks),
    minutesPerVisit: Number(r.minutes_per_visit),
    gridAnchor: r.grid_anchor as string, gridHm: r.grid_hm as string,
    clientName: r.client_name as string, clientEmail: r.client_email as string,
    clientPhone: r.client_phone as string, address: r.address as string,
    city: r.city as string, postalCode: r.postal_code as string, notes: (r.notes as string) ?? null,
    cycleCents: Number(r.cycle_cents), feePerVisitCents: Number(r.travel_fee_cents ?? 0),
    travelZone: (r.travel_zone as string) ?? null, currency: (r.currency as string) || "CAD",
    startCycle: Number(r.start_cycle ?? 1), startDone: Number(r.start_done ?? 0),
    paidCycles: (r.paid_cycles as Record<string, string>) ?? {},
    pendingMakeups: Number(r.pending_makeups ?? 0), noticeSeries: Number(r.notice_series ?? 0),
    createdBy: r.created_by === "owner" ? "owner" : "client",
    createdAt: new Date(r.created_at as string),
    endedAt: r.ended_at ? new Date(r.ended_at as string) : null,
  };
}

export class SubscriptionError extends Error {
  constructor(
    public code:
      | "paused" | "unknown_plan" | "out_of_area" | "conflicts" | "slot_taken" | "invalid_slot"
      | "too_late" | "not_found" | "done" | "ended" | "has_done" | "term_done" | "invalid",
    public conflicts: SeriesConflict[] = [],
    public alternatives: Date[] = [],
  ) {
    super(code);
    this.name = "SubscriptionError";
  }
}

/* ============================ Entrées ============================ */

const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

const Client = {
  locale: z.enum(["fr", "en"]).default("fr"),
  planKey: z.string().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().min(4).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(POSTAL).max(10),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
};

/** Ce que le client envoie depuis le parcours d'abonnement. */
export const SubscriptionInput = z.object({
  ...Client,
  startsAt: z.string().datetime({ offset: true }),
  consent: z.literal(true),
  hp: z.string().max(0).optional(),
  /* La provenance, acceptée telle quelle puis nettoyée champ par champ :
     voir BookingInput. Elle ne doit jamais faire échouer un abonnement. */
  heardFrom: z.unknown().optional(),
  attribution: z.unknown().optional(),
});
export type SubscriptionInputType = z.infer<typeof SubscriptionInput>;

/**
 * Ce que l'artisan entre à la main, pour un client qu'il sert déjà.
 *
 * La date et l'heure arrivent en heure murale de Montréal, pas en instant :
 * le navigateur de l'artisan n'a pas à savoir dans quel fuseau il se trouve.
 * Un abonné d'avant le site reprend au cycle et au rang où il en est.
 */
export const OwnerSubscriptionInput = z.object({
  ...Client,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  startCycle: z.number().int().min(1).max(SERIES_CYCLES * TERM_SERIES).default(1),
  startDone: z.number().int().min(0).max(3).default(0),
  paidCurrent: z.boolean().default(false),
});
export type OwnerSubscriptionInputType = z.infer<typeof OwnerSubscriptionInput>;

export function findPlan(key: string): Plan | null {
  return PLANS.find((p) => p.key === key) ?? null;
}

function planName(sub: Pick<Subscription, "planKey" | "planName">, locale: "fr" | "en"): string {
  const p = findPlan(sub.planKey);
  return p ? (locale === "en" ? p.en.name : p.fr.name) : sub.planName;
}

function gridOf(sub: Subscription, tz: string): Grid {
  return { anchor: sub.gridAnchor, hm: sub.gridHm, everyWeeks: sub.everyWeeks, tz };
}

/* ============================ Lecture ============================ */

export type SubscriptionFull = { sub: Subscription; visits: Booking[]; view: SubscriptionView };

function viewOf(sub: Subscription, visits: Booking[], now = new Date()): SubscriptionView {
  return viewSubscription({
    perCycle: sub.perCycle, everyWeeks: sub.everyWeeks,
    startCycle: sub.startCycle, startDone: sub.startDone,
    paidCycles: sub.paidCycles, pendingMakeups: sub.pendingMakeups,
    active: sub.status === "active",
    visits: visits.map((v) => ({
      id: v.id, startsAt: v.startsAt, cancelled: v.status === "cancelled",
      doneAt: v.doneAt, series: v.seriesNo ?? 1,
    })),
  }, now);
}

async function loadVisits(subId: string): Promise<Booking[]> {
  const rows = (await sql()`
    SELECT * FROM nivex_bookings WHERE subscription_id = ${subId} ORDER BY starts_at ASC`) as Row[];
  return rows.map(hydrate);
}

async function loadFull(sub: Subscription): Promise<SubscriptionFull> {
  const visits = await loadVisits(sub.id);
  return { sub, visits, view: viewOf(sub, visits) };
}

export async function findSubscription(id: string): Promise<SubscriptionFull | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT * FROM nivex_subscriptions WHERE id = ${id} LIMIT 1`) as Row[];
  return rows[0] ? loadFull(hydrateSub(rows[0])) : null;
}

export async function findSubscriptionByToken(t: string): Promise<SubscriptionFull | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT * FROM nivex_subscriptions WHERE manage_token = ${t} LIMIT 1`) as Row[];
  return rows[0] ? loadFull(hydrateSub(rows[0])) : null;
}

/** Les abonnements en cours d'abord, puis ceux qui ont pris fin récemment. */
export async function listSubscriptions(): Promise<SubscriptionFull[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT * FROM nivex_subscriptions
    WHERE status = 'active' OR ended_at > now() - interval '90 days'
    ORDER BY (status = 'active') DESC, created_at DESC
    LIMIT 200`) as Row[];
  return Promise.all(rows.map((r) => loadFull(hydrateSub(r))));
}

/** Les clients déjà servis, pour entrer un abonnement sans tout retaper. */
export async function knownClients(): Promise<{
  name: string; email: string; phone: string; address: string; city: string; postalCode: string;
}[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT DISTINCT ON (lower(client_email))
      client_name, client_email, client_phone, address, city, postal_code
    FROM nivex_bookings
    ORDER BY lower(client_email), created_at DESC
    LIMIT 500`) as Row[];
  return rows.map((r) => ({
    name: r.client_name as string, email: r.client_email as string, phone: r.client_phone as string,
    address: r.address as string, city: r.city as string, postalCode: r.postal_code as string,
  }));
}

/* ============================ Vérification ============================ */

export type SeriesPreview = {
  starts: Date[];
  conflicts: SeriesConflict[];
  alternatives: Date[];
  durationMinutes: number;
};

/**
 * Les dates d'une série, et celles qui ne tiennent pas.
 *
 * En cas de conflit, quelques autres créneaux des deux semaines suivantes
 * dont la série entière est libre : les plus proches de l'heure voulue
 * d'abord, au plus deux par jour, pour proposer un vrai choix plutôt que
 * quatre demi-heures d'un même matin.
 */
export async function previewSeries(opts: {
  planKey: string; first: Date; count?: number; checkLead: boolean;
}): Promise<SeriesPreview> {
  const plan = findPlan(opts.planKey);
  if (!plan) throw new SubscriptionError("unknown_plan");
  if (!Number.isFinite(opts.first.getTime())) throw new SubscriptionError("invalid");
  const settings = await getSettings();
  const tz = settings.timezone;
  const count = opts.count ?? plan.visits * SERIES_CYCLES;
  const minutes = plan.minutesPerVisit;
  const starts = gridDates(gridFrom(opts.first, plan.everyWeeks, tz), 0, count);

  const accessToken = await ownerAccessToken().catch(() => null);
  const busy = await loadBusyRange({
    accessToken, settings,
    timeMin: new Date(Math.min(Date.now(), starts[0].getTime()) - DAY),
    timeMax: new Date(seriesSpanEnd(starts, minutes).getTime() + 16 * DAY),
  });

  const conflicts = seriesConflicts(starts, minutes, busy, settings, { checkLead: opts.checkLead });
  const alternatives: Date[] = [];

  if (conflicts.length > 0) {
    const days = computeSlots({ fromKey: dateKey(opts.first, tz), days: 14, durationMinutes: minutes, settings, busy });
    const wanted = parseHM(gridFrom(opts.first, plan.everyWeeks, tz).hm);
    const candidates = days
      .flatMap((d) => d.slots.map((x) => ({ date: d.date, when: new Date(x.iso), gap: Math.abs(parseHM(x.time) - wanted) })))
      .filter((c) => c.when.getTime() !== opts.first.getTime())
      .sort((a, b) => a.gap - b.gap || a.when.getTime() - b.when.getTime());
    const perDay = new Map<string, number>();
    let tried = 0;
    for (const c of candidates) {
      if (alternatives.length >= 4 || tried > 200) break;
      if ((perDay.get(c.date) ?? 0) >= 2) continue;
      tried++;
      const series = gridDates(gridFrom(c.when, plan.everyWeeks, tz), 0, count);
      if (seriesConflicts(series, minutes, busy, settings, { checkLead: opts.checkLead }).length === 0) {
        alternatives.push(c.when);
        perDay.set(c.date, (perDay.get(c.date) ?? 0) + 1);
      }
    }
    alternatives.sort((a, b) => a.getTime() - b.getTime());
  }

  return { starts, conflicts, alternatives, durationMinutes: minutes };
}

/* ============================ Création ============================ */

/** L'abonnement d'un client, pris en ligne. */
export async function createSubscription(input: SubscriptionInputType, host?: string | null): Promise<SubscriptionFull> {
  const settings = await getSettings();
  if (settings.paused) throw new SubscriptionError("paused");
  const plan = findPlan(input.planKey);
  if (!plan) throw new SubscriptionError("unknown_plan");

  const first = new Date(input.startsAt);
  const preview = await previewSeries({ planKey: plan.key, first, checkLead: true });
  if (preview.conflicts.length > 0) {
    throw new SubscriptionError("conflicts", preview.conflicts, preview.alternatives);
  }

  return insertSubscription({
    settings, plan, input, starts: preview.starts, series: 1,
    startCycle: 1, startDone: 0, paidCurrent: false, createdBy: "client",
    provenance: cleanOrigin(input), host,
  });
}

/** L'abonnement qu'entre l'artisan, pour un client existant. */
export async function createOwnerSubscription(input: OwnerSubscriptionInputType, host?: string | null): Promise<SubscriptionFull> {
  const settings = await getSettings();
  const plan = findPlan(input.planKey);
  if (!plan) throw new SubscriptionError("unknown_plan");
  if (input.startDone >= plan.visits) throw new SubscriptionError("invalid");

  const first = ownerInstant(input.date, input.time, settings.timezone);
  const count = visitsToEndOfSeries(plan.visits, input.startCycle, input.startDone);
  const preview = await previewSeries({ planKey: plan.key, first, count, checkLead: false });
  if (preview.conflicts.length > 0) {
    throw new SubscriptionError("conflicts", preview.conflicts, preview.alternatives);
  }

  return insertSubscription({
    settings, plan, input, starts: preview.starts, series: seriesOfCycle(input.startCycle),
    startCycle: input.startCycle, startDone: input.startDone, paidCurrent: input.paidCurrent,
    createdBy: "owner", provenance: null, host,
  });
}

/** Une heure murale de Montréal, saisie par l'artisan, en instant. */
export function ownerInstant(date: string, time: string, tz: string): Date {
  const m = parseHM(time);
  return fromWall({ ...parseDateKey(date), hour: Math.floor(m / 60), minute: m % 60 }, tz);
}

async function insertSubscription(p: {
  settings: Settings; plan: Plan;
  input: z.infer<z.ZodObject<typeof Client>>;
  starts: Date[]; series: number;
  startCycle: number; startDone: number; paidCurrent: boolean;
  createdBy: "client" | "owner";
  provenance: ReturnType<typeof cleanOrigin> | null;
  host?: string | null;
}): Promise<SubscriptionFull> {
  const { settings, plan, input } = p;
  const tz = settings.timezone;

  /* La zone et ses frais, décidés ici et jamais repris du navigateur, sur la
     durée d'une visite. Les frais sont ceux de la zone, réduits pour un
     abonné, et figés avec le montant du cycle : le tarif tient douze mois. */
  const verdict = evaluateZone(input.postalCode, plan.minutesPerVisit, settings.zonePolicy);
  if (!bookable(verdict)) throw new SubscriptionError("out_of_area");
  const quote = quoteCycle(plan, settings, verdict.feeCents);

  const id = randomUUID();
  const grid = gridFrom(p.starts[0], plan.everyWeeks, tz);
  const label = `Abonnement ${plan.fr.name}`;
  const prov = p.provenance;
  const visits = p.starts.map((s, i) => ({
    ref: bookingRef(), manage_token: token(24),
    starts_at: s.toISOString(),
    ends_at: new Date(s.getTime() + plan.minutesPerVisit * 60_000).toISOString(),
    /* La provenance suit la première visite seulement : c'est elle que
       l'onglet Rendez-vous montre comme l'arrivée du client. */
    heard_from: i === 0 ? prov?.heardFrom ?? null : null,
    utm_source: i === 0 ? prov?.source ?? null : null,
    utm_medium: i === 0 ? prov?.medium ?? null : null,
    utm_campaign: i === 0 ? prov?.campaign ?? null : null,
    referrer: i === 0 ? prov?.referrer ?? null : null,
    landing_page: i === 0 ? prov?.landing ?? null : null,
    first_seen_at: i === 0 ? prov?.firstSeenAt ?? null : null,
    visit_count: i === 0 ? prov?.visits ?? null : null,
  }));
  const paid = p.paidCurrent ? { [String(p.startCycle)]: new Date().toISOString() } : {};

  await ensureSchema();
  const q = sql();
  try {
    /* Tout ou rien : si une seule date se heurte à un rendez-vous pris
       entre-temps, la contrainte d'exclusion refuse, et aucune ligne de la
       série — ni l'abonnement — ne reste en base. */
    await q.transaction([
      q`INSERT INTO nivex_subscriptions (
          id, ref, manage_token, locale, status, plan_key, plan_name,
          visits_per_cycle, every_weeks, minutes_per_visit, grid_anchor, grid_hm,
          client_name, client_email, client_phone, address, city, postal_code, notes,
          cycle_cents, travel_fee_cents, travel_zone, currency,
          start_cycle, start_done, paid_cycles, created_by
        ) VALUES (
          ${id}, ${bookingRef().replace("NVX-", "ABO-")}, ${token(24)}, ${input.locale}, 'active', ${plan.key}, ${plan.fr.name},
          ${plan.visits}, ${plan.everyWeeks}, ${plan.minutesPerVisit}, ${grid.anchor}, ${grid.hm},
          ${input.name}, ${input.email}, ${input.phone}, ${input.address}, ${input.city},
          ${input.postalCode.toUpperCase()}, ${input.notes || null},
          ${quote.planCents}, ${quote.feePerVisitCents}, ${verdict.labelFr}, ${settings.currency},
          ${p.startCycle}, ${p.startDone}, ${JSON.stringify(paid)}::jsonb, ${p.createdBy}
        )`,
      q`INSERT INTO nivex_bookings (
          ref, manage_token, locale, status, client_name, client_email, client_phone,
          address, city, postal_code, notes, items, starts_at, ends_at,
          duration_minutes, estimate_cents, currency, first_hour_free,
          travel_fee_cents, travel_zone, subscription_id, series_no,
          heard_from, utm_source, utm_medium, utm_campaign,
          referrer, landing_page, first_seen_at, visit_count
        )
        SELECT
          r.ref, r.manage_token, ${input.locale}, 'confirmed', ${input.name}, ${input.email}, ${input.phone},
          ${input.address}, ${input.city}, ${input.postalCode.toUpperCase()}, ${input.notes || null},
          ${JSON.stringify([{ key: plan.key, label, qty: 1 }])}::jsonb, r.starts_at, r.ends_at,
          ${plan.minutesPerVisit}, 0, ${settings.currency}, false,
          0, ${verdict.labelFr}, ${id}::uuid, ${p.series},
          r.heard_from, r.utm_source, r.utm_medium, r.utm_campaign,
          r.referrer, r.landing_page, r.first_seen_at, r.visit_count
        FROM jsonb_to_recordset(${JSON.stringify(visits)}::jsonb) AS r(
          ref text, manage_token text, starts_at timestamptz, ends_at timestamptz,
          heard_from text, utm_source text, utm_medium text, utm_campaign text,
          referrer text, landing_page text, first_seen_at timestamptz, visit_count integer
        )`,
    ]);
  } catch (e) {
    if (isOverlap(e)) throw new SubscriptionError("slot_taken");
    throw e;
  }

  const full = (await findSubscription(id))!;
  const origin = siteOrigin(p.host);
  const at = await ownerAccessToken().catch(() => null);

  if (at) {
    await calendarSeries(full, full.visits, at, settings, origin)
      .catch((e) => logEvent("subscription_calendar_failed", { ref: full.sub.ref, error: describe(e) }));
  } else {
    await logEvent("subscription_calendar_skipped", { ref: full.sub.ref, reason: "no_access_token" });
  }

  const emailSent = at ? await sendConfirmation(full, at, settings, origin, p.createdBy === "owner") : false;

  /* Les textos ne dépendent pas de Google : ils partent même si le compte
     est débranché. L'artisan n'est prévenu que de ce qu'il n'a pas fait. */
  const first = full.visits[0];
  if (first) {
    const l = full.sub.locale;
    await Promise.all([
      sendSms(full.sub.clientPhone, SMS.subscriptionConfirmed(l, planName(full.sub, l),
        smsWhen(first.startsAt, settings.timezone, l), rhythmPhrase(full.sub.everyWeeks, l),
        `${origin}/${l}/abonnement/${full.sub.manageToken}`), full.sub.ref),
      p.createdBy === "client"
        ? sendSms(ownerSmsNumber(), SMS.owner.newSubscription(full.sub.clientName, full.sub.planName,
            smsWhen(first.startsAt, settings.timezone, "fr")), full.sub.ref)
        : Promise.resolve(false),
    ]);
  }

  await logEvent("subscription_created", {
    ref: full.sub.ref, plan: plan.key, visits: p.starts.length, by: p.createdBy, email: emailSent,
  });
  return (await findSubscription(id))!;
}

function isOverlap(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return /duplicate key|unique|conflicting key value|exclusion constraint|23P01/i.test(msg);
}

function describe(e: unknown): string {
  if (e instanceof GoogleError) return `${e.op} — HTTP ${e.status} · ${e.body.slice(0, 300)}`;
  return String((e as Error)?.message ?? e).slice(0, 400);
}

/* ============================ Agenda ============================ */

function summaryOf(sub: Subscription, n: VisitNumber | undefined): string {
  const rank = n ? ` ${n.index}/${sub.perCycle}` : "";
  return `NIVEX — ${sub.clientName} · ${sub.planName}${rank}`;
}

/**
 * La description d'une visite dans l'agenda : de quoi partir sans ouvrir
 * le tableau de bord. L'heure d'arrivée y figure, puisque l'événement couvre
 * l'installation et le rangement.
 */
function descriptionOf(sub: Subscription, v: Booking, n: VisitNumber | undefined, origin: string, tz: string): string {
  const arrival = new Date(v.startsAt.getTime() - SETUP_MINUTES * 60_000);
  const amount = cycleAmount(sub.cycleCents, sub.feePerVisitCents, sub.perCycle);
  const lines = [
    `Arrivée : ${formatTimeIn(arrival, tz)} (${SETUP_MINUTES} min avant la séance, pour s'installer)`,
    `Séance : ${formatTimeIn(v.startsAt, tz)} – ${formatTimeIn(v.endsAt, tz)}`,
    "",
    `Formule : ${sub.planName}`,
    n ? `Visite ${n.index}/${sub.perCycle} du cycle ${n.cycle}` : "Visite",
  ];
  if (n?.index === 1) {
    lines.push(`Paiement du cycle à cette visite : ${formatMoney(amount.totalCents, sub.currency, "fr")}`);
  }
  lines.push(
    "",
    `Client : ${sub.clientName}`,
    `Téléphone : ${sub.clientPhone}`,
    `Adresse : ${sub.address}, ${sub.city} ${sub.postalCode}`,
  );
  if (sub.notes) lines.push("", `Précisions : ${sub.notes}`);
  lines.push("", `Abonnement : ${sub.ref} · visite ${v.ref}`, `Tableau de bord : ${origin}/admin`);
  return lines.join("\n");
}

function locationOf(sub: Subscription): string {
  return `${sub.address}, ${sub.city}, QC ${sub.postalCode}`;
}

/** Quelques appels à la fois : Google limite le débit, et une série en compte une trentaine. */
async function eachLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Pose une série dans l'agenda : un événement récurrent, puis chaque
 * occurrence retouchée pour porter son rang. Une occurrence sans visite —
 * une date sautée — est supprimée ; une visite sans occurrence — déplacée
 * avant d'être inscrite — reçoit son propre événement.
 */
async function calendarSeries(full: SubscriptionFull, rows: Booking[], at: string, s: Settings, origin: string): Promise<void> {
  const { sub, view } = full;
  const kept = rows.filter((v) => v.status !== "cancelled" && !v.googleEventId)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (kept.length === 0) return;

  const grid = gridOf(sub, s.timezone);
  const firstIdx = gridIndexAfter(grid, new Date(kept[0].startsAt.getTime() - 1));
  const lastIdx = gridIndexAfter(grid, new Date(kept[kept.length - 1].startsAt.getTime() - 1));
  const firstGrid = gridDate(grid, firstIdx);
  const block = occupiedBlock({ startsAt: firstGrid, endsAt: new Date(firstGrid.getTime() + sub.minutesPerVisit * 60_000) });

  const ev = await createRecurringEvent(at, {
    calendarId: s.calendarId,
    summary: summaryOf(sub, undefined),
    description: descriptionOf(sub, kept[0], undefined, origin, s.timezone),
    location: locationOf(sub),
    start: block.start.toISOString(),
    end: block.end.toISOString(),
    timeZone: s.timezone,
    rrule: `RRULE:FREQ=WEEKLY;INTERVAL=${sub.everyWeeks};COUNT=${lastIdx - firstIdx + 1}`,
  });

  const instances = await listInstances(at, s.calendarId, ev.id);
  const byStart = new Map(kept.map((v) => [occupiedBlock(v).start.getTime(), v]));
  const matched = new Set<string>();

  await eachLimit(instances, 4, async (inst) => {
    const v = byStart.get(new Date(inst.originalStart).getTime());
    if (!v) {
      await deleteEvent(at, s.calendarId, inst.id).catch(() => {});
      return;
    }
    matched.add(v.id);
    await sql()`UPDATE nivex_bookings SET google_event_id = ${inst.id}, google_series_id = ${ev.id} WHERE id = ${v.id}`;
    v.googleEventId = inst.id;
    v.googleSeriesId = ev.id;
    await patchEvent(at, s.calendarId, inst.id, {
      summary: summaryOf(sub, view.numbers.get(v.id)),
      description: descriptionOf(sub, v, view.numbers.get(v.id), origin, s.timezone),
    }).catch((e) => logEvent("subscription_patch_failed", { ref: v.ref, error: describe(e) }));
  });

  await eachLimit(kept.filter((v) => !matched.has(v.id)), 3, (v) => calendarSingle(full, v, at, s, origin));
}

/** Une visite hors de la série récurrente — un remplacement, un déplacement d'avant l'inscription. */
async function calendarSingle(full: SubscriptionFull, v: Booking, at: string, s: Settings, origin: string): Promise<void> {
  const n = full.view.numbers.get(v.id);
  const block = occupiedBlock(v);
  try {
    const ev = await createEvent(at, {
      calendarId: s.calendarId,
      summary: summaryOf(full.sub, n),
      description: descriptionOf(full.sub, v, n, origin, s.timezone),
      location: locationOf(full.sub),
      start: block.start.toISOString(),
      end: block.end.toISOString(),
      timeZone: s.timezone,
    });
    await sql()`UPDATE nivex_bookings SET google_event_id = ${ev.id} WHERE id = ${v.id}`;
    v.googleEventId = ev.id;
  } catch (e) {
    await logEvent("subscription_calendar_failed", { ref: v.ref, error: describe(e) });
  }
}

/**
 * Remet à jour le rang de chaque visite à venir dans l'agenda.
 *
 * Une annulation fait reculer toutes les visites suivantes d'un rang : la
 * troisième devient la deuxième, et le « 3/4 » affiché doit suivre.
 */
async function renumberCalendar(full: SubscriptionFull, at: string, s: Settings, origin: string, opts: { times?: boolean } = {}): Promise<void> {
  const now = Date.now();
  const future = full.visits.filter((v) => v.status !== "cancelled" && v.googleEventId && v.endsAt.getTime() > now);
  await eachLimit(future, 4, async (v) => {
    const n = full.view.numbers.get(v.id);
    const block = occupiedBlock(v);
    await patchEvent(at, s.calendarId, v.googleEventId!, {
      summary: summaryOf(full.sub, n),
      description: descriptionOf(full.sub, v, n, origin, s.timezone),
      ...(opts.times ? { start: block.start.toISOString(), end: block.end.toISOString(), timeZone: s.timezone } : {}),
    }).catch((e) => logEvent("subscription_patch_failed", { ref: v.ref, error: describe(e) }));
  });
}

/* ============================ Courriels ============================ */

function emailBase(full: SubscriptionFull, s: Settings, origin: string, visits?: Date[]): SubscriptionEmailData {
  const { sub } = full;
  const amount = cycleAmount(sub.cycleCents, sub.feePerVisitCents, sub.perCycle);
  const upcoming = visits ?? full.visits
    .filter((v) => v.status !== "cancelled" && v.startsAt.getTime() > Date.now())
    .map((v) => v.startsAt);
  return {
    ref: sub.ref, locale: sub.locale,
    clientName: sub.clientName, clientEmail: sub.clientEmail, clientPhone: sub.clientPhone,
    address: sub.address, city: sub.city, postalCode: sub.postalCode, notes: sub.notes,
    planName: planName(sub, sub.locale),
    perCycle: sub.perCycle, everyWeeks: sub.everyWeeks, minutesPerVisit: sub.minutesPerVisit,
    visits: upcoming,
    planCents: amount.planCents, travelCents: amount.travelCents, totalCents: amount.totalCents,
    feePerVisitCents: sub.feePerVisitCents, travelZone: sub.travelZone,
    currency: sub.currency, timezone: s.timezone,
    manageUrl: `${origin}/${sub.locale}/abonnement/${sub.manageToken}`,
    siteUrl: origin, businessPhone: PHONE, businessEmail: contactEmail(s),
  };
}

function visitData(full: SubscriptionFull, v: Booking, s: Settings, origin: string): VisitEmailData {
  const n = full.view.numbers.get(v.id) ?? { cycle: full.view.currentCycle, index: 1 };
  return {
    ...emailBase(full, s, origin),
    startsAt: v.startsAt, cycle: n.cycle, index: n.index,
    paymentDue: n.index === 1 && !full.sub.paidCycles[String(n.cycle)],
  };
}

async function send(at: string, s: Settings, to: { email: string; name?: string }, m: { subject: string; html: string; text: string }, replyTo?: string): Promise<boolean> {
  try {
    await sendGmail(at, {
      to: to.email, toName: to.name, subject: m.subject, html: m.html, text: m.text,
      fromName: s.businessName || "NIVEX", replyTo: replyTo ?? contactEmail(s),
    });
    return true;
  } catch (e) {
    await logEvent("subscription_email_failed", { to: to.email === REQUEST_INBOX ? "owner" : "client", error: describe(e) });
    return false;
  }
}

/** La confirmation au client et la fiche à l'artisan. Vrai si le client l'a reçue. */
async function sendConfirmation(full: SubscriptionFull, at: string, s: Settings, origin: string, byOwner: boolean, visits?: Date[]): Promise<boolean> {
  const d = emailBase(full, s, origin, visits);
  if (d.visits.length === 0) return false;
  const [ok] = await Promise.all([
    send(at, s, { email: full.sub.clientEmail, name: full.sub.clientName }, subscriptionConfirmation(d)),
    send(at, s, { email: REQUEST_INBOX }, subscriptionOwnerNotification({ ...d, planName: planName(full.sub, "fr") }, byOwner), full.sub.clientEmail),
  ]);
  if (ok) await sql()`UPDATE nivex_bookings SET email_sent = true WHERE subscription_id = ${full.sub.id}`.catch(() => {});
  return ok;
}

/* ============================ Visites ============================ */

/**
 * Pose une visite de remplacement après la dernière, sur la grille.
 *
 * Le premier créneau libre parmi les `MAKEUP_SEARCH_STEPS` suivants ; si
 * aucun ne l'est, l'abonnement garde une visite « à replacer », que
 * l'artisan voit en tête de l'onglet Abonnés.
 */
async function appendMakeup(full: SubscriptionFull, s: Settings, at: string | null): Promise<Booking | null> {
  const { sub } = full;
  const kept = full.visits.filter((v) => v.status !== "cancelled");
  if (kept.length === 0) return null;

  /* Après la toute dernière date de la série, annulées comprises : quand la
     visite annulée était la dernière, son créneau vient de se libérer, et
     le remplacement ne doit pas retomber dessus. */
  const lastAt = new Date(Math.max(...full.visits.map((v) => v.startsAt.getTime())));
  const grid = gridOf(sub, s.timezone);
  const from = gridIndexAfter(grid, lastAt);
  const candidates = gridDates(grid, from, MAKEUP_SEARCH_STEPS);
  const busy = await loadBusyRange({
    accessToken: at, settings: s,
    timeMin: new Date(candidates[0].getTime() - DAY),
    timeMax: seriesSpanEnd(candidates, sub.minutesPerVisit),
  });
  const series = Math.max(...kept.map((v) => v.seriesNo ?? 1));

  for (const when of candidates) {
    if (slotProblem(when.getTime(), sub.minutesPerVisit, busy, s, new Date(), { checkLead: false })) continue;
    try {
      const rows = (await sql()`
        INSERT INTO nivex_bookings (
          ref, manage_token, locale, status, client_name, client_email, client_phone,
          address, city, postal_code, notes, items, starts_at, ends_at,
          duration_minutes, estimate_cents, currency, first_hour_free,
          travel_fee_cents, travel_zone, subscription_id, series_no, makeup, email_sent
        ) VALUES (
          ${bookingRef()}, ${token(24)}, ${sub.locale}, 'confirmed', ${sub.clientName}, ${sub.clientEmail}, ${sub.clientPhone},
          ${sub.address}, ${sub.city}, ${sub.postalCode}, ${sub.notes},
          ${JSON.stringify([{ key: sub.planKey, label: `Abonnement ${sub.planName}`, qty: 1 }])}::jsonb,
          ${when.toISOString()}, ${new Date(when.getTime() + sub.minutesPerVisit * 60_000).toISOString()},
          ${sub.minutesPerVisit}, 0, ${sub.currency}, false,
          0, ${sub.travelZone}, ${sub.id}, ${series}, true, true
        ) RETURNING *`) as Row[];
      return hydrate(rows[0]);
    } catch (e) {
      if (!isOverlap(e)) throw e;
    }
  }

  await sql()`UPDATE nivex_subscriptions SET pending_makeups = pending_makeups + 1 WHERE id = ${sub.id}`;
  return null;
}

/**
 * Annule une visite, sans toucher au reste de la série.
 *
 * Elle sort du compte du cycle, une visite la remplace en fin de série, son
 * occurrence disparaît de l'agenda, et les rangs suivants se recalculent.
 */
export async function cancelVisit(b: Booking, by: "client" | "owner", host?: string | null): Promise<{ replacement: Booking | null }> {
  if (b.status === "cancelled") return { replacement: null };
  if (b.doneAt) throw new SubscriptionError("done");
  const settings = await getSettings();
  const before = await findSubscription(b.subscriptionId!);
  if (!before) throw new SubscriptionError("not_found");
  if (by === "client" && !canSubscriberChange(b.startsAt, settings.timezone)) throw new SubscriptionError("too_late");

  await sql()`UPDATE nivex_bookings SET status = 'cancelled', cancelled_at = now() WHERE id = ${b.id} AND status = 'confirmed'`;

  const at = await ownerAccessToken().catch(() => null);
  const afterCancel = await loadFull(before.sub);
  const replacement = before.sub.status === "active" ? await appendMakeup(afterCancel, settings, at) : null;
  const full = await loadFull(before.sub);
  const origin = siteOrigin(host);

  if (at) {
    if (b.googleEventId) {
      await deleteEvent(at, settings.calendarId, b.googleEventId)
        .catch((e) => logEvent("calendar_delete_failed", { ref: b.ref, error: describe(e) }));
    }
    const fresh = replacement ? full.visits.find((v) => v.id === replacement.id) : null;
    if (fresh) await calendarSingle(full, fresh, at, settings, origin);
    await renumberCalendar(full, at, settings, origin);

    const change: VisitChange = { kind: "cancelled", replacement: replacement?.startsAt ?? null };
    const d = visitData(before, b, settings, origin);
    await send(at, settings, { email: b.clientEmail, name: b.clientName }, visitChanged(d, change));
    if (by === "client") {
      await send(at, settings, { email: REQUEST_INBOX }, ownerVisitChanged({ ...d, planName: before.sub.planName }, change), b.clientEmail);
    }
  }

  /* Le client reçoit toujours le texto ; l'artisan, quand le client a annulé. */
  const l = b.locale;
  await sendSms(b.clientPhone, SMS.visitCancelled(l, smsWhen(b.startsAt, settings.timezone, l),
    replacement ? smsWhen(replacement.startsAt, settings.timezone, l) : null), b.ref);
  if (by === "client") {
    await sendSms(ownerSmsNumber(), SMS.owner.cancelled(b.clientName, smsWhen(b.startsAt, settings.timezone, "fr")), b.ref);
  }

  await logEvent("subscription_visit_cancelled", {
    ref: b.ref, subscription: before.sub.ref, by, replacement: replacement?.startsAt.toISOString() ?? null,
  });
  return { replacement };
}

/** Déplace une visite. Les autres ne bougent pas ; les rangs suivent l'ordre des dates. */
export async function moveVisit(b: Booking, to: Date, by: "client" | "owner", host?: string | null): Promise<Booking> {
  if (b.status === "cancelled") throw new SubscriptionError("ended");
  if (b.doneAt) throw new SubscriptionError("done");
  if (!Number.isFinite(to.getTime())) throw new SubscriptionError("invalid_slot");
  const settings = await getSettings();
  if (by === "client" && !canSubscriberChange(b.startsAt, settings.timezone)) throw new SubscriptionError("too_late");

  const at = await ownerAccessToken().catch(() => null);
  const busy = await loadBusy({
    accessToken: at, settings, excludeId: b.id,
    timeMin: new Date(to.getTime() - DAY), timeMax: new Date(to.getTime() + 2 * DAY),
  }).catch(() => []);
  if (slotProblem(to.getTime(), b.durationMinutes, busy, settings, new Date(), { checkLead: by === "client" })) {
    throw new SubscriptionError("invalid_slot");
  }

  const end = new Date(to.getTime() + b.durationMinutes * 60_000);
  try {
    await sql()`
      UPDATE nivex_bookings
      SET starts_at = ${to.toISOString()}, ends_at = ${end.toISOString()}, reminder_sent_at = NULL, sms_reminded_at = NULL
      WHERE id = ${b.id} AND status = 'confirmed'`;
  } catch (e) {
    if (isOverlap(e)) throw new SubscriptionError("slot_taken");
    throw e;
  }

  const full = (await findSubscription(b.subscriptionId!))!;
  const moved = full.visits.find((v) => v.id === b.id)!;
  const origin = siteOrigin(host);

  if (at) {
    if (moved.googleEventId) {
      await renumberCalendar(full, at, settings, origin, { times: true });
    } else {
      await calendarSingle(full, moved, at, settings, origin);
      await renumberCalendar(full, at, settings, origin);
    }
    const change: VisitChange = { kind: "moved", from: b.startsAt };
    const d = visitData(full, moved, settings, origin);
    await send(at, settings, { email: b.clientEmail, name: b.clientName }, visitChanged(d, change));
    if (by === "client") {
      await send(at, settings, { email: REQUEST_INBOX }, ownerVisitChanged({ ...d, planName: full.sub.planName }, change), b.clientEmail);
    }
  }

  await sendSms(b.clientPhone, SMS.visitMoved(b.locale, smsWhen(b.startsAt, settings.timezone, b.locale),
    smsWhen(to, settings.timezone, b.locale)), b.ref);
  if (by === "client") {
    await sendSms(ownerSmsNumber(), SMS.owner.moved(b.clientName, smsWhen(b.startsAt, settings.timezone, "fr"),
      smsWhen(to, settings.timezone, "fr")), b.ref);
  }

  await logEvent("subscription_visit_moved", { ref: b.ref, by, from: b.startsAt.toISOString(), to: to.toISOString() });
  return moved;
}

/**
 * « Visite effectuée » : c'est ce bouton, et lui seul, qui fait avancer le
 * compteur du cycle. Une visite à venir ne peut pas être cochée.
 */
export async function markDone(visitId: string, done: boolean): Promise<void> {
  await ensureSchema();
  if (done) {
    await sql()`
      UPDATE nivex_bookings SET done_at = now()
      WHERE id = ${visitId} AND subscription_id IS NOT NULL AND status = 'confirmed'
        AND starts_at <= now() + interval '2 hours'`;
  } else {
    await sql()`UPDATE nivex_bookings SET done_at = NULL WHERE id = ${visitId} AND subscription_id IS NOT NULL`;
  }
}

/** « Paiement reçu » pour un cycle, ou son retrait en cas d'erreur de saisie. */
export async function setPaid(subId: string, cycle: number, paid: boolean): Promise<void> {
  await ensureSchema();
  const key = String(Math.max(1, Math.floor(cycle)));
  if (paid) {
    await sql()`
      UPDATE nivex_subscriptions
      SET paid_cycles = paid_cycles || jsonb_build_object(${key}::text, ${new Date().toISOString()}::text)
      WHERE id = ${subId}`;
  } else {
    await sql()`UPDATE nivex_subscriptions SET paid_cycles = paid_cycles - ${key}::text WHERE id = ${subId}`;
  }
}

/** Une visite replacée à la main : l'alerte « à replacer » diminue d'autant. */
export async function placeMakeup(subId: string, date: string, time: string, host?: string | null): Promise<Booking> {
  const settings = await getSettings();
  const full = await findSubscription(subId);
  if (!full) throw new SubscriptionError("not_found");
  const when = ownerInstant(date, time, settings.timezone);
  const at = await ownerAccessToken().catch(() => null);
  const busy = await loadBusy({
    accessToken: at, settings, timeMin: new Date(when.getTime() - DAY), timeMax: new Date(when.getTime() + 2 * DAY),
  }).catch(() => []);
  if (slotProblem(when.getTime(), full.sub.minutesPerVisit, busy, settings, new Date(), { checkLead: false })) {
    throw new SubscriptionError("invalid_slot");
  }
  const series = Math.max(1, ...full.visits.map((v) => v.seriesNo ?? 1));
  let row: Row;
  try {
    row = ((await sql()`
      INSERT INTO nivex_bookings (
        ref, manage_token, locale, status, client_name, client_email, client_phone,
        address, city, postal_code, notes, items, starts_at, ends_at,
        duration_minutes, estimate_cents, currency, first_hour_free,
        travel_fee_cents, travel_zone, subscription_id, series_no, makeup, email_sent
      ) VALUES (
        ${bookingRef()}, ${token(24)}, ${full.sub.locale}, 'confirmed', ${full.sub.clientName}, ${full.sub.clientEmail}, ${full.sub.clientPhone},
        ${full.sub.address}, ${full.sub.city}, ${full.sub.postalCode}, ${full.sub.notes},
        ${JSON.stringify([{ key: full.sub.planKey, label: `Abonnement ${full.sub.planName}`, qty: 1 }])}::jsonb,
        ${when.toISOString()}, ${new Date(when.getTime() + full.sub.minutesPerVisit * 60_000).toISOString()},
        ${full.sub.minutesPerVisit}, 0, ${full.sub.currency}, false,
        0, ${full.sub.travelZone}, ${full.sub.id}, ${series}, true, true
      ) RETURNING *`) as Row[])[0];
  } catch (e) {
    if (isOverlap(e)) throw new SubscriptionError("slot_taken");
    throw e;
  }
  await sql()`UPDATE nivex_subscriptions SET pending_makeups = greatest(0, pending_makeups - 1) WHERE id = ${subId}`;
  const after = (await findSubscription(subId))!;
  const v = hydrate(row);
  if (at) {
    const origin = siteOrigin(host);
    await calendarSingle(after, after.visits.find((x) => x.id === v.id)!, at, settings, origin);
    await renumberCalendar(after, at, settings, origin);
  }
  await logEvent("subscription_makeup_placed", { ref: v.ref, subscription: full.sub.ref });
  return v;
}

/* ============================ Séries ============================ */

/**
 * Pose la série suivante — la seconde moitié des douze mois — au même
 * tarif, à la suite de la dernière visite et au même rythme.
 *
 * En cas de conflit, l'artisan voit les dates. Il peut les sauter : la
 * série se prolonge alors d'autant de dates, pour garder ses six cycles.
 */
export async function renewSeries(subId: string, opts: { skipConflicts: boolean }, host?: string | null): Promise<SubscriptionFull> {
  const settings = await getSettings();
  const full = await findSubscription(subId);
  if (!full) throw new SubscriptionError("not_found");
  if (full.sub.status !== "active") throw new SubscriptionError("ended");
  if (full.view.latestSeries >= TERM_SERIES) throw new SubscriptionError("term_done");

  const { sub } = full;
  const kept = full.visits.filter((v) => v.status !== "cancelled");
  const last = kept[kept.length - 1];
  const grid = gridOf(sub, settings.timezone);
  const from = last ? gridIndexAfter(grid, last.startsAt) : gridIndexAfter(grid, new Date());
  const count = sub.perCycle * SERIES_CYCLES;
  const window = gridDates(grid, from, count + (opts.skipConflicts ? count : 0));

  const at = await ownerAccessToken().catch(() => null);
  const busy = await loadBusyRange({
    accessToken: at, settings,
    timeMin: new Date(window[0].getTime() - DAY), timeMax: seriesSpanEnd(window, sub.minutesPerVisit),
  });
  const conflicts = seriesConflicts(window.slice(0, count), sub.minutesPerVisit, busy, settings, { checkLead: false });
  if (conflicts.length > 0 && !opts.skipConflicts) throw new SubscriptionError("conflicts", conflicts);

  const taken = new Set(seriesConflicts(window, sub.minutesPerVisit, busy, settings, { checkLead: false }).map((c) => c.startsAt.getTime()));
  const starts = window.filter((d) => !taken.has(d.getTime())).slice(0, count);
  if (starts.length < count) throw new SubscriptionError("conflicts", conflicts);

  const series = full.view.latestSeries + 1;
  const rows = starts.map((s) => ({
    ref: bookingRef(), manage_token: token(24),
    starts_at: s.toISOString(),
    ends_at: new Date(s.getTime() + sub.minutesPerVisit * 60_000).toISOString(),
  }));
  try {
    await sql()`
      INSERT INTO nivex_bookings (
        ref, manage_token, locale, status, client_name, client_email, client_phone,
        address, city, postal_code, notes, items, starts_at, ends_at,
        duration_minutes, estimate_cents, currency, first_hour_free,
        travel_fee_cents, travel_zone, subscription_id, series_no
      )
      SELECT
        r.ref, r.manage_token, ${sub.locale}, 'confirmed', ${sub.clientName}, ${sub.clientEmail}, ${sub.clientPhone},
        ${sub.address}, ${sub.city}, ${sub.postalCode}, ${sub.notes},
        ${JSON.stringify([{ key: sub.planKey, label: `Abonnement ${sub.planName}`, qty: 1 }])}::jsonb, r.starts_at, r.ends_at,
        ${sub.minutesPerVisit}, 0, ${sub.currency}, false,
        0, ${sub.travelZone}, ${sub.id}::uuid, ${series}
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
        ref text, manage_token text, starts_at timestamptz, ends_at timestamptz
      )`;
  } catch (e) {
    if (isOverlap(e)) throw new SubscriptionError("slot_taken");
    throw e;
  }

  const after = (await findSubscription(subId))!;
  const origin = siteOrigin(host);
  if (at) {
    const fresh = after.visits.filter((v) => v.seriesNo === series);
    await calendarSeries(after, fresh, at, settings, origin)
      .catch((e) => logEvent("subscription_calendar_failed", { ref: sub.ref, error: describe(e) }));
    await sendConfirmation(after, at, settings, origin, true, starts);
  }
  await logEvent("subscription_renewed", { ref: sub.ref, series, visits: starts.length, skipped: taken.size });
  return (await findSubscription(subId))!;
}

/**
 * Met fin à un abonnement : les visites à venir sont annulées — sans
 * remplacement, puisque rien ne reste à compléter — et retirées de l'agenda.
 * Celles qui ont eu lieu restent dans l'historique.
 */
export async function endSubscription(subId: string, host?: string | null): Promise<{ removed: number }> {
  const settings = await getSettings();
  const full = await findSubscription(subId);
  if (!full) throw new SubscriptionError("not_found");

  await sql()`UPDATE nivex_subscriptions SET status = 'ended', ended_at = coalesce(ended_at, now()) WHERE id = ${subId}`;
  const removed = ((await sql()`
    UPDATE nivex_bookings SET status = 'cancelled', cancelled_at = now()
    WHERE subscription_id = ${subId} AND status = 'confirmed' AND done_at IS NULL AND starts_at > now()
    RETURNING *`) as Row[]).map(hydrate).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const at = await ownerAccessToken().catch(() => null);
  if (at) {
    await eachLimit(removed.filter((v) => v.googleEventId), 4, async (v) => {
      await deleteEvent(at, settings.calendarId, v.googleEventId!)
        .catch((e) => logEvent("calendar_delete_failed", { ref: v.ref, error: describe(e) }));
    });
    if (removed.length > 0) {
      const origin = siteOrigin(host);
      await send(at, settings, { email: full.sub.clientEmail, name: full.sub.clientName },
        subscriptionEnded(emailBase(full, settings, origin), removed.map((v) => v.startsAt)));
    }
  }
  await logEvent("subscription_ended", { ref: full.sub.ref, removed: removed.length });
  return { removed: removed.length };
}

/**
 * Supprime un abonnement pour de bon — un essai, une erreur de saisie.
 *
 * Refusé dès qu'une visite a été effectuée : l'historique d'un vrai client
 * ne s'efface pas, il prend fin. Les séries disparaissent de l'agenda d'un
 * coup, puis les visites et l'abonnement de la base.
 */
export async function deleteSubscription(subId: string): Promise<void> {
  const settings = await getSettings();
  const full = await findSubscription(subId);
  if (!full) throw new SubscriptionError("not_found");
  if (full.visits.some((v) => v.doneAt)) throw new SubscriptionError("has_done");

  const at = await ownerAccessToken().catch(() => null);
  if (at) {
    const masters = [...new Set(full.visits.map((v) => v.googleSeriesId).filter((x): x is string => Boolean(x)))];
    const singles = full.visits.filter((v) => !v.googleSeriesId && v.googleEventId).map((v) => v.googleEventId!);
    await eachLimit([...masters, ...singles], 4, async (id) => {
      await deleteEvent(at, settings.calendarId, id)
        .catch((e) => logEvent("calendar_delete_failed", { ref: full.sub.ref, error: describe(e) }));
    });
  }
  await sql().transaction([
    sql()`DELETE FROM nivex_bookings WHERE subscription_id = ${subId}`,
    sql()`DELETE FROM nivex_subscriptions WHERE id = ${subId}`,
  ]);
  await logEvent("subscription_deleted", { ref: full.sub.ref, visits: full.visits.length });
}

/**
 * Remet l'agenda d'accord avec la base, et renvoie la confirmation.
 *
 * Pour les visites à venir : une occurrence retouchée à l'heure et au rang
 * de la base, un événement créé là où il en manque, une occurrence retirée
 * là où la visite est annulée.
 */
export async function resendSubscription(subId: string, host?: string | null): Promise<{
  emailSent: boolean; calendarAdded: boolean; error: string | null;
}> {
  const settings = await getSettings();
  const full = await findSubscription(subId);
  if (!full) return { emailSent: false, calendarAdded: false, error: "Abonnement introuvable." };

  let at: string | null = null;
  try {
    at = await ownerAccessToken();
  } catch (e) {
    return { emailSent: false, calendarAdded: false, error: describe(e) };
  }
  if (!at) return { emailSent: false, calendarAdded: false, error: "Aucun compte Google branché." };

  const origin = siteOrigin(host);
  const now = Date.now();
  const future = full.visits.filter((v) => v.endsAt.getTime() > now);

  await eachLimit(future.filter((v) => v.status === "cancelled" && v.googleEventId), 4, async (v) => {
    await deleteEvent(at!, settings.calendarId, v.googleEventId!).catch(() => {});
    await sql()`UPDATE nivex_bookings SET google_event_id = NULL WHERE id = ${v.id}`;
  });

  const missing = future.filter((v) => v.status !== "cancelled" && !v.googleEventId);
  const neverSynced = !full.visits.some((v) => v.googleSeriesId);
  if (neverSynced && missing.length > 1) {
    await calendarSeries(full, missing, at, settings, origin)
      .catch((e) => logEvent("subscription_calendar_failed", { ref: full.sub.ref, error: describe(e) }));
  } else {
    await eachLimit(missing, 3, (v) => calendarSingle(full, v, at!, settings, origin));
  }
  await renumberCalendar(await loadFull(full.sub), at, settings, origin, { times: true });

  const after = await loadFull(full.sub);
  const calendarAdded = after.visits.filter((v) => v.status !== "cancelled" && v.endsAt.getTime() > now).every((v) => v.googleEventId);
  const emailSent = after.sub.status === "active" ? await sendConfirmation(after, at, settings, origin, false) : false;
  await logEvent("subscription_resent", { ref: full.sub.ref, emailSent, calendarAdded });
  return {
    emailSent, calendarAdded,
    error: emailSent ? null : "Le courriel n'est toujours pas parti. Vérifiez la connexion Google.",
  };
}

/* ============================ Tâche quotidienne ============================ */

/**
 * Ce que la maison fait seule, une fois par jour.
 *
 *  — Le rappel de la veille. Pour une visite d'abonné : un courriel et un
 *    texto. Pour une séance ponctuelle : un texto. Une visite d'aujourd'hui
 *    qui n'a rien reçu — déplacée après le passage d'hier — reçoit le sien le
 *    matin même.
 *  — Le courriel de l'artisan, une semaine avant la dernière visite d'une
 *    série : la suite est-elle confirmée, ou quelque chose change-t-il ?
 *
 * Courriels et textos se notent chacun dans leur colonne : un second passage
 * le même jour ne renvoie rien, et l'un qui échoue n'empêche pas l'autre. Un
 * compte Google débranché coupe les courriels, pas les textos.
 */
export async function runDaily(host?: string | null, now = new Date()): Promise<{
  reminders: number; smsReminders: number; notices: number; google: boolean;
}> {
  await ensureSchema();
  const settings = await getSettings();
  const at = await ownerAccessToken().catch(() => null);
  if (!at) await logEvent("daily_emails_skipped", { reason: "no_access_token" });
  const tz = settings.timezone;
  const origin = siteOrigin(host);
  const today = dateKey(now, tz);
  const tomorrow = addDaysToKey(today, 1);

  const cache = new Map<string, SubscriptionFull | null>();
  const subOf = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await findSubscription(id));
    return cache.get(id)!;
  };

  /* — Rappels — */
  const due = ((await sql()`
    SELECT * FROM nivex_bookings
    WHERE status = 'confirmed'
      AND ((subscription_id IS NOT NULL AND reminder_sent_at IS NULL) OR sms_reminded_at IS NULL)
      AND starts_at > ${new Date(now.getTime() + 3600_000).toISOString()}
      AND starts_at < ${new Date(now.getTime() + 2 * DAY).toISOString()}
    ORDER BY starts_at`) as Row[]);

  let reminders = 0;
  let smsReminders = 0;
  for (const r of due) {
    const v = hydrate(r);
    const key = dateKey(v.startsAt, tz);
    if (key !== today && key !== tomorrow) continue;
    const isToday = key === today;

    let payment: string | null = null;
    if (v.subscriptionId) {
      const full = await subOf(v.subscriptionId);
      if (!full || full.sub.status !== "active") continue;
      const d = visitData(full, v, settings, origin);
      if (d.paymentDue) payment = formatMoney(d.totalCents, d.currency, v.locale);
      if (at && !v.reminderSentAt) {
        if (await send(at, settings, { email: v.clientEmail, name: v.clientName }, visitReminder(d, isToday))) {
          await sql()`UPDATE nivex_bookings SET reminder_sent_at = now() WHERE id = ${v.id}`;
          reminders++;
        }
      }
    }

    if (!r.sms_reminded_at) {
      const body = SMS.reminder(v.locale, smsWhen(v.startsAt, tz, v.locale), isToday, payment);
      if (await sendSms(v.clientPhone, body, v.ref)) {
        await sql()`UPDATE nivex_bookings SET sms_reminded_at = now() WHERE id = ${v.id}`;
        smsReminders++;
      }
    }
  }

  /* — Fin de série — */
  let notices = 0;
  const active = at ? (await sql()`SELECT * FROM nivex_subscriptions WHERE status = 'active'`) as Row[] : [];
  for (const r of active) {
    const full = await subOf(r.id as string);
    if (!full) continue;
    const { view, sub } = full;
    const alert = view.alerts.find((a) => a.kind === "series_ending");
    if (!alert || alert.kind !== "series_ending" || sub.noticeSeries >= alert.series) continue;
    const ok = await send(at!, settings, { email: REQUEST_INBOX },
      seriesNotice({ ...emailBase(full, settings, origin), planName: sub.planName }, {
        series: alert.series, lastAt: alert.lastAt, termEnds: alert.series >= TERM_SERIES,
      }), sub.clientEmail);
    if (ok) {
      await sql()`UPDATE nivex_subscriptions SET notice_series = ${alert.series} WHERE id = ${sub.id}`;
      notices++;
    }
  }

  await logEvent("daily_done", { reminders, smsReminders, notices, day: today });
  return { reminders, smsReminders, notices, google: Boolean(at) };
}

/* ============================ Pour l'affichage ============================ */

/** Le montant d'un cycle de cet abonnement, figé à la souscription. */
export function amountOf(sub: Subscription) {
  return cycleAmount(sub.cycleCents, sub.feePerVisitCents, sub.perCycle);
}

export function offsetOf(sub: Subscription): number {
  return startOffset(sub.perCycle, sub.startCycle, sub.startDone);
}



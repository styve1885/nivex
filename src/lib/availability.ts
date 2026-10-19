import type { Settings } from "./settings";
import { freeBusy, type Busy } from "./google";
import { ensureSchema, sql } from "./db";
import { SETUP_MINUTES } from "./brand";
import {
  addDaysToKey, dateKey, formatHM, fromWall, parseDateKey, parseHM, toWall, weekdayOfKey,
} from "./time";

export type Interval = { start: number; end: number }; // ms epoch

export type DaySlots = {
  date: string;          // « 2026-08-25 » dans le fuseau de l'artisan
  weekday: number;
  open: boolean;         // l'atelier travaille-t-il ce jour-là
  slots: { time: string; iso: string }[];
};

/** Fusionne et trie des intervalles qui se chevauchent. */
export function merge(list: Interval[]): Interval[] {
  if (list.length === 0) return [];
  const s = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [s[0]];
  for (let i = 1; i < s.length; i++) {
    const last = out[out.length - 1];
    if (s[i].start <= last.end) last.end = Math.max(last.end, s[i].end);
    else out.push({ ...s[i] });
  }
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Le temps réellement occupé par une séance : l'installation avant, le
 * rangement après. C'est ce bloc qui ne doit en croiser aucun autre — la
 * contrainte d'exclusion de la base le dit déjà (`nivex_occupied`), et le
 * moteur de créneaux doit dire la même chose qu'elle. Sans cela, une base
 * seule (Google injoignable) laissait le tampon se faire manger par
 * l'installation, et un tampon sous trente minutes proposait des heures
 * que la contrainte refusait ensuite.
 */
export function withSetup(i: Interval): Interval {
  return { start: i.start - SETUP_MINUTES * 60_000, end: i.end + SETUP_MINUTES * 60_000 };
}

/**
 * Le premier instant hors d'atteinte : minuit au lendemain du dernier jour
 * réservable, dans le fuseau de l'artisan.
 */
export function horizonEnd(s: Settings, now = new Date()): number {
  return fromWall(
    { ...parseDateKey(addDaysToKey(dateKey(now, s.timezone), s.horizonDays + 1)), hour: 0, minute: 0 },
    s.timezone,
  ).getTime();
}

/**
 * L'heure tombe-t-elle sur la grille que le tunnel propose ? Elle part de
 * l'ouverture du jour, de `slotStep` en `slotStep`, à la minute pile. Lue
 * à l'heure murale de l'artisan, jamais en UTC.
 */
export function onSlotGrid(start: number, s: Settings): boolean {
  if (!Number.isFinite(start) || start % 60_000 !== 0) return false;
  const key = dateKey(new Date(start), s.timezone);
  const rule = s.hours.find((h) => h.day === weekdayOfKey(key));
  if (!rule) return false;
  const w = toWall(new Date(start), s.timezone);
  return (w.hour * 60 + w.minute - parseHM(rule.open)) % s.slotStep === 0;
}

/**
 * Créneaux libres pour une plage de dates.
 *
 * Un créneau est retenu si :
 *  – il tient entièrement dans les heures d'ouverture du jour ;
 *  – il commence après le délai de prévenance (leadHours) ;
 *  – son installation et son rangement compris, il ne chevauche aucune
 *    occupation élargie du tampon de déplacement. Entre le rangement de
 *    l'un et l'installation de l'autre, il reste donc tout le tampon.
 */
export function computeSlots(opts: {
  fromKey: string;
  days: number;
  durationMinutes: number;
  settings: Settings;
  busy: Interval[];
  now?: Date;
}): DaySlots[] {
  const { settings: s, durationMinutes } = opts;
  const now = opts.now ?? new Date();
  const tz = s.timezone;
  const earliest = now.getTime() + s.leadHours * 3600_000;

  const lastMs = horizonEnd(s, now);

  // Le tampon protège l'artisan de part et d'autre de chaque engagement.
  const blocked = merge(
    opts.busy.map((b) => ({
      start: b.start - s.bufferMinutes * 60_000,
      end: b.end + s.bufferMinutes * 60_000,
    })),
  );

  const out: DaySlots[] = [];

  for (let i = 0; i < opts.days; i++) {
    const key = addDaysToKey(opts.fromKey, i);
    const wd = weekdayOfKey(key);
    const rule = s.hours.find((h) => h.day === wd);
    const day: DaySlots = { date: key, weekday: wd, open: Boolean(rule?.enabled), slots: [] };

    if (!rule?.enabled) { out.push(day); continue; }

    const openM = parseHM(rule.open);
    const closeM = parseHM(rule.close);
    if (closeM - openM < durationMinutes) { out.push(day); continue; }

    const ymd = parseDateKey(key);
    const lastStart = closeM - durationMinutes;

    for (let m = openM; m <= lastStart; m += s.slotStep) {
      const start = fromWall({ ...ymd, hour: Math.floor(m / 60), minute: m % 60 }, tz);
      const startMs = start.getTime();
      const endMs = startMs + durationMinutes * 60_000;

      if (startMs < earliest) continue;
      if (startMs >= lastMs) break;

      const candidate = withSetup({ start: startMs, end: endMs });
      if (blocked.some((b) => overlaps(candidate, b))) continue;

      day.slots.push({ time: formatHM(m), iso: start.toISOString() });
    }

    out.push(day);
  }

  return out;
}

/**
 * Occupations réelles : l'agenda Google du propriétaire + les réservations
 * en base. La base sert de filet si la création d'événement a échoué — et
 * de seule source si l'agenda ne répond pas, ou si rien n'est branché.
 *
 * Une réservation en base compte pour le temps qu'elle occupe vraiment,
 * installation et rangement compris : c'est ce que l'agenda montrerait, et
 * ce que la contrainte d'exclusion protège.
 */
export async function loadBusy(opts: {
  accessToken: string | null;
  settings: Settings;
  timeMin: Date;
  timeMax: Date;
  /** Une réservation à ne pas compter : celle qu'on est en train de déplacer. */
  excludeId?: string;
}): Promise<Interval[]> {
  const { accessToken, settings, timeMin, timeMax } = opts;
  const excludeId = opts.excludeId ?? "00000000-0000-0000-0000-000000000000";

  const [gcal, rows] = await Promise.all([
    accessToken
      ? freeBusy(accessToken, settings.calendarId, timeMin.toISOString(), timeMax.toISOString(), settings.timezone)
          .catch(() => [] as Busy[])
      : Promise.resolve([] as Busy[]),
    ensureSchema()
      .then(() => sql()`
        SELECT starts_at, ends_at FROM nivex_bookings
        WHERE status IN ('confirmed','pending')
          AND id <> ${excludeId}
          AND ends_at   > ${new Date(timeMin.getTime() - SETUP_MINUTES * 60_000).toISOString()}
          AND starts_at < ${new Date(timeMax.getTime() + SETUP_MINUTES * 60_000).toISOString()}`)
      .catch(() => [] as Record<string, unknown>[]),
  ]);

  const fromGoogle: Interval[] = gcal.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const fromDb: Interval[] = (rows as Record<string, unknown>[]).map((r) => withSetup({
    start: new Date(r.starts_at as string).getTime(),
    end: new Date(r.ends_at as string).getTime(),
  }));

  return merge([...fromGoogle, ...fromDb].filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end)));
}

/**
 * Le créneau qu'un client demande est-il encore réellement libre ? Contrôle
 * final avant écriture d'une séance ponctuelle.
 *
 * Plus exigeant que `slotProblem` : l'heure doit aussi tomber sur la grille
 * que le tunnel propose, et avant l'horizon réglé. Le navigateur ne décide
 * de rien — une requête fabriquée à la main n'obtient ni 9 h 07, ni une
 * date dans deux ans au tarif d'aujourd'hui.
 */
export function slotIsFree(startISO: string, durationMinutes: number, busy: Interval[], s: Settings, now = new Date()): boolean {
  const start = new Date(startISO).getTime();
  if (!(start < horizonEnd(s, now)) || !onSlotGrid(start, s)) return false;
  return slotProblem(start, durationMinutes, busy, s, now) === null;
}

/**
 * Pourquoi un créneau ne convient pas — ou `null` s'il convient.
 *
 * Même contrôle que `slotIsFree`, mais il dit lequel a échoué : une série
 * d'abonnement affiche ses dates en conflit, et « déjà pris » n'appelle pas
 * la même réponse que « jour fermé ». Le délai de prévenance peut être
 * levé : il protège la maison d'un rendez-vous pris trop tard, et n'a pas de
 * sens pour la vingtième date d'une série, ni pour l'artisan qui place
 * lui-même une visite.
 */
export type SlotProblem = "invalid" | "lead" | "closed" | "busy";

export function slotProblem(
  start: number, durationMinutes: number, busy: Interval[], s: Settings,
  now = new Date(), opts: { checkLead?: boolean } = {},
): SlotProblem | null {
  if (!Number.isFinite(start)) return "invalid";
  if ((opts.checkLead ?? true) && start < now.getTime() + s.leadHours * 3600_000 - 60_000) return "lead";

  const candidate = { start, end: start + durationMinutes * 60_000 };

  // Doit tenir dans les heures d'ouverture du jour.
  const key = dateKey(new Date(start), s.timezone);
  const rule = s.hours.find((h) => h.day === weekdayOfKey(key));
  if (!rule?.enabled) return "closed";

  const ymd = parseDateKey(key);
  const openMs  = fromWall({ ...ymd, hour: Math.floor(parseHM(rule.open) / 60),  minute: parseHM(rule.open) % 60 },  s.timezone).getTime();
  const closeMs = fromWall({ ...ymd, hour: Math.floor(parseHM(rule.close) / 60), minute: parseHM(rule.close) % 60 }, s.timezone).getTime();
  if (start < openMs || candidate.end > closeMs) return "closed";

  // L'horaire porte sur la séance ; l'occupation, sur le bloc entier.
  const blocked = merge(busy.map((b) => ({
    start: b.start - s.bufferMinutes * 60_000,
    end: b.end + s.bufferMinutes * 60_000,
  })));
  if (blocked.some((b) => overlaps(withSetup(candidate), b))) return "busy";

  return null;
}

/** Durée estimée à partir du panier, arrondie au pas de créneau et bornée au minimum. */
export function estimateMinutes(
  items: { key: string; qty: number }[],
  s: Settings,
): number {
  const raw = items.reduce((sum, it) => {
    const svc = s.services.find((x) => x.key === it.key && x.enabled);
    return sum + (svc ? svc.minutesPerUnit * Math.max(0, it.qty) : 0);
  }, 0);
  if (raw <= 0) return 0;
  const rounded = Math.ceil(raw / s.slotStep) * s.slotStep;
  return Math.max(s.minMinutes, rounded);
}

/** Montant estimé, en cents, première heure éventuellement offerte. */
export function estimateCents(minutes: number, s: Settings, firstFree: boolean): number {
  const billable = firstFree ? Math.max(0, minutes - 60) : minutes;
  return Math.round((billable / 60) * s.hourlyRate);
}

/**
 * Les occupations sur une longue période — les six mois d'une série.
 *
 * L'agenda Google est interrogé par tranches de deux mois : une requête de
 * disponibilité sur une demi-année n'est pas garantie, et une tranche qui
 * échoue ne doit pas effacer les autres. La base, elle, répond d'un coup,
 * et c'est elle qui a le dernier mot à l'écriture.
 *
 * La plage est bornée, et les tranches partent quelques-unes à la fois :
 * une date en l'an 9999 donnait des dizaines de milliers de requêtes
 * lancées ensemble, de quoi épuiser le quota Google de l'artisan. Au-delà
 * de la borne on refuse plutôt que de tronquer — une plage raccourcie en
 * silence sauterait des conflits.
 */
export async function loadBusyRange(opts: {
  accessToken: string | null;
  settings: Settings;
  timeMin: Date;
  timeMax: Date;
  excludeId?: string;
}): Promise<Interval[]> {
  const chunk = 60 * 24 * 3600_000;
  const span = opts.timeMax.getTime() - opts.timeMin.getTime();
  if (!(span <= MAX_RANGE_MS)) throw new Error(`Plage d'occupations trop longue : ${Math.round(span / 86_400_000)} jours.`);

  const starts: number[] = [];
  for (let t = opts.timeMin.getTime(); t < opts.timeMax.getTime(); t += chunk) starts.push(t);

  const out: Interval[] = [];
  for (let i = 0; i < starts.length; i += RANGE_CONCURRENCY) {
    const batch = await Promise.all(starts.slice(i, i + RANGE_CONCURRENCY).map((t) => loadBusy({
      ...opts,
      timeMin: new Date(t),
      timeMax: new Date(Math.min(t + chunk, opts.timeMax.getTime())),
    }).catch(() => [] as Interval[])));
    out.push(...batch.flat());
  }
  return merge(out);
}

/* Douze mois d'abonnement, une seconde série cherchée large, une date
   saisie un an en arrière : trois ans couvrent tout ce qui est légitime. */
const MAX_RANGE_MS = 3 * 366 * 86_400_000;
const RANGE_CONCURRENCY = 4;

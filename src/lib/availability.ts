import type { Settings } from "./settings";
import { freeBusy, type Busy } from "./google";
import { ensureSchema, sql } from "./db";
import {
  addDaysToKey, dateKey, formatHM, fromWall, parseDateKey, parseHM, weekdayOfKey,
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
 * Créneaux libres pour une plage de dates.
 *
 * Un créneau est retenu si :
 *  – il tient entièrement dans les heures d'ouverture du jour ;
 *  – il commence après le délai de prévenance (leadHours) ;
 *  – il ne chevauche aucune occupation, élargie du tampon de déplacement.
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

  const horizonEnd = fromWall(
    { ...parseDateKey(addDaysToKey(dateKey(now, tz), s.horizonDays + 1)), hour: 0, minute: 0 },
    tz,
  ).getTime();

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
      if (startMs >= horizonEnd) break;

      const candidate = { start: startMs, end: endMs };
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
 */
export async function loadBusy(opts: {
  accessToken: string | null;
  settings: Settings;
  timeMin: Date;
  timeMax: Date;
}): Promise<Interval[]> {
  const { accessToken, settings, timeMin, timeMax } = opts;

  const [gcal, rows] = await Promise.all([
    accessToken
      ? freeBusy(accessToken, settings.calendarId, timeMin.toISOString(), timeMax.toISOString(), settings.timezone)
          .catch(() => [] as Busy[])
      : Promise.resolve([] as Busy[]),
    ensureSchema()
      .then(() => sql()`
        SELECT starts_at, ends_at FROM nivex_bookings
        WHERE status IN ('confirmed','pending')
          AND ends_at   > ${timeMin.toISOString()}
          AND starts_at < ${timeMax.toISOString()}`)
      .catch(() => [] as Record<string, unknown>[]),
  ]);

  const fromGoogle: Interval[] = gcal.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const fromDb: Interval[] = (rows as Record<string, unknown>[]).map((r) => ({
    start: new Date(r.starts_at as string).getTime(),
    end: new Date(r.ends_at as string).getTime(),
  }));

  return merge([...fromGoogle, ...fromDb].filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end)));
}

/** Le créneau demandé est-il encore réellement libre ? Contrôle final avant écriture. */
export function slotIsFree(startISO: string, durationMinutes: number, busy: Interval[], s: Settings, now = new Date()): boolean {
  const start = new Date(startISO).getTime();
  if (!Number.isFinite(start)) return false;
  if (start < now.getTime() + s.leadHours * 3600_000 - 60_000) return false;

  const candidate = { start, end: start + durationMinutes * 60_000 };
  const blocked = merge(busy.map((b) => ({
    start: b.start - s.bufferMinutes * 60_000,
    end: b.end + s.bufferMinutes * 60_000,
  })));
  if (blocked.some((b) => overlaps(candidate, b))) return false;

  // Doit tenir dans les heures d'ouverture du jour.
  const key = dateKey(new Date(start), s.timezone);
  const rule = s.hours.find((h) => h.day === weekdayOfKey(key));
  if (!rule?.enabled) return false;

  const ymd = parseDateKey(key);
  const openMs  = fromWall({ ...ymd, hour: Math.floor(parseHM(rule.open) / 60),  minute: parseHM(rule.open) % 60 },  s.timezone).getTime();
  const closeMs = fromWall({ ...ymd, hour: Math.floor(parseHM(rule.close) / 60), minute: parseHM(rule.close) % 60 }, s.timezone).getTime();

  return start >= openMs && candidate.end <= closeMs;
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

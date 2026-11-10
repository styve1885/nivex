import type { Settings } from "./settings";
import { freeBusy, listEvents, type Busy, type CalendarItem } from "./google";
import { ensureSchema, sql } from "./db";
import { EARLY_ARRIVAL_MINUTES, INSTALL_MINUTES, PACKUP_MINUTES } from "./brand";
import {
  addDaysToKey, dateKey, formatHM, fromWall, parseDateKey, parseHM, toWall, weekdayOfKey,
} from "./time";

export type Interval = { start: number; end: number }; // ms epoch

/** Qui occupe un créneau : un rendez-vous de la base, ou un événement de l'agenda Google. */
export type Occupant =
  | {
      kind: "booking"; id: string; ref: string; name: string; subscriptionId: string | null;
      /** L'heure de la séance elle-même, hors arrivée anticipée : celle qu'on nomme. */
      startsAt: number; endsAt: number;
    }
  | { kind: "calendar"; summary: string | null; allDay: boolean };

/**
 * Un temps occupé, et par qui quand on le sait. `sameHome` : une autre
 * visite de l'abonnement qu'on retouche, à la même adresse. Elle ne doit
 * pas chevaucher, mais aucun battement de route ne la sépare de la visite
 * qu'on place : l'artisan ne bouge pas.
 */
export type Occupation = Interval & { who?: Occupant; sameHome?: boolean };

/** Le temps qu'une occupation interdit : elle-même, plus le battement de route de part et d'autre. */
function padded(b: Occupation, bufferMinutes: number): Interval {
  return b.sameHome ? { start: b.start, end: b.end } : { start: b.start - bufferMinutes * 60_000, end: b.end + bufferMinutes * 60_000 };
}

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
 * Le temps réellement occupé par une séance : elle-même, plus les minutes
 * passées sur place hors du temps réservé, avant et après (`setup_minutes`).
 * Zéro aujourd'hui, l'installation et le rangement étant compris dans la
 * séance ; quinze pour un rendez-vous d'avant le 22 octobre 2026 ou un
 * abonné « arrivée 15 min avant ». C'est ce bloc qui ne doit en croiser
 * aucun autre — la contrainte d'exclusion de la base le dit déjà
 * (`nivex_occupied`), et le moteur de créneaux doit dire la même chose
 * qu'elle.
 */
export function withSetup(i: Interval, setupMinutes: number): Interval {
  return { start: i.start - setupMinutes * 60_000, end: i.end + setupMinutes * 60_000 };
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
 *  – il tient entièrement dans les heures d'ouverture du jour, et le
 *    rangement d'un abonné « arrivée 15 min avant » aussi : on finit à la
 *    fermeture au plus tard (décision de l'artisan, 10 novembre 2026) ;
 *  – il commence après le délai de prévenance (leadHours) ;
 *  – le temps qu'il occupe ne chevauche aucune occupation élargie du
 *    tampon de déplacement. Entre deux séances, il reste donc tout le tampon.
 *
 * `setupMinutes` : les minutes passées sur place hors de la séance, pour
 * un abonné resté à l'ancien déroulement. Zéro par défaut.
 */
export function computeSlots(opts: {
  fromKey: string;
  days: number;
  durationMinutes: number;
  settings: Settings;
  busy: Occupation[];
  now?: Date;
  setupMinutes?: number;
}): DaySlots[] {
  const { settings: s, durationMinutes } = opts;
  const now = opts.now ?? new Date();
  const tz = s.timezone;
  const earliest = now.getTime() + s.leadHours * 3600_000;

  const lastMs = horizonEnd(s, now);

  // Le tampon protège l'artisan de part et d'autre de chaque engagement.
  const blocked = merge(opts.busy.map((b) => padded(b, s.bufferMinutes)));

  const out: DaySlots[] = [];

  for (let i = 0; i < opts.days; i++) {
    const key = addDaysToKey(opts.fromKey, i);
    const wd = weekdayOfKey(key);
    const rule = s.hours.find((h) => h.day === wd);
    const day: DaySlots = { date: key, weekday: wd, open: Boolean(rule?.enabled), slots: [] };

    if (!rule?.enabled) { out.push(day); continue; }

    const openM = parseHM(rule.open);
    const closeM = parseHM(rule.close);
    const setup = opts.setupMinutes ?? 0;
    if (closeM - openM < durationMinutes + setup) { out.push(day); continue; }

    const ymd = parseDateKey(key);
    const lastStart = closeM - durationMinutes - setup;

    for (let m = openM; m <= lastStart; m += s.slotStep) {
      const start = fromWall({ ...ymd, hour: Math.floor(m / 60), minute: m % 60 }, tz);
      const startMs = start.getTime();
      const endMs = startMs + durationMinutes * 60_000;

      if (startMs < earliest) continue;
      if (startMs >= lastMs) break;

      const candidate = withSetup({ start: startMs, end: endMs }, setup);
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
 * avec ses propres minutes hors séance (`setup_minutes`) : c'est ce que
 * l'agenda montrerait, et ce que la contrainte d'exclusion protège.
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
        SELECT starts_at, ends_at, setup_minutes FROM nivex_bookings
        WHERE status IN ('confirmed','pending')
          AND id <> ${excludeId}
          AND ends_at   > ${new Date(timeMin.getTime() - EARLY_ARRIVAL_MINUTES * 60_000).toISOString()}
          AND starts_at < ${new Date(timeMax.getTime() + EARLY_ARRIVAL_MINUTES * 60_000).toISOString()}`)
      .catch(() => [] as Record<string, unknown>[]),
  ]);

  const fromGoogle: Interval[] = gcal.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const fromDb: Interval[] = (rows as Record<string, unknown>[]).map((r) => withSetup({
    start: new Date(r.starts_at as string).getTime(),
    end: new Date(r.ends_at as string).getTime(),
  }, Number(r.setup_minutes ?? EARLY_ARRIVAL_MINUTES) || 0));

  return merge([...fromGoogle, ...fromDb].filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end)));
}

/**
 * Les événements de l'agenda qui occupent l'artisan, et leur nom.
 *
 * Les mêmes que retiendrait la disponibilité de Google : ni un événement
 * marqué « Disponible », ni une invitation refusée, ni un lieu de travail.
 * Une journée entière bloquée l'est de minuit à minuit, à l'heure de
 * l'artisan. `exclude` écarte les événements d'un abonnement, par leur
 * identifiant ou par leur série : pour ses visites, c'est la base qui fait
 * foi, et un événement resté à l'ancienne heure ne doit rien bloquer.
 */
export function occupationsFromEvents(
  items: CalendarItem[], tz: string, exclude: { eventIds?: Iterable<string>; seriesIds?: Iterable<string> } = {},
): Occupation[] {
  const ids = new Set(exclude.eventIds ?? []);
  const series = new Set(exclude.seriesIds ?? []);
  const midnight = (key: string) => fromWall({ ...parseDateKey(key), hour: 0, minute: 0 }, tz).getTime();
  const out: Occupation[] = [];
  for (const e of items) {
    if (e.status === "cancelled" || e.transparency === "transparent" || e.eventType === "workingLocation") continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (ids.has(e.id) || (e.recurringEventId && series.has(e.recurringEventId))) continue;
    const allDay = !e.start?.dateTime && Boolean(e.start?.date);
    const start = allDay ? midnight(e.start!.date!) : Date.parse(e.start?.dateTime ?? "");
    const end = allDay ? midnight(e.end?.date ?? addDaysToKey(e.start!.date!, 1)) : Date.parse(e.end?.dateTime ?? "");
    if (!(Number.isFinite(start) && Number.isFinite(end) && end > start)) continue;
    out.push({ start, end, who: { kind: "calendar", summary: e.summary?.trim() || null, allDay } });
  }
  return out;
}

/**
 * Ce qui occupe l'artisan autour d'un rendez-vous qu'on place ou qu'on
 * déplace, chaque temps avec son nom : la base, puis l'agenda Google lu
 * événement par événement.
 *
 * `excludeId` : le rendez-vous qu'on déplace, qui ne se gêne pas lui-même.
 * `home` : l'abonnement de ce rendez-vous. Ses événements Google ne comptent
 * pas — la base dit où sont ses visites, et l'agenda peut avoir gardé une
 * heure périmée — et ses autres visites, à la même adresse, ne demandent
 * pas de battement de route.
 *
 * Un agenda qui ne répond pas laisse la base seule juge, comme `loadBusy`.
 */
export async function loadOccupations(opts: {
  accessToken: string | null;
  settings: Settings;
  timeMin: Date;
  timeMax: Date;
  excludeId?: string;
  home?: { subscriptionId: string; eventIds: string[]; seriesIds: string[] };
}): Promise<Occupation[]> {
  const { accessToken, settings, timeMin, timeMax, home } = opts;
  const excludeId = opts.excludeId ?? "00000000-0000-0000-0000-000000000000";

  const [items, rows] = await Promise.all([
    accessToken
      ? listEvents(accessToken, settings.calendarId, timeMin.toISOString(), timeMax.toISOString())
          .catch(() => [] as CalendarItem[])
      : Promise.resolve([] as CalendarItem[]),
    ensureSchema()
      .then(() => sql()`
        SELECT id, ref, client_name, subscription_id, starts_at, ends_at, setup_minutes FROM nivex_bookings
        WHERE status IN ('confirmed','pending')
          AND id <> ${excludeId}
          AND ends_at   > ${new Date(timeMin.getTime() - EARLY_ARRIVAL_MINUTES * 60_000).toISOString()}
          AND starts_at < ${new Date(timeMax.getTime() + EARLY_ARRIVAL_MINUTES * 60_000).toISOString()}`)
      .catch(() => [] as Record<string, unknown>[]),
  ]);

  const fromDb: Occupation[] = (rows as Record<string, unknown>[]).map((r) => {
    const startsAt = new Date(r.starts_at as string).getTime();
    const endsAt = new Date(r.ends_at as string).getTime();
    return {
      ...withSetup({ start: startsAt, end: endsAt }, Number(r.setup_minutes ?? EARLY_ARRIVAL_MINUTES) || 0),
      who: {
        kind: "booking", id: String(r.id), ref: String(r.ref ?? ""), name: String(r.client_name ?? ""),
        subscriptionId: (r.subscription_id as string) ?? null, startsAt, endsAt,
      },
      sameHome: Boolean(home && r.subscription_id === home.subscriptionId),
    };
  });
  const fromGoogle = occupationsFromEvents(items, settings.timezone, { eventIds: home?.eventIds, seriesIds: home?.seriesIds });

  return [...fromDb, ...fromGoogle].filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end));
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

/**
 * Le verdict détaillé : ce qui ne va pas, et de quoi le dire en clair.
 * `closed` porte l'horaire du jour (`open` nul : jour fermé) et les minutes
 * de rangement qui devaient y tenir (`setup`) ; `busy`,
 * l'occupation qui gêne, `overlap` faux quand seul le battement de route
 * manque, sans chevauchement, et `arrival` les minutes d'arrivée anticipée
 * sans lesquelles les deux séances ne se gêneraient pas (zéro sinon) : une
 * séance de 18 h refusée à côté d'une autre qui finit à 18 h ne se comprend
 * qu'avec elles.
 */
export type SlotVerdict =
  | { problem: null }
  | { problem: "invalid" }
  | { problem: "lead" }
  | { problem: "closed"; weekday: number; open: string | null; close: string | null; setup: number }
  | { problem: "busy"; with: Occupation; overlap: boolean; arrival: number };

export function slotProblem(
  start: number, durationMinutes: number, busy: Occupation[], s: Settings,
  now = new Date(), opts: { checkLead?: boolean; setupMinutes?: number } = {},
): SlotProblem | null {
  return slotVerdict(start, durationMinutes, busy, s, now, opts).problem;
}

/* Le plus parlant d'abord : un vrai chevauchement avant un battement trop
   court, un rendez-vous de la base avant un événement de l'agenda, qui en
   est souvent la copie, puis le plus tôt. */
const occupantRank = (o: Occupation) => (o.who?.kind === "booking" ? 0 : o.who ? 1 : 2);

export function slotVerdict(
  start: number, durationMinutes: number, busy: Occupation[], s: Settings,
  now = new Date(), opts: { checkLead?: boolean; setupMinutes?: number } = {},
): SlotVerdict {
  if (!Number.isFinite(start)) return { problem: "invalid" };
  if ((opts.checkLead ?? true) && start < now.getTime() + s.leadHours * 3600_000 - 60_000) return { problem: "lead" };

  const candidate = { start, end: start + durationMinutes * 60_000 };
  const setup = opts.setupMinutes ?? 0;

  // Doit tenir dans les heures d'ouverture du jour.
  const key = dateKey(new Date(start), s.timezone);
  const weekday = weekdayOfKey(key);
  const rule = s.hours.find((h) => h.day === weekday);
  if (!rule?.enabled) return { problem: "closed", weekday, open: null, close: null, setup };

  const ymd = parseDateKey(key);
  const openMs  = fromWall({ ...ymd, hour: Math.floor(parseHM(rule.open) / 60),  minute: parseHM(rule.open) % 60 },  s.timezone).getTime();
  const closeMs = fromWall({ ...ymd, hour: Math.floor(parseHM(rule.close) / 60), minute: parseHM(rule.close) % 60 }, s.timezone).getTime();
  /* La séance tient dans l'horaire, et le rangement d'un abonné « arrivée
     15 min avant » aussi : on finit à la fermeture au plus tard (décision de
     l'artisan, 10 novembre 2026). L'arrivée, elle, peut précéder
     l'ouverture, comme avant le 22 octobre 2026. */
  if (start < openMs || candidate.end + setup * 60_000 > closeMs) {
    return { problem: "closed", weekday, open: rule.open, close: rule.close, setup };
  }

  // L'occupation porte sur le bloc entier.
  const block = withSetup(candidate, setup);
  const hit = busy
    .filter((b) => overlaps(block, padded(b, s.bufferMinutes)))
    .map((b) => ({ b, overlap: overlaps(block, b) }))
    .sort((x, y) => Number(y.overlap) - Number(x.overlap) || occupantRank(x.b) - occupantRank(y.b) || x.b.start - y.b.start)[0];
  if (hit) {
    /* Les séances elles-mêmes, sans arrivée anticipée de part ni d'autre. */
    const who = hit.b.who;
    const other: Occupation = who?.kind === "booking"
      ? { start: who.startsAt, end: who.endsAt, sameHome: hit.b.sameHome }
      : hit.b;
    const bare = hit.overlap ? overlaps(candidate, other) : overlaps(candidate, padded(other, s.bufferMinutes));
    const arrival = bare ? 0 : Math.max(setup, Math.round((other.start - hit.b.start) / 60_000));
    return { problem: "busy", with: hit.b, overlap: hit.overlap, arrival };
  }

  return { problem: null };
}

/**
 * Durée estimée à partir du panier : les minutes de repassage, plus
 * l'installation et le rangement compris dans la séance, arrondies au pas de
 * créneau et bornées au minimum. Cent dix minutes de repassage font une
 * séance de deux heures.
 */
export function estimateMinutes(
  items: { key: string; qty: number }[],
  s: Settings,
): number {
  const raw = items.reduce((sum, it) => {
    const svc = s.services.find((x) => x.key === it.key && x.enabled);
    return sum + (svc ? svc.minutesPerUnit * Math.max(0, it.qty) : 0);
  }, 0);
  return sessionMinutes(raw, s);
}

/** La séance qu'il faut pour tant de minutes de repassage ; zéro pour un panier vide. */
export function sessionMinutes(ironing: number, s: Pick<Settings, "slotStep" | "minMinutes">): number {
  if (ironing <= 0) return 0;
  const raw = ironing + INSTALL_MINUTES + PACKUP_MINUTES;
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

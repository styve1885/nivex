import type { Settings } from "./settings";
import type { Plan } from "./pricing";
import { planCents } from "./pricing";
import { slotProblem, type Interval, type SlotProblem } from "./availability";
import { addDaysToKey, dateKey, fromWall, parseDateKey, parseHM, toWall } from "./time";
import {
  CYCLE_MAX_WEEKS, SERIES_CYCLES, SERIES_NOTICE_DAYS, SUBSCRIBER_TRAVEL_DISCOUNT_CENTS,
  TERM_ALERT_DAYS, TERM_SERIES,
} from "./brand";

/**
 * Le calendrier d'un abonnement, sans base ni réseau.
 *
 * Tout ce qui décide d'une date, d'un numéro de visite ou d'un montant vit
 * ici, en fonctions pures : c'est ce qui permet de le vérifier sans rien
 * brancher. Le module qui parle à la base et à Google (subscriptions.ts) ne
 * fait qu'appliquer ces verdicts.
 *
 * Deux idées tiennent l'ensemble :
 *
 *  — Un « mois » d'abonnement est un cycle de visites réellement faites, pas
 *    un mois civil. Une visite annulée ne compte pas : le cycle se prolonge
 *    jusqu'à la suivante, et la numérotation de toutes les visites d'après
 *    se recalcule d'elle-même.
 *
 *  — Les dates suivent une grille : le jour et l'heure de la première visite,
 *    répétés au rythme de la formule. Une visite de remplacement se pose sur
 *    la grille, après la dernière, pour que la série se termine sur un cycle
 *    complet.
 */

/* ============================ Grille des dates ============================ */

export type Grid = {
  /** Date de la première visite, « 2026-11-06 », dans le fuseau de l'artisan. */
  anchor: string;
  /** Heure de début, « 10:00 ». */
  hm: string;
  everyWeeks: number;
  tz: string;
};

/** La grille d'un abonnement, lue sur l'instant de sa première visite. */
export function gridFrom(first: Date, everyWeeks: number, tz: string): Grid {
  const w = toWall(first, tz);
  return {
    anchor: dateKey(first, tz),
    hm: `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`,
    everyWeeks,
    tz,
  };
}

/**
 * La n-ième date de la grille, à l'heure murale fixée.
 *
 * On avance en jours sur la clé de date, puis on repasse par l'heure murale :
 * 10 h reste 10 h de part et d'autre du changement d'heure, alors qu'ajouter
 * des semaines en millisecondes ferait glisser la visite d'une heure.
 */
export function gridDate(g: Grid, n: number): Date {
  const key = addDaysToKey(g.anchor, n * g.everyWeeks * 7);
  const m = parseHM(g.hm);
  return fromWall({ ...parseDateKey(key), hour: Math.floor(m / 60), minute: m % 60 }, g.tz);
}

/** Le premier rang de la grille strictement postérieur à cet instant. */
export function gridIndexAfter(g: Grid, after: Date): number {
  let n = 0;
  /* Une estimation, puis un ajustement : la grille compte au plus une
     cinquantaine de rangs par an, et la boucle ne fait que corriger
     l'arrondi autour des changements d'heure. */
  const approx = Math.floor((after.getTime() - gridDate(g, 0).getTime()) / (g.everyWeeks * 7 * 86_400_000));
  n = Math.max(0, approx - 1);
  while (gridDate(g, n).getTime() <= after.getTime()) n++;
  return n;
}

/** `count` dates consécutives de la grille, à partir du rang `from`. */
export function gridDates(g: Grid, from: number, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => gridDate(g, from + i));
}

/**
 * Le premier rang de la série suivante : après la dernière visite posée, et
 * jamais avant `earliest` — maintenant, plus le délai de prévenance. Une série
 * renouvelée après la fin de la précédente ne pose donc aucune date passée.
 */
export function renewalFrom(g: Grid, lastAt: Date | null, earliest: Date): number {
  return Math.max(lastAt ? gridIndexAfter(g, lastAt) : 0, gridIndexAfter(g, earliest));
}

/* ============================ Séries ============================ */

/**
 * Les cycles couverts par une série : 1 à 6 pour la première, 7 à 12 pour
 * la seconde. Le douzième cycle clôt les douze mois du tarif garanti.
 */
export function seriesOfCycle(cycle: number): number {
  return Math.floor((cycle - 1) / SERIES_CYCLES) + 1;
}

export function lastCycleOfSeries(series: number): number {
  return series * SERIES_CYCLES;
}

export const TERM_CYCLES = SERIES_CYCLES * TERM_SERIES;

/**
 * Combien de visites poser pour finir la série en cours.
 *
 * Pour un abonnement neuf, six cycles pleins. Pour un abonné qui existait
 * avant le site — l'artisan l'entre à la main, au cycle et au rang où il en
 * est —, seulement ce qui reste jusqu'à la fin de sa série.
 */
export function visitsToEndOfSeries(perCycle: number, startCycle: number, startDone: number): number {
  const end = lastCycleOfSeries(seriesOfCycle(startCycle));
  return (end - startCycle + 1) * perCycle - startDone;
}

/* ============================ Montants ============================ */

/** Les frais d'une visite d'abonné : ceux de la zone, moins la réduction, jamais sous zéro. */
export function subscriberFeeCents(zoneFeeCents: number): number {
  return Math.max(0, Math.round(zoneFeeCents) - SUBSCRIBER_TRAVEL_DISCOUNT_CENTS);
}

export type CycleAmount = { planCents: number; travelCents: number; totalCents: number };

/**
 * Ce qui se paie à la première visite d'un cycle : la formule, plus les frais
 * de toutes les visites du cycle. Les deux restent lisibles séparément.
 */
export function cycleAmount(cycleCents: number, feePerVisitCents: number, perCycle: number): CycleAmount {
  const travelCents = feePerVisitCents * perCycle;
  return { planCents: cycleCents, travelCents, totalCents: cycleCents + travelCents };
}

/**
 * Un cycle tel qu'il a été encaissé. Des frais changés après le paiement
 * valent pour les cycles suivants, ils ne réécrivent pas ce qui a été reçu.
 * La formule est figée à la souscription : ce qui dépasse son montant, ce
 * sont les frais.
 */
export function paidCycleAmount(cycleCents: number, paidCents: number): CycleAmount {
  const planCents = Math.min(cycleCents, paidCents);
  return { planCents, travelCents: paidCents - planCents, totalCents: paidCents };
}

/** Le montant d'un cycle neuf, au taux du jour. Figé ensuite sur l'abonnement. */
export function quoteCycle(plan: Plan, s: Settings, zoneFeeCents: number): CycleAmount & { feePerVisitCents: number } {
  const fee = subscriberFeeCents(zoneFeeCents);
  return { ...cycleAmount(planCents(plan, s), fee, plan.visits), feePerVisitCents: fee };
}

/* ============================ Délai ============================ */

/**
 * Jusqu'à quand une visite d'abonné s'annule ou se déplace en ligne :
 * 23 h 59 la veille, c'est-à-dire avant minuit du jour même, à l'heure de
 * Montréal. Le serveur vit en UTC ; un dimanche soir à Montréal y est déjà
 * lundi, d'où le détour par la clé de date.
 */
export function changeDeadline(startsAt: Date, tz: string): Date {
  return fromWall({ ...parseDateKey(dateKey(startsAt, tz)), hour: 0, minute: 0 }, tz);
}

export function canSubscriberChange(startsAt: Date, tz: string, now = new Date()): boolean {
  return now.getTime() < changeDeadline(startsAt, tz).getTime();
}

/* ============================ Numérotation ============================ */

export type VisitLite = {
  id: string;
  startsAt: Date;
  cancelled: boolean;
  doneAt: Date | null;
};

export type VisitNumber = { cycle: number; index: number };

/**
 * Le rang de chaque visite dans son cycle.
 *
 * On range les visites maintenues par ordre chronologique et on les compte :
 * une annulation sort la visite du compte, les suivantes reculent d'un rang,
 * et le cycle se prolonge d'autant. `offset` dit où en était l'abonné avant
 * la première visite enregistrée : `(cycle de départ − 1) × visites par
 * cycle + visites déjà faites`.
 */
export function numberVisits(visits: VisitLite[], perCycle: number, offset = 0): Map<string, VisitNumber> {
  const kept = visits.filter((v) => !v.cancelled).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const out = new Map<string, VisitNumber>();
  kept.forEach((v, i) => {
    const seq = offset + i;
    out.set(v.id, { cycle: Math.floor(seq / perCycle) + 1, index: (seq % perCycle) + 1 });
  });
  return out;
}

export function startOffset(perCycle: number, startCycle: number, startDone: number): number {
  return (Math.max(1, startCycle) - 1) * perCycle + Math.max(0, startDone);
}

/* ============================ État ============================ */

export type CycleView = {
  cycle: number;
  /** Visites enregistrées de ce cycle, dans l'ordre. */
  visitIds: string[];
  firstAt: Date | null;
  lastAt: Date | null;
  done: number;
  /** Le cycle a-t-il toutes ses visites, faites ou prévues ? */
  complete: boolean;
  paidAt: string | null;
  /** Plus de huit semaines entre la première et la dernière visite. */
  overdue: boolean;
};

export type SubscriptionAlert =
  | { kind: "overdue"; cycle: number; firstAt: Date }
  | { kind: "to_confirm"; visitId: string; startsAt: Date }
  | { kind: "makeup_pending"; count: number }
  | { kind: "series_ending"; series: number; lastAt: Date }
  | { kind: "term_ending"; endsAt: Date };

export type SubscriptionView = {
  numbers: Map<string, VisitNumber>;
  cycles: CycleView[];
  /** Le cycle de la première visite pas encore faite ; le dernier si tout est fait. */
  currentCycle: number;
  doneInCurrent: number;
  nextVisit: VisitLite | null;
  /** Série la plus avancée posée dans l'agenda. */
  latestSeries: number;
  lastVisitOfLatestSeries: Date | null;
  /** Fin des douze mois : dernière visite du 12e cycle, ou sa projection. */
  termEndsAt: Date | null;
  alerts: SubscriptionAlert[];
};

export type SubscriptionFacts = {
  perCycle: number;
  everyWeeks: number;
  startCycle: number;
  startDone: number;
  paidCycles: Record<string, string>;
  pendingMakeups: number;
  active: boolean;
  visits: (VisitLite & { series: number })[];
};

/**
 * Tout ce que l'artisan doit savoir d'un abonnement, déduit des visites.
 *
 * Rien n'est stocké de ce qui se calcule : le cycle en cours, le rang d'une
 * visite, la fin des douze mois. Une donnée recopiée finit par contredire
 * celle dont elle vient ; celle-ci ne peut pas.
 */
export function viewSubscription(f: SubscriptionFacts, now = new Date()): SubscriptionView {
  const offset = startOffset(f.perCycle, f.startCycle, f.startDone);
  const numbers = numberVisits(f.visits, f.perCycle, offset);
  const kept = f.visits.filter((v) => !v.cancelled).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  /* — Les cycles — */
  const byCycle = new Map<number, (VisitLite & { series: number })[]>();
  for (const v of kept) {
    const n = numbers.get(v.id)!;
    if (!byCycle.has(n.cycle)) byCycle.set(n.cycle, []);
    byCycle.get(n.cycle)!.push(v);
  }
  const cycles: CycleView[] = [...byCycle.entries()].sort((a, b) => a[0] - b[0]).map(([cycle, list]) => {
    const before = cycle === f.startCycle ? f.startDone : 0;
    const firstAt = list[0]?.startsAt ?? null;
    const lastAt = list[list.length - 1]?.startsAt ?? null;
    const complete = before + list.length >= f.perCycle;
    const done = before + list.filter((v) => v.doneAt).length;
    /* La limite se mesure sur la dernière visite prévue quand le cycle est
       complet, et sur aujourd'hui tant qu'il manque une visite à poser. */
    const until = complete ? lastAt : now;
    const overdue = Boolean(firstAt && until
      && done < f.perCycle
      && until.getTime() - firstAt.getTime() > CYCLE_MAX_WEEKS * 7 * 86_400_000);
    return {
      cycle, visitIds: list.map((v) => v.id), firstAt, lastAt, done, complete,
      paidAt: f.paidCycles[String(cycle)] ?? null, overdue,
    };
  });

  /* — Où en est-on — */
  const firstNotDone = kept.find((v) => !v.doneAt) ?? null;
  const currentCycle = firstNotDone
    ? numbers.get(firstNotDone.id)!.cycle
    : (cycles[cycles.length - 1]?.cycle ?? f.startCycle);
  const doneInCurrent = cycles.find((c) => c.cycle === currentCycle)?.done ?? 0;
  const nextVisit = kept.find((v) => v.startsAt.getTime() > now.getTime()) ?? null;

  const latestSeries = Math.max(0, ...kept.map((v) => v.series));
  const ofLatest = kept.filter((v) => v.series === latestSeries);
  const lastVisitOfLatestSeries = ofLatest[ofLatest.length - 1]?.startsAt ?? null;

  /* La fin des douze mois : la dernière visite du douzième cycle si elle est
     posée, sinon la projection d'une seconde série au même rythme. */
  let termEndsAt: Date | null = null;
  const lastCycle = cycles.find((c) => c.cycle === TERM_CYCLES);
  if (lastCycle?.complete && lastCycle.lastAt) {
    termEndsAt = lastCycle.lastAt;
  } else if (kept.length > 0) {
    const last = kept[kept.length - 1];
    const lastNo = numbers.get(last.id)!;
    const remaining = (TERM_CYCLES - lastNo.cycle) * f.perCycle + (f.perCycle - lastNo.index);
    termEndsAt = remaining > 0
      ? new Date(last.startsAt.getTime() + remaining * f.everyWeeks * 7 * 86_400_000)
      : last.startsAt;
  }

  /* — Alertes — */
  const alerts: SubscriptionAlert[] = [];
  if (f.active) {
    for (const c of cycles) if (c.overdue && c.firstAt) alerts.push({ kind: "overdue", cycle: c.cycle, firstAt: c.firstAt });
    /* Une visite passée, ni faite ni annulée : l'artisan a oublié le bouton,
       ou le client n'était pas là. Le compteur ne peut pas avancer seul. */
    for (const v of kept) {
      if (!v.doneAt && v.startsAt.getTime() + 3 * 3600_000 < now.getTime()) {
        alerts.push({ kind: "to_confirm", visitId: v.id, startsAt: v.startsAt });
      }
    }
    if (f.pendingMakeups > 0) alerts.push({ kind: "makeup_pending", count: f.pendingMakeups });
    if (lastVisitOfLatestSeries
      && lastVisitOfLatestSeries.getTime() > now.getTime()
      && lastVisitOfLatestSeries.getTime() - now.getTime() <= SERIES_NOTICE_DAYS * 86_400_000) {
      alerts.push({ kind: "series_ending", series: latestSeries, lastAt: lastVisitOfLatestSeries });
    }
    if (termEndsAt && termEndsAt.getTime() - now.getTime() <= TERM_ALERT_DAYS * 86_400_000) {
      alerts.push({ kind: "term_ending", endsAt: termEndsAt });
    }
  }

  return {
    numbers, cycles, currentCycle, doneInCurrent, nextVisit,
    latestSeries, lastVisitOfLatestSeries, termEndsAt, alerts,
  };
}

/* ============================ Vérification d'une série ============================ */

export type SeriesConflict = { startsAt: Date; reason: SlotProblem };

/**
 * Les dates d'une série qui ne tiennent pas : jour fermé, heure hors de
 * l'horaire, créneau déjà pris. Le délai de prévenance ne vaut que pour la
 * première visite, et seulement quand c'est un client qui réserve.
 */
export function seriesConflicts(
  starts: Date[], durationMinutes: number, busy: Interval[], s: Settings,
  opts: { now?: Date; checkLead?: boolean } = {},
): SeriesConflict[] {
  const now = opts.now ?? new Date();
  const out: SeriesConflict[] = [];
  starts.forEach((d, i) => {
    const p = slotProblem(d.getTime(), durationMinutes, busy, s, now, { checkLead: i === 0 && (opts.checkLead ?? true) });
    if (p) out.push({ startsAt: d, reason: p });
  });
  return out;
}

/** Le dernier jour où une série reste vérifiable, pour charger les occupations. */
export function seriesSpanEnd(starts: Date[], durationMinutes: number): Date {
  const last = starts[starts.length - 1];
  return new Date((last?.getTime() ?? Date.now()) + durationMinutes * 60_000 + 86_400_000);
}

/* ============================ Déplacement ============================ */

/**
 * Les occupations, moins le bloc de la visite qu'on déplace.
 *
 * Sa ligne en base s'écarte par son identifiant ; son événement Google, lui,
 * revient dans la disponibilité de l'agenda, parfois fondu avec un rendez-vous
 * voisin. On retranche donc son bloc de chaque intervalle, au lieu de
 * chercher un intervalle identique. Sans cela, une visite ne pourrait pas
 * glisser d'une heure dans la même matinée : elle se gênerait elle-même.
 */
export function withoutInterval(busy: Interval[], cut: Interval): Interval[] {
  if (!(cut.end > cut.start)) return busy;
  return busy.flatMap((b) => {
    if (b.end <= cut.start || b.start >= cut.end) return [b];
    const parts: Interval[] = [];
    if (b.start < cut.start) parts.push({ start: b.start, end: cut.start });
    if (b.end > cut.end) parts.push({ start: cut.end, end: b.end });
    return parts;
  });
}

/** Les jours que le client peut chercher au-delà de la visite qu'il déplace. */
export const MOVE_REACH_DAYS = 14;

/**
 * Jusqu'où le client peut chercher une nouvelle heure pour une visite : au
 * moins l'horizon de réservation, et toujours deux semaines au-delà de la
 * visite elle-même. Une visite de mars se décale donc d'un jour ou deux, sans
 * que la grille publique des séances s'en trouve élargie.
 */
export function moveHorizonDays(todayKey: string, visitKey: string, horizonDays: number): number {
  const days = Math.round((Date.parse(`${visitKey}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / 86_400_000);
  return Math.max(horizonDays, days + MOVE_REACH_DAYS);
}

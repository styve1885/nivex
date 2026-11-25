import type { DayHours } from "./services";
import { weekdayOfKey } from "./time";

/**
 * Un changement d'horaire daté.
 *
 * Le 25 novembre 2026, l'artisan ouvre le samedi de 7 h à 22 h à partir du
 * samedi 5 décembre ; les samedis d'ici là restent à 18 h – 22 h. L'horaire
 * de l'onglet Réglages (`hours`) est celui d'aujourd'hui. Le changement
 * (colonne `hours_change`) dit, pour les seuls jours qu'il touche, les heures
 * qui valent à partir de sa date :
 *
 * - le moteur de créneaux lit le jour même de chaque créneau (`dayHours`) :
 *   un samedi d'avant garde ses heures, un samedi d'après prend les
 *   nouvelles, et cela dès aujourd'hui, pour qui réserve en avance ;
 * - les pages annoncent déjà le nouvel horaire (`shownHours`), en disant la
 *   date tant qu'elle n'est pas venue (`pendingChange`, `changedDays`) ;
 * - le jour venu, la tâche du matin le verse dans l'horaire de l'onglet et
 *   l'efface (`applyHoursChange`, lib/settings.ts).
 *
 * Une version du site qui ignore la colonne garde l'horaire d'aujourd'hui
 * pour tous les jours : pendant une mise en ligne, aucun samedi d'avant ne
 * s'ouvre le matin. Sans dépendance : l'onglet Réglages l'importe dans le
 * navigateur.
 */
export type HoursChange = { from: string; days: DayHours[] };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

const isDayHours = (d: unknown): d is DayHours => {
  const x = d as DayHours;
  return !!x && typeof x === "object" && Number.isInteger(x.day) && x.day >= 0 && x.day <= 6
    && typeof x.enabled === "boolean" && typeof x.open === "string" && CLOCK.test(x.open)
    && typeof x.close === "string" && CLOCK.test(x.close);
};

/** Le changement tel que la base le garde, ou rien s'il n'a pas la forme attendue. */
export function readHoursChange(raw: unknown): HoursChange | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { from?: unknown; days?: unknown };
  if (typeof r.from !== "string" || !DATE_KEY.test(r.from) || !Array.isArray(r.days)) return null;
  const days = r.days.filter(isDayHours);
  return days.length ? { from: r.from, days } : null;
}

/** Les heures d'un jour donné (clé « AAAA-MM-JJ », à l'heure de Montréal), changement compris. */
export function dayHours(
  s: { hours: DayHours[]; hoursChange?: HoursChange | null }, key: string,
): DayHours | undefined {
  const weekday = weekdayOfKey(key);
  const change = s.hoursChange;
  if (change && key >= change.from) {
    const next = change.days.find((d) => d.day === weekday);
    if (next) return next;
  }
  return s.hours.find((h) => h.day === weekday);
}

/** L'horaire une fois le changement fait : celui que les pages annoncent. */
export function shownHours(hours: DayHours[], change: HoursChange | null | undefined): DayHours[] {
  if (!change) return hours;
  return hours.map((h) => change.days.find((d) => d.day === h.day) ?? h);
}

/** Le changement tant que sa date n'est pas venue ; rien ensuite. */
export function pendingChange(change: HoursChange | null | undefined, today: string): HoursChange | null {
  return change && today < change.from ? change : null;
}

/** Les jours dont les heures changent vraiment : un jour laissé tel quel ne s'annonce pas. */
export function changedDays(hours: DayHours[], change: HoursChange): DayHours[] {
  return change.days.filter((d) => {
    const h = hours.find((x) => x.day === d.day);
    return !h || h.enabled !== d.enabled || h.open !== d.open || h.close !== d.close;
  });
}

/** « 5 décembre », « December 5 » : la date d'un changement, sans l'année, qui suit de près. */
export function changeDate(from: string, locale: "fr" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(`${from}T12:00:00Z`));
}

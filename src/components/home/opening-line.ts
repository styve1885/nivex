import type { Dict } from "@/lib/i18n";
import type { DayHours, Settings } from "@/lib/settings";
import { changeDate, changedDays, pendingChange, shownHours } from "@/lib/hours";
import { dateKey } from "@/lib/time";

/**
 * L'horaire d'ouverture, écrit depuis les jours réellement ouverts.
 *
 * Écrire cet horaire à la main, c'était le laisser mentir le jour où
 * l'artisan ouvre le dimanche. Chaque langue a ses usages : le français
 * met ses jours en minuscules et compte en heures, l'anglais capitalise
 * et coupe à midi. L'accueil l'écrit pour le bloc Contact, côté serveur :
 * le composant client ne reçoit que la ligne, et un test peut la lire. Le
 * pied de page, `/llms.txt` et la fiche de la maison lisent les mêmes jours
 * (`openDays`) : tous suivent l'onglet Réglages, aucun ne le recopie.
 */

/* La semaine se lit du lundi au dimanche, comme dans l'espace artisan : un
   horaire du mardi au dimanche ne doit pas commencer par le dimanche, que
   les réglages rangent en tête. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Les jours ouverts, du lundi au dimanche. */
export function openDays(hours: DayHours[]): DayHours[] {
  return WEEK.flatMap((day) => hours.filter((h) => h.day === day && h.enabled));
}

/**
 * « 7 h », « 9 h 30 » ; « 7 am », « 9:30 am ». L'espace qui précède l'unité
 * est insécable : « 18 » et « h » ne se séparent pas au bout d'une ligne.
 */
export function clock(hm: string, locale: "fr" | "en"): string {
  const [h, m] = hm.split(":").map(Number);
  if (locale === "fr") return m ? `${h}\u00a0h\u00a0${String(m).padStart(2, "0")}` : `${h}\u00a0h`;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}\u00a0${suffix}` : `${h12}\u00a0${suffix}`;
}

/**
 * « 18 h – 22 h, du lundi au jeudi et le samedi ; 7 h – 22 h, vendredi et
 * dimanche ».
 *
 * Une plage par horaire : les jours qui partagent les mêmes heures sont
 * nommés ensemble, « du lundi au jeudi » quand ils sont plus de deux à se
 * suivre, un à un sinon, et le dernier se rattache par « et ». À côté d'une
 * suite de jours, un jour seul prend l'article, « et le samedi » ; seuls, ils
 * n'en prennent pas, « vendredi et dimanche ». L'anglais n'en met jamais :
 * « Monday to Thursday and Saturday ». Un samedi plus court ne fait donc pas
 * disparaître les heures de toute la ligne : « 7 h – 22 h, du lundi au
 * vendredi ; 9 h – 17 h, samedi ».
 *
 * Un changement d'horaire daté (lib/hours.ts) s'y annonce d'avance : la
 * ligne dit déjà le nouvel horaire, et la date entre parenthèses tant
 * qu'elle n'est pas venue, « (le samedi à partir du 5 décembre) ».
 */
export function openingLine(
  t: Dict, settings: Pick<Settings, "hours"> & Partial<Pick<Settings, "hoursChange" | "timezone">>,
  locale: "fr" | "en", now = new Date(),
): string {
  const open = openDays(shownHours(settings.hours, settings.hoursChange));
  if (open.length === 0) return "";

  const name = (day: number) => (locale === "fr" ? t.days[day].toLowerCase() : t.days[day]);
  const words = (...w: string[]) => w.filter(Boolean).join(" ");

  /* Les jours d'un même horaire, en suites de jours consécutifs. */
  const days = (group: DayHours[]): string => {
    const runs: number[][] = [];
    for (const h of group) {
      const run = runs[runs.length - 1];
      if (run && WEEK.indexOf(h.day) === WEEK.indexOf(run[run.length - 1]) + 1) run.push(h.day);
      else runs.push([h.day]);
    }
    const ranged = runs.some((run) => run.length > 2);
    const parts = runs.flatMap((run) => (run.length > 2
      ? [words(t.contact.from, name(run[0]), t.contact.to, name(run[run.length - 1]))]
      : run.map((day) => (ranged ? words(t.contact.onDay, name(day)) : name(day)))));
    return parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} ${t.contact.and} ${parts[parts.length - 1]}`
      : parts[0];
  };

  const spans = new Map<string, DayHours[]>();
  for (const h of open) {
    const key = `${h.open}-${h.close}`;
    spans.set(key, [...(spans.get(key) ?? []), h]);
  }
  const line = [...spans.values()]
    .map((group) => `${clock(group[0].open, locale)} – ${clock(group[0].close, locale)}, ${days(group)}`)
    .join(locale === "fr" ? "\u202f; " : "; ");
  const note = changeNote(t, settings, locale, now);
  return note ? `${line} (${note})` : line;
}

/**
 * « le samedi à partir du 5 décembre », « Saturdays from December 5 » : les
 * jours dont les heures changent à une date encore à venir, et cette date.
 * Rien une fois la date venue, ni pour un jour que le changement fermerait :
 * il n'est plus dans la ligne.
 */
export function changeNote(
  t: Dict, settings: Pick<Settings, "hours"> & Partial<Pick<Settings, "hoursChange" | "timezone">>,
  locale: "fr" | "en", now = new Date(),
): string {
  const pending = pendingChange(settings.hoursChange, dateKey(now, settings.timezone ?? "America/Toronto"));
  if (!pending) return "";
  const changed = changedDays(settings.hours, pending).filter((d) => d.enabled).map((d) => d.day);
  const names = WEEK.filter((day) => changed.includes(day))
    .map((day) => (locale === "fr" ? `${t.contact.onDay} ${t.days[day].toLowerCase()}` : `${t.days[day]}s`));
  if (names.length === 0) return "";
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t.contact.and} ${names[names.length - 1]}` : names[0];
  return t.contact.changeFrom.replace("{days}", list).replace("{date}", changeDate(pending.from, locale));
}

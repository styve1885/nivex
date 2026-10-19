import type { Dict } from "@/lib/i18n";
import type { DayHours, Settings } from "@/lib/settings";

/**
 * L'horaire d'ouverture, écrit depuis les jours réellement ouverts.
 *
 * Écrire cet horaire à la main, c'était le laisser mentir le jour où
 * l'artisan ouvre le dimanche. Chaque langue a ses usages : le français
 * met ses jours en minuscules et compte en heures, l'anglais capitalise
 * et coupe à midi. Le bloc Contact s'en sert ; la fonction vit hors du
 * composant client pour qu'un test puisse la lire.
 */

/* La semaine se lit du lundi au dimanche, comme dans l'espace artisan : un
   horaire du mardi au dimanche ne doit pas commencer par le dimanche, que
   les réglages rangent en tête. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** « 7 h », « 9 h 30 » ; « 7 a.m. », « 9:30 a.m. ». */
export function clock(hm: string, locale: "fr" | "en"): string {
  const [h, m] = hm.split(":").map(Number);
  if (locale === "fr") return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  const suffix = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/**
 * « 7 h – 22 h, du lundi au samedi ».
 *
 * Une plage par horaire : les jours qui partagent les mêmes heures sont
 * nommés ensemble, « du lundi au vendredi » quand ils sont plus de deux à se
 * suivre. Un samedi plus court ne fait donc plus disparaître les heures de
 * toute la ligne : « 7 h – 22 h, du lundi au vendredi ; 9 h – 17 h, samedi ».
 */
export function openingLine(t: Dict, settings: Settings, locale: "fr" | "en"): string {
  const open = WEEK.flatMap((day) => settings.hours.filter((h) => h.day === day && h.enabled));
  if (open.length === 0) return "";

  const name = (day: number) => (locale === "fr" ? t.days[day].toLowerCase() : t.days[day]);

  /* Les jours d'un même horaire, en suites de jours consécutifs. */
  const days = (group: DayHours[]): string => {
    const runs: number[][] = [];
    for (const h of group) {
      const run = runs[runs.length - 1];
      if (run && WEEK.indexOf(h.day) === WEEK.indexOf(run[run.length - 1]) + 1) run.push(h.day);
      else runs.push([h.day]);
    }
    return runs
      .map((run) => (run.length > 2
        ? [t.contact.from, name(run[0]), t.contact.to, name(run[run.length - 1])].filter(Boolean).join(" ")
        : run.map(name).join(", ")))
      .join(", ");
  };

  const spans = new Map<string, DayHours[]>();
  for (const h of open) {
    const key = `${h.open}-${h.close}`;
    spans.set(key, [...(spans.get(key) ?? []), h]);
  }
  return [...spans.values()]
    .map((group) => `${clock(group[0].open, locale)} – ${clock(group[0].close, locale)}, ${days(group)}`)
    .join(locale === "fr" ? "\u202f; " : "; ");
}

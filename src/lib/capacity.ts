import { capacityPieces, ironingMinutes } from "./pricing";
import type { Dict } from "./i18n";
import { getRetired } from "./i18n/retired";
import type { Settings } from "./settings";

/**
 * La phrase de la capacité, écrite depuis les réglages : la foire aux
 * questions et les données structurées la disent de la même façon. Celle du
 * contenu d'une séance (installation, rangement, temps de repassage) ne se
 * dit plus depuis le 25 novembre 2026 ; elle dort avec les textes retirés.
 */

/**
 * Une durée telle qu'on la dit : « 2 h », « 1 h 50 », « 50 min » ;
 * « 2 hours », « 1 h 50 min » en anglais.
 */
export function shortDuration(minutes: number, locale: "fr" | "en"): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (locale === "en") {
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} hour${h > 1 ? "s" : ""}`;
    return `${m} min`;
  }
  if (h && m) return `${h} h ${String(m).padStart(2, "0")}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/* La plus courte séance proposée : la durée minimale réglée, jamais moins de deux heures. */
const shortest = (s: Pick<Settings, "minMinutes">) => Math.max(s.minMinutes, 120);

/** « Jusqu'à 18 pièces en 2 h, et jusqu'à 27 en 3 h, selon la taille, le type et la matière des vêtements. » */
export function capacitySentence(t: Dict, s: Pick<Settings, "minMinutes">, locale: "fr" | "en"): string {
  const a = shortest(s), b = a + 60;
  return t.capacity.sentence
    .replace("{a}", String(capacityPieces(a))).replace("{da}", shortDuration(a, locale))
    .replace("{b}", String(capacityPieces(b))).replace("{db}", shortDuration(b, locale));
}

/**
 * « Chaque séance inclut l'installation et le rangement… Une séance de 2 h
 * comprend donc 1 h 50 de repassage. » Retirée de la vitrine le 25 novembre
 * 2026 (lib/i18n/retired.ts) : seules la section retirée « Ce que contient
 * une séance » et l'ancienne question de l'installation la liraient, si on
 * les rallumait.
 */
export function setupSentence(s: Pick<Settings, "minMinutes">, locale: "fr" | "en"): string {
  const min = shortest(s);
  return getRetired(locale).capacitySetup
    .replace("{min}", shortDuration(min, locale))
    .replace("{ironing}", shortDuration(ironingMinutes(min), locale));
}

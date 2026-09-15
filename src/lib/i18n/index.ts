import { fr, type Dict } from "./fr";
import { en } from "./en";

export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

const dicts: Record<Locale, Dict> = { fr, en };

export function getDict(locale: string | undefined): Dict {
  return dicts[(locale as Locale) ?? defaultLocale] ?? fr;
}

export function isLocale(v: string | undefined): v is Locale {
  return v === "fr" || v === "en";
}

/** L'autre langue, pour le sélecteur. */
export function otherLocale(l: Locale): Locale {
  return l === "fr" ? "en" : "fr";
}

export type { Dict, LegalDoc, LegalSection } from "./fr";

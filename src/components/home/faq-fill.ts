import { perHour } from "@/lib/pricing";
import { servedText } from "@/lib/travel";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * Les réponses, remplies depuis les réglages.
 *
 * La cadence citée doit être celle du moteur, et la liste des secteurs celle
 * de l'onglet « Zones et frais » : sinon la foire aux questions contredit la
 * grille deux écrans plus haut. Les données structurées s'en servent aussi :
 * la fonction vit donc hors du composant client, appelable des deux côtés.
 *
 * Des chemises désactivées ne laissent pas un trou dans la phrase : la
 * réponse se rabat sur la seule moyenne d'un panier mixte.
 */
export function faqFill(text: string, t: Dict, settings: Settings, locale: "fr" | "en"): string {
  const shirt = settings.services.find((x) => x.key === "shirt" && x.enabled);
  const cadence = shirt
    ? t.faq.cadence.replace("{shirts}", String(perHour(shirt.minutesPerUnit)))
    : t.faq.cadenceMixed;
  return text
    .replace("{cadence}", cadence)
    .replace("{zone}", servedText(settings.zonePolicy, locale, t.zoneText));
}

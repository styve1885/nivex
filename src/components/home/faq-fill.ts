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
 */
export function faqFill(text: string, t: Dict, settings: Settings, locale: "fr" | "en"): string {
  const shirt = settings.services.find((x) => x.key === "shirt" && x.enabled);
  return text
    .replace("{shirts}", shirt ? String(perHour(shirt.minutesPerUnit)) : "")
    .replace("{zone}", servedText(settings.zonePolicy, locale, t.zoneText));
}


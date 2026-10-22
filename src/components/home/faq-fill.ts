import { capacitySentence, setupSentence } from "@/lib/capacity";
import { servedText } from "@/lib/travel";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * Les réponses, remplies depuis les réglages.
 *
 * La capacité citée doit être celle de `capacityPieces`, et la liste des
 * secteurs celle de l'onglet « Zones et frais » : sinon la foire aux
 * questions contredit la grille deux écrans plus haut. Les données
 * structurées s'en servent aussi : la fonction vit donc hors du composant
 * client, appelable des deux côtés.
 */
export function faqFill(text: string, t: Dict, settings: Settings, locale: "fr" | "en"): string {
  return text
    .replace("{capacity}", capacitySentence(t, settings, locale))
    .replace("{setup}", setupSentence(t, settings, locale))
    .replace("{zone}", servedText(settings.zonePolicy, locale, t.zoneText));
}

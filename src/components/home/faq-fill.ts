import { capacitySentence, setupSentence } from "@/lib/capacity";
import { areasSentence } from "@/lib/areas";
import { servedText } from "@/lib/travel";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * Les réponses, remplies depuis les réglages.
 *
 * La capacité citée doit être celle de `capacityPieces`, et la liste des
 * quartiers celle que la grille de l'onglet « Zones et frais » accepte :
 * sinon la foire aux questions contredit la page deux écrans plus haut.
 * L'accueil remplit les réponses une fois, côté serveur, pour la page et
 * pour les données structurées ; /llms-full.txt les reprend. Le composant
 * client ne reçoit que le résultat.
 *
 * « Venez-vous dans mon quartier ? » donne la liste de l'artisan
 * (lib/areas.ts), en une phrase ({areas}), puis l'invitation à écrire
 * ({missing}), en texte simple. Si la grille n'acceptait plus aucun quartier
 * de la liste, la phrase des secteurs actifs (`servedText`) la remplacerait.
 */
export function faqFill(text: string, t: Dict, settings: Settings, locale: "fr" | "en"): string {
  return text
    .replace("{capacity}", capacitySentence(t, settings, locale))
    .replace("{setup}", setupSentence(t, settings, locale))
    .replace("{areas}", areasSentence(settings.zonePolicy, locale, t.areas) || servedText(settings.zonePolicy, locale, t.zoneText))
    .replace("{missing}", t.areas.missing.replace("{write}", t.areas.write));
}

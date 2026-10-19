/**
 * Les prestations du code et la forme d'un réglage d'horaire.
 *
 * Ce module n'importe rien, et c'est sa raison d'être : l'onglet Réglages,
 * un composant client, a besoin de `DEFAULT_SERVICES` pour comparer les
 * minutes enregistrées aux temps relevés. Lues depuis `settings.ts`, elles
 * emportaient dans le navigateur le pilote de la base et les rustines de
 * `node:crypto`, soit des centaines de kilo-octets pour une liste de sept
 * lignes. `settings.ts` les reprend d'ici et les réexporte.
 */

export type DayHours = { day: number; enabled: boolean; open: string; close: string };
export type ServiceItem = {
  key: string;
  icon: string;
  fr: string;
  en: string;
  minutesPerUnit: number;
  unitFr: string;
  unitEn: string;
  enabled: boolean;
};

/**
 * Temps de traitement par pièce, marge de conversation et d'imprévus
 * comprise. Ces minutes ne servent pas qu'au devis : la capacité horaire
 * annoncée sur la page Tarifs en découle (`perHour`), et le site promet de
 * tenir le volume annoncé. Les gonfler d'optimisme revient donc à promettre
 * ce qu'on ne tiendra pas.
 *
 * Valeurs relevées au chronomètre sur séance réelle, septembre 2026.
 */
export const DEFAULT_SERVICES: ServiceItem[] = [
  { key: "shirt",    icon: "shirt",  fr: "Chemises",              en: "Shirts",              minutesPerUnit: 8,  unitFr: "chemise",  unitEn: "shirt",   enabled: true },
  { key: "delicate", icon: "dress",  fr: "Robes & délicats",      en: "Dresses & delicates", minutesPerUnit: 15, unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "suit",     icon: "suit",   fr: "Costumes & vestes",     en: "Suits & jackets",     minutesPerUnit: 19, unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "trousers", icon: "badge",  fr: "Pantalons & jupes",     en: "Trousers & skirts",   minutesPerUnit: 9,  unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "linen",    icon: "linen",  fr: "Draps simple et 2 places", en: "Single & double sheets", minutesPerUnit: 7,  unitFr: "drap",     unitEn: "sheet", enabled: true },
  { key: "linen-xl", icon: "linen",  fr: "Draps queen et 3 places",  en: "Queen & king sheets",    minutesPerUnit: 10, unitFr: "drap",     unitEn: "sheet", enabled: true },
  { key: "uniform",  icon: "clock",  fr: "Uniformes (ensemble)",     en: "Uniforms (set)",         minutesPerUnit: 11, unitFr: "ensemble", unitEn: "set",   enabled: true },
];

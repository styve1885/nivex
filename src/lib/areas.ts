import { joinList, zoneFor, type ZonePolicy } from "./travel";

/**
 * Les quartiers que la maison met en avant, choisis par l'artisan le
 * 13 novembre 2026 : la section « Secteurs desservis » de l'accueil, la page
 * Tarifs, la question « Venez-vous dans mon quartier ? », /llms.txt et la
 * description de l'accueil. Montréal d'abord, puis la Rive-Sud, dans l'ordre
 * de sa liste ; les noms aussi sont les siens.
 *
 * Ce n'est pas la grille de la réservation. Celle-ci vit dans l'onglet
 * « Zones et frais », et elle dessert davantage (Chambly, Candiac,
 * Saint-Jean-sur-Richelieu…) : le pied de page, le bloc « Nous écrire » et
 * le tableau des frais la disent en entier, et rien n'en est retiré.
 *
 * C'est une vitrine, et une vitrine tenue par la grille : un quartier ne
 * paraît que si la réservation accepte chacun de ses codes postaux
 * (`servedAreas`). Un secteur désactivé dans l'onglet efface donc de
 * lui-même le quartier qu'il couvrait, au lieu de promettre ce que le tunnel
 * refuserait ensuite.
 *
 * Sans autre dépendance que la grille : les pages, /llms.txt et les tests la
 * lisent telle quelle.
 */

export type AreaRegion = "montreal" | "south";

export type Area = {
  key: string;
  region: AreaRegion;
  fr: string;
  en: string;
  /** Les trois premiers caractères des codes postaux du quartier. */
  prefixes: string[];
};

export const AREAS: readonly Area[] = [
  { key: "centre-ville", region: "montreal", fr: "centre-ville", en: "Downtown", prefixes: ["H2Z", "H3A", "H3B", "H3G", "H3H"] },
  { key: "vieux-montreal", region: "montreal", fr: "Vieux-Montréal", en: "Old Montreal", prefixes: ["H2Y"] },
  { key: "griffintown", region: "montreal", fr: "Griffintown", en: "Griffintown", prefixes: ["H3C"] },
  { key: "ile-des-soeurs", region: "montreal", fr: "L'Île-des-Sœurs", en: "Nuns' Island", prefixes: ["H3E"] },
  { key: "westmount", region: "montreal", fr: "Westmount", en: "Westmount", prefixes: ["H3Y", "H3Z"] },
  { key: "outremont", region: "montreal", fr: "Outremont", en: "Outremont", prefixes: ["H2V"] },
  { key: "mont-royal", region: "montreal", fr: "Ville de Mont-Royal", en: "Town of Mount Royal", prefixes: ["H3P", "H3R"] },
  { key: "verdun", region: "montreal", fr: "Verdun", en: "Verdun", prefixes: ["H4G", "H4H"] },
  { key: "saint-lambert", region: "south", fr: "Saint-Lambert", en: "Saint-Lambert", prefixes: ["J4P", "J4R", "J4S"] },
  { key: "brossard", region: "south", fr: "Brossard", en: "Brossard", prefixes: ["J4W", "J4X", "J4Y", "J4Z"] },
  {
    key: "longueuil", region: "south", fr: "Longueuil (dont le Vieux-Longueuil)", en: "Longueuil (including Old Longueuil)",
    prefixes: ["J4G", "J4H", "J4J", "J4K", "J4L", "J4M", "J4N"],
  },
];

/** La réservation accepte-t-elle chacun des codes du quartier ? */
export function areaBookable(a: Area, policy: ZonePolicy): boolean {
  return a.prefixes.length > 0 && a.prefixes.every((p) => zoneFor(p, policy) !== null);
}

export type AreaGroup = { region: AreaRegion; areas: Area[] };

/** Les quartiers que la grille accepte, Montréal puis la Rive-Sud ; une région sans quartier disparaît. */
export function servedAreas(policy: ZonePolicy): AreaGroup[] {
  const ok = AREAS.filter((a) => areaBookable(a, policy));
  return (["montreal", "south"] as const)
    .map((region) => ({ region, areas: ok.filter((a) => a.region === region) }))
    .filter((g) => g.areas.length > 0);
}

/** Le nom d'un quartier dans une phrase : « centre-ville », « Downtown ». */
export function areaName(a: Area, locale: "fr" | "en"): string {
  return locale === "en" ? a.en : a.fr;
}

/** Le nom d'un quartier seul sur sa ligne ou dans une liste : « Centre-ville ». */
export function areaLabel(a: Area, locale: "fr" | "en"): string {
  const name = areaName(a, locale);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * La liste en une phrase, pour la foire aux questions et /llms.txt :
 * « À Montréal : centre-ville, … et Verdun ; sur la Rive-Sud : … . »
 * Rien quand la grille n'accepte aucun quartier de la liste.
 */
export function areasSentence(
  policy: ZonePolicy,
  locale: "fr" | "en",
  tpl: { sentenceMontreal: string; sentenceSouth: string },
): string {
  const parts = servedAreas(policy).map((g) =>
    (g.region === "montreal" ? tpl.sentenceMontreal : tpl.sentenceSouth)
      .replace("{list}", joinList(g.areas.map((a) => areaName(a, locale)), locale)));
  if (!parts.length) return "";
  const text = parts.join(locale === "en" ? "; " : "\u00a0; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * Les quartiers que nomme la description de l'accueil (lib/i18n/seo.ts),
 * dictée par l'artisan : si la réservation en refuse un, la description
 * cède la place à celle d'avant, qui ne nomme aucun quartier.
 */
export const DESCRIPTION_AREAS = [
  "westmount", "outremont", "ile-des-soeurs", "centre-ville", "saint-lambert", "brossard", "longueuil",
] as const;

export function descriptionAreasServed(policy: ZonePolicy): boolean {
  return DESCRIPTION_AREAS.every((key) => {
    const a = AREAS.find((x) => x.key === key);
    return Boolean(a) && areaBookable(a!, policy);
  });
}

import type { Settings } from "./settings";

/**
 * La grille tarifaire.
 *
 * Une offre se décrit par sa durée, jamais par son prix : le montant découle
 * du taux horaire en vigueur, réglé depuis l'espace artisan. C'est ce qui
 * garantit qu'une grille publiée sur Facebook et le devis calculé par le
 * tunnel de réservation ne se contrediront jamais.
 *
 * Les prix à la pièce, eux, sont fixes : ils s'appliquent à un ajout ponctuel,
 * pas à un panier, et ne suivent donc pas le taux horaire.
 */

type Text = { name: string; tag?: string; detail: string };

export type Offer = { key: string; minutes: number; fr: Text; en: Text };

/** Blocs horaires : vous réservez du temps, nous le remplissons. */
export const BLOCKS: Offer[] = [
  {
    key: "decouverte", minutes: 120,
    fr: { name: "Exécutif & Découverte",
          detail: "14 à 18 pièces. Par exemple : 10 chemises, 4 pantalons et 2 vestons." },
    en: { name: "Executive & Discovery",
          detail: "14 to 18 pieces. For instance: 10 shirts, 4 pairs of trousers and 2 jackets." },
  },
  {
    key: "famille", minutes: 180,
    fr: { name: "Famille & Scolaire",
          detail: "20 à 24 pièces. Par exemple : 12 chemises, 6 pantalons, 4 uniformes scolaires et 2 vestons." },
    en: { name: "Family & School",
          detail: "20 to 24 pieces. For instance: 12 shirts, 6 pairs of trousers, 4 school uniforms and 2 jackets." },
  },
  {
    key: "prestige", minutes: 240,
    fr: { name: "Garde-robe Prestige",
          detail: "28 à 32 pièces. Par exemple : 14 chemises, 8 pantalons, 4 vestons et 6 pièces de linge de maison." },
    en: { name: "Prestige Wardrobe",
          detail: "28 to 32 pieces. For instance: 14 shirts, 8 pairs of trousers, 4 jackets and 6 pieces of household linen." },
  },
];

/** Forfaits composés : un panier type, déjà chiffré. */
export const BUNDLES: Offer[] = [
  {
    key: "grand-foyer", minutes: 180,
    fr: { name: "Grand Foyer", tag: "Familles, lits multiples",
          detail: "4 parures complètes et 8 linges de maison, soit 24 pièces : draps-housses, housses de couette, taies, nappes et serviettes." },
    en: { name: "Full Household", tag: "Families, several beds",
          detail: "4 complete bed sets and 8 pieces of household linen — 24 pieces in all: fitted sheets, duvet covers, pillowcases, tablecloths and napkins." },
  },
  {
    key: "reception", minutes: 120,
    fr: { name: "Prestige Réception", tag: "Linge délicat",
          detail: "2 parures haut de gamme et 2 grandes nappes de réception. Lin, coton d'Égypte, broderies : vapeur sans contact." },
    en: { name: "Reception Linen", tag: "Delicate linen",
          detail: "2 fine bed sets and 2 large dining tablecloths. Linen, Egyptian cotton, embroidery: contactless steam." },
  },
  {
    key: "duo", minutes: 120,
    fr: { name: "Duo Garde-robe & Literie", tag: "Vêtements et lit",
          detail: "8 vêtements courants et 2 parures complètes — la chambre entière en une visite." },
    en: { name: "Wardrobe & Bedding Duo", tag: "Clothes and bed",
          detail: "8 everyday garments and 2 complete bed sets — the whole bedroom in one visit." },
  },
  {
    key: "rentree", minutes: 120,
    fr: { name: "Rentrée & Écoles privées", tag: "Enfants, scolaire",
          detail: "Jusqu'à 12 ensembles d'uniforme, soit la semaine complète de deux enfants. Jupes plissées, chemises, blazers, sur cintres numérotés." },
    en: { name: "Back to School", tag: "Children, uniforms",
          detail: "Up to 12 uniform sets — a full week for two children. Pleated skirts, shirts, blazers, on numbered hangers." },
  },
  {
    key: "affaires", minutes: 180,
    fr: { name: "Garde-robe Affaires", tag: "Professionnels",
          detail: "10 chemises, 2 complets et 3 pantalons, amidon léger sur cols et poignets compris." },
    en: { name: "Business Wardrobe", tag: "Professionals",
          detail: "10 shirts, 2 suits and 3 pairs of trousers, light starch on collars and cuffs included." },
  },
];

/** Ajouts : ils se greffent à une séance déjà réservée, sans second déplacement. */
export const ADDONS: Offer[] = [
  {
    key: "douce-nuit", minutes: 90,
    fr: { name: "Pack Douce Nuit", tag: "Solo ou couple",
          detail: "2 parures complètes : 2 draps-housses, 2 housses de couette et 4 taies." },
    en: { name: "Good Night Pack", tag: "Single or couple",
          detail: "2 complete bed sets: 2 fitted sheets, 2 duvet covers and 4 pillowcases." },
  },
  {
    key: "panier-bebe", minutes: 60,
    fr: { name: "Panier Bébé", tag: "Tout-petits",
          detail: "Jusqu'à 18 pièces bébé ou enfant : bodys, pyjamas, draps de berceau, gigoteuses." },
    en: { name: "Baby Basket", tag: "Little ones",
          detail: "Up to 18 baby or toddler pieces: bodysuits, pyjamas, crib sheets, sleep sacks." },
  },
  {
    key: "enfant-plus", minutes: 60,
    fr: { name: "Enfant supplémentaire", tag: "Forfait Rentrée",
          detail: "6 ensembles d'uniforme de plus, pour un troisième enfant et au-delà." },
    en: { name: "Additional Child", tag: "Back to School package",
          detail: "6 more uniform sets, for a third child and beyond." },
  },
  {
    key: "prolongation", minutes: 60,
    fr: { name: "Prolongation", tag: "Décidée sur place",
          detail: "7 à 8 pièces de plus, si le panier est plus gros que prévu." },
    en: { name: "Extra hour", tag: "Decided on the spot",
          detail: "7 to 8 more pieces, if the basket turns out bigger than expected." },
  },
];

/* ============================ Prix à la pièce ============================ */

export type UnitPrice = { cents: number; toCents?: number; fr: string; en: string };

export const UNIT_LINEN: UnitPrice[] = [
  { cents: 2800, fr: "Parure Queen ou King complète", en: "Complete Queen or King set" },
  { cents: 2200, fr: "Parure simple ou double complète", en: "Complete single or double set" },
  { cents: 1400, fr: "Housse de couette seule", en: "Duvet cover alone" },
  { cents: 800,  fr: "Drap plat ou drap-housse", en: "Flat sheet or fitted sheet" },
  { cents: 1200, toCents: 1800, fr: "Nappe de réception", en: "Dining tablecloth" },
  { cents: 600,  fr: "Draps de berceau et gigoteuse", en: "Crib sheets and sleep sack" },
  { cents: 300,  fr: "Serviette de table", en: "Table napkin" },
];

export const UNIT_GARMENTS: UnitPrice[] = [
  { cents: 3000, fr: "Complet 2 pièces (veston, pantalon)", en: "Two-piece suit (jacket, trousers)" },
  { cents: 4000, fr: "Complet 3 pièces (veston, gilet, pantalon)", en: "Three-piece suit (jacket, waistcoat, trousers)" },
  { cents: 3500, toCents: 4500, fr: "Robe de soirée ou cocktail", en: "Evening or cocktail dress" },
  { cents: 6500, toCents: 8500, fr: "Robe de gala, cérémonie ou mariée", en: "Gala, ceremony or wedding dress" },
  { cents: 3200, fr: "Manteau en laine ou cachemire", en: "Wool or cashmere coat" },
  { cents: 1000, fr: "Chemise en soie pure ou en lin pur", en: "Pure silk or pure linen shirt" },
  { cents: 500,  fr: "Chemise ou robe d'enfant", en: "Child's shirt or dress" },
];

/* ============================ Abonnements ============================ */

export type Plan = {
  key: string;
  visits: number;
  minutesPerVisit: number;
  /** Remise sur le tarif horaire, de 0 à 1. */
  discount: number;
  fr: { name: string; detail: string };
  en: { name: string; detail: string };
};

export const PLANS: Plan[] = [
  {
    key: "serenite", visits: 1, minutesPerVisit: 180, discount: 0.07,
    fr: { name: "Sérénité Literie", detail: "1 visite de 3 h par mois — jusqu'à 4 lits refaits à neuf." },
    en: { name: "Bedding Serenity", detail: "One 3-hour visit a month — up to 4 beds made new again." },
  },
  {
    key: "confort", visits: 2, minutesPerVisit: 120, discount: 0.075,
    fr: { name: "Confort", detail: "2 visites de 2 h par mois — une trentaine de pièces au total." },
    en: { name: "Comfort", detail: "Two 2-hour visits a month — around thirty pieces in all." },
  },
  {
    key: "executif", visits: 4, minutesPerVisit: 120, discount: 0.10,
    fr: { name: "Exécutif", detail: "4 visites de 2 h, une par semaine — la garde-robe de travail tenue à jour." },
    en: { name: "Executive", detail: "Four 2-hour visits, one a week — the work wardrobe kept current." },
  },
  {
    key: "grande-famille", visits: 4, minutesPerVisit: 180, discount: 0.12,
    fr: { name: "Grande Famille", detail: "4 visites de 3 h par mois — vêtements, uniformes et literie de toute la maison." },
    en: { name: "Large Family", detail: "Four 3-hour visits a month — clothes, uniforms and bedding for the whole house." },
  },
];

/* ============================ Calculs ============================ */

/** Montant d'une offre, au taux horaire en vigueur. */
export function offerCents(o: Offer, s: Settings): number {
  return Math.round((o.minutes / 60) * s.hourlyRate);
}

/** Le même montant, la première heure offerte déduite. */
export function firstTimeCents(o: Offer, s: Settings): number {
  return Math.max(0, offerCents(o, s) - s.hourlyRate);
}

/** Montant mensuel d'un abonnement, arrondi au multiple de 5 $ le plus proche. */
export function planCents(p: Plan, s: Settings): number {
  const full = (p.visits * p.minutesPerVisit / 60) * s.hourlyRate;
  return Math.round((full * (1 - p.discount)) / 500) * 500;
}

/** Le plus bas montant mensuel de la gamme — le « à partir de » annoncé. */
export function cheapestPlanCents(s: Settings): number {
  return Math.min(...PLANS.map((p) => planCents(p, s)));
}

/** Montant du même volume, sans abonnement. */
export function planFullCents(p: Plan, s: Settings): number {
  return Math.round((p.visits * p.minutesPerVisit / 60) * s.hourlyRate);
}

/**
 * Combien de pièces d'un type par heure.
 *
 * Lu directement du moteur de créneaux : la cadence annoncée au client est
 * celle que le tunnel de réservation utilise pour calculer sa durée.
 * Arrondi vers le bas — on promet ce qu'on tient.
 */
export function perHour(minutesPerUnit: number): number {
  return Math.max(1, Math.floor(60 / minutesPerUnit));
}

/** Précisions de métier, par prestation du moteur. */
export const CADENCE_NOTE: Record<string, { fr: string; en: string }> = {
  shirt:    { fr: "Col, empiècement, poignets, manches, corps — dans cet ordre, toujours.",
              en: "Collar, yoke, cuffs, sleeves, body — in that order, always." },
  linen:    { fr: "Pliage hôtelier compris, arêtes vives, prêt pour l'armoire.",
              en: "Hotel folding included, sharp edges, ready for the cupboard." },
  trousers: { fr: "L'arête existante est suivie, jamais recréée.",
              en: "The existing crease is followed, never recreated." },
  uniform:  { fr: "Ensemble haut et bas, rendu sur cintres numérotés par enfant.",
              en: "Top and bottom together, returned on hangers numbered per child." },
  delicate: { fr: "Vapeur sans contact ou pattemouille, selon ce que la fibre exige.",
              en: "Contactless steam or a pressing cloth, as the fibre requires." },
  suit:     { fr: "Remise en forme des épaules, marquage du pli. Sans lustrage, jamais.",
              en: "Shoulders reshaped, crease marked. Never any shine." },
};

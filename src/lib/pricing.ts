import type { Settings } from "./settings";
import { INSTALL_MINUTES, PACKUP_MINUTES, PIECES_PER_HOUR, SUBSCRIBER_HOURLY_DISCOUNT_CENTS } from "./brand";

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
 *
 * Aucune offre n'écrit de quantité : le volume d'une durée se lit de
 * `capacityPieces`, le seul chiffre de pièces du site. Un « 10 à 15 pièces »
 * écrit ici finirait par contredire le « jusqu'à 18 pièces » de la FAQ.
 */

type Text = { name: string; tag?: string; detail: string };

export type Offer = { key: string; minutes: number; fr: Text; en: Text };

/** Blocs horaires : vous réservez du temps, nous le remplissons. */
export const BLOCKS: Offer[] = [
  {
    key: "decouverte", minutes: 120,
    fr: { name: "Exécutif & Découverte",
          detail: "Les chemises, pantalons et vestons de la semaine, ou une première séance pour faire connaissance." },
    en: { name: "Executive & Discovery",
          detail: "The week's shirts, trousers and jackets, or a first session to get acquainted." },
  },
  {
    key: "famille", minutes: 180,
    fr: { name: "Famille & Scolaire",
          detail: "Chemises, pantalons et uniformes scolaires de toute la maisonnée." },
    en: { name: "Family & School",
          detail: "Shirts, trousers and school uniforms for the whole household." },
  },
  {
    key: "prestige", minutes: 240,
    fr: { name: "Garde-robe Prestige",
          detail: "Chemises, pantalons, vestons et linge de maison : la garde-robe entière remise en ordre." },
    en: { name: "Prestige Wardrobe",
          detail: "Shirts, trousers, jackets and household linen: the whole wardrobe put back in order." },
  },
];

/** Forfaits composés : un panier type, déjà chiffré. */
export const BUNDLES: Offer[] = [
  {
    key: "grand-foyer", minutes: 180,
    fr: { name: "Grand Foyer", tag: "Familles, lits multiples",
          detail: "Parures complètes et linge de maison : draps-housses, housses de couette, taies, nappes et serviettes." },
    en: { name: "Full Household", tag: "Families, several beds",
          detail: "Complete bed sets and household linen: fitted sheets, duvet covers, pillowcases, tablecloths and napkins." },
  },
  {
    key: "reception", minutes: 120,
    fr: { name: "Prestige Réception", tag: "Linge délicat",
          detail: "Parures haut de gamme et grandes nappes de réception. Lin, coton d'Égypte, broderies : vapeur sans contact." },
    en: { name: "Reception Linen", tag: "Delicate linen",
          detail: "Fine bed sets and large dining tablecloths. Linen, Egyptian cotton, embroidery: contactless steam." },
  },
  {
    key: "duo", minutes: 120,
    fr: { name: "Duo Garde-robe & Literie", tag: "Vêtements et lit",
          detail: "Vêtements courants et parures complètes — la chambre entière en une visite." },
    en: { name: "Wardrobe & Bedding Duo", tag: "Clothes and bed",
          detail: "Everyday garments and complete bed sets — the whole bedroom in one visit." },
  },
  {
    key: "rentree", minutes: 120,
    fr: { name: "Rentrée & Écoles privées", tag: "Enfants, scolaire",
          detail: "Les uniformes de la semaine pour toute la fratrie. Jupes plissées, chemises, blazers, sur cintres numérotés." },
    en: { name: "Back to School", tag: "Children, uniforms",
          detail: "The week's uniforms for all the children. Pleated skirts, shirts, blazers, on numbered hangers." },
  },
  {
    key: "affaires", minutes: 180,
    fr: { name: "Garde-robe Affaires", tag: "Professionnels",
          detail: "Chemises, complets et pantalons, amidon léger sur cols et poignets compris." },
    en: { name: "Business Wardrobe", tag: "Professionals",
          detail: "Shirts, suits and trousers, light starch on collars and cuffs included." },
  },
];

/** Ajouts : ils se greffent à une séance déjà réservée, sans second déplacement. */
export const ADDONS: Offer[] = [
  {
    key: "douce-nuit", minutes: 90,
    fr: { name: "Pack Douce Nuit", tag: "Solo ou couple",
          detail: "Parures complètes : draps-housses, housses de couette et taies." },
    en: { name: "Good Night Pack", tag: "Single or couple",
          detail: "Complete bed sets: fitted sheets, duvet covers and pillowcases." },
  },
  {
    key: "panier-bebe", minutes: 60,
    fr: { name: "Panier Bébé", tag: "Tout-petits",
          detail: "Pièces bébé ou enfant : bodys, pyjamas, draps de berceau, gigoteuses." },
    en: { name: "Baby Basket", tag: "Little ones",
          detail: "Baby or toddler pieces: bodysuits, pyjamas, crib sheets, sleep sacks." },
  },
  {
    key: "enfant-plus", minutes: 60,
    fr: { name: "Enfant supplémentaire", tag: "Forfait Rentrée",
          detail: "Les ensembles d'uniforme d'un troisième enfant et au-delà." },
    en: { name: "Additional Child", tag: "Back to School package",
          detail: "The uniform sets of a third child and beyond." },
  },
  {
    key: "prolongation", minutes: 60,
    fr: { name: "Prolongation", tag: "Décidée sur place",
          detail: "Une heure de plus, si le panier est plus gros que prévu." },
    en: { name: "Extra hour", tag: "Decided on the spot",
          detail: "One more hour, if the basket turns out bigger than expected." },
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
  /** Visites par cycle : c'est ce nombre, effectué, qui fait un « mois ». */
  visits: number;
  minutesPerVisit: number;
  /** Rythme des visites, en semaines : 1 chaque semaine, 2 aux deux semaines… */
  everyWeeks: number;
  fr: { name: string; detail: string };
  en: { name: string; detail: string };
};

export const PLANS: Plan[] = [
  {
    key: "essentiel", visits: 1, minutesPerVisit: 180, everyWeeks: 4,
    fr: { name: "Essentiel", detail: "1 visite de 3 h toutes les quatre semaines — les vêtements du mois et les draps de la maison." },
    en: { name: "Essential", detail: "One 3-hour visit every four weeks — the month's clothes and the household sheets." },
  },
  {
    key: "confort", visits: 2, minutesPerVisit: 120, everyWeeks: 2,
    fr: { name: "Confort", detail: "2 visites de 2 h, aux deux semaines — le linge de tous les jours tenu à jour." },
    en: { name: "Comfort", detail: "Two 2-hour visits, every other week — everyday clothes kept current." },
  },
  {
    key: "executif", visits: 4, minutesPerVisit: 120, everyWeeks: 1,
    fr: { name: "Exécutif", detail: "4 visites de 2 h, une par semaine — la garde-robe de travail tenue à jour." },
    en: { name: "Executive", detail: "Four 2-hour visits, one a week — the work wardrobe kept current." },
  },
  {
    key: "grande-famille", visits: 4, minutesPerVisit: 180, everyWeeks: 1,
    fr: { name: "Grande Famille", detail: "4 visites de 3 h, une par semaine — vêtements, uniformes et literie de toute la maison." },
    en: { name: "Large Family", detail: "Four 3-hour visits, one a week — clothes, uniforms and bedding for the whole house." },
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

/**
 * Montant d'un cycle d'abonnement : ses heures au tarif abonné, soit le taux
 * horaire moins `SUBSCRIBER_HOURLY_DISCOUNT_CENTS`, arrondi au multiple de
 * 5 $ le plus proche. À 55 $ l'heure : 150, 200, 400 et 600 $.
 */
export function planCents(p: Plan, s: Settings): number {
  const rate = Math.max(0, s.hourlyRate - SUBSCRIBER_HOURLY_DISCOUNT_CENTS);
  return Math.round(((p.visits * p.minutesPerVisit / 60) * rate) / 500) * 500;
}

/** Le plus bas montant par cycle de la gamme — le « à partir de » annoncé. */
export function cheapestPlanCents(s: Settings): number {
  return Math.min(...PLANS.map((p) => planCents(p, s)));
}

/** Montant du même volume, sans abonnement. */
export function planFullCents(p: Plan, s: Settings): number {
  return Math.round((p.visits * p.minutesPerVisit / 60) * s.hourlyRate);
}

/** Le volume d'une formule sur un cycle : ses visites, à la capacité de leur durée. */
export function planPieces(p: Pick<Plan, "visits" | "minutesPerVisit">): number {
  return p.visits * capacityPieces(p.minutesPerVisit);
}

/**
 * Jusqu'à combien de pièces tiennent dans une séance de cette durée :
 * 18 en deux heures, 27 en trois. Arrondi vers le bas — on promet ce qu'on
 * tient. Le texte l'accompagne toujours de « selon la taille, le type et la
 * matière des vêtements ».
 */
export function capacityPieces(minutes: number): number {
  return Math.max(0, Math.floor((minutes * PIECES_PER_HOUR) / 60));
}

/** Le temps de repassage d'une séance : sa durée, moins l'installation et le rangement. */
export function ironingMinutes(minutes: number): number {
  return Math.max(0, minutes - INSTALL_MINUTES - PACKUP_MINUTES);
}

export type Phase = { start: Date; end: Date };

/**
 * Les trois temps d'une séance, tels que l'espace artisan les affiche. Sans
 * dépendance : l'onglet Rendez-vous, un composant client, s'en sert.
 *
 * Aujourd'hui : installation pendant les cinq premières minutes, repassage,
 * rangement pendant les cinq dernières. Dans l'ancien déroulement
 * (`setupMinutes` > 0), l'installation précède la séance, le rangement la
 * suit, et tout le temps réservé est du repassage.
 */
export function sessionPhases(startsAt: Date, endsAt: Date, setupMinutes: number): {
  install: Phase; ironing: Phase; packup: Phase; ironingMinutes: number;
} {
  const s = startsAt.getTime(), e = endsAt.getTime();
  const at = (ms: number) => new Date(ms);
  if (setupMinutes > 0) {
    return {
      install: { start: at(s - setupMinutes * 60_000), end: at(s) },
      ironing: { start: at(s), end: at(e) },
      packup: { start: at(e), end: at(e + setupMinutes * 60_000) },
      ironingMinutes: Math.round((e - s) / 60_000),
    };
  }
  const a = s + INSTALL_MINUTES * 60_000, b = Math.max(a, e - PACKUP_MINUTES * 60_000);
  return {
    install: { start: at(s), end: at(a) },
    ironing: { start: at(a), end: at(b) },
    packup: { start: at(b), end: at(e) },
    ironingMinutes: Math.round((b - a) / 60_000),
  };
}


/**
 * Les offres que le tunnel peut encore produire : aucune plus courte que la
 * durée minimale réglée. Une séance de deux heures affichée sous « minimum
 * 3 heures » se réserverait trois heures, au prix de trois.
 */
export function bookableOffers(offers: Offer[], s: Settings): Offer[] {
  return offers.filter((o) => o.minutes >= s.minMinutes);
}

/** Précisions de métier, par prestation du moteur. Aucune ne compte de pièces. */
export const CADENCE_NOTE: Record<string, { fr: string; en: string }> = {
  shirt:    { fr: "Col, empiècement, poignets, manches, corps — dans cet ordre, toujours.",
              en: "Collar, yoke, cuffs, sleeves, body — in that order, always." },
  linen:    { fr: "Pliage hôtelier compris, arêtes vives, prêt pour l'armoire.",
              en: "Hotel folding included, sharp edges, ready for the cupboard." },
  "linen-xl": { fr: "Les grandes largeurs demandent un second passage sur la table. Comptées à part.",
              en: "The wide sizes need a second pass on the board. Counted separately." },
  trousers: { fr: "L'arête existante est suivie, jamais recréée.",
              en: "The existing crease is followed, never recreated." },
  uniform:  { fr: "Ensemble haut et bas, rendu sur cintres numérotés par enfant.",
              en: "Top and bottom together, returned on hangers numbered per child." },
  delicate: { fr: "Vapeur sans contact ou pattemouille, selon ce que la fibre exige.",
              en: "Contactless steam or a pressing cloth, as the fibre requires." },
  suit:     { fr: "Remise en forme des épaules, marquage du pli. Sans lustrage, jamais.",
              en: "Shoulders reshaped, crease marked. Never any shine." },
};

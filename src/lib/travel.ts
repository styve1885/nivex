/**
 * Frais et limites de déplacement, décidés par le temps de trajet réel.
 *
 * Une liste de codes postaux dit où l'artisan accepte d'aller ; elle ne dit
 * pas ce que le voyage coûte. Deux adresses du même quartier peuvent être à
 * quarante minutes l'une de l'autre en autobus, et un dimanche ne ressemble
 * pas à un mardi. La règle porte donc sur la seule chose qui compte vraiment
 * — le temps qu'il faut pour s'y rendre —, mesuré par `transit.ts`.
 *
 * Ce module ne parle à personne : il reçoit un nombre de minutes et rend un
 * verdict. C'est ce qui le rend vérifiable sans réseau.
 */

export type TravelPolicy = {
  /** Faux : on ne mesure rien et personne ne paie de frais. */
  enabled: boolean;
  /** En deçà, le déplacement est compris dans le prix. */
  freeUnderMinutes: number;
  /** Frais d'une séance plus courte que `longSessionMinutes`, en cents. */
  feeShortCents: number;
  /** Frais d'une séance qui l'atteint, en cents. */
  feeLongCents: number;
  /** Ce qu'on appelle une longue séance. */
  longSessionMinutes: number;
  /** Au-delà de ce trajet, la séance doit durer `longSessionMinutes`. */
  minSessionOverMinutes: number;
  /** Au-delà, la réservation en ligne est fermée : il faut appeler. */
  maxMinutes: number;
  /**
   * Codes postaux acceptés quand la mesure est impossible.
   *
   * Volontairement plus courte que la zone affichée : une adresse qu'on sait
   * lointaine ne doit pas passer en aveugle. Mieux vaut un client qui
   * téléphone qu'un déplacement de deux heures facturé comme un voisinage.
   */
  fallbackPrefixes: string[];
  /** Durée de vie d'une mesure en cache, en jours. */
  cacheDays: number;
};

export const DEFAULT_TRAVEL_POLICY: TravelPolicy = {
  enabled: true,
  freeUnderMinutes: 60,
  feeShortCents: 2500,
  feeLongCents: 1500,
  longSessionMinutes: 180,
  minSessionOverMinutes: 75,
  maxMinutes: 105,
  fallbackPrefixes: [
    "J4G","J4H","J4J","J4K","J4L","J4M","J4N",   // Vieux-Longueuil
    "J3Y","J4T",                                  // Saint-Hubert
    "J4V",                                        // Greenfield Park
    "J4P","J4R","J4S",                            // Saint-Lambert
    "J4W","J4X","J4Y","J4Z",                      // Brossard
    "J4B",                                        // Boucherville
    "J3V",                                        // Saint-Bruno-de-Montarville
    "H3E",                                        // Île-des-Sœurs
    "H4G","H4H",                                  // Verdun
    "H3Y","H3Z",                                  // Westmount
    "H2V",                                        // Outremont
    "H2Y",                                        // Vieux-Montréal
  ],
  cacheDays: 30,
};

/* ============================ Verdict ============================ */

export type TravelStatus =
  /** Dans le voisinage : rien à payer. */
  | "free"
  /** Desservi, avec des frais de route. */
  | "fee"
  /** Trop loin pour la réservation en ligne : il faut appeler. */
  | "too-far"
  /** Mesure impossible et adresse hors liste de secours : on n'engage rien. */
  | "blocked";

export type TravelVerdict = {
  status: TravelStatus;
  /** Le trajet mesuré, ou `null` quand la mesure a échoué. */
  minutes: number | null;
  /** Vrai quand le trajet a été réellement mesuré, faux quand on a fait confiance au code postal. */
  verified: boolean;
  feeCents: number;
  /**
   * Durée minimale de séance imposée par l'éloignement, en minutes.
   * Zéro quand l'adresse n'en impose aucune.
   */
  requiredSessionMinutes: number;
};

/** Les trois premiers caractères, sans espace ni casse. */
export function postalHead(postal: string): string {
  return postal.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3);
}

export function inFallback(postal: string, policy: TravelPolicy): boolean {
  const p = postalHead(postal);
  return p.length === 3 && policy.fallbackPrefixes.some((x) => x.toUpperCase() === p);
}

/**
 * Le verdict pour une adresse et une séance.
 *
 * `minutes` vaut `null` quand l'API n'a pas répondu. On bascule alors sur la
 * liste de secours : l'adresse passe, sans frais — on ne facture pas une
 * route qu'on n'a pas mesurée — et la réservation est marquée comme non
 * vérifiée pour que l'artisan sache qu'il doit regarder.
 *
 * Les frais se calculent sur la durée que la séance aura réellement, c'est-à-dire
 * au moins celle que l'éloignement impose. Afficher le tarif court à quelqu'un
 * qui devra de toute façon réserver trois heures serait une annonce fausse.
 */
export function evaluateTravel(
  minutes: number | null,
  durationMinutes: number,
  postal: string,
  policy: TravelPolicy,
): TravelVerdict {
  if (!policy.enabled) {
    return { status: "free", minutes, verified: minutes != null, feeCents: 0, requiredSessionMinutes: 0 };
  }

  if (minutes == null) {
    return inFallback(postal, policy)
      ? { status: "free", minutes: null, verified: false, feeCents: 0, requiredSessionMinutes: 0 }
      : { status: "blocked", minutes: null, verified: false, feeCents: 0, requiredSessionMinutes: 0 };
  }

  if (minutes > policy.maxMinutes) {
    return { status: "too-far", minutes, verified: true, feeCents: 0, requiredSessionMinutes: 0 };
  }

  if (minutes < policy.freeUnderMinutes) {
    return { status: "free", minutes, verified: true, feeCents: 0, requiredSessionMinutes: 0 };
  }

  const requiredSessionMinutes = minutes > policy.minSessionOverMinutes ? policy.longSessionMinutes : 0;
  const effective = Math.max(durationMinutes, requiredSessionMinutes);
  const feeCents = effective >= policy.longSessionMinutes ? policy.feeLongCents : policy.feeShortCents;

  return { status: "fee", minutes, verified: true, feeCents, requiredSessionMinutes };
}

/** La séance proposée est-elle assez longue pour cette adresse ? */
export function sessionTooShort(v: TravelVerdict, durationMinutes: number): boolean {
  return v.requiredSessionMinutes > 0 && durationMinutes < v.requiredSessionMinutes;
}

/** La réservation en ligne peut-elle aboutir ? */
export function bookable(v: TravelVerdict, durationMinutes: number): boolean {
  if (v.status === "too-far" || v.status === "blocked") return false;
  return !sessionTooShort(v, durationMinutes);
}

/* ============================ Textes ============================ */

/**
 * La phrase des conditions, construite depuis la politique en vigueur.
 *
 * La page Tarifs ne récite pas « 25 $ » : elle lit ce qui est réglé. Changer
 * un montant depuis /admin change la page, sans quoi les conditions publiées
 * finiraient par contredire ce que le tunnel facture.
 */
export function travelTerms(
  policy: TravelPolicy,
  locale: "fr" | "en",
  money: (cents: number) => string,
): string | null {
  if (!policy.enabled || (policy.feeShortCents <= 0 && policy.feeLongCents <= 0)) return null;
  const h = hoursText(policy.longSessionMinutes, locale);
  const free = hoursText(policy.freeUnderMinutes, locale);
  if (locale === "en") {
    return `Travel fee by distance: ${money(policy.feeShortCents)} per visit shorter than ${h}, ${money(policy.feeLongCents)} per visit of ${h} or more, for addresses more than ${free} of travel away.`;
  }
  /* « à plus de une heure » ne s'écrit pas. L'élision dépend de ce que les
     réglages produisent — « une heure », « 45 minutes », « 1 h 30 » —, elle
     se décide donc ici et non dans une chaîne figée. */
  const plusDe = /^[aeiouâêîôûàéèùh]/i.test(free) ? `plus d'${free}` : `plus de ${free}`;
  return `Frais de déplacement selon la distance : ${money(policy.feeShortCents)} par visite de moins de ${h}, ${money(policy.feeLongCents)} par visite de ${h} ou plus, pour les adresses situées à ${plusDe} de trajet.`;
}

function hoursText(minutes: number, locale: "fr" | "en"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return locale === "en" ? `${m} minutes` : `${m} minutes`;
  if (m === 0) {
    if (locale === "en") return h === 1 ? "one hour" : `${h} hours`;
    return h === 1 ? "une heure" : `${h} heures`;
  }
  return locale === "en" ? `${h} h ${m}` : `${h} h ${m}`;
}

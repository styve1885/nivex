/**
 * Zones desservies et frais de déplacement.
 *
 * Trois cercles autour de la maison, reconnus aux trois premiers caractères
 * du code postal. Le plus proche ne coûte rien ; les deux autres ajoutent des
 * frais, moindres pour une longue séance puisque la route se répartit sur
 * plus d'heures de travail.
 *
 * Deux principes gouvernent ces frais, et ils tiennent ensemble dans une
 * seule décision : ils vivent dans leur propre colonne, jamais fondus dans
 * l'estimation.
 *
 *  — Ils ne sont pas du temps de repassage. L'offre « première heure
 *    offerte » escompte des heures de travail ; elle n'a donc aucune prise
 *    sur eux, ni pour les effacer ni pour les réduire.
 *
 *  — Ils se règlent depuis l'espace artisan. Les zones, les préfixes et les
 *    montants sont des décisions commerciales : elles ne doivent pas
 *    demander une mise en production.
 *
 * Ce module ne parle à personne : il reçoit un code postal et une durée, et
 * rend un verdict. C'est ce qui le rend vérifiable sans réseau ni base.
 */

export type FeeZone = {
  key: string;
  labelFr: string;
  labelEn: string;
  /** Les trois premiers caractères des codes postaux couverts. */
  prefixes: string[];
  /** Frais d'une séance plus courte que `longSessionMinutes`, en cents. */
  shortFeeCents: number;
  /** Frais d'une séance qui l'atteint, en cents. */
  longFeeCents: number;
  enabled: boolean;
};

export type ZonePolicy = {
  zones: FeeZone[];
  /**
   * Ce qu'on appelle une longue séance.
   *
   * Le seuil est atteint, non dépassé : trois heures tout rond paient déjà
   * le tarif réduit. C'est la lecture qui favorise le client, et celle qu'on
   * a annoncée.
   */
  longSessionMinutes: number;
};

export const DEFAULT_ZONE_POLICY: ZonePolicy = {
  longSessionMinutes: 180,
  zones: [
    {
      key: "a",
      labelFr: "Longueuil et la Rive-Sud",
      labelEn: "Longueuil and the South Shore",
      prefixes: [
        "J4G", "J4H", "J4J", "J4K", "J4L", "J4M", "J4N",  // Vieux-Longueuil
        "J3Y", "J4T",                                      // Saint-Hubert
        "J4V",                                             // Greenfield Park
        "J4P", "J4R", "J4S",                               // Saint-Lambert
        "J4W", "J4X", "J4Y", "J4Z",                        // Brossard
        "J4B",                                             // Boucherville
        "J3V",                                             // Saint-Bruno-de-Montarville
        "J3E",                                             // Sainte-Julie
        "J3L",                                             // Chambly
        "J3X",                                             // Varennes
        "J5R",                                             // La Prairie
      ],
      shortFeeCents: 0,
      longFeeCents: 0,
      enabled: true,
    },
    {
      key: "b",
      labelFr: "Quartiers de Montréal",
      labelEn: "Montreal neighbourhoods",
      prefixes: [
        "H3E",          // Île-des-Sœurs
        "H4G", "H4H",   // Verdun
        "H2Y",          // Vieux-Montréal
        "H3Y", "H3Z",   // Westmount
        "H2V",          // Outremont
      ],
      shortFeeCents: 1500,
      longFeeCents: 1000,
      enabled: true,
    },
    {
      key: "c",
      labelFr: "Saint-Jean-sur-Richelieu",
      labelEn: "Saint-Jean-sur-Richelieu",
      prefixes: ["J2W", "J2X", "J2Y", "J3A", "J3B"],
      shortFeeCents: 2500,
      longFeeCents: 2000,
      enabled: true,
    },
  ],
};

/* ============================ Verdict ============================ */

export type ZoneStatus =
  /** Desservi, déplacement compris dans le prix. */
  | "free"
  /** Desservi, avec des frais de route. */
  | "fee"
  /** Hors zone : la réservation en ligne ne peut pas aboutir. */
  | "out";

export type ZoneVerdict = {
  status: ZoneStatus;
  zoneKey: string | null;
  labelFr: string | null;
  labelEn: string | null;
  feeCents: number;
};

export const OUT_OF_ZONE: ZoneVerdict = {
  status: "out", zoneKey: null, labelFr: null, labelEn: null, feeCents: 0,
};

/** Les trois premiers caractères, sans espace ni casse. */
export function postalHead(postal: string): string {
  return postal.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3);
}

/** La zone qui reconnaît ce code postal, ou rien. */
export function zoneFor(postal: string, policy: ZonePolicy): FeeZone | null {
  const p = postalHead(postal);
  if (p.length !== 3) return null;
  for (const z of policy.zones) {
    if (!z.enabled) continue;
    if (z.prefixes.some((x) => x.toUpperCase() === p)) return z;
  }
  return null;
}

/**
 * Le verdict pour une adresse et une séance.
 *
 * La durée est celle de la séance réservée, pas le temps facturé : une
 * première heure offerte ne raccourcit pas la route, et ne doit donc pas
 * faire basculer les frais du côté du tarif plein.
 */
export function evaluateZone(
  postal: string,
  durationMinutes: number,
  policy: ZonePolicy,
): ZoneVerdict {
  const z = zoneFor(postal, policy);
  if (!z) return OUT_OF_ZONE;

  const cents = durationMinutes >= policy.longSessionMinutes ? z.longFeeCents : z.shortFeeCents;

  return {
    status: cents > 0 ? "fee" : "free",
    zoneKey: z.key,
    labelFr: z.labelFr,
    labelEn: z.labelEn,
    feeCents: Math.max(0, Math.round(cents)),
  };
}

/** La réservation en ligne peut-elle aboutir ? */
export function bookable(v: ZoneVerdict): boolean {
  return v.status !== "out";
}

/* ============================ Textes ============================ */

/**
 * Le tableau des frais, construit depuis la politique en vigueur.
 *
 * La page Tarifs ne récite pas « 15 $ » : elle lit ce qui est réglé. Changer
 * un montant depuis /admin change la page, sans quoi les conditions publiées
 * finiraient par contredire ce que le tunnel facture. Les zones sans frais
 * n'y figurent pas : une ligne « 0 $ » n'apprend rien.
 */
export type FeeRow = { zone: string; short: string; long: string };

export function feeTable(
  policy: ZonePolicy,
  locale: "fr" | "en",
  money: (cents: number) => string,
): FeeRow[] {
  return policy.zones
    .filter((z) => z.enabled && (z.shortFeeCents > 0 || z.longFeeCents > 0))
    .map((z) => ({
      zone: locale === "en" ? z.labelEn : z.labelFr,
      short: money(z.shortFeeCents),
      long: money(z.longFeeCents),
    }));
}

/** Les heures du seuil, écrites comme on les dit. */
export function longSessionText(policy: ZonePolicy, locale: "fr" | "en"): string {
  const h = Math.floor(policy.longSessionMinutes / 60);
  const m = policy.longSessionMinutes % 60;
  if (m !== 0) return `${h} h ${m}`;
  if (locale === "en") return h === 1 ? "one hour" : `${h} hours`;
  return h === 1 ? "une heure" : `${h} heures`;
}

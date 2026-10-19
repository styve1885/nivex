/**
 * Zones desservies et frais de déplacement.
 *
 * Deux étages. Des **secteurs** — Longueuil, Verdun, Candiac… —, chacun
 * reconnu aux trois premiers caractères du code postal, et rattaché à une
 * **zone** qui porte les frais. Le secteur est ce que le client lit et ce que
 * Google affiche ; la zone est ce qu'il paie. Un secteur change de zone d'un
 * clic, une zone change de tarif sans toucher à ses secteurs.
 *
 * Deux principes gouvernent ces frais, et ils tiennent ensemble dans une
 * seule décision : ils vivent dans leur propre colonne, jamais fondus dans
 * l'estimation.
 *
 *  — Ils ne sont pas du temps de repassage. L'offre « première heure
 *    offerte » escompte des heures de travail ; elle n'a donc aucune prise
 *    sur eux, ni pour les effacer ni pour les réduire.
 *
 *  — Ils se règlent depuis l'espace artisan. Secteurs, préfixes, zones et
 *    montants sont des décisions commerciales : elles ne doivent pas
 *    demander une mise en production.
 *
 * Ce module ne parle à personne : il reçoit un code postal et une durée, et
 * rend un verdict. C'est ce qui le rend vérifiable sans réseau ni base.
 */

export type Zone = {
  key: string;
  nameFr: string;
  nameEn: string;
  /** Frais d'une séance plus courte que le seuil, en cents. */
  shortFeeCents: number;
  /** Frais d'une séance qui atteint le seuil, en cents. */
  longFeeCents: number;
  /**
   * Ce qu'on appelle une longue séance, propre à chaque zone.
   *
   * Le seuil est atteint, non dépassé : trois heures tout rond paient déjà
   * le tarif réduit. C'est la lecture qui favorise le client, et celle qu'on
   * a annoncée.
   */
  thresholdMinutes: number;
};

export type Sector = {
  key: string;
  nameFr: string;
  nameEn: string;
  /** Les trois premiers caractères des codes postaux couverts. */
  prefixes: string[];
  zoneKey: string;
  enabled: boolean;
};

/**
 * La grille complète. L'ordre des tableaux est celui de l'affichage : les
 * zones dans l'ordre où elles sont rangées, et dans chaque zone ses secteurs
 * dans l'ordre du tableau.
 *
 * `version` n'est pas décoratif : c'est lui qui distingue cette forme de
 * celles que la colonne a portées avant (voir `readZonePolicy`).
 */
export type ZonePolicy = { version: 2; zones: Zone[]; sectors: Sector[] };

export const POLICY_VERSION = 2 as const;
export const PREFIX_RE = /^[A-Z]\d[A-Z]$/;

const sector = (key: string, nameFr: string, nameEn: string, zoneKey: string, prefixes: string[]): Sector =>
  ({ key, nameFr, nameEn, prefixes, zoneKey, enabled: true });

export const DEFAULT_ZONE_POLICY: ZonePolicy = {
  version: POLICY_VERSION,
  zones: [
    { key: "a", nameFr: "Zone A", nameEn: "Zone A", shortFeeCents: 0, longFeeCents: 0, thresholdMinutes: 180 },
    { key: "b", nameFr: "Zone B", nameEn: "Zone B", shortFeeCents: 1500, longFeeCents: 1000, thresholdMinutes: 180 },
    { key: "c", nameFr: "Zone C", nameEn: "Zone C", shortFeeCents: 2500, longFeeCents: 2000, thresholdMinutes: 180 },
  ],
  sectors: [
    /* Saint-Lambert d'abord, toujours : c'est le secteur que la maison met en
       avant. Vieux-Longueuil et Longueuil partagent leurs préfixes, dans la
       même zone : le premier nomme l'arrondissement qu'on cherche, le second
       la ville. */
    sector("saint-lambert", "Saint-Lambert", "Saint-Lambert", "a", ["J4P", "J4R", "J4S"]),
    sector("vieux-longueuil", "Vieux-Longueuil", "Vieux-Longueuil", "a", ["J4G", "J4H", "J4J", "J4K", "J4L", "J4M", "J4N"]),
    sector("longueuil", "Longueuil", "Longueuil", "a", ["J4G", "J4H", "J4J", "J4K", "J4L", "J4M", "J4N"]),
    sector("greenfield-park", "Greenfield Park", "Greenfield Park", "a", ["J4V"]),
    sector("saint-hubert", "Saint-Hubert", "Saint-Hubert", "a", ["J3Y", "J3Z", "J4T"]),
    sector("brossard", "Brossard", "Brossard", "a", ["J4W", "J4X", "J4Y", "J4Z"]),
    sector("boucherville", "Boucherville", "Boucherville", "a", ["J4B"]),
    sector("saint-bruno", "Saint-Bruno-de-Montarville", "Saint-Bruno-de-Montarville", "a", ["J3V"]),
    sector("sainte-julie", "Sainte-Julie", "Sainte-Julie", "a", ["J3E"]),
    sector("varennes", "Varennes", "Varennes", "a", ["J3X"]),
    sector("ile-des-soeurs", "L'Île-des-Sœurs", "Nuns' Island", "b", ["H3E"]),
    sector("verdun", "Verdun", "Verdun", "b", ["H4G", "H4H"]),
    sector("vieux-montreal", "Vieux-Montréal", "Old Montreal", "b", ["H2Y"]),
    sector("westmount", "Westmount", "Westmount", "b", ["H3Y", "H3Z"]),
    sector("outremont", "Outremont", "Outremont", "b", ["H2V"]),
    sector("centre-ville", "Centre-ville de Montréal", "Downtown Montreal", "b",
      ["H3A", "H3B", "H3G", "H3H", "H3C", "H2Z", "H2L", "H2X"]),
    sector("plateau", "Le Plateau-Mont-Royal", "Plateau-Mont-Royal", "b", ["H2J", "H2T", "H2W", "H2H"]),
    /* J3L couvre aussi Carignan, et J5R à la fois Candiac et La Prairie : le
       code postal ne sépare pas ces villes, qui paient donc ensemble les frais
       de la zone B. La grille suit celle réglée en production le 17 octobre. */
    sector("chambly", "Chambly", "Chambly", "b", ["J3L"]),
    sector("candiac", "Candiac", "Candiac", "b", ["J5R"]),
    sector("la-prairie", "La Prairie", "La Prairie", "b", ["J5R"]),
    sector("saint-jean", "Saint-Jean-sur-Richelieu", "Saint-Jean-sur-Richelieu", "c", ["J2W", "J2X", "J2Y", "J3A", "J3B"]),
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
  /** Le nom de la zone, recopié sur la réservation avec ses frais. */
  labelFr: string | null;
  labelEn: string | null;
  /** Les frais pour la durée demandée. */
  feeCents: number;
  /** Les deux tarifs de la zone et son seuil, pour les annoncer ensemble. */
  shortFeeCents: number;
  longFeeCents: number;
  thresholdMinutes: number;
};

export const OUT_OF_ZONE: ZoneVerdict = {
  status: "out", zoneKey: null, labelFr: null, labelEn: null,
  feeCents: 0, shortFeeCents: 0, longFeeCents: 0, thresholdMinutes: 0,
};

/** Les trois premiers caractères, sans espace ni casse. */
export function postalHead(postal: string): string {
  return postal.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3);
}

/**
 * La zone qui reconnaît ce code postal, ou rien.
 *
 * Seuls comptent les secteurs actifs rattachés à une zone qui existe. Un
 * préfixe partagé par deux secteurs de la même zone — J5R, La Prairie et
 * Candiac — donne la même réponse par l'un ou l'autre ; deux zones pour un
 * même préfixe, l'enregistrement le refuse (`policyProblems`).
 */
export function zoneFor(postal: string, policy: ZonePolicy): Zone | null {
  const p = postalHead(postal);
  if (p.length !== 3) return null;
  for (const s of policy.sectors) {
    if (!s.enabled || !s.prefixes.includes(p)) continue;
    const z = policy.zones.find((x) => x.key === s.zoneKey);
    if (z) return z;
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

  const cents = Math.max(0, Math.round(durationMinutes >= z.thresholdMinutes ? z.longFeeCents : z.shortFeeCents));

  return {
    status: cents > 0 ? "fee" : "free",
    zoneKey: z.key,
    labelFr: z.nameFr,
    /* Un nom anglais laissé vide suit le français, comme partout ailleurs. */
    labelEn: z.nameEn || z.nameFr,
    feeCents: cents,
    shortFeeCents: z.shortFeeCents,
    longFeeCents: z.longFeeCents,
    thresholdMinutes: z.thresholdMinutes,
  };
}

/** La réservation en ligne peut-elle aboutir ? */
export function bookable(v: ZoneVerdict): boolean {
  return v.status !== "out";
}

/* ============================ Ordre et listes ============================ */

/** Les secteurs dans l'ordre d'affichage : zone par zone, puis dans l'ordre du tableau. */
export function orderedSectors(policy: ZonePolicy): Sector[] {
  const rang = new Map(policy.zones.map((z, i) => [z.key, i]));
  return policy.sectors
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (rang.get(a.s.zoneKey) ?? 1e6) - (rang.get(b.s.zoneKey) ?? 1e6) || a.i - b.i)
    .map((x) => x.s);
}

/** Les secteurs qui comptent : actifs, et rattachés à une zone qui existe. */
export function activeSectors(policy: ZonePolicy): Sector[] {
  const zones = new Set(policy.zones.map((z) => z.key));
  return orderedSectors(policy).filter((s) => s.enabled && zones.has(s.zoneKey));
}

/** « A, B et C » / « A, B and C ». */
export function joinList(names: string[], locale: "fr" | "en"): string {
  if (names.length <= 1) return names.join("");
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(", ")} ${locale === "en" ? "and" : "et"} ${last}`;
}

/**
 * Un secteur de l'île de Montréal.
 *
 * Reconnu à ses préfixes, pas à son nom ni à sa zone : une zone peut mêler
 * Verdun et Chambly, et un nom se retouche. Les codes postaux de l'île
 * commencent par H ; Laval aussi, mais par H7, et Laval n'est pas Montréal.
 */
export function isMontrealSector(s: Sector): boolean {
  return s.prefixes.length > 0 && s.prefixes.every((p) => p.startsWith("H") && !p.startsWith("H7"));
}

/**
 * Les secteurs actifs, la Rive-Sud et les environs d'abord, Montréal ensuite.
 *
 * Dans chaque groupe, l'ordre est celui de l'onglet « Zones et frais ». Les
 * deux groupes ne se mélangent pas : une liste qui intercale Verdun entre
 * Brossard et Chambly ne se lit pas, ni par un client ni par un moteur.
 */
export function sectorsByRegion(policy: ZonePolicy): { south: Sector[]; montreal: Sector[] } {
  const actifs = activeSectors(policy);
  return {
    south: actifs.filter((s) => !isMontrealSector(s)),
    montreal: actifs.filter(isMontrealSector),
  };
}

const nameOf = (s: Sector, locale: "fr" | "en") => (locale === "en" ? s.nameEn || s.nameFr : s.nameFr);

/** Les noms des secteurs actifs : Rive-Sud et environs, puis Montréal. */
export function sectorNames(policy: ZonePolicy, locale: "fr" | "en"): string[] {
  const { south, montreal } = sectorsByRegion(policy);
  return [...south, ...montreal].map((s) => nameOf(s, locale));
}

/**
 * Les régions qui ont au moins un secteur actif — la Rive-Sud, puis
 * Montréal —, pour les phrases trop courtes pour nommer chaque secteur.
 */
export function servedRegions(policy: ZonePolicy, labels: { south: string; montreal: string }): string[] {
  const { south, montreal } = sectorsByRegion(policy);
  return [...(south.length ? [labels.south] : []), ...(montreal.length ? [labels.montreal] : [])];
}

/** Les noms des quartiers de Montréal desservis, dans l'ordre. */
export function montrealNames(policy: ZonePolicy, locale: "fr" | "en"): string[] {
  return sectorsByRegion(policy).montreal.map((s) => nameOf(s, locale));
}

/**
 * La phrase de la zone desservie, écrite depuis les secteurs actifs.
 *
 * Elle remplace le texte saisi à la main : une phrase qu'on retouche à part
 * finit toujours par oublier le quartier qu'on vient d'ajouter, et le site
 * annonce alors moins — ou plus — qu'il n'accepte.
 */
export function servedText(
  policy: ZonePolicy,
  locale: "fr" | "en",
  tpl: { served: string; montreal: string; none: string },
): string {
  const { south, montreal } = sectorsByRegion(policy);
  const parts = [
    south.length ? tpl.served.replace("{list}", joinList(south.map((s) => nameOf(s, locale)), locale)) : "",
    montreal.length ? tpl.montreal.replace("{list}", joinList(montreal.map((s) => nameOf(s, locale)), locale)) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : tpl.none;
}

/**
 * Les frais des quartiers de Montréal, zone par zone.
 *
 * Pour la page Montréal : les mêmes montants que le tableau de la page
 * Tarifs, restreints aux zones qui contiennent un quartier de l'île, avec les
 * quartiers concernés. Rien n'y est récité.
 */
export function montrealFees(
  policy: ZonePolicy,
  locale: "fr" | "en",
  money: (cents: number) => string,
): FeeRow[] {
  const { montreal } = sectorsByRegion(policy);
  return policy.zones
    .map((z) => ({ z, sectors: montreal.filter((s) => s.zoneKey === z.key) }))
    .filter(({ sectors }) => sectors.length > 0)
    .map(({ z, sectors }) => ({
      key: z.key,
      zone: locale === "en" ? z.nameEn || z.nameFr : z.nameFr,
      sectors: sectors.map((s) => nameOf(s, locale)),
      free: z.shortFeeCents === 0 && z.longFeeCents === 0,
      short: money(z.shortFeeCents),
      long: money(z.longFeeCents),
      threshold: thresholdText(z.thresholdMinutes, locale),
    }));
}

/** Ce que l'artisan colle dans sa fiche Google : un secteur actif par ligne, dans l'ordre. */
export function googleList(policy: ZonePolicy): string {
  return sectorNames(policy, "fr").join("\n");
}

/** Les préfixes reconnus, sans doublon — pour les données structurées. */
export function activePrefixes(policy: ZonePolicy): string[] {
  return [...new Set(activeSectors(policy).flatMap((s) => s.prefixes))];
}

/* ============================ Textes ============================ */

/** Le seuil écrit comme on le dit : « 3 h », « 2 h 30 » ; « 3 hours ». */
export function thresholdText(minutes: number, locale: "fr" | "en"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === "en") {
    if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
    return `${h} h ${String(m).padStart(2, "0")}`;
  }
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Le tableau des frais, construit depuis la grille en vigueur.
 *
 * La page Tarifs ne récite pas « 15 $ » : elle lit ce qui est réglé. Changer
 * un montant depuis /admin change la page, sans quoi les conditions publiées
 * finiraient par contredire ce que le tunnel facture. Chaque zone y figure
 * avec ses secteurs, celles sans frais comprises : c'est là qu'un client
 * apprend qu'il n'en paie aucun. Une zone sans secteur actif n'apprend rien
 * et reste hors du tableau. Dans chaque zone, la Rive-Sud vient d'abord et
 * les quartiers de l'île ensuite, comme dans toute liste de secteurs.
 */
export type FeeRow = {
  key: string;
  zone: string;
  sectors: string[];
  free: boolean;
  short: string;
  long: string;
  threshold: string;
};

export function feeTable(
  policy: ZonePolicy,
  locale: "fr" | "en",
  money: (cents: number) => string,
): FeeRow[] {
  const { south, montreal } = sectorsByRegion(policy);
  const actifs = [...south, ...montreal];
  return policy.zones
    .map((z) => ({ z, sectors: actifs.filter((s) => s.zoneKey === z.key) }))
    .filter(({ sectors }) => sectors.length > 0)
    .map(({ z, sectors }) => ({
      key: z.key,
      zone: locale === "en" ? z.nameEn || z.nameFr : z.nameFr,
      sectors: sectors.map((s) => (locale === "en" ? s.nameEn || s.nameFr : s.nameFr)),
      free: z.shortFeeCents === 0 && z.longFeeCents === 0,
      short: money(z.shortFeeCents),
      long: money(z.longFeeCents),
      threshold: thresholdText(z.thresholdMinutes, locale),
    }));
}

/* ============================ Contrôles ============================ */

export type PrefixUse = { prefix: string; sectorKey: string; sectorName: string; zoneKey: string };

/**
 * Où chaque préfixe est déjà employé, secteurs inactifs compris.
 *
 * L'espace artisan s'en sert pour prévenir dès la saisie ; l'enregistrement,
 * pour refuser ce qui ne peut pas tenir.
 */
export function prefixUses(policy: ZonePolicy): Map<string, PrefixUse[]> {
  const out = new Map<string, PrefixUse[]>();
  for (const s of policy.sectors) {
    for (const p of new Set(s.prefixes)) {
      const list = out.get(p) ?? [];
      list.push({ prefix: p, sectorKey: s.key, sectorName: s.nameFr, zoneKey: s.zoneKey });
      out.set(p, list);
    }
  }
  return out;
}

/**
 * Les bornes d'une grille. Le serveur les refuse ; `policyProblems` les
 * signale pendant la saisie, pour qu'aucune ne se découvre seulement au
 * moment d'enregistrer, derrière un refus qui ne dit pas où chercher.
 */
export const POLICY_LIMITS = {
  zones: 30,
  sectors: 200,
  prefixesPerSector: 60,
  nameLength: 80,
  feeCents: 50_000,
} as const;

/**
 * Ce qui empêche d'enregistrer une grille, en phrases lisibles par l'artisan.
 *
 * La règle qui compte le plus : **un préfixe, une zone**. Deux zones pour un
 * même code rendraient le tarif dépendant de l'ordre du tableau, donc
 * imprévisible. On ne tranche pas à la place de l'artisan : on refuse, et on
 * nomme les deux secteurs. Deux secteurs de la même zone peuvent, eux,
 * partager un préfixe — La Prairie et Candiac partagent J5R.
 */
export function policyProblems(policy: ZonePolicy): string[] {
  const out: string[] = [];
  const zones = new Map<string, Zone>();
  const L = POLICY_LIMITS;
  const tooLong = (x: { nameFr: string; nameEn: string }) =>
    x.nameFr.trim().length > L.nameLength || x.nameEn.trim().length > L.nameLength;

  if (policy.zones.length === 0) out.push("Il faut au moins une zone.");
  if (policy.zones.length > L.zones) out.push(`${L.zones} zones au plus.`);
  for (const z of policy.zones) {
    if (zones.has(z.key)) out.push(`Deux zones portent la même clé (${z.key}).`);
    zones.set(z.key, z);
    if (!z.nameFr.trim()) out.push("Chaque zone doit porter un nom.");
    if (z.thresholdMinutes < 30 || z.thresholdMinutes > 960) {
      out.push(`${z.nameFr || z.key} : le seuil doit se situer entre 30 minutes et 16 heures.`);
    }
    if ([z.shortFeeCents, z.longFeeCents].some((c) => !Number.isInteger(c) || c < 0 || c > L.feeCents)) {
      out.push(`${z.nameFr || z.key} : les frais vont de 0 à ${L.feeCents / 100} $ par visite.`);
    }
    if (tooLong(z)) out.push(`${z.nameFr.trim().slice(0, 40) || z.key} : un nom compte ${L.nameLength} caractères au plus.`);
  }

  if (policy.sectors.length > L.sectors) out.push(`${L.sectors} secteurs au plus.`);
  const keys = new Set<string>();
  for (const s of policy.sectors) {
    const nom = s.nameFr.trim() || "Un secteur sans nom";
    if (keys.has(s.key)) out.push(`Deux secteurs portent la même clé (${s.key}).`);
    keys.add(s.key);
    if (!s.nameFr.trim()) out.push("Chaque secteur doit porter un nom en français.");
    if (!zones.has(s.zoneKey)) out.push(`${nom} est rattaché à une zone qui n'existe plus.`);
    const bad = s.prefixes.filter((p) => !PREFIX_RE.test(p));
    if (bad.length) out.push(`${nom} : préfixe invalide (${bad.join(", ")}). Format attendu : lettre, chiffre, lettre.`);
    if (s.enabled && s.prefixes.length === 0) out.push(`${nom} est actif mais n'a aucun préfixe.`);
    if (s.prefixes.length > L.prefixesPerSector) {
      out.push(`${nom} : ${s.prefixes.length} préfixes, pour ${L.prefixesPerSector} au plus. Répartissez-les entre plusieurs secteurs.`);
    }
    if (tooLong(s)) out.push(`${nom.slice(0, 40)} : un nom compte ${L.nameLength} caractères au plus.`);
  }

  if (!policy.sectors.some((s) => s.enabled && s.prefixes.length > 0 && zones.has(s.zoneKey))) {
    out.push("Au moins un secteur doit rester actif, sinon plus personne ne peut réserver en ligne.");
  }

  for (const [p, uses] of prefixUses(policy)) {
    const actifs = uses.filter((u) => policy.sectors.find((s) => s.key === u.sectorKey)?.enabled);
    const zonesDuPrefixe = [...new Set(actifs.map((u) => u.zoneKey))];
    if (zonesDuPrefixe.length > 1) {
      const qui = actifs.map((u) => `${u.sectorName} (${zones.get(u.zoneKey)?.nameFr ?? u.zoneKey})`);
      out.push(`${p} est dans deux zones à la fois : ${joinList(qui, "fr")}. Un préfixe ne peut appartenir qu'à une seule zone.`);
    }
  }

  return [...new Set(out)];
}

/* ============================ Historique ============================ */

const dollars = (cents: number) => {
  const v = cents / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(".", ",")} $`;
};

/**
 * Ce qui a changé entre deux grilles, une ligne par changement.
 *
 * C'est l'historique de l'onglet « Zones et frais » : de quoi retrouver,
 * des mois plus tard, quand Verdun est passé en zone C et à quel tarif.
 */
export function describeChanges(before: ZonePolicy, after: ZonePolicy): string[] {
  const out: string[] = [];
  const zoneName = (p: ZonePolicy, key: string) => p.zones.find((z) => z.key === key)?.nameFr ?? key;

  for (const z of after.zones) {
    const old = before.zones.find((x) => x.key === z.key);
    if (!old) {
      out.push(`Zone « ${z.nameFr} » créée : ${dollars(z.shortFeeCents)} sous ${thresholdText(z.thresholdMinutes, "fr")}, ${dollars(z.longFeeCents)} à partir de ${thresholdText(z.thresholdMinutes, "fr")}.`);
      continue;
    }
    if (old.nameFr !== z.nameFr) out.push(`Zone « ${old.nameFr} » renommée « ${z.nameFr} ».`);
    else if (old.nameEn !== z.nameEn) out.push(`Zone « ${z.nameFr} » : nom anglais « ${old.nameEn} » devenu « ${z.nameEn} ».`);
    if (old.shortFeeCents !== z.shortFeeCents) {
      out.push(`Zone « ${z.nameFr} » : frais sous le seuil ${dollars(old.shortFeeCents)} → ${dollars(z.shortFeeCents)}.`);
    }
    if (old.longFeeCents !== z.longFeeCents) {
      out.push(`Zone « ${z.nameFr} » : frais à partir du seuil ${dollars(old.longFeeCents)} → ${dollars(z.longFeeCents)}.`);
    }
    if (old.thresholdMinutes !== z.thresholdMinutes) {
      out.push(`Zone « ${z.nameFr} » : seuil ${thresholdText(old.thresholdMinutes, "fr")} → ${thresholdText(z.thresholdMinutes, "fr")}.`);
    }
  }
  for (const z of before.zones) {
    if (!after.zones.some((x) => x.key === z.key)) out.push(`Zone « ${z.nameFr} » supprimée.`);
  }

  for (const s of after.sectors) {
    const old = before.sectors.find((x) => x.key === s.key);
    if (!old) {
      out.push(`Secteur « ${s.nameFr} » ajouté en ${zoneName(after, s.zoneKey)} (${s.prefixes.join(", ") || "aucun préfixe"})${s.enabled ? "" : ", inactif"}.`);
      continue;
    }
    if (old.nameFr !== s.nameFr) out.push(`Secteur « ${old.nameFr} » renommé « ${s.nameFr} ».`);
    if (old.nameEn !== s.nameEn) out.push(`Secteur « ${s.nameFr} » : nom anglais « ${old.nameEn} » devenu « ${s.nameEn} ».`);
    if (old.zoneKey !== s.zoneKey) {
      out.push(`Secteur « ${s.nameFr} » : ${zoneName(before, old.zoneKey)} → ${zoneName(after, s.zoneKey)}.`);
    }
    const added = s.prefixes.filter((p) => !old.prefixes.includes(p));
    const removed = old.prefixes.filter((p) => !s.prefixes.includes(p));
    if (added.length) out.push(`Secteur « ${s.nameFr} » : ${added.join(", ")} ajouté${added.length > 1 ? "s" : ""}.`);
    if (removed.length) out.push(`Secteur « ${s.nameFr} » : ${removed.join(", ")} retiré${removed.length > 1 ? "s" : ""}.`);
    if (old.enabled !== s.enabled) out.push(`Secteur « ${s.nameFr} » ${s.enabled ? "activé" : "désactivé"}.`);
  }
  for (const s of before.sectors) {
    if (!after.sectors.some((x) => x.key === s.key)) out.push(`Secteur « ${s.nameFr} » supprimé.`);
  }

  /* L'ordre ne se compare qu'entre secteurs restés dans la même zone : un
     ajout, une suppression ou un changement de zone est déjà noté, et ne
     doit pas se lire en plus comme un réordonnancement. */
  const restes = (p: ZonePolicy) => p.sectors
    .filter((s) => before.sectors.find((x) => x.key === s.key)?.zoneKey === s.zoneKey
      && after.sectors.find((x) => x.key === s.key)?.zoneKey === s.zoneKey)
    .map((s) => `${s.zoneKey}/${s.key}`)
    /* Tri stable sur la zone seule : dans une zone, l'ordre du tableau reste. */
    .sort((a, b) => a.split("/")[0].localeCompare(b.split("/")[0]))
    .join("|");
  if (restes(before) !== restes(after)) out.push("Ordre des secteurs modifié.");

  const zonesCommunes = (p: ZonePolicy) => p.zones
    .filter((z) => before.zones.some((x) => x.key === z.key) && after.zones.some((x) => x.key === z.key))
    .map((z) => z.key).join("|");
  if (zonesCommunes(before) !== zonesCommunes(after)) out.push("Ordre des zones modifié.");

  return out;
}

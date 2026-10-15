import type { Settings } from "./settings";

/**
 * Frais de déplacement.
 *
 * Certaines adresses sont desservies mais coûtent une route. Les frais s'y
 * ajoutent au prix de la séance, et deux principes les gouvernent :
 *
 *  — Ils ne sont pas du temps de repassage. L'offre « première heure
 *    offerte » escompte des heures de travail ; elle n'a donc aucune prise
 *    sur eux, ni pour les effacer ni pour les réduire. Ils vivent dans une
 *    colonne à part, à côté de l'estimation, et jamais dedans.
 *
 *  — Ils se règlent depuis l'espace artisan. Les montants, le seuil et les
 *    codes postaux concernés sont des décisions commerciales : elles ne
 *    doivent pas demander une mise en production.
 */

export type TravelZone = {
  key: string;
  prefixes: string[];
  labelFr: string;
  labelEn: string;
  /** Frais d'une visite plus courte que le seuil, en cents. */
  shortFeeCents: number;
  /** Frais d'une visite qui atteint le seuil, en cents. */
  longFeeCents: number;
  /** Le seuil, en minutes. Une visite qui l'atteint paie le tarif long. */
  thresholdMinutes: number;
  enabled: boolean;
};

export const DEFAULT_TRAVEL_ZONES: TravelZone[] = [
  {
    key: "saint-jean",
    prefixes: ["J2W", "J2X", "J2Y", "J3A", "J3B"],
    labelFr: "Saint-Jean-sur-Richelieu",
    labelEn: "Saint-Jean-sur-Richelieu",
    shortFeeCents: 2500,
    longFeeCents: 1500,
    thresholdMinutes: 180,
    enabled: true,
  },
];

/** Les trois premiers caractères, sans espace ni casse. */
function head(postal: string): string {
  return postal.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3);
}

export type TravelFee = {
  zoneKey: string;
  labelFr: string;
  labelEn: string;
  cents: number;
};

/**
 * Les frais dus pour une adresse et une durée, ou rien.
 *
 * La durée est celle de la séance réservée — pas le temps facturé. Une
 * première heure offerte ne raccourcit pas la route : une séance de trois
 * heures dont une est offerte reste une visite de trois heures, et paie le
 * tarif long.
 *
 * La première zone qui reconnaît le code postal l'emporte. Deux zones qui se
 * recouvrent sont une erreur de réglage, pas un cas à arbitrer ici ; l'espace
 * artisan la signale au moment de la saisie.
 */
export function travelFeeFor(
  postalCode: string,
  durationMinutes: number,
  zones: TravelZone[] | null | undefined,
): TravelFee | null {
  const p = head(postalCode);
  if (p.length < 3) return null;

  for (const z of zones ?? []) {
    if (!z.enabled) continue;
    if (!z.prefixes.some((x) => x.toUpperCase() === p)) continue;

    const cents = durationMinutes >= z.thresholdMinutes ? z.longFeeCents : z.shortFeeCents;
    if (cents <= 0) return null;

    return { zoneKey: z.key, labelFr: z.labelFr, labelEn: z.labelEn, cents: Math.round(cents) };
  }
  return null;
}

/** Raccourci pour les appels qui tiennent déjà les réglages complets. */
export function travelFee(postalCode: string, durationMinutes: number, s: Settings): TravelFee | null {
  return travelFeeFor(postalCode, durationMinutes, s.travelZones);
}

/**
 * La phrase des conditions, construite depuis les réglages.
 *
 * La page Tarifs ne récite pas « 25 $ » et « 15 $ » : elle lit les montants
 * en vigueur. Changer un tarif depuis /admin change la page, sans quoi les
 * conditions publiées finiraient par contredire ce que le tunnel facture.
 */
export function travelTerms(
  zones: TravelZone[] | null | undefined,
  locale: "fr" | "en",
  money: (cents: number) => string,
): string[] {
  return (zones ?? [])
    .filter((z) => z.enabled && (z.shortFeeCents > 0 || z.longFeeCents > 0))
    .map((z) => {
      const name = locale === "en" ? z.labelEn : z.labelFr;
      const h = z.thresholdMinutes / 60;
      const hours = Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", locale === "en" ? "." : ",");
      return locale === "en"
        ? `${name}: a ${money(z.shortFeeCents)} travel fee per visit shorter than ${hours} hours, ${money(z.longFeeCents)} per visit of ${hours} hours or more.`
        : `${name} : frais de déplacement de ${money(z.shortFeeCents)} par visite de moins de ${hours} heures, ${money(z.longFeeCents)} par visite de ${hours} heures ou plus.`;
    });
}

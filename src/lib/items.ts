/**
 * Les lignes d'une réservation, telles qu'elles s'écrivent partout : tunnel,
 * courriels, page du client, agenda et espace artisan.
 *
 * Sans dépendance : l'onglet Rendez-vous, un composant client, s'en sert.
 *
 * Trois sortes de lignes cohabitent en base, dans la colonne `items` :
 * - la séance d'essai, `session`, la seule séance ponctuelle du tunnel depuis
 *   le 23 octobre 2026 ;
 * - les pièces à l'unité, `unit:<clé>`, avec leur prix figé à la réservation
 *   (et le haut de la fourchette pour une pièce au prix variable) ;
 * - les prestations de l'ancien panier (« Chemises × 13 »), que gardent les
 *   rendez-vous pris avant. Elles s'affichent comme avant.
 */

export type BookedItem = {
  key: string;
  label: string;
  qty: number;
  /** Prix d'une pièce à l'unité, en cents. */
  cents?: number;
  /** Haut de la fourchette, pour une pièce au prix variable. */
  toCents?: number;
};

/** Une ligne à afficher : la clé peut manquer dans une donnée plus ancienne. */
export type ItemLike = Omit<BookedItem, "key"> & { key?: string };

export const SESSION_KEY = "session";
export const UNIT_PREFIX = "unit:";

export const isUnit = (i: ItemLike) => (i.key ?? "").startsWith(UNIT_PREFIX);

/** « 12 $ » ou « 12 $ – 18 $ » : un montant, ou une fourchette quand les deux bouts diffèrent. */
export function moneyRange(low: number, high: number, money: (cents: number) => string): string {
  return high > low ? `${money(low)} – ${money(high)}` : money(low);
}

/** Une ligne : « Séance de 2 heures », « Nappe de réception × 2 · 24 $ – 36 $ », « Chemises × 13 ». */
export function itemText(i: ItemLike, money: (cents: number) => string): string {
  if (i.key === SESSION_KEY) return i.label;
  const line = `${i.label} × ${i.qty}`;
  if (!isUnit(i) || typeof i.cents !== "number") return line;
  return `${line} · ${moneyRange(i.cents * i.qty, (i.toCents ?? i.cents) * i.qty, money)}`;
}

/**
 * L'estimation d'une réservation, en fourchette. La base garde le bas
 * (`estimate_cents`, pièces au plus bas prix compris) ; le haut s'en déduit
 * des pièces au prix variable, sans colonne de plus.
 */
export function estimateRange(items: ItemLike[], estimateCents: number): { low: number; high: number } {
  const spread = items.reduce(
    (sum, i) => sum + (isUnit(i) && typeof i.cents === "number" ? ((i.toCents ?? i.cents) - i.cents) * i.qty : 0),
    0,
  );
  return { low: estimateCents, high: estimateCents + Math.max(0, spread) };
}

/*
 * Les montants et les durées tapés dans l'onglet « Zones et frais », lus
 * comme l'artisan les écrit.
 *
 * Un champ numérique du navigateur relit sa valeur à chaque touche, et le
 * panneau la réécrivait arrondie : « 12,50 » y devenait 130 $, « 2.5 »
 * heures devenait 5 h, sans un mot, et la grille partait ainsi en ligne. Les
 * champs gardent donc le texte tapé, et ces fonctions le lisent — virgule ou
 * point. Ce qui ne se lit pas rend `null` : on le signale au lieu de le
 * deviner. Aucune dépendance : les tests les appellent directement.
 */

const DECIMAL = /^(\d+\.?\d{0,2}|\.\d{1,2})$/;

/** « 12,50 », « 12.5 », « 12 $ » → cents. Un champ vide vaut zéro, comme avant. */
export function parseDollars(text: string): number | null {
  const t = text.replace(/\s/g, "").replace(/\$$/, "").replace(",", ".");
  if (t === "") return 0;
  if (!DECIMAL.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** « 3 », « 2,5 », « 2 h 30 », « 2:30 » → minutes. Un seuil vide ne se devine pas. */
export function parseHours(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  const hm = /^(\d{1,2}) ?[h:] ?(\d{1,2})?$/.exec(t);
  if (hm) {
    const m = hm[2] ? Number(hm[2]) : 0;
    return m < 60 ? Number(hm[1]) * 60 + m : null;
  }
  const d = t.replace(/ /g, "").replace(",", ".");
  if (!DECIMAL.test(d)) return null;
  return Math.round(Number(d) * 60);
}

/** 1250 → « 12,50 » ; 1200 → « 12 ». */
export function dollarsText(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

/** 150 → « 2,5 » ; 180 → « 3 » ; 135 → « 2,25 ». */
export function hoursText(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100).replace(".", ",");
}

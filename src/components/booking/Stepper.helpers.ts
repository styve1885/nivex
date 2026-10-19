/** Petites fonctions partagées par le tunnel de réservation. */

import { addDaysToKey } from "@/lib/time";

export const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalisePostal(v: string): string {
  const c = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return c.length > 3 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

/** Met en forme un numéro nord-américain au fil de la frappe. */
export function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isPhoneValid(v: string): boolean {
  return v.replace(/\D/g, "").replace(/^1/, "").length === 10;
}

/* Les coordonnées, sous le nom que leur donne le serveur puis le tunnel,
   dans l'ordre où le formulaire les présente. */
const CONTACT_FIELDS = {
  name: "name", email: "email", phone: "phone", city: "city", address: "address", postalCode: "postal",
} as const;
export type ContactField = (typeof CONTACT_FIELDS)[keyof typeof CONTACT_FIELDS];

/**
 * Les coordonnées que le serveur a refusées (`fields` d'une réponse
 * `invalid_input`), dans l'ordre du formulaire. Un refus qui ne porte sur
 * aucune d'elles rend une liste vide : rien à corriger à l'étape Adresse.
 */
export function rejectedContactFields(fields: unknown): ContactField[] {
  if (!fields || typeof fields !== "object") return [];
  return (Object.keys(CONTACT_FIELDS) as (keyof typeof CONTACT_FIELDS)[])
    .filter((k) => Object.prototype.hasOwnProperty.call(fields, k))
    .map((k) => CONTACT_FIELDS[k]);
}

/**
 * Vrai quand la quinzaine suivante commencerait après le dernier jour
 * réservable en ligne. L'horaire propose des débuts jusqu'au jour
 * `aujourd'hui + horizonDays` inclus : au-delà, chaque jour serait vide.
 */
export function pastHorizon(firstKey: string, todayKey: string, horizonDays: number, span = 14): boolean {
  if (!firstKey || !todayKey || !Number.isFinite(horizonDays)) return false;
  return addDaysToKey(firstKey, span) > addDaysToKey(todayKey, horizonDays);
}

/** Regroupe les créneaux d'une journée en matin / après-midi / soirée. */
export function groupSlots(slots: { time: string; iso: string }[]) {
  const morning: typeof slots = [], afternoon: typeof slots = [], evening: typeof slots = [];
  for (const s of slots) {
    const h = Number(s.time.slice(0, 2));
    if (h < 12) morning.push(s);
    else if (h < 17) afternoon.push(s);
    else evening.push(s);
  }
  return { morning, afternoon, evening };
}

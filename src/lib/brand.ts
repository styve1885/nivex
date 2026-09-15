import type { Settings } from "./settings";

/**
 * Coordonnées publiques de la maison.
 *
 * L'adresse courriel affichée suit le compte Google effectivement branché
 * par l'artisan — c'est de là que partent les confirmations, donc c'est
 * celle à laquelle les clients doivent pouvoir répondre. Tant que rien
 * n'est branché, on retombe sur l'adresse imprimée sur le dépliant.
 */
export const FALLBACK_EMAIL = "styve1885@gmail.com";

/**
 * Préavis d'annulation par le client, en heures.
 *
 * Au-delà, le lien « Gérer ma réservation » cesse d'annuler tout seul et
 * renvoie au téléphone. Cette constante est la seule source : le garde-fou
 * `canSelfCancel`, les courriels, la foire aux questions et les conditions
 * d'utilisation la lisent tous ici. La changer les change tous ensemble.
 */
export const CANCEL_WINDOW_HOURS = 2;
export const PHONE = "+1 450 943 1217";
export const PHONE_HREF = "tel:+14509431217";

export function contactEmail(settings?: Pick<Settings, "ownerEmail"> | null): string {
  return settings?.ownerEmail?.trim() || FALLBACK_EMAIL;
}

export function contactEmailHref(settings?: Pick<Settings, "ownerEmail"> | null): string {
  return `mailto:${contactEmail(settings)}`;
}

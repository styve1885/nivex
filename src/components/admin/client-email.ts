/**
 * Les courriels au client, tels que l'admin les nomme (27 novembre 2026) :
 * le motif du dernier parti, et la case « Avertir le client ». Sans
 * dépendance : les deux onglets l'importent dans le navigateur.
 */

/** Le motif du dernier courriel parti au client, en clair. */
export const CLIENT_EMAIL_KIND: Record<string, string> = {
  confirmation: "confirmation",
  moved: "déplacement",
  cancelled: "annulation",
  replacement: "annonce du remplacement",
  reminder: "rappel de la veille",
  update: "horaire à jour",
  ended: "fin de l'abonnement",
};

/** « Confirmation envoyée », pour un rendez-vous d'avant la note, sans date. */
export const LEGACY_EMAIL = "Confirmation envoyée avant le 27 novembre 2026 (heure non notée)";

/** La ligne sous chaque case « Avertir le client ». */
export function notifyHint(notify: boolean): string {
  return notify
    ? "Le client reçoit un courriel et un texto."
    : "Le client ne reçoit rien ; vous recevez un avis. Quand vous aurez fini, « Envoyer la confirmation au client » lui écrit une seule fois.";
}

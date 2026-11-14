/**
 * La planche à repasser du client : la réponse donnée au tunnel de
 * réservation (14 novembre 2026), « Avez-vous une planche à repasser en bon
 * état ? ». L'artisan apporte le fer et tout le matériel ; le client ne
 * fournit que la planche. Sans dépendance : le tunnel l'importe dans le
 * navigateur, le serveur et les courriels de même.
 */
export const BOARD_ANSWERS = ["yes", "no", "unsure"] as const;
export type BoardAnswer = (typeof BOARD_ANSWERS)[number];

export function isBoardAnswer(x: unknown): x is BoardAnswer {
  return typeof x === "string" && (BOARD_ANSWERS as readonly string[]).includes(x);
}

/**
 * « À contacter » : le client n'a pas de planche en bon état, ou n'en est pas
 * sûr. La réservation reste prise ; l'artisan l'appelle avant la séance.
 */
export function boardNeedsContact(a: BoardAnswer | null | undefined): boolean {
  return a === "no" || a === "unsure";
}

/** La réponse, dite à l'artisan, en français. Nul pour un rendez-vous pris sans la question. */
export const BOARD_LABELS_FR: Record<BoardAnswer, string> = { yes: "Oui", no: "Non", unsure: "Je ne suis pas sûr" };

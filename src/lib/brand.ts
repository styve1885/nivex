/**
 * Coordonnées publiques de la maison.
 *
 * L'adresse courriel affichée est celle du domaine, la même sur le site,
 * la fiche Google et le profil Twilio. Elle ne reçoit rien elle-même :
 * ImprovMX renvoie tout vers le Gmail de l'artisan. Les confirmations
 * partent toujours du compte Google branché, avec cette adresse comme
 * adresse de réponse : un client qui répond retombe donc au même endroit.
 */
export const CONTACT_EMAIL = "contact@nivexrepassage.ca";

/**
 * Préavis d'annulation par le client, en heures.
 *
 * Au-delà, le lien « Gérer ma réservation » cesse d'annuler tout seul et
 * renvoie au téléphone. Cette constante est la seule source : le garde-fou
 * `canSelfCancel`, les courriels, la foire aux questions et les conditions
 * d'utilisation la lisent tous ici. La changer les change tous ensemble.
 *
 * Elle ne vaut que pour les séances ponctuelles. Une visite d'abonnement
 * s'annule ou se déplace jusqu'à 23 h 59 la veille : voir `changeDeadline`
 * dans cycles.ts.
 */
export const CANCEL_WINDOW_HOURS = 2;

/**
 * Durée minimale, en minutes, pour que la première heure soit offerte.
 *
 * Sans ce plancher, une première séance d'une heure reviendrait à zéro
 * dollar : le moteur retranche soixante minutes de la durée facturable, et
 * il ne resterait rien. La condition est annoncée au client partout où
 * l'offre est mentionnée ; c'est ici qu'elle est appliquée.
 */
export const FIRST_FREE_MIN_MINUTES = 120;
/** Numéro d'entreprise du Québec, au registraire des entreprises. */
export const NEQ = "2282362666";

/**
 * Boîte de réception des demandes de créneau.
 *
 * Distincte du compte Google branché : les confirmations partent du compte
 * de l'artisan, mais les demandes venues du site atterrissent toutes ici,
 * même le jour où le compte connecté change.
 */
export const REQUEST_INBOX = "nivexrepassage@gmail.com";

/**
 * Installation avant la séance, rangement après, en minutes.
 *
 * Le bloc réservé par le client est entièrement du repassage : l'artisan
 * arrive avant et repart après, et ce temps ne lui est pas facturé. Il
 * doit pourtant être bloqué, sinon deux séances collées se chevauchent
 * dans la vraie vie tout en paraissant libres dans l'agenda.
 *
 * Cette constante gouverne trois choses : l'étendue de l'événement inscrit
 * à l'agenda, la contrainte de non-chevauchement en base, et la phrase
 * annoncée au client. Les trois ne peuvent donc pas se contredire.
 */
export const SETUP_MINUTES = 15;

export const PHONE = "+1 450 943 1217";
export const PHONE_HREF = "tel:+14509431217";

export function contactEmail(): string {
  return CONTACT_EMAIL;
}

export function contactEmailHref(): string {
  return `mailto:${CONTACT_EMAIL}`;
}

/* ============================ Abonnements ============================ */

/**
 * Une série d'abonnement compte six cycles, et douze mois en font deux.
 *
 * Un « mois » d'abonnement n'est pas un mois civil : c'est un cycle de
 * visites réellement effectuées — quatre, deux ou une selon la formule. La
 * série est posée d'un coup dans l'agenda ; la seconde l'est sur décision de
 * l'artisan, prévenu `SERIES_NOTICE_DAYS` jours avant la dernière visite de
 * la première. Le tarif tient pour les deux.
 */
export const SERIES_CYCLES = 6;
export const TERM_SERIES = 2;

/** Un cycle doit se terminer dans ce délai après sa première visite, sinon l'artisan est alerté. */
export const CYCLE_MAX_WEEKS = 8;

/** Le courriel de l'artisan part ce nombre de jours avant la dernière visite d'une série. */
export const SERIES_NOTICE_DAYS = 7;

/** L'alerte de renouvellement s'allume ce nombre de jours avant la fin des douze mois. */
export const TERM_ALERT_DAYS = 30;

/**
 * Réduction des frais de déplacement pour un abonné, par visite, en cents.
 *
 * Elle porte sur les frais de la zone et de la durée de la visite, sans
 * jamais les faire passer sous zéro : une adresse sans frais ne reçoit rien
 * en retour.
 */
export const SUBSCRIBER_TRAVEL_DISCOUNT_CENTS = 500;

/**
 * Une visite annulée est remplacée en fin de série, au même jour et à la
 * même heure. Si ce créneau est pris, on essaie les suivants du même
 * rythme, jusqu'à ce nombre ; au-delà, l'artisan la replace à la main.
 */
export const MAKEUP_SEARCH_STEPS = 8;

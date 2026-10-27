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
 * L'adresse canonique du site, en production : avec www.
 *
 * Depuis le 25 octobre 2026, nivexrepassage.ca, sans www, redirige en 308
 * vers elle : c'est un réglage de domaine chez Vercel, pas du code. Tout ce
 * que lisent les moteurs en dépend — liens canoniques, hreflang, plan du
 * site, robots.txt, données structurées, IndexNow —, et aussi les liens des
 * courriels et l'adresse de retour de Google (à déclarer dans la console
 * Google Cloud), et le webhook des réponses par texto chez Twilio : la
 * redirection de Vercel arrête les requêtes avant le code, si bien qu'un
 * réglage resté sur l'ancien domaine ne joint plus le site. Ce que garde le
 * navigateur est lié au domaine exact : après la bascule, l'artisan se
 * reconnecte à /admin sur le www dans chaque navigateur, et rouvre son lien
 * « ne pas compter » dans ceux de Facebook et d'Instagram. En production, `siteOrigin`
 * rend cette adresse quoi que dise la variable d'environnement : une
 * variable restée sur l'ancien domaine renverrait chaque lien canonique vers
 * une redirection, ce que Google lit comme une page à ne pas indexer.
 */
export const SITE_URL = "https://www.nivexrepassage.ca";

/**
 * La clé IndexNow : le moteur qui reçoit une liste d'adresses vérifie que le
 * site lui appartient en lisant le fichier public/<clé>.txt, qui ne contient
 * que la clé. Elle n'a rien de secret ; la changer demande de renommer le
 * fichier. Voir lib/indexnow.ts.
 */
export const INDEXNOW_KEY = "5d6a47021d6a4c68a7b8503b397f7ee3";

/**
 * Le jeton de la balise de validation de Google Search Console, propriété
 * https://www.nivexrepassage.ca/, fourni par l'artisan le 26 octobre 2026 :
 * la valeur de `content=` seule, jamais la balise entière. Le retirer fait
 * perdre la validation de la propriété. Vide, la balise ne s'écrit pas.
 */
export const GOOGLE_SITE_VERIFICATION = "qr9tWTjQLrKWeKSnXhvDQWGpP0_zqSdxksUIWVSg3w8";

/** Le fondateur, nommé dans la fiche LocalBusiness. */
export const FOUNDER = "Styve Ketchandji Ngaleu";

/**
 * Les pages de la maison sur les réseaux sociaux (`sameAs` de la fiche
 * LocalBusiness), données par l'artisan le 26 octobre 2026. L'adresse de la
 * page, jamais un lien de partage, et sans ses paramètres de suivi
 * (`utm_source`, `mibextid`…). Une adresse vide n'est pas publiée.
 */
export const SOCIAL_PROFILES: string[] = [
  "https://www.facebook.com/profile.php?id=61592622475613",
  "https://www.instagram.com/nivexrepassage_a_domicile/",
];

/**
 * Les profils personnels du fondateur (`sameAs` de `founder`, dans la même
 * fiche). Son LinkedIn est un profil de personne, pas une page d'entreprise :
 * il le désigne, lui, et non la maison.
 */
export const FOUNDER_PROFILES: string[] = [
  "https://www.linkedin.com/in/styve-ketchandji-ngaleu-70a765362",
];

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

/**
 * La séance la plus courte que la maison vend : deux heures. Il n'existe pas
 * de séance d'une heure. Les réglages ne descendent pas en dessous, à
 * l'enregistrement comme à la lecture ; sinon le moteur aurait accepté une
 * séance d'une heure que la vitrine, elle, ne montre jamais.
 */
export const MIN_SESSION_MINUTES = 120;
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
 * Installation et rangement du matériel, en minutes, compris dans la séance.
 *
 * Depuis le 22 octobre 2026, l'artisan arrive à l'heure du début : les cinq
 * premières minutes servent à s'installer, les cinq dernières à ranger, et
 * le reste du temps réservé est du repassage. Une séance de deux heures en
 * compte donc une heure cinquante. Le créneau bloqué est la séance, ni plus
 * ni moins : ces minutes n'en débordent pas.
 *
 * Elles gouvernent la durée tirée d'un panier (les minutes de repassage,
 * plus celles-ci), les trois temps de l'espace artisan et la phrase dite au
 * client. Les textes écrivent « 5 minutes chacun » : deux valeurs
 * différentes demanderaient de les réécrire.
 */
export const INSTALL_MINUTES = 5;
export const PACKUP_MINUTES = 5;

/**
 * L'ancien déroulement : arrivée un quart d'heure avant, départ un quart
 * d'heure après, hors du temps réservé.
 *
 * Il vaut encore pour les rendez-vous pris avant le changement, et pour les
 * abonnés dont la case « arrivée 15 min avant » est cochée. Leur colonne
 * `setup_minutes` le porte, ligne par ligne : ce temps reste bloqué autour
 * de leurs séances, en base comme dans l'agenda, et leurs rappels donnent
 * l'heure d'arrivée. Une séance d'aujourd'hui y vaut zéro.
 */
export const EARLY_ARRIVAL_MINUTES = 15;

/**
 * La capacité annoncée, en pièces par heure de séance : jusqu'à 18 pièces
 * en deux heures, jusqu'à 27 en trois, toujours « selon la taille, le type
 * et la matière des vêtements ».
 *
 * C'est le seul chiffre de quantité du site. `capacityPieces` en tire chaque
 * volume — séances, forfaits, abonnements, foire aux questions, données
 * structurées — pour qu'aucune page n'en avance un autre.
 */
export const PIECES_PER_HOUR = 9;

/** Le texto « je serai chez vous » part ce nombre de minutes avant l'arrivée. */
export const SOON_TEXT_MINUTES = 120;

/** La signature des textos aux clients : le prénom de l'artisan. */
export const SMS_SIGNATURE = "Styve";

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
 * Un abonné paie l'heure ce montant de moins que la séance à la carte, en
 * cents : à 55 $ l'heure, 50 $. Le prix d'une formule en découle
 * (`planCents`), arrondi aux 5 $, puis se fige à la souscription.
 */
export const SUBSCRIBER_HOURLY_DISCOUNT_CENTS = 500;

/**
 * Une visite annulée est remplacée en fin de série, au même jour et à la
 * même heure. Si ce créneau est pris, on essaie les suivants du même
 * rythme, jusqu'à ce nombre ; au-delà, l'artisan la replace à la main.
 */
export const MAKEUP_SEARCH_STEPS = 8;

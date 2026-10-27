/*
 * Ce que lisent les moteurs dans l'en-tête de chaque page : son titre et sa
 * description.
 *
 * Hors des dictionnaires, comme les textes retirés : un dictionnaire part en
 * entier vers les composants clients qui le reçoivent tel quel (les
 * tunnels, les pages personnelles), et ces textes ne servent qu'au serveur,
 * dans `<head>`.
 *
 * Les règles, que les tests tiennent :
 *  — chaque titre commence par « NIVEX Repassage » (« NIVEX In-Home
 *    Ironing » en anglais) et n'appartient qu'à sa page ;
 *  — chaque description tient entre 150 et 160 caractères une fois remplie,
 *    et nomme le repassage à domicile, Montréal et la Rive-Sud ;
 *  — les montants ({plan}, {from}, {to}, {min}, {price}) se remplissent
 *    depuis les réglages, jamais à la main (`pageDescription`, lib/seo.ts).
 *    Un changement de taux ne change la longueur que si un montant gagne un
 *    chiffre : le test le dirait.
 */

export type SeoPage =
  | "home" | "tarifs" | "montreal" | "reserver" | "abonnement" | "conditions" | "confidentialite"
  | "reservation" | "subscription" | "notFound" | "optOut";

type SeoText = { title: string; description: string };

export const seoFr: Record<SeoPage, SeoText> = {
  home: {
    title: "NIVEX Repassage à domicile — Montréal et Rive-Sud",
    /* {plan} : le plus bas montant par cycle. */
    description: "NIVEX, repassage à domicile à Montréal et sur la Rive-Sud\u00a0: vos vêtements et votre literie repassés chez vous, sans collecte. Abonnements dès {plan} par cycle.",
  },
  tarifs: {
    title: "NIVEX Repassage — Tarifs et abonnements",
    /* {from} et {to} : le plus bas et le plus haut montant par cycle ; {min}
       et {price} : la séance d'essai. */
    description: "Tarifs du repassage à domicile à Montréal et sur la Rive-Sud\u00a0: abonnements de {from} à {to} par cycle, séance de {min} à {price}, prix des pièces à l'unité.",
  },
  montreal: {
    title: "NIVEX Repassage à domicile à Montréal",
    description: "Repassage à domicile à Montréal comme sur la Rive-Sud\u00a0: NIVEX repasse vos vêtements et votre literie chez vous, dans les quartiers de l'île, sans collecte.",
  },
  reserver: {
    title: "NIVEX Repassage — Réserver une séance",
    description: "Réservez une séance de repassage à domicile à Montréal ou sur la Rive-Sud\u00a0: choisissez votre créneau en ligne, la confirmation part aussitôt par courriel.",
  },
  abonnement: {
    title: "NIVEX Repassage — S'abonner",
    description: "Abonnement de repassage à domicile à Montréal et sur la Rive-Sud\u00a0: choisissez votre formule, votre jour et votre heure\u202f; vos visites se suivent au même rythme.",
  },
  conditions: {
    title: "NIVEX Repassage — Conditions d'utilisation",
    description: "Conditions d'utilisation de NIVEX, repassage à domicile à Montréal et sur la Rive-Sud\u00a0: réservation, annulation, abonnements, paiement et zones desservies.",
  },
  confidentialite: {
    title: "NIVEX Repassage — Politique de confidentialité",
    description: "Politique de confidentialité de NIVEX, repassage à domicile à Montréal et sur la Rive-Sud\u00a0: données recueillies, usages, durées de conservation et vos droits.",
  },
  reservation: {
    title: "NIVEX Repassage — Gérer ma réservation",
    description: "Gérez votre réservation de repassage à domicile NIVEX, à Montréal ou sur la Rive-Sud\u00a0: date, heure, adresse, et annulation en ligne dans le délai prévu.",
  },
  subscription: {
    title: "NIVEX Repassage — Gérer mes visites",
    description: "Gérez vos visites d'abonné NIVEX, repassage à domicile à Montréal et sur la Rive-Sud\u00a0: prochaines dates, déplacement ou annulation jusqu'à 23 h 59 la veille.",
  },
  notFound: {
    title: "NIVEX Repassage — Page introuvable",
    description: "Cette page n'existe pas ou plus. NIVEX, repassage à domicile à Montréal et sur la Rive-Sud\u00a0: retrouvez l'accueil, les tarifs et la réservation en ligne.",
  },
  optOut: {
    title: "NIVEX Repassage — Ne pas compter ce navigateur",
    description: "Retirer ce navigateur du décompte des visites de NIVEX, service de repassage à domicile à Montréal et sur la Rive-Sud. Cette page est réservée à l'artisan.",
  },
};

export const seoEn: Record<SeoPage, SeoText> = {
  home: {
    title: "NIVEX In-Home Ironing — Montreal and South Shore",
    description: "NIVEX, in-home ironing in Montreal and on the South Shore: your clothes and bed linen pressed in your home, with no pickup. Subscriptions from {plan} per cycle.",
  },
  tarifs: {
    title: "NIVEX In-Home Ironing — Prices and subscriptions",
    description: "Prices for in-home ironing in Montreal and on the South Shore: subscriptions from {from} to {to} per cycle, a session of {min} for {price}, and single pieces.",
  },
  montreal: {
    title: "NIVEX In-Home Ironing in Montreal",
    description: "In-home ironing in Montreal, just as on the South Shore: NIVEX presses your clothes and bed linen in your home, across the island's neighbourhoods. No pickup.",
  },
  reserver: {
    title: "NIVEX In-Home Ironing — Book a session",
    description: "Book an in-home ironing session in Montreal or on the South Shore: pick your time slot online, and the confirmation is sent to you by email right away.",
  },
  abonnement: {
    title: "NIVEX In-Home Ironing — Subscribe",
    description: "In-home ironing subscription in Montreal and on the South Shore: choose your plan, your day and your time once, and your visits follow at the same pace.",
  },
  conditions: {
    title: "NIVEX In-Home Ironing — Terms of use",
    description: "Terms of use of NIVEX, in-home ironing in Montreal and on the South Shore: booking, cancellation, subscriptions, payment, travel fees and the areas we serve.",
  },
  confidentialite: {
    title: "NIVEX In-Home Ironing — Privacy policy",
    description: "Privacy policy of NIVEX, in-home ironing in Montreal and on the South Shore: the data we collect, how it is used, how long it is kept and your rights.",
  },
  reservation: {
    title: "NIVEX In-Home Ironing — Manage my booking",
    description: "Manage your NIVEX in-home ironing booking in Montreal or on the South Shore: the date, time and address, and online cancellation within the notice period.",
  },
  subscription: {
    title: "NIVEX In-Home Ironing — Manage my visits",
    description: "Manage your NIVEX subscriber visits, in-home ironing in Montreal and on the South Shore: upcoming dates, moving or cancelling until 11:59 pm the day before.",
  },
  notFound: {
    title: "NIVEX In-Home Ironing — Page not found",
    description: "This page does not exist, or no longer does. NIVEX, in-home ironing in Montreal and on the South Shore: find the home page, prices and online booking.",
  },
  optOut: {
    title: "NIVEX In-Home Ironing — Don't count this browser",
    description: "Remove this browser from the NIVEX visit count, the in-home ironing service in Montreal and on the South Shore. This page is meant for the craftsman only.",
  },
};

/* L'espace artisan, en français seulement, et jamais indexé. */
export const seoAdmin = {
  title: "NIVEX Repassage — Espace artisan",
  login: "NIVEX Repassage — Connexion à l'espace artisan",
  description: "Espace artisan de NIVEX, repassage à domicile à Montréal et sur la Rive-Sud\u00a0: rendez-vous, abonnés, messages, visites, réglages, zones et frais de déplacement.",
};

/** Le nom du catalogue des abonnements et de la séance d'essai, dans la fiche LocalBusiness. */
export function catalogName(locale: string): string {
  return locale === "en" ? "Subscriptions and trial session" : "Abonnements et séance d'essai";
}

export function getSeo(locale: string): Record<SeoPage, SeoText> {
  return locale === "en" ? seoEn : seoFr;
}

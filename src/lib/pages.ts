/**
 * Les pages publiques que les moteurs doivent trouver, chacune avec la date
 * de sa dernière modification significative : son contenu, ses données
 * structurées ou son en-tête (titre, description). Une retouche de
 * ponctuation ne compte pas.
 *
 * Le plan du site écrit ces dates, et IndexNow les compare à celles qu'il a
 * déjà envoyées (lib/indexnow.ts) : modifier une page sans avancer sa date,
 * c'est la laisser invisible aux deux. La date vaut pour les deux langues.
 *
 * Ce que l'artisan change depuis /admin (tarif, horaire, zones) ne passe pas
 * par ici : lib/freshness.ts en garde le jour, et `pageDate` prend le plus
 * récent des deux.
 *
 * Les tunnels, /reserver et /abonnement, n'y sont pas : ils ne servent qu'à
 * réserver, depuis les autres pages. Les liens personnels de réservation et
 * d'abonnement, que robots.txt écarte, encore moins.
 *
 * Sans dépendance : le plan du site, IndexNow et les tests la lisent tels
 * quels.
 */

export type PublicPage = {
  /** Le chemin après la langue : "" pour l'accueil, "/tarifs"… */
  path: string;
  /** « AAAA-MM-JJ », à l'heure de Montréal. */
  updated: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

/* Le 26 octobre 2026, chaque page a reçu son titre, sa description et la
   fiche LocalBusiness, puis, le soir, les réseaux de la fiche (`sameAs`) ;
   le 27, la fiche Google (`hasMap`). La fiche est posée sur toutes les
   pages : toutes datent de ce jour-là, à l'heure de Montréal. */
export const PUBLIC_PAGES: PublicPage[] = [
  { path: "", updated: "2026-10-27", changeFrequency: "weekly", priority: 1 },
  { path: "/tarifs", updated: "2026-10-27", changeFrequency: "monthly", priority: 0.8 },
  { path: "/montreal", updated: "2026-10-27", changeFrequency: "monthly", priority: 0.7 },
  { path: "/conditions", updated: "2026-10-27", changeFrequency: "yearly", priority: 0.3 },
  { path: "/confidentialite", updated: "2026-10-27", changeFrequency: "yearly", priority: 0.3 },
];

export const PAGE_LOCALES = ["fr", "en"] as const;

export type PublicUrl = { url: string; locale: (typeof PAGE_LOCALES)[number]; page: PublicPage };

/** Chaque page publique, dans chaque langue, en adresse absolue. */
export function publicUrls(origin: string): PublicUrl[] {
  return PAGE_LOCALES.flatMap((locale) =>
    PUBLIC_PAGES.map((page) => ({ url: `${origin}/${locale}${page.path}`, locale, page })));
}

/**
 * La date d'une page : la sienne, ou le dernier changement du contenu tiré
 * des réglages s'il est plus récent. Deux dates « AAAA-MM-JJ » se comparent
 * comme des chaînes ; « » (aucun changement relevé) ne l'emporte jamais.
 */
export function pageDate(page: PublicPage, settingsChangedOn: string): string {
  return settingsChangedOn > page.updated ? settingsChangedOn : page.updated;
}

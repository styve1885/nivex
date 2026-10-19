import type { Metadata, Viewport } from "next";
import type { Dict } from "./i18n";
import type { Settings } from "./settings";
import { PHONE, contactEmail } from "./brand";
import { siteOrigin } from "./google";
import { formatMoney } from "./time";
import { joinList, sectorsByRegion, type Sector, type ZonePolicy } from "./travel";

/**
 * Ce que les moteurs et les assistants lisent du commerce.
 *
 * Tout part des réglages, comme la page elle-même : le taux horaire, la
 * durée minimale, les secteurs desservis. Des données structurées qui
 * récitent de mémoire contrediraient la page qu'elles décrivent, et un moteur
 * qui relève l'écart cesse de leur faire confiance.
 */

type Lang = "fr" | "en";

const nameOf = (s: Sector, lang: Lang) => (lang === "en" ? s.nameEn || s.nameFr : s.nameFr);

/* ========================== L'en-tête des pages ========================== */

/**
 * Ce que portent toutes les pages, vitrine et espace artisan. Le site a deux
 * racines, app/[locale]/layout.tsx et app/admin/layout.tsx, et chacune le
 * reprend d'ici : rien ne doit différer de l'une à l'autre.
 *
 * Même origine que le plan de site et le robots.txt. `siteOrigin()` ignore
 * une variable vide — `??` ne le faisait pas, et une valeur vide posée dans
 * l'hébergeur faisait échouer la compilation sur `new URL("")`.
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  applicationName: "NIVEX",
  authors: [{ name: "NIVEX" }],
  keywords: [
    "repassage à domicile", "repassage Saint-Lambert", "repassage Longueuil", "repassage Rive-Sud",
    "repassage à domicile Montréal", "service de repassage Montérégie",
    "pressage chemises", "ironing service Quebec", "linge de maison", "NIVEX",
  ],
  twitter: { card: "summary_large_image" },
};

/**
 * L'affichage, le même sous les deux racines. « only light » est la seule
 * formulation qui empêche Chrome d'inverser lui-même les couleurs d'un
 * téléphone en mode sombre ; `light` ne suffit pas.
 */
export const siteViewport: Viewport = {
  colorScheme: "only light",
  themeColor: "#FBF8F2",
  width: "device-width",
  initialScale: 1,
};

/** Le titre d'une page de la vitrine : son nom, puis la maison. */
export const TITLE_TEMPLATE = "%s · NIVEX";

/**
 * Les métadonnées d'une page de la vitrine : son adresse canonique, ses deux
 * langues, et sa propre carte de partage.
 *
 * Un bloc `openGraph` déclaré plus bas remplace en entier celui du dessus, au
 * lieu de s'y fondre. Les sous-pages n'en déclaraient pas : elles se
 * partageaient avec la carte de l'accueil, son titre, sa description et un
 * `og:url` qui renvoyait à l'accueil — l'adresse que Facebook et LinkedIn
 * suivent, si bien que le lien profond se perdait. Chaque page reçoit donc un
 * bloc complet : type, nom du site, langues, et l'image, que le
 * fichier-convention ne fournit plus dès qu'un bloc est déclaré.
 *
 * Le gabarit « · NIVEX » ne s'applique qu'à `<title>` : la carte reçoit le
 * titre complet. Aucun bloc `twitter` ici — celui de la racine ne survit que
 * si personne ne le redéclare, et Next remplit le reste depuis `openGraph`.
 */
export function pageMeta(
  t: Dict, locale: string, path: string,
  title: string | { absolute: string }, description: string,
): Metadata {
  const lang: Lang = locale === "en" ? "en" : "fr";
  const url = `/${lang}${path}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { "fr-CA": `/fr${path}`, "en-CA": `/en${path}`, "x-default": `/fr${path}` },
    },
    openGraph: {
      type: "website",
      siteName: "NIVEX",
      title: typeof title === "string" ? TITLE_TEMPLATE.replace("%s", title) : title.absolute,
      description,
      url,
      locale: lang === "en" ? "en_CA" : "fr_CA",
      alternateLocale: [lang === "en" ? "fr_CA" : "en_CA"],
      images: [{ url: "/opengraph-image.jpg", width: 1200, height: 630, alt: t.meta.ogAlt }],
    },
  };
}

/**
 * L'en-tête d'une page introuvable : son titre, sans l'adresse canonique ni
 * les langues héritées de la racine, qui désignent l'accueil. Next ajoute de
 * lui-même `noindex` à toute réponse 404.
 */
export function notFoundMeta(t: Dict): Metadata {
  return { title: t.notFound.metaTitle, alternates: {} };
}

/* ========================= Les données structurées ========================= */

/** « +1 450 943-1217 » : le numéro de la maison, écrit comme on le lit. */
export function phoneDisplay(): string {
  const d = PHONE.replace(/\D/g, "").slice(-10);
  return `+1 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * La description de l'accueil : les cinq premiers secteurs de la Rive-Sud,
 * dans l'ordre de l'onglet « Zones et frais », puis Montréal s'il est
 * desservi. La première heure offerte ne s'y ajoute que tant que l'artisan
 * la propose : un extrait de recherche ne promet pas ce que le tunnel refuse.
 */
export function metaDescription(t: Dict, policy: ZonePolicy, lang: Lang, firstHourFree: boolean): string {
  const { south, montreal } = sectorsByRegion(policy);
  const places = [
    ...south.slice(0, 5).map((s) => nameOf(s, lang)),
    ...(montreal.length ? [lang === "en" ? "Montreal" : "Montréal"] : []),
  ];
  const text = t.meta.description.replace("{places}", joinList(places, lang));
  return firstHourFree ? `${text} ${t.meta.offer}` : text;
}

/**
 * Un lieu desservi. Un quartier de l'île porte Montréal comme localité : un
 * assistant qui lit « Verdun » doit comprendre qu'il s'agit de Montréal.
 */
function place(s: Sector, montreal: boolean, lang: Lang) {
  return {
    "@type": "Place",
    name: nameOf(s, lang),
    address: {
      "@type": "PostalAddress",
      addressLocality: montreal ? "Montréal" : nameOf(s, lang),
      addressRegion: "QC",
      addressCountry: "CA",
    },
  };
}

/** La fiche LocalBusiness, la même sur l'accueil et sur la page Montréal. */
export function localBusinessJsonLd(t: Dict, s: Settings, lang: Lang) {
  const origin = siteOrigin();
  const { south, montreal } = sectorsByRegion(s.zonePolicy);
  const minimum = Math.max(s.minMinutes, 120);
  const rate = s.hourlyRate / 100;

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${origin}/#nivex`,
    name: "NIVEX",
    description: metaDescription(t, s.zonePolicy, lang, s.firstHourFree),
    slogan: t.brand.tagline,
    url: `${origin}/${lang}`,
    image: `${origin}/opengraph-image.jpg`,
    telephone: phoneDisplay(),
    email: contactEmail(),
    priceRange: `${formatMoney(s.hourlyRate, s.currency, lang)} / h`,
    currenciesAccepted: s.currency,
    address: { "@type": "PostalAddress", addressLocality: "Longueuil", addressRegion: "QC", addressCountry: "CA" },
    /* La Rive-Sud d'abord, puis les quartiers de Montréal : l'ordre de la page. */
    areaServed: [
      ...south.map((x) => place(x, false, lang)),
      ...montreal.map((x) => place(x, true, lang)),
    ],
    openingHoursSpecification: s.hours.filter((h) => h.enabled).map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][h.day],
      opens: h.open, closes: h.close,
    })),
    makesOffer: [
      {
        "@type": "Offer",
        name: t.meta.service,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: rate,
          priceCurrency: s.currency,
          unitCode: "HUR",
          unitText: lang === "en" ? "hour" : "heure",
        },
        /* La durée minimale d'une séance, en heures. */
        eligibleQuantity: { "@type": "QuantitativeValue", minValue: minimum / 60, unitCode: "HUR" },
      },
      ...t.services.items.map((x) => ({
        "@type": "Offer", itemOffered: { "@type": "Service", name: x.name, description: x.body },
      })),
    ],
  };
}

/** Une foire aux questions, telle que la page l'affiche. */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question", name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

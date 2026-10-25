import type { Metadata, Viewport } from "next";
import type { Dict } from "./i18n";
import type { Settings } from "./settings";
import { FOUNDER, PHONE, SOCIAL_PROFILES, contactEmail } from "./brand";
import { catalogName, getSeo, type SeoPage } from "./i18n/seo";
import { siteOrigin } from "./google";
import { formatMoney, minutesToText } from "./time";
import {
  PLANS, UNIT_PRICES, capacityPieces, cheapestPlanCents, planCents, planPieces, sessionLength, sessionPriceCents,
} from "./pricing";
import { setupSentence } from "./capacity";
import { isMontrealSector, sectorsByRegion, thresholdText, type Sector } from "./travel";

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

/** Les réglages qui remplissent les montants des descriptions. */
type PriceSettings = Pick<Settings, "hourlyRate" | "minMinutes" | "currency">;

/**
 * La description d'une page, montants remplis depuis les réglages : le plus
 * bas montant par cycle ({plan}), l'éventail des abonnements ({from}, {to})
 * et la séance d'essai ({min}, {price}). Une description sans montant se
 * passe des réglages.
 */
export function pageDescription(page: SeoPage, lang: Lang, s?: PriceSettings): string {
  const text = getSeo(lang)[page].description;
  if (!s) return text;
  const money = (c: number) => formatMoney(c, s.currency, lang);
  const cycles = PLANS.map((p) => planCents(p, s));
  return text
    .replace("{plan}", money(cheapestPlanCents(s)))
    .replace("{from}", money(Math.min(...cycles)))
    .replace("{to}", money(Math.max(...cycles)))
    .replace("{min}", minutesToText(sessionLength(s), lang))
    .replace("{price}", money(sessionPriceCents(s)));
}

/**
 * Les métadonnées d'une page publique : son titre et sa description
 * (lib/i18n/seo.ts), son adresse canonique, ses deux langues et sa propre
 * carte de partage.
 *
 * Le titre est complet — « NIVEX Repassage — … » — et la racine n'y ajoute
 * rien. Les liens restent relatifs : `metadataBase` (l'adresse canonique,
 * avec www, en production) les rend absolus dans `<head>`, hreflang compris.
 *
 * Un bloc `openGraph` déclaré plus bas remplace en entier celui du dessus, au
 * lieu de s'y fondre. Chaque page reçoit donc un bloc complet : type, nom du
 * site, langues, et l'image, que le fichier-convention ne fournit plus dès
 * qu'un bloc est déclaré. Aucun bloc `twitter` ici — celui de la racine ne
 * survit que si personne ne le redéclare, et Next remplit le reste depuis
 * `openGraph`.
 */
export function pageMeta(t: Dict, locale: string, path: string, page: SeoPage, s?: PriceSettings): Metadata {
  const lang: Lang = locale === "en" ? "en" : "fr";
  const title = getSeo(lang)[page].title;
  const description = pageDescription(page, lang, s);
  const url = `/${lang}${path}`;
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: { "fr-CA": `/fr${path}`, "en-CA": `/en${path}`, "x-default": `/fr${path}` },
    },
    openGraph: {
      type: "website",
      siteName: "NIVEX",
      title,
      description,
      url,
      locale: lang === "en" ? "en_CA" : "fr_CA",
      alternateLocale: [lang === "en" ? "fr_CA" : "en_CA"],
      images: [{ url: "/opengraph-image.jpg", width: 1200, height: 630, alt: t.meta.ogAlt }],
    },
  };
}

/**
 * L'en-tête d'une page personnelle — gérer sa réservation, ses visites — ou
 * de retrait du décompte : son titre et sa description, jamais indexée, sans
 * adresse canonique ni langues, qui n'ont de sens que pour une page publique.
 */
export function privateMeta(locale: string, page: SeoPage): Metadata {
  const lang: Lang = locale === "en" ? "en" : "fr";
  return {
    title: { absolute: getSeo(lang)[page].title },
    description: pageDescription(page, lang),
    robots: { index: false, follow: false },
    alternates: {},
  };
}

/**
 * L'en-tête d'une page introuvable : son titre et sa description, sans
 * l'adresse canonique ni les langues. Next ajoute de lui-même `noindex` à
 * toute réponse 404.
 */
export function notFoundMeta(locale: string): Metadata {
  const lang: Lang = locale === "en" ? "en" : "fr";
  return { title: { absolute: getSeo(lang).notFound.title }, description: pageDescription("notFound", lang), alternates: {} };
}

/* ========================= Les données structurées ========================= */

/** Le nom de la maison dans les données structurées, dans les deux langues. */
export const BUSINESS_NAME = "NIVEX Repassage à domicile";

/** « +1-450-943-1217 » : le numéro, au format international des fiches. */
export function phoneSchema(): string {
  const d = PHONE.replace(/\D/g, "").slice(-10);
  return `+1-${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
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

/**
 * Les frais de déplacement, une offre par zone qui a des secteurs actifs,
 * avec les secteurs qu'elle couvre : zéro pour une zone sans frais —
 * Montréal y est —, sinon ses deux tarifs selon la durée, comme le tableau
 * de la page Tarifs. Tout vient de l'onglet « Zones et frais ».
 */
function travelOffers(t: Dict, s: Settings, lang: Lang, provider: { "@id": string }) {
  const { south, montreal } = sectorsByRegion(s.zonePolicy);
  const actifs = [...south, ...montreal];
  const money = (c: number) => formatMoney(c, s.currency, lang);
  const terms = t.tarifs.terms;
  return s.zonePolicy.zones
    .map((z) => ({ z, sectors: actifs.filter((x) => x.zoneKey === z.key) }))
    .filter(({ sectors }) => sectors.length > 0)
    .map(({ z, sectors }) => {
      const name = `${terms.travel} · ${lang === "en" ? z.nameEn || z.nameFr : z.nameFr}`;
      const base = {
        "@type": "Offer",
        name,
        itemOffered: { "@type": "Service", name, provider },
        areaServed: sectors.map((x) => place(x, isMontrealSector(x), lang)),
      };
      if (z.shortFeeCents === z.longFeeCents) {
        return { ...base, price: z.shortFeeCents / 100, priceCurrency: s.currency };
      }
      /* Deux prix selon la durée de la séance, chacun avec sa condition : un
         prix chiffré par tarif, que Google exige, plutôt qu'une fourchette. */
      const hours = thresholdText(z.thresholdMinutes, lang);
      const short = terms.travelShort.replace("{fee}", money(z.shortFeeCents)).replace("{hours}", hours);
      const long = terms.travelLong.replace("{fee}", money(z.longFeeCents)).replace("{hours}", hours);
      return {
        ...base,
        description: `${short}, ${long}.`,
        priceSpecification: [
          { "@type": "PriceSpecification", price: z.shortFeeCents / 100, priceCurrency: s.currency, description: short },
          { "@type": "PriceSpecification", price: z.longFeeCents / 100, priceCurrency: s.currency, description: long },
        ],
      };
    });
}

/**
 * La fiche de la maison, la même sur toutes les pages publiques : posée une
 * fois par la racine app/[locale]/layout.tsx, dans la langue de la page.
 *
 * Un DryCleaningOrLaundry, le sous-type de LocalBusiness le plus proche du
 * repassage. Google exige `name` et `address` : l'artisan se déplace et ne
 * publie pas d'adresse, si bien que l'adresse s'arrête à la ville, sans rue
 * ni code postal — comme sur son profil d'entreprise, qui masque l'adresse et
 * nomme ses zones. Les secteurs desservis sont ceux de la page Tarifs
 * (`areaServed`, la Rive-Sud d'abord), les prix ceux des pages, tirés des
 * mêmes réglages.
 *
 * Toutes les adresses sont absolues, sur l'origine canonique (avec www en
 * production) : une fiche qui pointe vers une redirection perd sa valeur.
 */
export function localBusinessJsonLd(t: Dict, s: Settings, lang: Lang) {
  const origin = siteOrigin();
  const { south, montreal } = sectorsByRegion(s.zonePolicy);
  const session = sessionLength(s);
  const money = (c: number) => formatMoney(c, s.currency, lang);
  const offerUrl = `${origin}/${lang}/tarifs`;
  const cycles = PLANS.map((p) => planCents(p, s));
  /* Chaque offre porte un Service, jamais un Product : un produit ferait
     chercher à Google des avis, un stock et une livraison qu'un service n'a
     pas. Le Service renvoie à la fiche par son identifiant. */
  const provider = { "@id": `${origin}/#nivex` };
  const service = (name: string) => ({ "@type": "Service", name, serviceType: t.meta.service, provider });

  return {
    "@context": "https://schema.org",
    "@type": "DryCleaningOrLaundry",
    "@id": provider["@id"],
    name: BUSINESS_NAME,
    alternateName: "NIVEX",
    description: pageDescription("home", lang, s),
    slogan: t.brand.tagline,
    url: `${origin}/${lang}`,
    logo: `${origin}/logo-nivex.png`,
    image: `${origin}/opengraph-image.jpg`,
    telephone: phoneSchema(),
    email: contactEmail(),
    founder: { "@type": "Person", name: FOUNDER },
    /* De la séance d'essai au plus haut montant par cycle, en chiffres. */
    priceRange: `${money(sessionPriceCents(s))} – ${money(Math.max(...cycles))}`,
    currenciesAccepted: s.currency,
    address: { "@type": "PostalAddress", addressLocality: "Longueuil", addressRegion: "QC", addressCountry: "CA" },
    /* La Rive-Sud d'abord, puis les quartiers de Montréal : l'ordre de la page. */
    areaServed: [
      ...south.map((x) => place(x, false, lang)),
      ...montreal.map((x) => place(x, true, lang)),
    ],
    ...(SOCIAL_PROFILES.filter(Boolean).length ? { sameAs: SOCIAL_PROFILES.filter(Boolean) } : {}),
    openingHoursSpecification: s.hours.filter((h) => h.enabled).map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][h.day]}`,
      opens: h.open, closes: h.close,
    })),
    /* Ce que la vitrine vend, aux prix des pages : les quatre abonnements au
       prix d'un cycle et la séance d'essai, puis les pièces à l'unité. Rien
       de ce que la vitrine a retiré (séances de trois et quatre heures,
       forfaits, ajouts) n'y figure. */
    hasOfferCatalog: [
      {
        "@type": "OfferCatalog",
        name: catalogName(lang),
        itemListElement: [
          ...PLANS.map((p) => {
            const text = lang === "en" ? p.en : p.fr;
            const name = t.meta.plan.replace("{name}", text.name);
            return {
              "@type": "Offer",
              name,
              price: planCents(p, s) / 100,
              priceCurrency: s.currency,
              url: offerUrl,
              description: `${text.detail} ${t.capacity.perCycle.replace("{n}", String(planPieces(p)))}. ${t.capacity.caveat}`,
              itemOffered: service(name),
            };
          }),
          {
            "@type": "Offer",
            name: `${t.meta.service} · ${minutesToText(session, lang)}`,
            price: sessionPriceCents(s) / 100,
            priceCurrency: s.currency,
            url: offerUrl,
            /* La capacité et le déroulement, les mêmes phrases que la page. */
            description: `${t.capacity.upTo.replace("{n}", String(capacityPieces(session)))}. ${t.capacity.caveat} ${setupSentence(t, s, lang)}`,
            itemOffered: service(`${t.meta.service} · ${minutesToText(session, lang)}`),
          },
        ],
      },
      /* Les pièces à l'unité de la page Tarifs, une fourchette quand le prix varie. */
      {
        "@type": "OfferCatalog",
        name: t.tarifs.units.title,
        itemListElement: UNIT_PRICES.map((u) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: lang === "en" ? u.en : u.fr, provider },
          ...(u.toCents
            /* « À partir de » : le prix plancher, que Google exige, et la fourchette. */
            ? { priceSpecification: { "@type": "PriceSpecification", price: u.cents / 100, minPrice: u.cents / 100, maxPrice: u.toCents / 100, priceCurrency: s.currency } }
            : { price: u.cents / 100, priceCurrency: s.currency }),
        })),
      },
    ],
    /* L'heure de plus décidée sur place, les cinq cartes des prestations,
       telles que l'accueil les montre, et les frais de déplacement de chaque
       zone. */
    makesOffer: [
      {
        "@type": "Offer",
        name: t.meta.extraHour,
        itemOffered: service(t.meta.extraHour),
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: s.hourlyRate / 100,
          priceCurrency: s.currency,
          unitCode: "HUR",
          unitText: lang === "en" ? "hour" : "heure",
        },
      },
      ...t.services.items.map((x) => ({
        "@type": "Offer", itemOffered: { "@type": "Service", name: x.name, description: x.body, provider },
      })),
      ...travelOffers(t, s, lang, provider),
    ],
  };
}

/**
 * Le site lui-même, sur l'accueil : le nom que Google peut afficher à la
 * place du domaine, et le nom court.
 */
export function websiteJsonLd(lang: Lang) {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#site`,
    name: BUSINESS_NAME,
    alternateName: "NIVEX",
    url: `${origin}/`,
    inLanguage: lang === "en" ? "en-CA" : "fr-CA",
    publisher: { "@id": `${origin}/#nivex` },
  };
}

/**
 * Le texte d'un bloc `<script type="application/ld+json">`. Les chevrons
 * sont échappés : un nom de secteur saisi dans l'onglet Zones et frais qui
 * contiendrait « </script> » ne doit pas pouvoir fermer la balise.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
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

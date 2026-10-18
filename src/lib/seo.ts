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

/** « +1 450 943-1217 » : le numéro de la maison, écrit comme on le lit. */
export function phoneDisplay(): string {
  const d = PHONE.replace(/\D/g, "").slice(-10);
  return `+1 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * La description de l'accueil : les cinq premiers secteurs de la Rive-Sud,
 * dans l'ordre de l'onglet « Zones et frais », puis Montréal s'il est
 * desservi.
 */
export function metaDescription(t: Dict, policy: ZonePolicy, lang: Lang): string {
  const { south, montreal } = sectorsByRegion(policy);
  const places = [
    ...south.slice(0, 5).map((s) => nameOf(s, lang)),
    ...(montreal.length ? [lang === "en" ? "Montreal" : "Montréal"] : []),
  ];
  return t.meta.description.replace("{places}", joinList(places, lang));
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
    description: metaDescription(t, s.zonePolicy, lang),
    slogan: t.brand.tagline,
    url: `${origin}/${lang}`,
    image: `${origin}/opengraph-image.jpg`,
    telephone: phoneDisplay(),
    email: contactEmail(s),
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

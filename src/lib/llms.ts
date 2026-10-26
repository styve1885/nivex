import { getDict } from "./i18n";
import type { Settings } from "./settings";
import { CONTACT_EMAIL, PHONE } from "./brand";
import { siteOrigin } from "./google";
import { formatMoney, minutesToText } from "./time";
import { feeTable, feeZones, montrealTravelFree, servedText, type FeeRow } from "./travel";
import { setupSentence } from "./capacity";
import { pageDescription } from "./seo";
import { faqFill } from "@/components/home/faq-fill";
import {
  PLANS, UNIT_GARMENTS, UNIT_LINEN, cycleTravel, cycleTravelText, planCents, planFullCents, planPieces,
  sessionLength, sessionPriceCents, type UnitPrice,
} from "./pricing";

/**
 * Ce que les assistants lisent de la maison, en Markdown, en français puis
 * en anglais, sur deux fichiers :
 *  — /llms.txt, court : le service, les zones, les quatre abonnements et la
 *    séance d'essai avec leurs prix, le contact et les pages principales ;
 *  — /llms-full.txt, le détail : pièces à l'unité, frais par zone et coût
 *    d'un cycle en zone payante, conditions, les sept questions et leurs
 *    réponses.
 *
 * Rien n'y est écrit à la main : les prix, la séance d'essai, les zones et
 * leurs frais, les questions et leurs réponses sortent des mêmes réglages et
 * des mêmes dictionnaires que les pages. Un assistant qui les lit cite donc
 * exactement ce que la page affiche.
 */
export function llmsText(s: Settings): string {
  return [shortSection(s, "fr"), shortSection(s, "en")].join("\n\n---\n\n");
}

export function llmsFullText(s: Settings): string {
  return [section(s, "fr"), section(s, "en")].join("\n\n---\n\n");
}

/** Une zone et ses frais, en une ligne. */
function feeLine(f: FeeRow, t: ReturnType<typeof getDict>): string {
  const price = f.free ? t.tarifs.terms.travelFree
    : f.short === f.long ? t.tarifs.terms.travelFlat.replace("{fee}", f.short)
      : `${t.tarifs.terms.travelShort.replace("{fee}", f.short).replace("{hours}", f.threshold)} ; `
        + t.tarifs.terms.travelLong.replace("{fee}", f.long).replace("{hours}", f.threshold);
  return `- ${f.zone} (${f.sectors.join(", ")}) : ${price}`;
}

/* Le français met une espace avant les deux-points ; l'anglais, non. */
const punctuate = (text: string, lang: "fr" | "en") =>
  lang === "en" ? text.replace(/ : /g, ": ").replace(/ ; /g, "; ") : text;

function shortSection(s: Settings, lang: "fr" | "en"): string {
  const t = getDict(lang);
  const origin = siteOrigin();
  const money = (c: number) => formatMoney(c, s.currency, lang);
  const L = LABELS[lang];
  const plans = PLANS.map((p) => {
    const text = lang === "en" ? p.en : p.fr;
    return `- ${text.name} : ${money(planCents(p, s))} ${t.pricing.perCycle}, ${text.short.charAt(0).toLowerCase()}${text.short.slice(1)}`;
  });
  const lines = [
    `# ${L.title}`,
    "",
    `> ${pageDescription("home", lang, s)}`,
    "",
    t.hero.onSite,
    "",
    `## ${L.zones}`,
    "",
    servedText(s.zonePolicy, lang, t.zoneText),
    ...(montrealTravelFree(s.zonePolicy) ? ["", t.zoneText.montrealFree] : []),
    "",
    ...feeTable(s.zonePolicy, lang, money).map((f) => feeLine(f, t)),
    "",
    `## ${t.tarifs.plans.title}`,
    "",
    ...plans,
    "",
    `## ${L.trial}`,
    "",
    t.tarifs.trial.replace("{min}", minutesToText(sessionLength(s), lang)).replace("{price}", money(sessionPriceCents(s))),
    "",
    `## ${t.nav.contact}`,
    "",
    `- ${L.phone} : ${PHONE}`,
    `- ${L.email} : ${CONTACT_EMAIL}`,
    "",
    `## ${L.pages}`,
    "",
    `- [${t.nav.home}](${origin}/${lang})`,
    `- [${t.tarifs.eyebrow}](${origin}/${lang}/tarifs)`,
    `- [${t.montreal.eyebrow}](${origin}/${lang}/montreal)`,
    `- [${t.booking.title}](${origin}/${lang}/reserver)`,
    `- [${t.tarifs.plans.title}](${origin}/${lang}/abonnement)`,
    `- [${L.full}](${origin}/llms-full.txt)`,
  ];
  return punctuate(lines.join("\n"), lang);
}

function section(s: Settings, lang: "fr" | "en"): string {
  const t = getDict(lang);
  const origin = siteOrigin();
  const money = (c: number) => formatMoney(c, s.currency, lang);
  const range = (u: UnitPrice) => (u.toCents ? `${money(u.cents)} – ${money(u.toCents)}` : money(u.cents));
  const label = (u: UnitPrice) => (lang === "en" ? u.en : u.fr);
  const L = LABELS[lang];
  const min = minutesToText(sessionLength(s), lang);

  const plans = PLANS.map((p) => {
    const text = lang === "en" ? p.en : p.fr;
    return `- ${t.meta.plan.replace("{name}", text.name)} : ${money(planCents(p, s))} ${t.pricing.perCycle}`
      + ` (${t.pricing.insteadOf} ${money(planFullCents(p, s))}). ${text.detail} `
      + `${t.capacity.perCycle.replace("{n}", String(planPieces(p)))}.`;
  });

  const fees = feeTable(s.zonePolicy, lang, money).map((f) => feeLine(f, t));

  /* Le coût d'un cycle dans chaque zone payante, comme sur la page Tarifs. */
  const cycles = feeZones(s.zonePolicy).flatMap(({ zone }) => [
    `### ${t.tarifs.terms.cycleTitle.replace("{zone}", lang === "en" ? zone.nameEn || zone.nameFr : zone.nameFr)}`,
    "",
    ...cycleTravel(zone, s).map((c) => `- ${cycleTravelText(c, t, lang, money)}`),
    "",
  ]);

  const faq = t.faq.items.map((f) => `### ${f.q}\n\n${faqFill(f.a, t, s, lang)}`);

  const lines = [
    `# NIVEX — ${t.meta.service}`,
    "",
    `> ${pageDescription("home", lang, s)}`,
    "",
    `## ${L.prices}`,
    "",
    ...plans,
    `- ${t.tarifs.trial.replace("{min}", min).replace("{price}", money(sessionPriceCents(s)))}`,
    `- ${t.tarifs.conditions.extraHour.replace("{rate}", money(s.hourlyRate))}`,
    ...(s.firstHourFree ? [`- ${t.pricing.firstFree} : ${t.pricing.firstFreeConditions}`] : []),
    `- ${setupSentence(t, s, lang)}`,
    `- ${t.capacity.caveat}`,
    "",
    `## ${t.tarifs.units.title}`,
    "",
    t.tarifs.units.lede,
    "",
    ...[...UNIT_LINEN, ...UNIT_GARMENTS].map((u) => `- ${label(u)} : ${range(u)}`),
    "",
    `## ${t.tarifs.terms.travel}`,
    "",
    servedText(s.zonePolicy, lang, t.zoneText),
    ...(montrealTravelFree(s.zonePolicy) ? ["", t.zoneText.montrealFree] : []),
    "",
    ...fees,
    "",
    t.tarifs.terms.travelNote,
    "",
    ...cycles,
    `## ${t.tarifs.conditions.title}`,
    "",
    ...t.tarifs.conditions.items.map((c) => `- ${c}`),
    "",
    `## ${t.faq.eyebrow}`,
    "",
    faq.join("\n\n"),
    "",
    `## ${L.pages}`,
    "",
    `- [${t.nav.home}](${origin}/${lang})`,
    `- [${t.tarifs.eyebrow}](${origin}/${lang}/tarifs)`,
    `- [${t.booking.title}](${origin}/${lang}/reserver)`,
    `- [${t.tarifs.plans.title}](${origin}/${lang}/abonnement)`,
    `- [${t.montreal.eyebrow}](${origin}/${lang}/montreal)`,
    "",
    `## ${t.nav.contact}`,
    "",
    `- ${L.phone} : ${PHONE}`,
    `- ${L.email} : ${CONTACT_EMAIL}`,
  ];
  return punctuate(lines.join("\n"), lang);
}

const LABELS = {
  fr: {
    title: "NIVEX Repassage à domicile", prices: "Abonnements et séance d'essai", pages: "Pages",
    phone: "Téléphone", email: "Courriel", zones: "Zones desservies", trial: "Séance d'essai",
    full: "Version détaillée pour les assistants",
  },
  en: {
    title: "NIVEX In-Home Ironing", prices: "Subscriptions and trial session", pages: "Pages",
    phone: "Phone", email: "Email", zones: "Areas served", trial: "Trial session",
    full: "Detailed version for assistants",
  },
} as const;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowIcon } from "@/components/Icons";
import { ZoneChecker } from "@/components/ZoneChecker";
import { getDict, isLocale, type Dict } from "@/lib/i18n";
import { getSettings, type Settings } from "@/lib/settings";
import { SETUP_MINUTES } from "@/lib/brand";
import { formatMoney, minutesToText } from "@/lib/time";
import { montrealFees, montrealNames, type FeeRow } from "@/lib/travel";
import { faqJsonLd, localBusinessJsonLd } from "@/lib/seo";

/*
 * Repassage à domicile à Montréal.
 *
 * Une page pour ceux qui cherchent Montréal, et pour les assistants qui
 * répondent à leur place. Rien n'y est récité : les quartiers sont les
 * secteurs de l'île réglés dans l'onglet « Zones et frais », les montants et
 * la durée minimale sont ceux de la page Tarifs, lus aux mêmes réglages.
 */

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return {
    title: { absolute: t.montreal.metaTitle },
    description: t.montreal.lede,
    alternates: {
      canonical: `/${locale}/montreal`,
      languages: { "fr-CA": "/fr/montreal", "en-CA": "/en/montreal" },
    },
    openGraph: {
      title: t.montreal.metaTitle,
      description: t.montreal.lede,
      url: `/${locale}/montreal`,
      locale: locale === "en" ? "en_CA" : "fr_CA",
      images: [{ url: "/opengraph-image.jpg", width: 1200, height: 630, alt: t.meta.ogAlt }],
    },
  };
}

/** Les frais d'une zone, en une phrase : ceux d'une courte séance, puis d'une longue. */
function feeSentence(f: FeeRow, t: Dict): string {
  const terms = t.tarifs.terms;
  if (f.free) return `${terms.travelFree}.`;
  if (f.short === f.long) return `${terms.travelFlat.replace("{fee}", f.short)}.`;
  return `${terms.travelShort.replace("{fee}", f.short).replace("{hours}", f.threshold)}, `
    + `${terms.travelLong.replace("{fee}", f.long).replace("{hours}", f.threshold)}.`;
}

/**
 * Les réponses de la foire aux questions, remplies depuis les réglages.
 *
 * La réponse sur les frais suit la grille : sans quartier ouvert, la question
 * disparaît, plutôt que de répondre par un pronom sans montant ; sans frais
 * nulle part, elle le dit, au lieu d'annoncer des frais « à chaque visite »
 * juste après « sans frais ». Les données structurées reprennent ces réponses.
 */
function faqItems(t: Dict, s: Settings, locale: "fr" | "en", fees: FeeRow[]) {
  const sep = locale === "en" ? ": " : " : ";
  const feesText = fees.length === 1
    ? feeSentence(fees[0], t)
    : fees.map((f) => `${f.sectors.join(", ")}${sep}${feeSentence(f, t)}`).join(" ");
  const days = locale === "en" ? "days" : "jours";
  return t.montreal.faq
    .filter((f) => !f.a.includes("{fees}") || fees.length > 0)
    .map((f) => ({
      q: f.q,
      a: f.a.includes("{fees}") && fees.every((x) => x.free)
        ? t.montreal.feesFree
        : f.a
          .replace("{lead}", minutesToText(s.leadHours * 60, locale))
          .replace("{horizon}", `${s.horizonDays} ${days}`)
          .replace("{fees}", feesText),
    }));
}

export default async function MontrealPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const m = t.montreal;
  const s = await getSettings();

  const money = (c: number) => formatMoney(c, s.currency, locale);
  const quartiers = montrealNames(s.zonePolicy, locale);
  const fees = montrealFees(s.zonePolicy, locale, money);

  /* La plus courte séance possible, au prix qu'elle coûte : le même calcul
     que l'en-tête de la page Tarifs. */
  const shortest = Math.max(s.minMinutes, 120);
  const min = minutesToText(shortest, locale);
  const entry = money(Math.round((shortest / 60) * s.hourlyRate));

  const faq = faqItems(t, s, locale, fees);
  const jsonLd = localBusinessJsonLd(t, s, locale);
  const faqLd = faqJsonLd(faq);

  return (
    <div className="bg-linen-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* — En-tête — */}
      <section className="px-7 pb-20 pt-36 sm:px-10 sm:pt-40">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">{m.eyebrow}</p>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {m.title}
          </h1>
          <p className="mt-7 max-w-2xl text-[1.05rem] leading-[1.85] text-ink-700">{m.lede}</p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link href={`/${locale}/reserver`} className="btn">{m.cta}<ArrowIcon /></Link>
            <a href={t.brand.phoneHref} className="text-[0.95rem] text-gold-700 transition-colors hover:text-gold-600">
              {t.brand.phone}
            </a>
          </div>
        </div>
      </section>

      {/* — Les quartiers, tels que réglés dans « Zones et frais » — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">{m.areasTitle}</h2>
          {quartiers.length > 0 ? (
            <>
              <p className="mt-5 max-w-2xl text-[0.95rem] font-light leading-[1.9] text-ink-500">{m.areasLede}</p>
              <ul className="mt-10 grid gap-x-10 gap-y-3 sm:grid-cols-2">
                {quartiers.map((q) => (
                  <li key={q} className="relative border-b border-gold-300/40 pb-3 pl-6 font-display text-[1.2rem] text-ink-800">
                    <span aria-hidden="true" className="absolute left-0 top-1.5 text-[0.7rem] text-gold-500">◇</span>
                    {q}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-5 max-w-2xl text-[0.95rem] font-light leading-[1.9] text-ink-500">{m.none}</p>
          )}
          <div className="paper mt-12 px-7 py-8 sm:px-9">
            <ZoneChecker t={t} locale={locale} />
          </div>
        </div>
      </section>

      {/* — Les conditions : celles de la page Tarifs, lues aux mêmes réglages — */}
      <section className="px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">{m.conditionsTitle}</h2>
          <p className="mt-5 max-w-2xl text-[0.95rem] font-light leading-[1.9] text-ink-500">
            {m.conditionsLede.split("{link}")[0]}
            <Link href={`/${locale}/tarifs`} className="text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 hover:text-gold-600">
              {t.nav.pricing}
            </Link>
            {m.conditionsLede.split("{link}")[1]}
          </p>

          <dl className="mt-10 border-t border-gold-300/40">
            <Row dt={m.rate}>
              {m.rateValue.replace("{rate}", money(s.hourlyRate)).replace("{entry}", entry).replace("{min}", min)}
            </Row>
            <Row dt={m.minimum}>
              {m.minimumValue.replace("{min}", min).replace("{setup}", String(SETUP_MINUTES))}
            </Row>
            {fees.length > 0 && (
              <Row dt={m.travel}>
                {fees.length === 1 ? (
                  <span className="block text-ink-700">{feeSentence(fees[0], t)}</span>
                ) : (
                  <ul className="space-y-3">
                    {fees.map((f) => (
                      <li key={f.key}>
                        <span className="block text-ink-700">{feeSentence(f, t)}</span>
                        <span className="block text-[0.8rem] text-ink-400">{f.sectors.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* « Par visite, en plus du prix » ne se dit que s'il y a des frais. */}
                {fees.some((f) => !f.free) && <span className="mt-2 block text-ink-400">{m.travelNote}</span>}
              </Row>
            )}
            {s.firstHourFree && (
              <Row dt={t.pricing.firstFree}>{t.pricing.firstFreeConditions}</Row>
            )}
          </dl>
        </div>
      </section>

      {/* — Questions propres à Montréal, toujours dépliées — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">{m.faqTitle}</h2>
          <dl className="mt-10 border-t border-gold-300/40">
            {faq.map((f) => (
              <div key={f.q} className="border-b border-gold-300/40 py-6">
                <dt className="font-display text-[1.25rem] leading-snug text-ink-800">{f.q}</dt>
                <dd className="mt-3 max-w-3xl text-[0.93rem] font-light leading-[1.9] text-ink-500">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* — Appel à l'action — */}
      <section className="bg-ink-900 px-7 py-24 text-linen-200 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light leading-tight text-linen-100 sm:text-4xl">{t.tarifs.cta.title}</h2>
          <p className="mt-5 max-w-xl text-[0.95rem] font-light leading-[1.9] text-linen-300/85">{t.tarifs.cta.body}</p>
          <div className="mt-9 flex flex-wrap items-center gap-6">
            <Link href={`/${locale}/reserver`} className="btn btn-gold">{t.cta.button}<ArrowIcon /></Link>
            <a href={t.brand.phoneHref} className="text-[0.95rem] text-gold-300 transition-colors hover:text-gold-200">
              {t.brand.phone}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ dt, children }: { dt: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b border-gold-300/40 py-5 sm:grid-cols-[15rem_1fr] sm:gap-6">
      <dt className="font-display text-[1rem] text-ink-800">{dt}</dt>
      <dd className="text-[0.88rem] font-light leading-[1.8] text-ink-500">{children}</dd>
    </div>
  );
}

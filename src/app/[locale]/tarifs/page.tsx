import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowIcon } from "@/components/Icons";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettingsStrict, type Settings } from "@/lib/settings";
import { formatMoney, minutesToText } from "@/lib/time";
import { feeTable, feeZones, servedText } from "@/lib/travel";
import { pageMeta, tarifsDescription } from "@/lib/seo";
import { ZoneChecker } from "@/components/ZoneChecker";
import { RetiredSections } from "@/components/tarifs/RetiredSections";
import { setupSentence } from "@/lib/capacity";
import {
  PLANS, UNIT_GARMENTS, UNIT_LINEN, cycleTravel, cycleTravelText, planCents, planFullCents, planPieces,
  sessionLength, sessionPriceCents, type UnitPrice,
} from "@/lib/pricing";

// Le taux horaire, la durée minimale et les zones se règlent depuis /admin :
// la page se relit au même rythme que l'accueil.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  const s = await getSettingsStrict();
  return pageMeta(t, locale, "/tarifs", t.tarifs.eyebrow, tarifsDescription(t, s, locale === "en" ? "en" : "fr"));
}

function UnitList({ items, s, locale }: { items: UnitPrice[]; s: Settings; locale: "fr" | "en" }) {
  return (
    <ul>
      {items.map((u) => (
        <li key={u.key} className="flex items-baseline justify-between gap-4 border-b border-gold-300/40 py-3">
          <span className="text-[0.9rem] font-light text-ink-600">{locale === "en" ? u.en : u.fr}</span>
          <span className="whitespace-nowrap font-display text-[1rem] tabular-nums text-ink-800">
            {formatMoney(u.cents, s.currency, locale)}
            {u.toCents ? ` – ${formatMoney(u.toCents, s.currency, locale)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * La page Tarifs, dans l'ordre du 23 octobre 2026 : les abonnements, la
 * séance d'essai, les pièces à l'unité, les frais de déplacement, la première
 * heure offerte et cinq conditions. Les sections retirées attendent dans
 * RetiredSections, éteintes par `PUBLISHED`.
 *
 * Aucun montant n'est récité : tout sort des réglages en vigueur, comme dans
 * le tunnel, l'accueil et les données structurées.
 */
export default async function TarifsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const s = await getSettingsStrict();
  const money = (cents: number) => formatMoney(cents, s.currency, locale);
  const fees = feeTable(s.zonePolicy, locale, money);
  const trial = t.tarifs.trial
    .replace("{min}", minutesToText(sessionLength(s), locale))
    .replace("{price}", money(sessionPriceCents(s)));
  const conditions = [
    t.tarifs.conditions.extraHour.replace("{rate}", money(s.hourlyRate)),
    setupSentence(t, s, locale),
    ...t.tarifs.conditions.items,
  ];

  return (
    <div className="bg-linen-100">
      {/* — En-tête — */}
      <section className="px-7 pb-16 pt-36 sm:px-10 sm:pt-40">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">{t.tarifs.eyebrow}</p>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.tarifs.title}
          </h1>
        </div>
      </section>

      {/* — a) Abonnements — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <p className="eyebrow">{t.tarifs.plans.title}</p>
            <h2 className="mt-4 font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.plans.lede}</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PLANS.map((p) => {
              const text = locale === "en" ? p.en : p.fr;
              const price = planCents(p, s);
              const full = planFullCents(p, s);
              return (
                <div key={p.key} className="paper flex flex-col gap-2 p-7">
                  <h3 className="font-display text-[1.15rem] text-ink-800">{text.name}</h3>
                  <p className="text-[0.85rem] font-light leading-[1.75] text-ink-500">{text.detail}</p>
                  <p className="text-[0.72rem] uppercase tracking-[0.12em] text-gold-700">
                    {t.capacity.perCycle.replace("{n}", String(planPieces(p)))}
                  </p>
                  {/* « 400 $ au lieu de 440 $ » : le prix à la carte barré, et dit
                      en toutes lettres — un lecteur d'écran n'entend pas le trait. */}
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-3 font-display text-[1.7rem] tabular-nums text-gold-700">
                    <span>
                      {money(price)}
                      <span className="ml-1.5 font-sans text-[0.72rem] font-light text-ink-400">{t.tarifs.plans.perMonth}</span>
                    </span>
                    {full > price && (
                      <span className="font-sans text-[0.85rem] font-light text-ink-400">
                        {t.tarifs.plans.insteadOf} <s>{money(full)}</s>
                      </span>
                    )}
                  </p>
                  <Link href={`/${locale}/abonnement?formule=${p.key}`}
                    className="mt-auto self-start pt-4 text-[10px] uppercase tracking-[0.18em] text-gold-700 underline decoration-gold-400 underline-offset-4 transition-colors hover:text-gold-600">
                    {t.tarifs.plans.cta}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-6 max-w-2xl text-[0.8rem] font-light leading-relaxed text-ink-400">
            {t.tarifs.plans.cycleNote} {t.capacity.caveat}
          </p>
          <ul className="mt-8 grid gap-2.5">
            {t.tarifs.plans.perks.map((perk) => (
              <li key={perk} className="relative pl-6 text-[0.88rem] font-light text-ink-500">
                <span aria-hidden="true" className="absolute left-0 top-1 text-[0.7rem] text-gold-500">◇</span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* — b) La séance d'essai, en une ligne — */}
      <section className="px-7 py-16 sm:px-10">
        <div className="paper mx-auto flex max-w-4xl flex-col items-start gap-5 px-7 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-9">
          <p className="font-display text-[1.35rem] font-light leading-snug text-ink-800">{trial}</p>
          <Link href={`/${locale}/reserver`} className="btn flex-none !py-3.5 !px-6 !text-[10px]">
            {t.tarifs.trialCta}<ArrowIcon />
          </Link>
        </div>
      </section>

      <RetiredSections t={t} s={s} locale={locale} />

      {/* — c) Pièces à l'unité — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <p className="eyebrow">{t.tarifs.units.title}</p>
            <h2 className="mt-4 font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.units.lede}</h2>
          </div>
          <div className="mt-10 grid gap-12 sm:grid-cols-2 sm:gap-14">
            <div>
              <h3 className="border-b border-ink-800 pb-2 text-[0.66rem] font-medium uppercase tracking-[0.2em] text-gold-700">
                {t.tarifs.units.linen}
              </h3>
              <UnitList items={UNIT_LINEN} s={s} locale={locale} />
            </div>
            <div>
              <h3 className="border-b border-ink-800 pb-2 text-[0.66rem] font-medium uppercase tracking-[0.2em] text-gold-700">
                {t.tarifs.units.garments}
              </h3>
              <UnitList items={UNIT_GARMENTS} s={s} locale={locale} />
            </div>
          </div>
          <p className="mt-8 max-w-2xl text-[0.8rem] font-light leading-relaxed text-ink-400">{t.tarifs.units.note}</p>
        </div>
      </section>

      {/* — d) Frais de déplacement par zone — */}
      <section className="px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.terms.travel}</h2>
          {/* De quoi vérifier son adresse avant de lire les montants. */}
          <div className="paper mt-10 px-7 py-8 sm:px-9">
            <p className="text-[0.9rem] font-light leading-[1.85] text-ink-600">
              {servedText(s.zonePolicy, locale, t.zoneText)}
            </p>
            <Link href={`/${locale}/montreal`}
              className="mt-3 inline-block text-[0.82rem] text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-600">
              {t.montreal.link}
            </Link>
            <ZoneChecker t={{ brand: t.brand, zoneCheck: t.zoneCheck }} locale={locale} className="mt-6" />
          </div>

          {/* Une zone par ligne, avec ses secteurs et ses deux tarifs, écrits
              depuis l'onglet « Zones et frais » : changer un montant depuis
              /admin change cette page, sans quoi elle finirait par contredire
              ce que le tunnel facture. Le seuil est propre à chaque zone. */}
          {fees.length > 0 && (
            <>
              <ul className="mt-10 divide-y divide-gold-300/30 border-y border-gold-300/40">
                {fees.map((f) => (
                  <li key={f.key} className="grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:gap-6">
                    <div>
                      <p className="font-display text-[1.05rem] text-ink-800">{f.zone}</p>
                      <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-400">{f.sectors.join(", ")}</p>
                    </div>
                    <div className="text-[0.88rem] tabular-nums text-ink-700 sm:text-right">
                      {f.free ? (
                        <p>{t.tarifs.terms.travelFree}</p>
                      ) : f.short === f.long ? (
                        <p>{t.tarifs.terms.travelFlat.replace("{fee}", f.short)}</p>
                      ) : (
                        <>
                          <p>{t.tarifs.terms.travelShort.replace("{fee}", f.short).replace("{hours}", f.threshold)}</p>
                          <p>{t.tarifs.terms.travelLong.replace("{fee}", f.long).replace("{hours}", f.threshold)}</p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-5 max-w-2xl text-[0.8rem] font-light leading-relaxed text-ink-400">
                {t.tarifs.terms.travelNote}{s.firstHourFree ? ` ${t.tarifs.terms.travelNoteOffer}` : null}
              </p>
            </>
          )}

          {/* Le coût d'un cycle d'abonnement dans chaque zone qui facture la
              route : la formule, plus les frais de chaque visite selon sa
              durée — le calcul de la souscription, au taux du jour. */}
          {feeZones(s.zonePolicy).map(({ zone }) => (
            <div key={zone.key} className="mt-12">
              <h3 className="border-b border-ink-800 pb-2 text-[0.66rem] font-medium uppercase tracking-[0.2em] text-gold-700">
                {t.tarifs.terms.cycleTitle.replace("{zone}", locale === "en" ? zone.nameEn || zone.nameFr : zone.nameFr)}
              </h3>
              <ul>
                {cycleTravel(zone, s).map((c) => (
                  <li key={c.plan.key} className="border-b border-gold-300/40 py-3 text-[0.9rem] font-light tabular-nums text-ink-600">
                    {cycleTravelText(c, t, locale, money)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* — e) La première heure offerte, tant que l'artisan la propose — */}
      {s.firstHourFree && (
        <section className="bg-linen-50 px-7 py-16 sm:px-10">
          <p className="mx-auto max-w-4xl border-l-2 border-gold-500 pl-5 text-[0.92rem] font-light leading-[1.8] text-ink-600">
            <span className="mr-2 text-[10px] uppercase tracking-[0.2em] text-gold-700">{t.pricing.firstFree}</span>
            {t.pricing.firstFreeConditions}
          </p>
        </section>
      )}

      {/* — f) Conditions, cinq points au plus — */}
      <section className="px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.conditions.title}</h2>
          <ul className="mt-10 border-t border-gold-300/40">
            {conditions.map((c) => (
              <li key={c} className="relative border-b border-gold-300/40 py-5 pl-7 text-[0.92rem] font-light leading-[1.8] text-ink-600">
                <span aria-hidden="true" className="absolute left-0 top-[1.55rem] text-[0.7rem] text-gold-500">◇</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

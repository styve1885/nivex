import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowIcon } from "@/components/Icons";
import { getDict, isLocale, type Dict } from "@/lib/i18n";
import { getSettings, type Settings } from "@/lib/settings";
import { formatMoney, minutesToText } from "@/lib/time";
import {
  ADDONS, BLOCKS, BUNDLES, CADENCE_NOTE, PLANS, UNIT_GARMENTS, UNIT_LINEN,
  firstTimeCents, offerCents, perHour, planCents, planFullCents,
  type Offer, type UnitPrice,
} from "@/lib/pricing";

// Le taux horaire, la durée minimale et le catalogue se règlent depuis /admin :
// la page se relit au même rythme que l'accueil.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return {
    title: t.tarifs.eyebrow,
    description: t.tarifs.lede,
    alternates: {
      canonical: `/${locale}/tarifs`,
      languages: { "fr-CA": "/fr/tarifs", "en-CA": "/en/tarifs" },
    },
  };
}

/** Le prix d'une offre : plein, et la première séance à côté si l'heure est offerte. */
function Price({ o, s, t, locale }: { o: Offer; s: Settings; t: Dict; locale: "fr" | "en" }) {
  const full = formatMoney(offerCents(o, s), s.currency, locale);
  if (!s.firstHourFree) {
    return <span className="font-display text-[1.35rem] text-ink-800">{full}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-0.5 sm:items-end">
      <span className="font-display text-[1.35rem] text-gold-700">
        {formatMoney(firstTimeCents(o, s), s.currency, locale)}
      </span>
      <span className="text-[0.72rem] text-ink-400">
        <span className="line-through">{full}</span> · {t.tarifs.firstFreeLabel}
      </span>
    </span>
  );
}

function OfferRow({
  o, s, t, locale, withOffer,
}: { o: Offer; s: Settings; t: Dict; locale: "fr" | "en"; withOffer: boolean }) {
  const text = locale === "en" ? o.en : o.fr;
  return (
    <div className="grid gap-2 border-b border-gold-300/40 py-6 sm:grid-cols-[13rem_4.5rem_1fr_auto] sm:items-center sm:gap-5">
      <div>
        <p className="font-display text-[1.08rem] leading-snug text-ink-800">{text.name}</p>
        {text.tag && (
          <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-ink-400">{text.tag}</p>
        )}
      </div>
      <p className="text-[0.78rem] text-ink-400">{minutesToText(o.minutes, locale)}</p>
      <p className="text-[0.88rem] font-light leading-[1.8] text-ink-500">{text.detail}</p>
      <div className="sm:text-right">
        {withOffer ? (
          <Price o={o} s={s} t={t} locale={locale} />
        ) : (
          <span className="font-display text-[1.35rem] text-ink-800">
            {formatMoney(offerCents(o, s), s.currency, locale)}
          </span>
        )}
      </div>
    </div>
  );
}

function UnitList({ items, s, locale }: { items: UnitPrice[]; s: Settings; locale: "fr" | "en" }) {
  return (
    <ul>
      {items.map((u) => (
        <li key={u.fr} className="flex items-baseline justify-between gap-4 border-b border-gold-300/40 py-3">
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

export default async function TarifsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const s = await getSettings();
  const min = minutesToText(s.minMinutes, locale);
  const rate = formatMoney(s.hourlyRate, s.currency, locale);
  const services = s.services.filter((x) => x.enabled);

  return (
    <div className="bg-linen-100">
      {/* — En-tête — */}
      <section className="px-7 pb-20 pt-36 sm:px-10 sm:pt-40">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">{t.tarifs.eyebrow}</p>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.tarifs.title}
          </h1>
          <p className="mt-7 max-w-2xl text-[1.02rem] font-light leading-[1.9] text-ink-600">{t.tarifs.lede}</p>

          <div className="mt-12 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="font-display text-5xl font-light text-ink-800 sm:text-6xl">{rate}</span>
            <span className="text-sm text-ink-400">{t.pricing.perHour}</span>
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-ink-500">
            {t.tarifs.perHourNote.replace("{min}", min)}
          </p>
        </div>
      </section>

      {/* — La cadence, lue du moteur de créneaux — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">
              {t.tarifs.cadence.title}
            </h2>
            <p className="mt-5 max-w-2xl text-[0.95rem] font-light leading-[1.9] text-ink-500">
              {t.tarifs.cadence.lede}
            </p>
          </div>

          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse">
              <thead>
                <tr className="border-b border-ink-800">
                  <th scope="col" className="pb-3 text-left text-[0.64rem] uppercase tracking-[0.18em] text-gold-700">
                    {t.tarifs.cadence.colType}
                  </th>
                  <th scope="col" className="pb-3 text-right text-[0.64rem] uppercase tracking-[0.18em] text-gold-700">
                    {t.tarifs.cadence.colQty}
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => (
                  <tr key={svc.key} className="border-b border-gold-300/40">
                    <td className="py-4 pr-4 align-baseline">
                      <span className="text-[0.95rem] text-ink-700">{locale === "en" ? svc.en : svc.fr}</span>
                      {CADENCE_NOTE[svc.key] && (
                        <span className="mt-1 block text-[0.76rem] font-light leading-[1.6] text-ink-400">
                          {locale === "en" ? CADENCE_NOTE[svc.key].en : CADENCE_NOTE[svc.key].fr}
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-right align-baseline font-display text-[1.15rem] tabular-nums text-ink-800">
                      {perHour(svc.minutesPerUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 max-w-2xl text-[0.8rem] font-light leading-relaxed text-ink-400">
            {t.tarifs.cadence.note}
          </p>
        </div>
      </section>

      {/* — La différence — */}
      <section className="px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">
              {t.tarifs.versus.title}
            </h2>
            <p className="mt-4 text-[0.95rem] font-light text-ink-500">{t.tarifs.versus.lede}</p>
          </div>

          <div className="mt-12 border-t border-gold-300/40">
            {t.tarifs.versus.rows.map((row) => (
              <div key={row.title}
                className="grid gap-3 border-b border-gold-300/40 py-6 sm:grid-cols-[11rem_1fr_1fr] sm:gap-6">
                <h3 className="font-display text-[1.05rem] text-ink-800">{row.title}</h3>
                <p className="text-[0.88rem] font-light leading-[1.8] text-ink-400">
                  <span className="mr-1.5 text-[0.66rem] uppercase tracking-[0.14em]">{t.tarifs.versus.elsewhere} —</span>
                  {row.them}
                </p>
                <p className="text-[0.88rem] font-light leading-[1.8] text-ink-600">
                  <span className="mr-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-gold-700">{t.tarifs.versus.here} —</span>
                  {row.us}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* — Blocs horaires — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <p className="eyebrow">{t.tarifs.blocks.title}</p>
            <h2 className="mt-4 font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.blocks.lede}</h2>
          </div>
          <div className="mt-10 border-t border-gold-300/40">
            {BLOCKS.map((o) => <OfferRow key={o.key} o={o} s={s} t={t} locale={locale} withOffer />)}
          </div>
          <p className="mt-8 border-l-2 border-gold-500 bg-linen-200/60 px-6 py-5 text-[0.88rem] font-light leading-[1.8] text-ink-600">
            {t.tarifs.blocks.minimum.replace("{min}", min)}
          </p>
        </div>
      </section>

      {/* — Forfaits composés — */}
      <section className="px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <p className="eyebrow">{t.tarifs.bundles.title}</p>
            <h2 className="mt-4 font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.bundles.lede}</h2>
          </div>
          <div className="mt-10 border-t border-gold-300/40">
            {BUNDLES.map((o) => <OfferRow key={o.key} o={o} s={s} t={t} locale={locale} withOffer />)}
          </div>
        </div>
      </section>

      {/* — Ajouts — */}
      <section className="bg-linen-50 px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <p className="eyebrow">{t.tarifs.addons.title}</p>
            <h2 className="mt-4 font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.addons.lede}</h2>
          </div>
          <div className="mt-10 border-t border-gold-300/40">
            {ADDONS.map((o) => <OfferRow key={o.key} o={o} s={s} t={t} locale={locale} withOffer={false} />)}
          </div>
        </div>
      </section>

      {/* — Pièces à l'unité — */}
      <section className="px-7 py-24 sm:px-10">
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

      {/* — Abonnements — */}
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
                  <p className="mt-3 font-display text-[1.7rem] tabular-nums text-gold-700">
                    {formatMoney(price, s.currency, locale)}
                    <span className="ml-1.5 font-sans text-[0.72rem] font-light text-ink-400">{t.tarifs.plans.perMonth}</span>
                  </p>
                  <p className="text-[0.75rem] font-light text-ink-400">
                    {t.tarifs.plans.full} : {formatMoney(full, s.currency, locale)} · {t.tarifs.plans.save}{" "}
                    {formatMoney(full - price, s.currency, locale)}
                  </p>
                </div>
              );
            })}
          </div>
          <ul className="mt-10 grid gap-2.5">
            {t.tarifs.plans.perks.map((perk) => (
              <li key={perk} className="relative pl-6 text-[0.88rem] font-light text-ink-500">
                <span aria-hidden="true" className="absolute left-0 top-1 text-[0.7rem] text-gold-500">◇</span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* — Modalités — */}
      <section className="px-7 py-24 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div>
            <h2 className="font-display text-3xl font-light text-ink-800 sm:text-4xl">{t.tarifs.terms.title}</h2>
          </div>
          <dl className="mt-10 border-t border-gold-300/40">
            {t.tarifs.terms.items.map((item) => (
              <div key={item.dt} className="grid gap-1.5 border-b border-gold-300/40 py-5 sm:grid-cols-[15rem_1fr] sm:gap-6">
                <dt className="font-display text-[1rem] text-ink-800">{item.dt}</dt>
                <dd className="text-[0.88rem] font-light leading-[1.8] text-ink-500">{item.dd}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* — Appel à l'action — */}
      <section className="bg-ink-900 px-7 py-24 text-linen-200 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-light leading-tight text-linen-100 sm:text-4xl">
            {t.tarifs.cta.title}
          </h2>
          <p className="mt-5 max-w-xl text-[0.95rem] font-light leading-[1.9] text-linen-300/85">
            {t.tarifs.cta.body}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-6">
            <Link href={`/${locale}/reserver`} className="btn btn-gold">
              {t.cta.button}<ArrowIcon />
            </Link>
            <a href={t.brand.phoneHref} className="text-[0.95rem] text-gold-300 transition-colors hover:text-gold-200">
              {t.brand.phone}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

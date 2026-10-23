import { formatMoney, minutesToText } from "@/lib/time";
import { capacitySentence, setupSentence } from "@/lib/capacity";
import {
  ADDONS, BLOCKS, BUNDLES, CADENCE_NOTE, PUBLISHED,
  bookableOffers, capacityPieces, firstTimeCents, offerCents, type Offer,
} from "@/lib/pricing";
import { getRetired } from "@/lib/i18n/retired";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * Les sections que la page Tarifs a retirées le 23 octobre 2026 : le contenu
 * d'une séance, la comparaison avec le repassage de ménage, les séances, les
 * forfaits et les ajouts.
 *
 * Elles ne s'affichent plus, mais rien n'est perdu : leurs définitions
 * (pricing.ts) et leurs textes (i18n/retired.ts) sont intacts, et repasser un
 * drapeau de `PUBLISHED` à `true` les remet en place, telles qu'elles étaient.
 * Avant de les remettre, relire `blocks.minimum` : il parle des ajouts.
 */
export function RetiredSections({ t, s, locale }: { t: Dict; s: Settings; locale: "fr" | "en" }) {
  const r = getRetired(locale).tarifs;
  const min = minutesToText(Math.max(s.minMinutes, 120), locale);
  const services = s.services.filter((x) => x.enabled);
  const blocks = bookableOffers(BLOCKS, s);
  const bundles = bookableOffers(BUNDLES, s);

  return (
    <>
      {PUBLISHED.contents && (
        <section className="bg-linen-50 px-7 py-24 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">
              {r.cadence.title}
            </h2>
            <p className="mt-5 max-w-2xl text-[0.95rem] font-light leading-[1.9] text-ink-600">
              {capacitySentence(t, s, locale)}
            </p>
            <p className="mt-3 max-w-2xl text-[0.95rem] font-light leading-[1.9] text-ink-500">
              {setupSentence(t, s, locale)}
            </p>
            <p className="mt-12 border-b border-ink-800 pb-3 text-[0.64rem] uppercase tracking-[0.18em] text-gold-700">
              {r.cadence.colType}
            </p>
            <ul>
              {services.map((svc) => (
                <li key={svc.key} className="border-b border-gold-300/40 py-4">
                  <span className="text-[0.95rem] text-ink-700">{locale === "en" ? svc.en : svc.fr}</span>
                  {CADENCE_NOTE[svc.key] && (
                    <span className="mt-1 block text-[0.76rem] font-light leading-[1.6] text-ink-400">
                      {locale === "en" ? CADENCE_NOTE[svc.key].en : CADENCE_NOTE[svc.key].fr}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {PUBLISHED.difference && (
        <section className="px-7 py-24 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">
              {r.versus.title}
            </h2>
            <p className="mt-4 text-[0.95rem] font-light text-ink-500">{r.versus.lede}</p>
            <div className="mt-12 border-t border-gold-300/40">
              {r.versus.rows.map((row) => (
                <div key={row.title}
                  className="grid gap-3 border-b border-gold-300/40 py-6 sm:grid-cols-[11rem_1fr_1fr] sm:gap-6">
                  <h3 className="font-display text-[1.05rem] text-ink-800">{row.title}</h3>
                  <p className="text-[0.88rem] font-light leading-[1.8] text-ink-400">
                    <span className="mr-1.5 text-[0.66rem] uppercase tracking-[0.14em]">{r.versus.elsewhere} —</span>
                    {row.them}
                  </p>
                  <p className="text-[0.88rem] font-light leading-[1.8] text-ink-600">
                    <span className="mr-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-gold-700">{r.versus.here} —</span>
                    {row.us}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {PUBLISHED.blocks && blocks.length > 0 && (
        <OfferSection eyebrow={r.blocks.title} title={r.blocks.lede}
          offers={blocks} withOffer t={t} s={s} locale={locale}
          note={r.blocks.minimum.replace("{min}", min)} />
      )}
      {PUBLISHED.bundles && bundles.length > 0 && (
        <OfferSection eyebrow={r.bundles.title} title={r.bundles.lede}
          offers={bundles} withOffer t={t} s={s} locale={locale} />
      )}
      {PUBLISHED.addons && (
        <OfferSection eyebrow={r.addons.title} title={r.addons.lede}
          offers={ADDONS} withOffer={false} t={t} s={s} locale={locale} />
      )}
    </>
  );
}

function OfferSection({ eyebrow, title, offers, withOffer, note, t, s, locale }: {
  eyebrow: string; title: string; offers: Offer[]; withOffer: boolean; note?: string;
  t: Dict; s: Settings; locale: "fr" | "en";
}) {
  return (
    <section className="bg-linen-50 px-7 py-24 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-4 font-display text-3xl font-light text-ink-800 sm:text-4xl">{title}</h2>
        <div className="mt-10 border-t border-gold-300/40">
          {offers.map((o) => <OfferRow key={o.key} o={o} s={s} t={t} locale={locale} withOffer={withOffer} />)}
        </div>
        <p className="mt-4 text-[0.78rem] font-light leading-relaxed text-ink-400">{t.capacity.caveat}</p>
        {note && (
          <p className="mt-8 border-l-2 border-gold-500 bg-linen-200/60 px-6 py-5 text-[0.88rem] font-light leading-[1.8] text-ink-600">
            {note}
          </p>
        )}
      </div>
    </section>
  );
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
        <span className="sr-only">{t.tarifs.insteadOf} </span><s>{full}</s> · {t.tarifs.firstFreeLabel}
      </span>
    </span>
  );
}

function OfferRow({ o, s, t, locale, withOffer }: {
  o: Offer; s: Settings; t: Dict; locale: "fr" | "en"; withOffer: boolean;
}) {
  const text = locale === "en" ? o.en : o.fr;
  return (
    <div className="grid gap-2 border-b border-gold-300/40 py-6 sm:grid-cols-[13rem_4.5rem_1fr_auto] sm:items-center sm:gap-5">
      <div>
        <p className="font-display text-[1.08rem] leading-snug text-ink-800">{text.name}</p>
        {text.tag && <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-ink-400">{text.tag}</p>}
      </div>
      <p className="text-[0.78rem] text-ink-400">{minutesToText(o.minutes, locale)}</p>
      <div>
        <p className="text-[0.88rem] font-light leading-[1.8] text-ink-500">{text.detail}</p>
        <p className="mt-1 text-[0.72rem] uppercase tracking-[0.12em] text-gold-700">
          {t.capacity.upTo.replace("{n}", String(capacityPieces(o.minutes)))}
        </p>
      </div>
      <div className="sm:text-right">
        {withOffer ? <Price o={o} s={s} t={t} locale={locale} /> : (
          <span className="font-display text-[1.35rem] text-ink-800">{formatMoney(offerCents(o, s), s.currency, locale)}</span>
        )}
      </div>
    </div>
  );
}

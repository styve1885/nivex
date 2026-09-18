import Link from "next/link";
import { Reveal } from "../Reveal";
import { CheckIcon, ArrowIcon } from "../Icons";
import { formatMoney, minutesToText } from "@/lib/time";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

export function Pricing({ t, locale, settings }: { t: Dict; locale: "fr" | "en"; settings: Settings }) {
  const rate = formatMoney(settings.hourlyRate, settings.currency, locale);
  const min = minutesToText(settings.minMinutes, locale);

  return (
    <section className="bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-4xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.pricing.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">{t.pricing.title}</h2>
          <p className="mx-auto mt-6 max-w-lg text-[0.97rem] font-light leading-[1.95] text-ink-500">{t.pricing.lede}</p>
        </Reveal>

        <Reveal delay={110} className="mt-16">
          <div className="paper relative overflow-hidden p-10 text-center sm:p-14">
            <span aria-hidden="true" className="absolute inset-3 border border-gold-300/35" />

            <div className="relative">
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-display text-6xl font-light text-ink-800 sm:text-7xl">{rate}</span>
                <span className="text-sm text-ink-400">{t.pricing.perHour}</span>
              </div>

              <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-ink-400">
                {t.pricing.minimum} · {min}
              </p>

              {settings.firstHourFree && (
                <div className="mx-auto mt-10 max-w-md border border-gold-400/60 bg-linen-50/60 px-7 py-6">
                  <p className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gold-700">
                    <CheckIcon className="h-3.5 w-3.5" />{t.pricing.firstFree}
                  </p>
                  <p className="mt-3 text-[0.88rem] font-light leading-[1.85] text-ink-500">{t.pricing.firstFreeBody}</p>
                </div>
              )}

              <Link href={`/${locale}/reserver`} className="btn mt-10">
                {t.cta.button}<ArrowIcon />
              </Link>

              <p className="mt-6">
                <Link href={`/${locale}/tarifs`}
                  className="text-[11px] uppercase tracking-[0.2em] text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-600">
                  {t.pricing.seeAll} →
                </Link>
              </p>

              <p className="mx-auto mt-8 max-w-sm text-[0.78rem] font-light leading-relaxed text-ink-400">
                {t.pricing.note}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

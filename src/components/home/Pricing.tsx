import Link from "next/link";
import { Reveal } from "../Reveal";
import { formatMoney } from "@/lib/time";
import { shortDuration } from "@/lib/capacity";
import { PLANS, planCents, planFullCents, planPieces, sessionLength, sessionPriceCents } from "@/lib/pricing";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * La vitrine tarifaire de l'accueil : les quatre abonnements, puis la séance
 * d'essai en une ligne.
 *
 * Tout montant découle des réglages : le prix d'un cycle du taux horaire
 * (`planCents`), le prix barré du même temps à la carte, la séance d'essai de
 * la durée minimale réglée. Le volume d'un cycle vient du seul chiffre de
 * capacité du site, et la précision qui l'accompagne toujours se lit sous les
 * cartes.
 */
export function Pricing({ t, locale, settings }: { t: Dict; locale: "fr" | "en"; settings: Settings }) {
  const money = (cents: number) => formatMoney(cents, settings.currency, locale);
  const trial = t.pricing.trial
    .replace("{min}", shortDuration(sessionLength(settings), locale))
    .replace("{price}", money(sessionPriceCents(settings)));

  return (
    <section id="tarifs" className="scroll-mt-24 bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.pricing.eyebrow}</p>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.pricing.title}
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p, i) => {
            const text = locale === "en" ? p.en : p.fr;
            const price = planCents(p, settings);
            const full = planFullCents(p, settings);
            return (
              <Reveal key={p.key} delay={i * 90} className="paper flex flex-col p-7">
                <h3 className="text-[10px] uppercase tracking-[0.24em] text-gold-700">{text.name}</h3>
                {/* « 400 $ au lieu de 440 $ » : le prix à la carte barré, et dit
                    en toutes lettres — un lecteur d'écran n'entend pas le trait. */}
                <p className="mt-4 font-display text-[1.9rem] font-light leading-none tabular-nums text-ink-800">
                  {money(price)}
                  <span className="ml-1.5 font-sans text-[0.75rem] font-light text-ink-400">{t.pricing.perCycle}</span>
                </p>
                {full > price && (
                  <p className="mt-2 text-[0.8rem] font-light text-ink-400">
                    {t.pricing.insteadOf} <s>{money(full)}</s>
                  </p>
                )}
                <p className="mt-4 text-[0.88rem] font-light leading-[1.75] text-ink-600">
                  {t.pricing.planLine.replace("{detail}", text.short).replace("{n}", String(planPieces(p)))}
                </p>
                <Link href={`/${locale}/abonnement?formule=${p.key}`}
                  className="mt-auto self-start pt-5 text-[10px] uppercase tracking-[0.18em] text-gold-700 underline decoration-gold-400 underline-offset-4 transition-colors hover:text-gold-600">
                  {t.pricing.subscribe}
                </Link>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[0.78rem] font-light leading-relaxed text-ink-400">{t.capacity.caveat}</p>

        <Reveal delay={120} className="mt-12 flex flex-col items-center gap-5 text-center">
          <p className="font-display text-[1.35rem] font-light leading-snug text-ink-800 sm:text-[1.5rem]">{trial}</p>
          <Link
            href={`/${locale}/tarifs`}
            className="text-[11px] uppercase tracking-[0.2em] text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-600"
          >
            {t.pricing.seeAll} →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

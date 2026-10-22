import Link from "next/link";
import { Reveal } from "../Reveal";
import { CheckIcon, ArrowIcon } from "../Icons";
import { formatMoney, minutesToText } from "@/lib/time";
import { capacityPieces, cheapestPlanCents } from "@/lib/pricing";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * La vitrine tarifaire.
 *
 * On y vend une séance, jamais un taux : le montant se lit « 2 heures —
 * 110 $ », et la durée n'apparaît que comme repère de déroulement.
 *
 * La plus courte séance annoncée est la durée minimale d'un déplacement,
 * telle que réglée par l'artisan : la vitrine ne peut donc pas proposer
 * une séance que le tunnel refuserait de réserver. Les montants découlent
 * du taux en vigueur, si bien qu'ils ne peuvent pas non plus contredire
 * le devis.
 */
export function Pricing({ t, locale, settings }: { t: Dict; locale: "fr" | "en"; settings: Settings }) {
  const money = (cents: number) => formatMoney(cents, settings.currency, locale);

  /* La première séance dure le minimum réglé — jamais moins —, la deuxième
     une heure de plus. Leur durée et leur prix en découlent ensemble : une
     durée écrite à la main resterait à deux heures quand le prix, lui,
     suivrait le minimum. L'abonnement n'affiche que son prix. */
  const shortest = Math.max(settings.minMinutes, 120);
  const durations = [minutesToText(shortest, locale), minutesToText(shortest + 60, locale), ""];
  /* Le volume suit la durée, tiré du seul chiffre de capacité du site, et
     la précision qui l'accompagne toujours se lit sous les cartes. */
  const upTo = (minutes: number) => t.capacity.upTo.replace("{n}", String(capacityPieces(minutes)));
  const pieces = [upTo(shortest), upTo(shortest + 60), null];
  const volume = (text: string, i: number) =>
    pieces[i] ? `${pieces[i]} — ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
  const amounts = [
    money(Math.round((shortest / 60) * settings.hourlyRate)),
    money(Math.round(((shortest + 60) / 60) * settings.hourlyRate)),
    t.pricing.planFrom.replace("{price}", money(cheapestPlanCents(settings))),
  ];

  return (
    <section className="bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-5xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.pricing.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.pricing.title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[0.97rem] font-light leading-[1.95] text-ink-500">
            {t.pricing.lede}
          </p>
        </Reveal>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {t.pricing.offers.map((offer, i) => (
            <Reveal key={offer.name} delay={i * 90} className="paper flex flex-col p-8">
              <p className="text-[10px] uppercase tracking-[0.24em] text-gold-700">{offer.name}</p>

              <p className="mt-4 font-display text-[1.6rem] font-light leading-tight text-ink-800">
                {durations[i] ? `${durations[i]} — ${amounts[i]}` : amounts[i]}
              </p>

              <p className="mt-4 text-[0.9rem] font-light leading-[1.8] text-ink-600">{volume(offer.volume, i)}</p>
              <p className="mt-auto pt-5 text-[0.8rem] font-light leading-[1.7] text-ink-400">{offer.note}</p>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-center text-[0.78rem] font-light leading-relaxed text-ink-400">{t.capacity.caveat}</p>

        {settings.firstHourFree && (
          <Reveal delay={120} className="mx-auto mt-12 max-w-2xl border border-gold-400/60 bg-linen-100/70 px-7 py-6 text-center">
            <p className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gold-700">
              <CheckIcon className="h-3.5 w-3.5" />{t.pricing.firstFree}
            </p>
            <p className="mt-3 text-[0.88rem] font-light leading-[1.85] text-ink-600">
              {t.pricing.firstFreeConditions}
            </p>
          </Reveal>
        )}

        <Reveal delay={160} className="mt-12 flex flex-col items-center gap-6">
          <Link href={`/${locale}/reserver`} className="btn">
            {t.pricing.button}<ArrowIcon />
          </Link>
          <Link
            href={`/${locale}/tarifs`}
            className="text-[11px] uppercase tracking-[0.2em] text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-600"
          >
            {t.pricing.seeAll} →
          </Link>
          <p className="mx-auto max-w-sm text-center text-[0.78rem] font-light leading-relaxed text-ink-400">
            {t.pricing.note}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { servedText } from "@/lib/travel";
import { PLANS, planCents, planFullCents } from "@/lib/pricing";
import { rhythmPhrase } from "@/lib/email";
import { SERIES_CYCLES, SUBSCRIBER_TRAVEL_DISCOUNT_CENTS } from "@/lib/brand";
import { SubscriptionWizard, type SubscriptionConfig } from "@/components/booking/SubscriptionWizard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return {
    title: t.subscribe.title,
    description: t.subscribe.lede,
    alternates: { canonical: `/${locale}/abonnement`, languages: { "fr-CA": "/fr/abonnement", "en-CA": "/en/abonnement" } },
  };
}

export default async function SubscribePage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ formule?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;

  const t = getDict(locale);
  const s = await getSettings();

  /* Les montants viennent des réglages en vigueur : la page Tarifs et ce
     parcours lisent la même fonction, et la création la relit encore. */
  const config: SubscriptionConfig = {
    locale,
    plans: PLANS.map((p) => ({
      key: p.key,
      name: locale === "en" ? p.en.name : p.fr.name,
      detail: locale === "en" ? p.en.detail : p.fr.detail,
      visits: p.visits,
      minutesPerVisit: p.minutesPerVisit,
      everyWeeks: p.everyWeeks,
      rhythm: rhythmPhrase(p.everyWeeks, locale),
      cycleCents: planCents(p, s),
      fullCents: planFullCents(p, s),
    })),
    currency: s.currency,
    timezone: s.timezone,
    discountCents: SUBSCRIBER_TRAVEL_DISCOUNT_CENTS,
    seriesCycles: SERIES_CYCLES,
    initialPlan: sp.formule ?? null,
    areaText: servedText(s.zonePolicy, locale, t.zoneText),
  };

  return (
    <div className="bg-linen-100 pt-24">
      <SubscriptionWizard t={t} config={config} />
    </div>
  );
}

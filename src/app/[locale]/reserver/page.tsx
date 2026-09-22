import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { BookingWizard, type WizardConfig } from "@/components/booking/BookingWizard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return {
    title: t.booking.title,
    description: t.booking.lede,
    alternates: { canonical: `/${locale}/reserver`, languages: { "fr-CA": "/fr/reserver", "en-CA": "/en/reserver" } },
  };
}

export default async function BookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const s = await getSettings();

  /* Le tunnel ne lit plus l'agenda : il transmet une demande de créneau,
     que l'artisan confirme par téléphone. Il reste donc ouvert même si
     rien n'est branché — c'est tout l'intérêt. */
  const config: WizardConfig = {
    locale,
    services: s.services.filter((x) => x.enabled).map((x) => ({
      key: x.key, icon: x.icon,
      label: locale === "en" ? x.en : x.fr,
      unit: locale === "en" ? x.unitEn : x.unitFr,
      minutesPerUnit: x.minutesPerUnit,
    })),
    hourlyRate: s.hourlyRate,
    currency: s.currency,
    minMinutes: s.minMinutes,
    slotStep: s.slotStep,
    firstHourFree: s.firstHourFree,
    areaPrefixes: s.serviceArea.prefixes.map((p) => p.toUpperCase()),
  };

  return (
    <div className="bg-linen-100 pt-24">
      <BookingWizard t={t} config={config} />
    </div>
  );
}

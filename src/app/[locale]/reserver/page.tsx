import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { servedText } from "@/lib/travel";
import { pageMeta } from "@/lib/seo";
import { BookingWizard, type WizardConfig } from "@/components/booking/BookingWizard";
import { PausedNotice } from "@/components/booking/PausedNotice";
import { LEGAL_UPDATED } from "@/components/LegalDocument";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return pageMeta(t, locale, "/reserver", t.booking.title, t.booking.lede);
}

export default async function BookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const s = await getSettings();

  /* Seule la pause ferme la prise de rendez-vous, et la page le dit dès
     l'arrivée plutôt qu'à la confirmation. Un compte Google débranché, lui,
     ne ferme rien : le rendez-vous s'écrit en base, l'agenda et les
     courriels suivent dès qu'ils le peuvent. */
  if (s.paused) {
    return (
      <div className="bg-linen-100 pt-24">
        <PausedNotice t={t} locale={locale} title={t.booking.title} />
      </div>
    );
  }

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
    timezone: s.timezone,
    areaText: servedText(s.zonePolicy, locale, t.zoneText),
    legalUpdated: LEGAL_UPDATED,
  };

  return (
    <div className="bg-linen-100 pt-24">
      <BookingWizard t={t} config={config} />
    </div>
  );
}

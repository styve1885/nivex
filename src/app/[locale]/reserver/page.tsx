import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { servedText } from "@/lib/travel";
import { pageMeta } from "@/lib/seo";
import { BookingWizard, type WizardConfig } from "@/components/booking/BookingWizard";
import { PausedNotice } from "@/components/booking/PausedNotice";
import { LEGAL_UPDATED } from "@/components/LegalDocument";
import {
  PLANS, UNIT_LINEN, UNIT_PRICES, capacityPieces, planCents, planFullCents, planPieces, sessionLength, sessionPriceCents,
} from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return pageMeta(t, locale, "/reserver", "reserver");
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

  /* Le tunnel ne propose que la séance d'essai — avec les pièces à l'unité
     en option — et les quatre abonnements. Tout est chiffré ici, depuis les
     réglages et la grille ; createBooking refait le calcul de son côté. */
  const config: WizardConfig = {
    locale,
    sessionMinutes: sessionLength(s),
    sessionCents: sessionPriceCents(s),
    sessionPieces: capacityPieces(sessionLength(s)),
    units: UNIT_PRICES.map((u) => ({
      key: u.key, label: locale === "en" ? u.en : u.fr, cents: u.cents,
      ...(u.toCents ? { toCents: u.toCents } : {}),
      group: UNIT_LINEN.includes(u) ? "linen" as const : "garments" as const,
    })),
    plans: PLANS.map((p) => {
      const text = locale === "en" ? p.en : p.fr;
      return {
        key: p.key, name: text.name,
        line: t.pricing.planLine.replace("{detail}", text.short).replace("{n}", String(planPieces(p))),
        cents: planCents(p, s), fullCents: planFullCents(p, s),
      };
    }),
    hourlyRate: s.hourlyRate,
    currency: s.currency,
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

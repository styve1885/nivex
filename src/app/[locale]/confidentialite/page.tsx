import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { LegalDocument } from "@/components/LegalDocument";

// Les réglages de l'artisan nourrissent le texte : on les relit régulièrement,
// au même rythme que la page d'accueil.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return {
    title: t.footer.legal,
    description: t.legal.privacy.lede,
    alternates: {
      canonical: `/${locale}/confidentialite`,
      languages: { "fr-CA": "/fr/confidentialite", "en-CA": "/en/confidentialite" },
    },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettings();

  return (
    <LegalDocument
      doc={t.legal.privacy}
      t={t}
      locale={locale}
      settings={settings}
      related={{ href: `/${locale}/conditions`, label: t.footer.terms }}
    />
  );
}

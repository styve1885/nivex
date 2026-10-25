import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettingsStrict } from "@/lib/settings";
import { LegalDocument } from "@/components/LegalDocument";
import { pageMeta } from "@/lib/seo";

// Les réglages de l'artisan nourrissent le texte : on les relit régulièrement,
// au même rythme que la page d'accueil.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return pageMeta(t, locale, "/confidentialite", "confidentialite");
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettingsStrict();

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

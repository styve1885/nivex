import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { LegalDocument } from "@/components/LegalDocument";
import { pageMeta } from "@/lib/seo";

// Le taux, la durée minimale et les délais sont ceux réglés depuis /admin :
// la page se relit au même rythme que la page d'accueil.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return pageMeta(t, locale, "/conditions", t.footer.terms, t.legal.terms.lede);
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettings();

  return (
    <LegalDocument
      doc={t.legal.terms}
      t={t}
      locale={locale}
      settings={settings}
      related={{ href: `/${locale}/confidentialite`, label: t.footer.legal }}
    />
  );
}

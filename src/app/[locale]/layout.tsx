import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getDict, isLocale, locales } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return {
    title: { default: t.meta.title, template: "%s · NIVEX" },
    description: t.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: { "fr-CA": "/fr", "en-CA": "/en", "x-default": "/fr" },
    },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === "en" ? "en_CA" : "fr_CA",
      url: `/${locale}`,
      // Déclarée ici, et pas seulement à la racine : ce bloc-ci remplace
      // celui du dessus, et l'image du fichier-convention s'y perdrait.
      images: [{ url: "/opengraph-image.jpg", width: 1200, height: 630, alt: t.meta.ogAlt }],
    },
  };
}

export default async function LocaleLayout({
  children, params,
}: {
  children: React.ReactNode; params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettings();

  return (
    <>
      <a href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink-800 focus:px-5 focus:py-3 focus:text-xs focus:uppercase focus:tracking-widest focus:text-linen-100">
        {locale === "en" ? "Skip to content" : "Aller au contenu"}
      </a>
      <SiteHeader t={t} locale={locale} />
      <main id="contenu">{children}</main>
      <SiteFooter t={t} locale={locale} settings={settings} />
    </>
  );
}

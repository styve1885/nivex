import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettingsStrict } from "@/lib/settings";
import { contactEmail } from "@/lib/brand";
import { servedText } from "@/lib/travel";
import { Hero } from "@/components/home/Hero";
import { Story } from "@/components/home/Story";
import { Services } from "@/components/home/Services";
import { HowItWorks } from "@/components/home/HowItWorks";
import { BeforeAfter, BeforeAfterBanner } from "@/components/home/BeforeAfter";
import { Pricing } from "@/components/home/Pricing";
import { Faq } from "@/components/home/Faq";
import { faqFill } from "@/components/home/faq-fill";
import { faqJsonLd, jsonLdHtml, pageMeta, websiteJsonLd } from "@/lib/seo";
import { Contact } from "@/components/home/Contact";
import { openingLine } from "@/components/home/opening-line";
import { ClosingCta } from "@/components/home/ClosingCta";

export const revalidate = 300;

/* Son titre, sa description (avec le plus bas montant par cycle, tiré des
   réglages), son adresse canonique et ses deux langues. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMeta(getDict(locale), locale, "", "home", await getSettingsStrict());
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettingsStrict();

  /* Données structurées : le site, et la foire aux questions telle qu'elle
     s'affiche, remplie une seule fois pour les deux. La fiche LocalBusiness
     vient de la racine, sur toutes les pages. */
  const siteLd = websiteJsonLd(locale);
  const faqItems = t.faq.items.map((f) => ({ q: f.q, a: faqFill(f.a, t, settings, locale) }));
  const faqLd = faqJsonLd(faqItems);

  /* Faq et Contact sont des composants clients : leurs props s'écrivent dans
     la page, lisibles par n'importe qui, et chaque octet se télécharge avant
     qu'elle réponde. Ils ne reçoivent donc que ce qu'ils affichent, écrit ici,
     et des objets neufs : le dictionnaire entier pesait 47 Ko, le quart de la
     page, et les réglages portent le compte Google de l'artisan. */

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(siteLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqLd) }} />

      {/* L'ordre du 23 octobre 2026, pour un accueil deux fois plus court.
          Le ruban (Marquee), la galerie (Gallery, dont les photos vivent
          maintenant sous les prestations) et le protocole (Protocol) ont
          quitté la page ; leurs composants et leurs textes restent, pour
          pouvoir les remettre. */}
      <Hero t={t} locale={locale} settings={settings} />
      <HowItWorks t={t} />
      <Services t={t} />
      <BeforeAfter t={t} />
      <BeforeAfterBanner t={t} />
      <Pricing t={t} locale={locale} settings={settings} />
      <Story t={t} />
      <Faq eyebrow={t.faq.eyebrow} title={t.faq.title} items={faqItems} />
      <Contact
        t={{ contact: t.contact, brand: t.brand, photos: t.photos, zoneCheck: t.zoneCheck, montreal: { link: t.montreal.link } }}
        locale={locale} businessEmail={contactEmail()}
        hours={openingLine(t, settings, locale)} served={servedText(settings.zonePolicy, locale, t.zoneText)} />
      <ClosingCta t={t} locale={locale} settings={settings} />
    </>
  );
}

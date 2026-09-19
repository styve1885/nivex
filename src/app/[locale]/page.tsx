import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { contactEmail } from "@/lib/brand";
import { Hero } from "@/components/home/Hero";
import { Marquee } from "@/components/home/Marquee";
import { Story } from "@/components/home/Story";
import { Services } from "@/components/home/Services";
import { Gallery } from "@/components/home/Gallery";
import { Protocol } from "@/components/home/Protocol";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Pricing } from "@/components/home/Pricing";
import { Faq } from "@/components/home/Faq";
import { Contact } from "@/components/home/Contact";
import { ClosingCta } from "@/components/home/ClosingCta";

export const revalidate = 300;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettings();

  /* Données structurées : pour que Google comprenne le commerce. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: "NIVEX",
    description: t.meta.description,
    slogan: t.brand.tagline,
    telephone: "+14509431217",
    email: contactEmail(settings),
    priceRange: "$$",
    areaServed: settings.serviceArea.prefixes.map((p) => ({ "@type": "PostalCodeRangeSpecification", postalCodeBegin: p })),
    address: { "@type": "PostalAddress", addressRegion: "QC", addressCountry: "CA", addressLocality: "Longueuil" },
    openingHoursSpecification: settings.hours.filter((h) => h.enabled).map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][h.day],
      opens: h.open, closes: h.close,
    })),
    makesOffer: t.services.items.map((s) => ({
      "@type": "Offer", itemOffered: { "@type": "Service", name: s.name, description: s.body },
    })),
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.items.map((f) => ({
      "@type": "Question", name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <Hero t={t} locale={locale} />
      <Marquee t={t} />
      <Story t={t} />
      <Services t={t} />
      <Gallery t={t} />
      <Protocol t={t} />
      <HowItWorks t={t} />
      <Pricing t={t} locale={locale} settings={settings} />
      <Faq t={t} />
      <Contact t={t} locale={locale} businessEmail={contactEmail(settings)} />
      <ClosingCta t={t} locale={locale} />
    </>
  );
}

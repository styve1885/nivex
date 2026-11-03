import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowIcon } from "@/components/Icons";
import { PresentationVideo, TranscriptText } from "@/components/video/PresentationVideo";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettingsStrict } from "@/lib/settings";
import { jsonLdHtml, pageMeta, presentationVideoJsonLd } from "@/lib/seo";

/*
 * La présentation de NIVEX en vidéo.
 *
 * Une page dont la vidéo est le sujet : Google n'affiche une vidéo dans ses
 * résultats que pour une telle page. Le titre, la vidéo, sa transcription en
 * entier, et de quoi réserver. Elle est au plan du site et dans /llms.txt,
 * pas dans le menu : l'accueil montre la même vidéo juste après le héros.
 */

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMeta(getDict(locale), locale, "/presentation", "presentation");
}

export default async function PresentationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  /* La page ne cite aucun réglage, mais la racine en écrit dans le pied de
     page et la fiche de la maison. La lecture stricte fait échouer une
     régénération pendant une panne de base, et la dernière page réussie reste
     servie, au lieu d'en figer une aux valeurs du code. */
  await getSettingsStrict();

  const t = getDict(locale);
  const v = t.video;

  return (
    <div className="bg-linen-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(presentationVideoJsonLd(locale)) }} />

      <section className="px-7 pb-20 pt-36 sm:px-10 sm:pt-40">
        <div className="mx-auto max-w-[60rem]">
          <p className="eyebrow">{v.eyebrow}</p>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {v.title}
          </h1>
          <p className="mt-6 max-w-2xl text-[1.02rem] leading-[1.8] text-ink-700">{v.lede}</p>
          <div className="mt-12">
            <PresentationVideo t={{ video: v }} eager />
          </div>
        </div>
      </section>

      <section className="bg-linen-50 px-7 py-24 sm:px-10" aria-labelledby="transcription">
        <div className="mx-auto max-w-2xl">
          <h2 id="transcription" className="font-display text-3xl font-light leading-tight text-ink-800 sm:text-4xl">
            {v.transcriptTitle}
          </h2>
          {v.transcriptNote && <p className="mt-3 text-[0.82rem] italic text-ink-400">{v.transcriptNote}</p>}
          <TranscriptText locale={locale} className="mt-8 !text-[0.98rem]" />
          <div className="mt-14 flex flex-wrap items-center gap-6">
            <Link href={`/${locale}/reserver`} className="btn">{t.hero.ctaPrimary}<ArrowIcon /></Link>
            <a href={t.brand.phoneHref} className="text-[0.95rem] text-gold-700 transition-colors hover:text-gold-600">
              {t.brand.phone}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

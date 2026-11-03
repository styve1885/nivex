import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/google";
import { pageDate, publicUrls } from "@/lib/pages";
import { publicChangedOn } from "@/lib/freshness";
import { PRESENTATION, uploadDateTime } from "@/lib/video";
import { presentationVideoJsonLd } from "@/lib/seo";

/**
 * Le plan du site : les pages publiques de lib/pages.ts, dans les deux
 * langues, avec leur vraie date de modification et leurs équivalents dans
 * l'autre langue. Les tunnels de réservation et les liens personnels n'y
 * figurent pas.
 *
 * La date tient compte de ce que l'artisan change depuis /admin
 * (lib/freshness.ts) : le plan se régénère comme les pages, et les routes
 * qui enregistrent les réglages et les zones le revalident aussitôt. Une
 * base injoignable fait échouer la régénération, qui laisse servir le
 * dernier plan réussi.
 *
 * La page de présentation y déclare sa vidéo (le plan de sitemap vidéo de
 * Google) : titre, aperçu, description, fichier, durée et date, les mêmes que
 * ses données structurées. Next écrit ces champs sans les échapper : ils
 * passent donc par `xml`.
 */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const changedOn = await publicChangedOn();
  return publicUrls(base).map(({ url, locale, page }) => ({
    url,
    /* La date seule, « AAAA-MM-JJ », écrite telle quelle dans <lastmod> :
       aucun fuseau ne la déplace d'un jour. */
    lastModified: pageDate(page, changedOn),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    ...(page.video ? { videos: [video(locale)] } : {}),
    alternates: {
      languages: {
        "fr-CA": `${base}/fr${page.path}`,
        "en-CA": `${base}/en${page.path}`,
        "x-default": `${base}/fr${page.path}`,
      },
    },
  }));
}

/** La vidéo de présentation, pour le plan du site, dans la langue de la page. */
function video(lang: "fr" | "en") {
  const ld = presentationVideoJsonLd(lang);
  return {
    title: xml(ld.name),
    thumbnail_loc: ld.thumbnailUrl,
    description: xml(ld.description),
    content_loc: ld.contentUrl,
    duration: PRESENTATION.seconds,
    publication_date: uploadDateTime(PRESENTATION.uploaded),
  };
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

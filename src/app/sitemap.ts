import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/google";
import { pageDate, publicUrls } from "@/lib/pages";
import { publicChangedOn } from "@/lib/freshness";

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
 */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const changedOn = await publicChangedOn();
  return publicUrls(base).map(({ url, page }) => ({
    url,
    /* La date seule, « AAAA-MM-JJ », écrite telle quelle dans <lastmod> :
       aucun fuseau ne la déplace d'un jour. */
    lastModified: pageDate(page, changedOn),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: {
      languages: {
        "fr-CA": `${base}/fr${page.path}`,
        "en-CA": `${base}/en${page.path}`,
        "x-default": `${base}/fr${page.path}`,
      },
    },
  }));
}

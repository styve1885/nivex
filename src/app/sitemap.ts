import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/google";
import { publicUrls } from "@/lib/pages";

/**
 * Le plan du site : les pages publiques de lib/pages.ts, dans les deux
 * langues, avec leur vraie date de modification et leurs équivalents dans
 * l'autre langue. Les tunnels de réservation et les liens personnels n'y
 * figurent pas.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  return publicUrls(base).map(({ url, page }) => ({
    url,
    /* La date seule, « AAAA-MM-JJ », écrite telle quelle dans <lastmod> :
       aucun fuseau ne la déplace d'un jour. */
    lastModified: page.updated,
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

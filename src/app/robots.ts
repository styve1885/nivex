import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/google";

/*
 * Les robots des moteurs de recherche et des assistants qui citent leurs
 * sources sont nommés un par un. Un robot qui trouve son nom ne lit plus que
 * son propre groupe et ignore celui de « * » : chaque groupe répète donc les
 * mêmes interdits. L'espace artisan, l'API et les liens personnels de
 * réservation ne regardent personne.
 */
const PRIVATE = ["/admin", "/api/", "/fr/reservation/", "/en/reservation/", "/fr/abonnement/", "/en/abonnement/"];

const NAMED = ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"];

export default function robots(): MetadataRoute.Robots {
  const base = siteOrigin();
  return {
    rules: [
      ...NAMED.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE })),
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

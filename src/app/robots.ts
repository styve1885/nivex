import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/google";

/*
 * Les robots des moteurs de recherche et des assistants qui citent leurs
 * sources sont nommés un par un. Un robot qui trouve son nom ne lit plus que
 * son propre groupe et ignore celui de « * » : chaque groupe répète donc les
 * mêmes interdits. L'espace artisan, l'API, les liens personnels de
 * réservation et la page qui retire un navigateur du décompte ne regardent
 * personne.
 */
const PRIVATE = [
  "/admin", "/api/", "/fr/reservation/", "/en/reservation/", "/fr/abonnement/", "/en/abonnement/",
  "/fr/ne-pas-compter", "/en/ne-pas-compter",
];

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

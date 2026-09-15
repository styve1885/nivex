import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/google";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const now = new Date();
  const pages = [
    { path: "", changeFrequency: "weekly" as const, priority: 1 },
    { path: "/reserver", changeFrequency: "monthly" as const, priority: 0.8 },
    { path: "/confidentialite", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/conditions", changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  return ["fr", "en"].flatMap((locale) =>
    pages.map(({ path: p, changeFrequency, priority }) => ({
      url: `${base}/${locale}${p}`,
      lastModified: now,
      changeFrequency,
      priority,
      alternates: {
        languages: {
          "fr-CA": `${base}/fr${p}`,
          "en-CA": `${base}/en${p}`,
        },
      },
    })),
  );
}

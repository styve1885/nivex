import type { Metadata, Viewport } from "next";
import { SiteMeasurement } from "@/components/SiteMeasurement";
import { cormorant, jost } from "@/lib/fonts";
import { siteMetadata, siteViewport } from "@/lib/seo";
import "../globals.css";

/*
 * La racine de l'espace artisan, à part de celle de la vitrine
 * (app/[locale]/layout.tsx) : elle ne dépend d'aucune langue, et passer de
 * l'une à l'autre recharge la page entière. L'en-tête commun vient de
 * `lib/seo.ts`, le même que sous la vitrine.
 */

export const metadata: Metadata = {
  ...siteMetadata,
  title: "Espace artisan",
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = siteViewport;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" className={`${cormorant.variable} ${jost.variable}`}>
      <body>
        <div className="min-h-screen bg-linen-100">{children}</div>
        {/* Les pages /admin ne se comptent jamais : le composant les écarte de
            lui-même, et le tableau de bord pose le marqueur de retrait sur
            chaque navigateur où il s'ouvre. */}
        <SiteMeasurement />
      </body>
    </html>
  );
}

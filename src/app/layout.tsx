import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { cormorant, jost } from "@/lib/fonts";
import { siteOrigin } from "@/lib/google";
import "./globals.css";

export const metadata: Metadata = {
  // Même source que le plan de site et le robots.txt. `siteOrigin()` ignore une
  // variable vide — `??` ne le faisait pas, et une valeur vide posée dans
  // l'hébergeur faisait échouer la compilation sur `new URL("")`.
  metadataBase: new URL(siteOrigin()),
  title: "NIVEX — Repassage à domicile de prestige",
  description:
    "Un artisan du repassage se déplace chez vous, avec son matériel professionnel. Longueuil, Rive-Sud et Montérégie. Première heure offerte.",
  applicationName: "NIVEX",
  authors: [{ name: "NIVEX" }],
  keywords: [
    "repassage à domicile", "repassage Longueuil", "repassage Rive-Sud", "service de repassage Montérégie",
    "pressage chemises", "ironing service Quebec", "linge de maison", "NIVEX",
  ],
  openGraph: {
    type: "website", siteName: "NIVEX", locale: "fr_CA", alternateLocale: ["en_CA"],
    title: "NIVEX — Repassage à domicile de prestige",
    description: "Offrez à votre garde-robe le soin qu'elle mérite. Première heure offerte.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#FBF8F2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await headers()).get("x-nivex-locale") === "en" ? "en-CA" : "fr-CA";
  return (
    <html lang={lang} className={`${cormorant.variable} ${jost.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SiteMeasurement } from "@/components/SiteMeasurement";
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
    "Repassage à domicile à Saint-Lambert, Longueuil, sur la Rive-Sud et à Montréal. Un artisan repasse vos vêtements et votre literie sur place, chez vous. Première heure offerte.",
  applicationName: "NIVEX",
  authors: [{ name: "NIVEX" }],
  keywords: [
    "repassage à domicile", "repassage Saint-Lambert", "repassage Longueuil", "repassage Rive-Sud",
    "repassage à domicile Montréal", "service de repassage Montérégie",
    "pressage chemises", "ironing service Quebec", "linge de maison", "NIVEX",
  ],
  openGraph: {
    type: "website", siteName: "NIVEX", locale: "fr_CA", alternateLocale: ["en_CA"],
    title: "NIVEX — Repassage à domicile de prestige",
    description: "Offrez à votre garde-robe le soin qu'elle mérite. Première heure offerte.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "only light",
  themeColor: "#FBF8F2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await headers()).get("x-nivex-locale") === "en" ? "en-CA" : "fr-CA";
  return (
    <html lang={lang} className={`${cormorant.variable} ${jost.variable}`}>
      <body>
        {children}
        {/*
          Mesure de fréquentation, chez l'hébergeur qui sert déjà le site :
          pas de témoin déposé, pas d'identifiant de navigateur conservé,
          donc rien à demander au visiteur et aucun quatrième fournisseur à
          déclarer. Ce qui remonte est agrégé — des nombres, des pages, des
          provenances —, jamais une personne. La politique de
          confidentialité le dit dans ces termes ; les deux doivent rester
          d'accord.

          Le composant porte aussi le journal anonyme de l'espace artisan et
          les deux exclusions qui vont avec : les pages /admin ne se comptent
          jamais, et un appareil marqué « ne pas compter » n'envoie plus
          rien. Ce layout enveloppant aussi /admin, le filtre doit vivre là
          où le chemin est connu — pas ici.
        */}
        <SiteMeasurement />
      </body>
    </html>
  );
}

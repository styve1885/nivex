import { Cormorant_Garamond, Jost } from "next/font/google";

/*
 * `subsets` ne décide que des fichiers préchargés : les règles @font-face du
 * jeu latin-ext restent déclarées, et le navigateur ne les télécharge que si
 * un caractère de la page en a besoin. Le jeu latin couvre déjà le français
 * et l'anglais (é, ç, œ, ’, —, €) ; précharger latin-ext coûtait environ
 * 85 Ko à chaque première visite, au téléphone surtout, pour rien.
 */

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-jost",
  display: "swap",
});

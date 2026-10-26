import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { notFoundMeta } from "@/lib/seo";

/*
 * Toute adresse inconnue sous /fr et /en : une faute de frappe, un vieux lien
 * partagé, un code QR mal recopié.
 *
 * Sans cette route, Next servait sa page 404 par défaut — en anglais, sans
 * en-tête ni pied de page, et noire sur un téléphone en mode sombre. Une
 * route attrape-tout a la priorité la plus basse : elle ne masque aucune
 * vraie page, et `notFound()` rend not-found.tsx dans la racine de la
 * langue, avec un vrai statut 404.
 *
 * À savoir : le HTML que le serveur envoie est la coquille d'erreur de Next,
 * sans texte ni `lang` ; la page traduite paraît une fois le JavaScript
 * chargé. C'est ainsi que Next 16 rend un `notFound()` levé hors d'une
 * frontière Suspense. Le statut, lui, est bien 404 dès le serveur.
 *
 * Rendue à chaque requête, jamais mise en cache : un robot qui essaie mille
 * adresses ne doit pas remplir le cache de l'hébergeur de mille pages vides.
 */

export const dynamic = "force-dynamic";

/* not-found.tsx porte le même titre. Celui-ci reste affiché une fois la page
   reprise par le navigateur, qui relit l'en-tête de la route. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return notFoundMeta((await params).locale);
}

export default function MissingPage(): never {
  notFound();
}

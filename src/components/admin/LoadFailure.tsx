"use client";

import Link from "next/link";

/** Pourquoi une lecture de l'espace artisan a échoué. */
export type LoadError = "session" | "server";

/* Un 401 : la session de trente jours a expiré pendant que l'onglet restait
   ouvert. Tout le reste — base injoignable, réponse illisible, réseau coupé —
   se dit de la même façon. */
export const loadErrorOf = (status: number): LoadError => (status === 401 ? "session" : "server");

/**
 * Une lecture qui échoue ne se présente pas comme une liste vide.
 *
 * « Aucun message », « aucune visite » sont des faits. Les afficher quand la
 * lecture a échoué faisait croire à l'artisan que personne n'avait écrit, ou
 * que son journal s'était vidé. On dit ce qui s'est passé, et quoi faire.
 */
export function LoadFailure({ error, className = "py-16 text-center" }: { error: LoadError; className?: string }) {
  return (
    <p role="alert" className={`text-[0.9rem] leading-relaxed text-[#8E332C] ${className}`}>
      {error === "session" ? (
        <>
          Votre session a expiré.{" "}
          <Link href="/admin/login" className="underline underline-offset-4">Reconnectez-vous</Link> pour continuer.
        </>
      ) : (
        <>Lecture impossible : le serveur n&apos;a pas répondu. Rechargez la page dans un instant.</>
      )}
    </p>
  );
}

"use client";

import { useState, type ReactNode } from "react";

/**
 * La bande qui défile, et le bouton qui l'arrête.
 *
 * Un texte qui bouge seul plus de cinq secondes doit pouvoir s'arrêter
 * (WCAG 2.2.2). Le réglage « réduire les animations » du système le fige
 * déjà, et le bouton disparaît alors ; pour tous les autres, c'est lui. Au
 * survol d'une souris, le ruban s'arrête aussi, le temps d'être lu.
 *
 * Seuls les deux libellés traversent vers le navigateur : le dictionnaire
 * reste au serveur.
 */
export function MarqueeTrack({ children, pause, play }: { children: ReactNode; pause: string; play: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <>
      <div className="marquee-track flex w-max gap-10 whitespace-nowrap" data-paused={paused ? "" : undefined}>
        {children}
      </div>
      <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? play : pause}
        className="absolute right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gold-400 bg-linen-50 text-gold-600 transition-colors hover:border-gold-500 hover:text-gold-700 motion-reduce:hidden">
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M2.5 1.2 8.6 5 2.5 8.8Z" /> : <path d="M2.2 1.2h2v7.6h-2zM5.8 1.2h2v7.6h-2z" />}
        </svg>
      </button>
    </>
  );
}

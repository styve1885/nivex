import { getRetired } from "@/lib/i18n/retired";
import type { Dict } from "@/lib/i18n";
import { MarqueeTrack } from "./MarqueeTrack";

/**
 * Ruban défilant — la liste des prestations, comme un ourlet cousu. Retiré
 * de l'accueil le 23 octobre 2026 ; sa liste vit dans retired.ts.
 */
export function Marquee({ t, locale }: { t: Dict; locale: "fr" | "en" }) {
  const list = getRetired(locale).marquee;
  /* La liste est écrite deux fois pour que la boucle se referme sans
     couture. La copie ne sert qu'à l'œil : un lecteur d'écran n'entend la
     liste qu'une fois. */
  const items = [...list, ...list];
  return (
    <div className="marquee relative overflow-hidden border-y border-gold-300/40 bg-linen-50 py-5">
      <MarqueeTrack pause={t.marqueeControl.pause} play={t.marqueeControl.play}>
        {items.map((label, i) => (
          <span key={i} aria-hidden={i >= list.length || undefined}
            className="flex items-center gap-10 text-[11px] uppercase tracking-[0.26em] text-ink-500">
            {label}<span className="text-gold-400" aria-hidden="true">◆</span>
          </span>
        ))}
      </MarqueeTrack>
      {/* fondus latéraux */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-linen-50 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-linen-50 to-transparent" />
      {/* L'animation vit ici, et non dans un style en ligne : un style en
          ligne l'emporterait sur l'arrêt, au bouton comme au survol. */}
      <style>{`
        @keyframes marquee { to { transform: translateX(-50%) } }
        .marquee-track { animation: marquee 44s linear infinite }
        .marquee-track[data-paused] { animation-play-state: paused }
        @media (hover: hover) { .marquee:hover .marquee-track { animation-play-state: paused } }
      `}</style>
    </div>
  );
}

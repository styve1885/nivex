import { getImageProps } from "next/image";
import type { Dict } from "@/lib/i18n";
import { PRESENTATION } from "@/lib/video";
import { presentationTranscript } from "@/lib/i18n/video";
import { PresentationPlayer } from "./PresentationPlayer";

/* Les largeurs d'aperçu proposées au lecteur : un petit écran, un écran
   ordinaire, un téléphone à haute densité (390 px × 3), un grand écran à
   haute densité. L'optimiseur de Next les sert en WebP, de 19 à 79 Ko ; le
   fichier d'origine, en JPEG, reste celui que lisent les moteurs. */
const POSTER_WIDTHS = [640, 1080, 1200, 1920];

function posterSet(): string {
  const { props } = getImageProps({
    src: PRESENTATION.poster, alt: "", width: PRESENTATION.width, height: PRESENTATION.height,
    sizes: "(min-width: 1024px) 960px, 100vw",
  });
  return (props.srcSet ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => POSTER_WIDTHS.includes(Number.parseInt(s.split(/\s+/)[1] ?? "", 10)))
    .join(", ");
}

/**
 * La vidéo dans son cadre : 16:9, 960 px au plus. Au téléphone, elle prend
 * toute la largeur de l'écran, d'un bord à l'autre ; plus large, elle prend
 * les filets et l'ombre des cartes de la maison (`paper`).
 *
 * `eager` : sur la page de présentation, l'aperçu est écrit dans la page,
 * en grand. Sur l'accueil, il attend que le visiteur s'en approche.
 */
export function PresentationVideo({ t, eager = false }: { t: Pick<Dict, "video">; eager?: boolean }) {
  const posters = posterSet();
  const big = posters.split(",").map((s) => s.trim().split(/\s+/)[0]).pop();
  return (
    <figure className="paper -mx-7 overflow-hidden border-x-0 sm:mx-auto sm:max-w-[60rem] sm:border-x">
      <PresentationPlayer
        src={PRESENTATION.src}
        posters={posters}
        poster={eager ? big : undefined}
        label={t.video.label}
        fallback={t.video.fallback}
        download={t.video.download}
      />
    </figure>
  );
}

/** La transcription, en paragraphes, dans la langue de la page. */
export function TranscriptText({ locale, className = "" }: { locale: "fr" | "en"; className?: string }) {
  return (
    <div className={`space-y-4 text-[0.92rem] font-light leading-[1.9] text-ink-600 ${className}`}>
      {presentationTranscript[locale].map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
    </div>
  );
}

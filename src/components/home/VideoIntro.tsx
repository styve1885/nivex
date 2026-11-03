import { Reveal } from "../Reveal";
import { PresentationVideo, TranscriptText } from "../video/PresentationVideo";
import type { Dict } from "@/lib/i18n";

/**
 * « En vidéo » : Styve présente la maison, juste après le héros. Le lien
 * « Voir la présentation » du héros descend ici (`#presentation`).
 *
 * Tout est rendu par le serveur, transcription comprise : elle se replie dans
 * un `<details>`, sans une ligne de JavaScript, et reste dans la page pour qui
 * la lit, moteur ou assistant compris. Le lecteur seul est un composant client.
 */
export function VideoIntro({ t, locale }: { t: Pick<Dict, "video">; locale: "fr" | "en" }) {
  const v = t.video;
  return (
    <section id="presentation" className="scroll-mt-24 bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{v.eyebrow}</p>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {v.title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[0.97rem] font-light leading-[1.9] text-ink-500">{v.lede}</p>
        </Reveal>

        <Reveal delay={120} className="mt-14">
          <PresentationVideo t={t} />
        </Reveal>

        <details className="group mx-auto mt-8 max-w-2xl">
          <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gold-700 transition-colors hover:text-gold-600 [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-gold-400 decoration-1 underline-offset-4">{v.transcriptToggle}</span>
            <span aria-hidden="true" className="inline-block text-[9px] transition-transform duration-300 group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-6 border-t border-gold-300/40 pt-6">
            {v.transcriptNote && <p className="mb-4 text-[0.8rem] italic text-ink-400">{v.transcriptNote}</p>}
            <TranscriptText locale={locale} />
          </div>
        </details>
      </div>
    </section>
  );
}

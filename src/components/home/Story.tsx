import { Reveal } from "../Reveal";
import { Photo } from "../Photo";
import type { Dict } from "@/lib/i18n";

export function Story({ t }: { t: Dict }) {
  return (
    <section id="histoire" className="relative scroll-mt-24 overflow-hidden bg-linen-100 py-28 sm:py-36">
      <div aria-hidden="true"
        className="pointer-events-none absolute right-[-10%] top-1/4 h-[30rem] w-[30rem] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-gold-200), transparent 65%)" }} />

      <div className="relative mx-auto max-w-4xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.story.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.story.title}
          </h2>
          <div className="rule-diamond mx-auto mt-8 max-w-[14rem]" aria-hidden="true"><span className="text-[10px]">◆</span></div>
        </Reveal>

        {/* La version courte, depuis le 23 octobre 2026. Les quatre chapitres
            de la version longue restent dans `story.chapters`, pour pouvoir
            les remettre. */}
        <Reveal delay={90}>
          <p className="mx-auto mt-14 max-w-2xl text-center text-[0.97rem] font-light leading-[2] text-ink-500">
            {t.story.body}
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-20 grid items-center gap-12 sm:grid-cols-[minmax(0,21rem)_1fr] sm:gap-14">
          <Photo
            src="/artisan/nivex-portrait-principal.jpg"
            alt={t.photos.portrait}
            sizes="(min-width: 640px) 21rem, 88vw"
          />
          <div className="text-center sm:text-left">
            <div className="rule-diamond mb-10 max-w-[10rem] mx-auto sm:mx-0" aria-hidden="true"><span className="text-[10px]">◆</span></div>
            {/* Les guillemets viennent avec la citation : « … » en français, “…” en anglais. */}
            <blockquote className="font-display text-2xl font-light italic leading-relaxed text-ink-700 sm:text-[1.9rem]">
              {t.story.quote}
            </blockquote>
            <p className="mt-8 font-display text-3xl text-gold-600" style={{ fontStyle: "italic" }}>{t.story.signature}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.26em] text-ink-400">{t.story.signatureRole}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

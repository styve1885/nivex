import { Reveal } from "../Reveal";
import { Photo } from "../Photo";
import type { Dict } from "@/lib/i18n";

export function HowItWorks({ t }: { t: Dict }) {
  return (
    <section id="deroulement" className="scroll-mt-24 bg-linen-100 py-28 sm:py-36">
      <div className="mx-auto max-w-5xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.how.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">{t.how.title}</h2>
        </Reveal>

        <div className="relative mt-20 grid gap-14 sm:grid-cols-3 sm:gap-8">
          {/* fil conducteur */}
          <div aria-hidden="true" className="absolute left-0 right-0 top-[2.1rem] hidden h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent sm:block" />

          {t.how.steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 130} className="relative text-center">
              <div className="relative mx-auto flex h-[4.2rem] w-[4.2rem] items-center justify-center">
                <span aria-hidden="true" className="absolute inset-0 rotate-45 border border-gold-400/60 bg-linen-100" />
                <span aria-hidden="true" className="absolute inset-2 rotate-45 border border-gold-300/40" />
                <span className="relative font-display text-2xl text-gold-600">{s.n}</span>
              </div>
              <h3 className="mt-7 font-display text-[1.55rem] font-normal text-ink-800">{s.title}</h3>
              <p className="mx-auto mt-3 max-w-xs text-[0.9rem] font-light leading-[1.9] text-ink-500">{s.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mx-auto mt-20 max-w-md">
          <Photo
            src="/artisan/nivex-poste-de-travail.jpg"
            alt={t.photos.poste}
            sizes="(min-width: 640px) 28rem, 88vw"
          />
        </Reveal>
      </div>
    </section>
  );
}

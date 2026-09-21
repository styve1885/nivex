import { Reveal } from "../Reveal";
import { Photo } from "../Photo";
import type { Dict } from "@/lib/i18n";

/** Section « métier » : la séquence de repassage d'une chemise, dans l'ordre. */
export function Protocol({ t }: { t: Dict }) {
  return (
    <section className="relative overflow-hidden bg-ink-900 py-28 text-linen-200 sm:py-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: "repeating-linear-gradient(45deg, var(--color-gold-200) 0 1px, transparent 1px 9px)",
      }} />
      <div aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[40rem] -translate-x-1/2 opacity-[0.1] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-gold-400), transparent 68%)" }} />

      <div className="relative mx-auto max-w-5xl px-7 sm:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow !text-gold-400">{t.protocol.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-linen-100 sm:text-5xl">
            {t.protocol.title}
          </h2>
          <p className="mt-6 text-[0.95rem] font-light leading-[1.95] text-linen-300/70">{t.protocol.lede}</p>
        </Reveal>

        <div className="mt-20 grid gap-14 lg:grid-cols-[1fr_17rem] lg:items-start lg:gap-14">
        <ol className="space-y-0">
          {t.protocol.steps.map((s, i) => (
            <Reveal key={s.n} as="li" delay={i * 60}
              className="group grid grid-cols-[3.5rem_1fr] items-baseline gap-5 border-t border-linen-200/10 py-7 transition-colors duration-500 hover:border-gold-400/40 sm:grid-cols-[5rem_11rem_1fr] sm:gap-8">
              <span className="font-display text-2xl font-light text-gold-500/70 transition-colors duration-500 group-hover:text-gold-400 sm:text-3xl">
                {s.n}
              </span>
              <h3 className="col-start-2 font-display text-xl text-linen-100 sm:text-[1.35rem]">{s.title}</h3>
              <p className="col-span-2 col-start-1 text-[0.9rem] font-light leading-[1.9] text-linen-300/65 sm:col-span-1 sm:col-start-3">
                {s.body}
              </p>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={240} className="mx-auto w-full max-w-sm lg:sticky lg:top-28 lg:max-w-none">
          <Photo
            src="/artisan/nivex-au-travail.jpg"
            alt={t.photos.travail}
            frameClassName="!border-gold-400/35"
            sizes="(min-width: 1024px) 17rem, 88vw"
          />
        </Reveal>
        </div>
      </div>
    </section>
  );
}

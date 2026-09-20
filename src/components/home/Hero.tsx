import Link from "next/link";
import { Lockup } from "../Logo";
import { ArrowIcon } from "../Icons";
import type { Dict } from "@/lib/i18n";

export function Hero({ t, locale }: { t: Dict; locale: "fr" | "en" }) {
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden pt-28 pb-20">
      {/* — Fond : lin chaud, deux halos d'or, trame textile — */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(120% 80% at 50% -10%, var(--color-linen-50) 0%, var(--color-linen-100) 45%, var(--color-linen-200) 100%)",
        }} />
        <div className="absolute -right-[15%] top-[8%] h-[38rem] w-[38rem] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-gold-200), transparent 65%)" }} />
        <div className="absolute -left-[18%] bottom-[-10%] h-[34rem] w-[34rem] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-gold-300), transparent 65%)" }} />
        {/* trame de tissage */}
        <div className="absolute inset-0 opacity-[0.045]" style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-ink-700) 0 1px, transparent 1px 4px)," +
            "repeating-linear-gradient(90deg, var(--color-ink-700) 0 1px, transparent 1px 4px)",
        }} />
        {/* cadre filet, comme sur le carton d'invitation */}
        <div className="absolute inset-4 border border-gold-300/35 sm:inset-7" />
        <div className="absolute inset-6 border border-gold-300/20 sm:inset-9" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-8 text-center sm:px-14">
        <p className="eyebrow animate-fade" style={{ animationDelay: "80ms" }}>{t.hero.eyebrow}</p>

        <div className="mt-9 flex justify-center animate-rise" style={{ animationDelay: "160ms" }}>
          <Lockup className="h-28 w-auto sm:h-36" priority />
        </div>

        <h1 className="mt-8 font-display text-[2.65rem] font-light leading-[1.06] tracking-tight text-ink-800 sm:text-6xl lg:text-[4.6rem]">
          <span className="block animate-rise" style={{ animationDelay: "260ms" }}>{t.hero.titleTop}</span>
          <span className="mt-1 block animate-rise italic gold-sheen" style={{ animationDelay: "380ms" }}>
            {t.hero.titleBottom}
          </span>
        </h1>

        <div className="rule-diamond mx-auto mt-9 max-w-xs animate-fade" style={{ animationDelay: "520ms" }} aria-hidden="true">
          <span className="text-[10px]">◆</span>
        </div>

        <p className="mx-auto mt-8 max-w-xl text-[0.98rem] font-light leading-[1.85] text-ink-500 animate-rise sm:text-base"
          style={{ animationDelay: "600ms" }}>
          {t.hero.lede}
        </p>

        <div className="mt-11 flex flex-col items-center justify-center gap-4 animate-rise sm:flex-row"
          style={{ animationDelay: "720ms" }}>
          <Link href={`/${locale}/reserver`} className="btn w-full sm:w-auto">
            {t.hero.ctaPrimary}<ArrowIcon />
          </Link>
          <Link href="#histoire" className="btn btn-ghost w-full sm:w-auto">{t.hero.ctaSecondary}</Link>
        </div>

        {/* Bandeau de l'offre — repris du cintre de porte */}
        <div className="mx-auto mt-12 max-w-md border border-gold-400/60 px-7 py-4 animate-fade"
          style={{ animationDelay: "860ms" }}>
          <p className="text-[11px] uppercase leading-relaxed tracking-[0.16em] text-gold-700">
            {t.hero.offer}
          </p>
          <p className="mt-2.5 text-[0.78rem] font-light leading-[1.7] text-ink-500">
            {t.pricing.firstFreeConditions}
          </p>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 animate-fade"
        style={{ animationDelay: "1100ms" }} aria-hidden="true">
        <span className="text-[9px] uppercase tracking-[0.3em] text-ink-400">{t.hero.scroll}</span>
        <span className="h-10 w-px overflow-hidden bg-gold-300/50">
          <span className="block h-4 w-px bg-gold-600"
            style={{ animation: "rise 2.2s var(--ease-silk) infinite" }} />
        </span>
      </div>
    </section>
  );
}

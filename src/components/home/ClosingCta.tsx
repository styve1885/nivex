import Link from "next/link";
import { Reveal } from "../Reveal";
import { Mark } from "../Logo";
import { ArrowIcon } from "../Icons";
import type { Dict } from "@/lib/i18n";

export function ClosingCta({ t, locale }: { t: Dict; locale: "fr" | "en" }) {
  return (
    <section className="relative overflow-hidden bg-linen-200 py-28 sm:py-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-6 inset-y-8 border border-gold-400/30 sm:inset-x-12 sm:inset-y-10" />
        <div className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-gold-200), transparent 65%)" }} />
      </div>

      <Reveal className="relative mx-auto max-w-2xl px-8 text-center">
        <Mark className="mx-auto h-14 w-auto" />
        <h2 className="mt-8 font-display text-4xl font-light leading-tight text-ink-800 sm:text-[3.2rem]">
          {t.cta.title}
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[0.97rem] font-light leading-[1.95] text-ink-500">{t.cta.body}</p>

        <div className="mt-10 flex flex-col items-center gap-5">
          <Link href={`/${locale}/reserver`} className="btn w-full sm:w-auto">
            {t.cta.button}<ArrowIcon />
          </Link>
          <p className="text-[0.85rem] text-ink-400">
            {t.cta.or}{" "}
            <a href={t.brand.phoneHref} className="border-b border-gold-400 pb-0.5 text-ink-700 transition-colors hover:text-gold-700">
              {t.brand.phone}
            </a>
          </p>
        </div>
      </Reveal>
    </section>
  );
}

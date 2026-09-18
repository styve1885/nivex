import Link from "next/link";
import { Crest, Wordmark } from "./Logo";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";
import { contactEmail, contactEmailHref } from "@/lib/brand";

export function SiteFooter({ t, locale, settings }: { t: Dict; locale: "fr" | "en"; settings: Settings }) {
  const year = new Date().getFullYear();
  const home = `/${locale}`;

  const openDays = settings.hours.filter((h) => h.enabled);
  const grouped = openDays.map((h) => ({
    label: t.daysShort[h.day],
    range: `${h.open} – ${h.close}`,
  }));

  return (
    <footer className="relative overflow-hidden bg-ink-900 text-linen-200">
      <div aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, var(--color-gold-300), transparent 68%)" }} />
      <div aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, var(--color-gold-400), transparent 68%)" }} />

      <div className="relative mx-auto max-w-7xl px-6 py-20 sm:px-10">
        <div className="grid gap-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Crest className="h-16 w-16 text-gold-400" />
            <Wordmark as="div" className="mt-5 text-2xl text-linen-100" />
            <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-gold-400">{t.footer.tagline}</p>
            <p className="mt-6 max-w-xs font-display text-lg italic leading-relaxed text-linen-300/80">
              “{t.story.quote}”
            </p>
          </div>

          <div>
            <h3 className="mb-5 text-[10px] uppercase tracking-[0.26em] text-gold-400">{t.nav.contact}</h3>
            <ul className="space-y-3 text-sm text-linen-300/85">
              <li><a href={t.brand.phoneHref} className="transition-colors hover:text-gold-300">{t.brand.phone}</a></li>
              <li><a href={contactEmailHref(settings)} className="break-all transition-colors hover:text-gold-300">{contactEmail(settings)}</a></li>
              <li className="pt-2 text-linen-300/60">{t.brand.region}</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-[10px] uppercase tracking-[0.26em] text-gold-400">{t.footer.hours}</h3>
            <ul className="space-y-2 text-sm text-linen-300/85">
              {grouped.length === 0 && <li className="text-linen-300/60">{t.closed}</li>}
              {grouped.map((g) => (
                <li key={g.label} className="flex justify-between gap-4 tabular-nums">
                  <span className="text-linen-300/60">{g.label}</span><span>{g.range}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-[10px] uppercase tracking-[0.26em] text-gold-400">{t.footer.zone}</h3>
            <p className="text-sm leading-relaxed text-linen-300/85">
              {locale === "en" ? settings.serviceArea.labelEn : settings.serviceArea.labelFr}
            </p>
            <Link href={`${home}/reserver`}
              className="mt-6 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gold-300 transition-colors hover:text-gold-200">
              {t.nav.book} →
            </Link>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-linen-200/10 pt-8 text-[11px] text-linen-300/45 sm:flex-row">
          <p>© {year} NIVEX. {t.footer.rights}.</p>
          <p className="hidden items-center gap-2 lg:flex">
            <span className="text-gold-400/70">◆</span> {t.footer.craft}
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href={`${home}/tarifs`} className="transition-colors hover:text-gold-300">{t.nav.pricing}</Link>
            <Link href={`${home}/confidentialite`} className="transition-colors hover:text-gold-300">{t.footer.legal}</Link>
            <Link href={`${home}/conditions`} className="transition-colors hover:text-gold-300">{t.footer.terms}</Link>
            <Link href="/admin" className="transition-colors hover:text-gold-300">{t.footer.admin}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

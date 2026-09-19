"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "./Logo";
import type { Dict } from "@/lib/i18n";

export function SiteHeader({ t, locale }: { t: Dict; locale: "fr" | "en" }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const home = `/${locale}`;
  const links = [
    { href: `${home}#histoire`, label: t.nav.story },
    { href: `${home}#prestations`, label: t.nav.services },
    { href: `${home}#deroulement`, label: t.nav.how },
    { href: `${home}#questions`, label: t.nav.faq },
    { href: `${home}/tarifs`, label: t.nav.pricing },
    { href: `${home}#contact`, label: t.nav.contact },
  ];

  // Le sélecteur de langue conserve la page courante.
  const other = locale === "fr" ? "en" : "fr";
  const swapped = pathname.replace(/^\/(fr|en)/, `/${other}`);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-700 ${
          scrolled || open
            ? "bg-linen-100/92 backdrop-blur-xl border-b border-gold-200/70 py-3"
            : "bg-transparent py-6"
        }`}
        style={{ transitionTimingFunction: "var(--ease-silk)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href={home} className="group flex items-center gap-3" aria-label="NIVEX">
            <Mark className={`transition-all duration-700 ${scrolled ? "h-8" : "h-11"} w-auto`} />
            <span className="flex flex-col">
              <Wordmark className={`text-ink-800 transition-all duration-700 ${scrolled ? "text-lg" : "text-xl"}`} />
              <span className="mt-0.5 hidden text-[8.5px] uppercase tracking-[0.3em] text-ink-400 sm:block">
                {t.brand.tagline}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex xl:gap-8" aria-label={t.nav.home}>
            {links.map((l) => (
              <Link key={l.href} href={l.href}
                className="group relative whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-ink-600 transition-colors hover:text-ink-900">
                {l.label}
                <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-gold-500 transition-all duration-500 group-hover:w-full"
                  style={{ transitionTimingFunction: "var(--ease-silk)" }} />
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link href={swapped} prefetch={false}
              className="hidden text-[10px] uppercase tracking-[0.22em] text-ink-500 transition-colors hover:text-gold-600 sm:block"
              hrefLang={other} aria-label={other === "en" ? "Switch to English" : "Passer en français"}>
              {other === "en" ? "EN" : "FR"}
            </Link>
            <span className="hidden h-3 w-px bg-gold-300 sm:block" aria-hidden="true" />
            <Link href={`${home}/reserver`} className="btn hidden !py-3 !px-6 !text-[10px] sm:inline-flex">
              {t.nav.book}
            </Link>

            <button onClick={() => setOpen((v) => !v)}
              className="relative z-50 flex h-9 w-9 flex-col items-center justify-center gap-[5px] lg:hidden"
              aria-label="Menu" aria-expanded={open}>
              <span className={`h-px w-6 bg-ink-700 transition-all duration-500 ${open ? "translate-y-[6px] rotate-45" : ""}`} />
              <span className={`h-px w-6 bg-ink-700 transition-all duration-300 ${open ? "opacity-0" : ""}`} />
              <span className={`h-px w-6 bg-ink-700 transition-all duration-500 ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Menu mobile plein écran */}
      <div
        className={`fixed inset-0 z-40 bg-linen-100 transition-all duration-700 lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ transitionTimingFunction: "var(--ease-silk)" }}
      >
        <nav className="flex h-full flex-col items-center justify-center gap-4 px-8">
          {links.map((l, i) => (
            <Link key={l.href} href={l.href}
              className="font-display text-4xl leading-none text-ink-800 transition-colors hover:text-gold-600"
              style={{ animation: open ? `rise .7s var(--ease-silk) ${i * 70 + 100}ms both` : "none" }}>
              {l.label}
            </Link>
          ))}
          <div className="rule-diamond my-8 w-32" aria-hidden="true">
            <span className="text-xs">◆</span>
          </div>
          <Link href={`${home}/reserver`} className="btn">{t.nav.book}</Link>
          <a href={t.brand.phoneHref} className="mt-6 text-sm tracking-wide text-ink-500">{t.brand.phone}</a>
          <Link href={swapped} prefetch={false} hrefLang={other}
            className="mt-8 text-[11px] uppercase tracking-[0.24em] text-gold-600">
            {other === "en" ? "English" : "Français"}
          </Link>
        </nav>
      </div>
    </>
  );
}

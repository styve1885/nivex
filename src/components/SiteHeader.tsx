"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Wordmark } from "./Logo";
import type { Dict } from "@/lib/i18n";

export function SiteHeader({ t, locale }: { t: Dict; locale: "fr" | "en" }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  /* Le menu ouvert couvre toute la page. Elle ne défile plus, et ce qu'il
     cache ne se tabule ni ne se lit plus : seuls l'en-tête, où vit le bouton
     qui le referme, et le menu lui-même restent vivants. La main passe au
     premier lien ; Échap referme et la rend au bouton. Passer en grand
     écran referme aussi : le menu et son bouton y disparaissent, et la page
     resterait figée derrière. */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const release = inertAllBut([header.current, menu.current]);
    menu.current?.querySelector("a")?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => { if (wide.matches) setOpen(false); };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = "";
      release();
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  /* Un lien de section ne change pas de chemin, et l'effet plus haut ne se
     déclenche pas : c'est le geste lui-même qui referme le menu, sans quoi
     il resterait devant la section demandée. */
  const close = () => setOpen(false);

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
        ref={header}
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-700 ${
          scrolled || open
            ? "bg-linen-100/92 backdrop-blur-xl border-b border-gold-200/70 py-3"
            : "bg-transparent py-6"
        }`}
        style={{ transitionTimingFunction: "var(--ease-silk)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href={home} className="group flex items-center" aria-label="NIVEX">
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
            <LangLink to={swapped} lang={other}
              className="hidden text-[10px] uppercase tracking-[0.22em] text-ink-500 transition-colors hover:text-gold-600 sm:block"
              label={other === "en" ? "Switch to English" : "Passer en français"}>
              {other === "en" ? "EN" : "FR"}
            </LangLink>
            <span className="hidden h-3 w-px bg-gold-300 sm:block" aria-hidden="true" />
            <Link href={`${home}/reserver`} className="btn hidden !py-3 !px-6 !text-[10px] sm:inline-flex">
              {t.nav.book}
            </Link>

            <button ref={toggle} onClick={() => setOpen((v) => !v)}
              className="relative z-50 flex h-9 w-9 flex-col items-center justify-center gap-[5px] lg:hidden"
              aria-label="Menu" aria-expanded={open} aria-controls="menu-mobile">
              <span className={`h-px w-6 bg-ink-700 transition-all duration-500 ${open ? "translate-y-[6px] rotate-45" : ""}`} />
              <span className={`h-px w-6 bg-ink-700 transition-all duration-300 ${open ? "opacity-0" : ""}`} />
              <span className={`h-px w-6 bg-ink-700 transition-all duration-500 ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Menu mobile plein écran. Fermé, il n'est pas seulement transparent :
          inerte, il sort de l'ordre de tabulation et de ce que lisent les
          lecteurs d'écran, sans couper le fondu. */}
      <div
        ref={menu}
        id="menu-mobile"
        inert={!open}
        className={`fixed inset-0 z-40 bg-linen-100 transition-all duration-700 lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ transitionTimingFunction: "var(--ease-silk)" }}
      >
        <nav className="flex h-full flex-col items-center justify-center gap-4 px-8">
          {links.map((l, i) => (
            <Link key={l.href} href={l.href} onClick={close}
              className="font-display text-4xl leading-none text-ink-800 transition-colors hover:text-gold-600"
              style={{ animation: open ? `rise .7s var(--ease-silk) ${i * 70 + 100}ms both` : "none" }}>
              {l.label}
            </Link>
          ))}
          <div className="rule-diamond my-8 w-32" aria-hidden="true">
            <span className="text-xs">◆</span>
          </div>
          <Link href={`${home}/reserver`} onClick={close} className="btn">{t.nav.book}</Link>
          <a href={t.brand.phoneHref} onClick={close} className="mt-6 text-sm tracking-wide text-ink-500">{t.brand.phone}</a>
          <LangLink to={swapped} lang={other} onClick={close}
            className="mt-8 text-[11px] uppercase tracking-[0.24em] text-gold-600">
            {other === "en" ? "English" : "Français"}
          </LangLink>
        </nav>
      </div>
    </>
  );
}

/**
 * Rend inertes les voisins de l'en-tête et du menu, et rend de quoi les
 * réveiller. Ne touche ni aux scripts, ni à l'annonceur de navigation de
 * Next, ni à un élément déjà inerte qu'il n'a pas endormi lui-même.
 */
function inertAllBut(keep: (HTMLElement | null)[]): () => void {
  const kept = keep.filter((el): el is HTMLElement => el !== null);
  const asleep: HTMLElement[] = [];
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || el.inert) continue;
    if (/^(SCRIPT|STYLE|LINK|TEMPLATE|NEXT-ROUTE-ANNOUNCER)$/.test(el.tagName)) continue;
    if (kept.some((k) => el.contains(k))) continue;
    el.inert = true;
    asleep.push(el);
  }
  return () => asleep.forEach((el) => { el.inert = false; });
}

type LangLinkProps = {
  to: string;
  lang: "fr" | "en";
  className: string;
  label?: string;
  onClick?: () => void;
  children: ReactNode;
};

/* Le lien de langue garde aussi ce que porte l'adresse : la formule choisie
   depuis Tarifs (?formule=), l'avis d'une visite déplacée, la clé du lien
   « ne pas compter ». `useSearchParams` suspend le rendu d'une page faite
   d'avance : le même lien, sans interrogation, tient la place jusqu'à
   l'hydratation, et le reste de l'en-tête part quand même dans le HTML. */
function LangLink(props: LangLinkProps) {
  return (
    <Suspense fallback={<LangAnchor {...props} />}>
      <LangWithQuery {...props} />
    </Suspense>
  );
}

function LangWithQuery({ to, ...rest }: LangLinkProps) {
  const query = useSearchParams().toString();
  return <LangAnchor to={query ? `${to}?${query}` : to} {...rest} />;
}

function LangAnchor({ to, lang, className, label, onClick, children }: LangLinkProps) {
  return (
    <Link href={to} prefetch={false} hrefLang={lang} className={className} aria-label={label} onClick={onClick}>
      {children}
    </Link>
  );
}

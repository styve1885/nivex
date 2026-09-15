import Link from "next/link";
import type { Dict, LegalDoc } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";
import { CANCEL_WINDOW_HOURS, contactEmail, contactEmailHref, PHONE, PHONE_HREF } from "@/lib/brand";
import { siteOrigin } from "@/lib/google";
import { minutesToText, formatMoney } from "@/lib/time";

/**
 * Rendu d'un document légal.
 *
 * Le texte vit dans les dictionnaires ; les valeurs qui peuvent changer —
 * taux horaire, durée minimale, préavis, zone desservie, adresse de contact —
 * y figurent en accolades et sont remplies ici, à partir des réglages en
 * vigueur. Un document légal qui répète une valeur en dur devient faux dès
 * qu'on la modifie ailleurs.
 */

/** Date de dernière révision des deux documents. */
export const LEGAL_UPDATED = "2026-09-15";

function values(locale: "fr" | "en", s: Settings): Record<string, string> {
  const days = locale === "en" ? "days" : "jours";
  const hours = locale === "en" ? "hours" : "heures";
  return {
    email: contactEmail(s),
    phone: PHONE,
    site: siteOrigin().replace(/^https?:\/\//, ""),
    zone: locale === "en" ? s.serviceArea.labelEn : s.serviceArea.labelFr,
    rate: formatMoney(s.hourlyRate, s.currency, locale),
    min: minutesToText(s.minMinutes, locale),
    lead: `${s.leadHours} ${hours}`,
    cancel: `${CANCEL_WINDOW_HOURS} ${hours}`,
    horizon: `${s.horizonDays} ${days}`,
  };
}

const LINK = "underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-700";

/** Découpe le texte sur les accolades, et rend joignables celles qui le sont. */
function fill(text: string, v: Record<string, string>, s: Settings): React.ReactNode[] {
  return text.split(/(\{[a-z]+\})/g).map((part, i) => {
    if (part === "{email}") {
      return <a key={i} href={contactEmailHref(s)} className={LINK}>{v.email}</a>;
    }
    if (part === "{phone}") {
      return <a key={i} href={PHONE_HREF} className={LINK}>{v.phone}</a>;
    }
    const named = /^\{([a-z]+)\}$/.exec(part);
    if (named) return v[named[1]] ?? part;
    return part;
  });
}

function slug(index: number): string {
  return `article-${index + 1}`;
}

export function LegalDocument({
  doc, t, locale, settings, related,
}: {
  doc: LegalDoc;
  t: Dict;
  locale: "fr" | "en";
  settings: Settings;
  related: { href: string; label: string };
}) {
  const v = values(locale, settings);
  const updated = new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${LEGAL_UPDATED}T12:00:00Z`));

  return (
    <div className="bg-linen-100 pb-28 pt-36 sm:pt-40">
      <div className="mx-auto max-w-3xl px-7 sm:px-10">
        <header>
          <p className="eyebrow">{doc.eyebrow}</p>
          <h1 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-7 text-[1.02rem] font-light leading-[1.9] text-ink-600">
            {fill(doc.lede, v, settings)}
          </p>
          <p className="mt-8 text-[11px] uppercase tracking-[0.22em] text-ink-500">
            {t.legal.updatedLabel} — <time dateTime={LEGAL_UPDATED}>{updated}</time>
          </p>
        </header>

        <div className="rule-diamond mt-12" aria-hidden="true"><span className="text-[10px]">◆</span></div>

        <nav className="paper mt-12 px-7 py-8 sm:px-9" aria-labelledby="sommaire">
          <h2 id="sommaire" className="eyebrow">{t.legal.summary}</h2>
          <ol className="mt-5 space-y-2.5">
            {doc.sections.map((section, i) => (
              <li key={section.title} className="flex gap-4 text-[0.92rem] font-light leading-snug">
                <span aria-hidden="true" className="w-6 flex-none tabular-nums text-gold-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <a href={`#${slug(i)}`} className={`text-ink-600 ${LINK}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-20 space-y-16">
          {doc.sections.map((section, i) => (
            <section key={section.title} id={slug(i)} className="scroll-mt-28">
              <h2 className="font-display text-[1.6rem] font-normal leading-snug text-ink-800 sm:text-[1.8rem]">
                <span aria-hidden="true" className="mr-4 text-[0.95rem] tabular-nums text-gold-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.title}
              </h2>

              {section.body.map((paragraph, j) => (
                <p key={j} className="mt-5 text-[0.95rem] font-light leading-[1.95] text-ink-600">
                  {fill(paragraph, v, settings)}
                </p>
              ))}

              {section.list && (
                <ul className="mt-6 space-y-4 border-l border-gold-300/60 pl-6">
                  {section.list.map((item, j) => (
                    <li key={j} className="text-[0.95rem] font-light leading-[1.9] text-ink-600">
                      {fill(item, v, settings)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <footer className="mt-24 border-t border-gold-300/40 pt-10">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">{t.legal.readAlso}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link href={related.href} className={`font-display text-xl text-ink-800 ${LINK}`}>
              {related.label}
            </Link>
            <Link
              href={`/${locale}`}
              className="text-[11px] uppercase tracking-[0.2em] text-gold-700 transition-colors hover:text-gold-600"
            >
              {t.booking.success.home} →
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

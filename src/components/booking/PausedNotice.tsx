import Link from "next/link";
import { PHONE, PHONE_HREF } from "@/lib/brand";
import type { Dict } from "@/lib/i18n";

/**
 * La prise de rendez-vous en pause.
 *
 * La pause est la seule vraie fermeture de la maison, et elle se dit dès
 * l'arrivée sur la page, avec le numéro à composer : laisser choisir des
 * prestations, une adresse et une heure pour refuser à la toute fin, c'est
 * perdre le client. La création, elle, garde son propre refus — c'est elle
 * qui fait foi, y compris pour un onglet ouvert avant la pause.
 */
export function PausedNotice({ t, locale, title }: { t: Dict; locale: "fr" | "en"; title: string }) {
  return (
    <div className="mx-auto max-w-2xl px-7 py-16 text-center sm:px-10 sm:py-20">
      <header>
        <p className="eyebrow">{t.brand.tagline}</p>
        <h1 className="mt-4 font-display text-4xl font-light text-ink-800 sm:text-5xl">{title}</h1>
      </header>

      <div className="paper mt-10 p-8 sm:p-10">
        <p className="mx-auto max-w-md text-[0.95rem] font-light leading-[1.9] text-ink-600">{t.booking.errors.paused}</p>
        <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a href={PHONE_HREF} className="btn w-full sm:w-auto">{PHONE}</a>
          <Link href={`/${locale}`} className="btn btn-ghost w-full sm:w-auto">{t.booking.success.home}</Link>
        </div>
      </div>
    </div>
  );
}

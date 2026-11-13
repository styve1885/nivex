import { Reveal } from "../Reveal";
import { AreaList, AreaMissing } from "../AreaList";
import type { Dict } from "@/lib/i18n";
import type { ZonePolicy } from "@/lib/travel";
import { servedAreas } from "@/lib/areas";

/**
 * « Secteurs desservis », juste avant les tarifs : les quartiers de
 * l'artisan, Montréal puis la Rive-Sud, et l'invitation à écrire pour les
 * autres. Courte, centrée, lisible au téléphone : des noms, aucun code
 * postal.
 *
 * Tenue par la grille de la réservation (lib/areas.ts) : un quartier refusé
 * ne paraît pas, et sans aucun quartier la section disparaît.
 */
export function Areas({ t, locale, policy }: {
  t: Pick<Dict, "areas">; locale: "fr" | "en"; policy: ZonePolicy;
}) {
  if (!servedAreas(policy).length) return null;

  return (
    <section id="secteurs" className="scroll-mt-24 bg-linen-100 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.areas.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.areas.title}
          </h2>
        </Reveal>
        <Reveal delay={90} className="mt-12">
          <AreaList t={t.areas} locale={locale} policy={policy} />
        </Reveal>
        <Reveal delay={150} className="mt-10 text-center">
          <AreaMissing t={t.areas} href="#contact" />
        </Reveal>
      </div>
    </section>
  );
}

import { Reveal } from "../Reveal";
import { ServiceIcon } from "../Icons";
import { perHour } from "@/lib/pricing";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

/**
 * Les prestations, et ce qu'on en traite en une heure.
 *
 * La cadence n'est pas écrite dans le texte : elle se déduit des minutes
 * réglées par l'artisan, comme celle de la page Tarifs. Le site promet de
 * tenir le volume annoncé — il ne peut donc pas l'annoncer d'un côté et le
 * calculer de l'autre.
 */
export function Services({ t, settings }: { t: Dict; settings: Settings }) {
  const cadence = (key: string) => {
    const svc = settings.services.find((x) => x.key === key && x.enabled);
    return svc ? String(perHour(svc.minutesPerUnit)) : "";
  };

  return (
    <section id="prestations" className="scroll-mt-24 bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-7 sm:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t.services.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.services.title}
          </h2>
          <p className="mt-6 text-[0.97rem] font-light leading-[1.95] text-ink-500">{t.services.lede}</p>
        </Reveal>

        <div className="mt-20 grid gap-px overflow-hidden border border-gold-300/40 bg-gold-300/30 sm:grid-cols-2 lg:grid-cols-3">
          {t.services.items.map((s, i) => (
            <Reveal key={s.name} as="article" delay={i * 70}
              className="group relative bg-linen-50 p-9 transition-colors duration-700 hover:bg-linen-100">
              <span aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gold-500 transition-transform duration-700 group-hover:scale-x-100"
                style={{ transitionTimingFunction: "var(--ease-silk)" }} />
              <ServiceIcon name={s.icon} className="h-8 w-8 text-gold-500 transition-transform duration-700 group-hover:-translate-y-1" />
              <h3 className="mt-6 font-display text-[1.45rem] font-normal text-ink-800">{s.name}</h3>
              <p className="mt-3 text-[0.9rem] font-light leading-[1.9] text-ink-500">{s.body}</p>
              <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-gold-600">
                {s.detail.replace("{qty}", cadence(s.serviceKey))}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";
import { Reveal } from "../Reveal";
import { ServiceIcon } from "../Icons";
import type { Dict } from "@/lib/i18n";

/**
 * Les prestations, et ce qui passe entre nos mains.
 *
 * Depuis le 23 octobre 2026, une seule section : cinq cartes d'une phrase,
 * puis les photos de la galerie, sans légende. Aucune carte n'annonce de
 * quantité — la capacité d'une séance se dit ailleurs, d'un seul chiffre
 * (`capacityPieces`) — et aucune ne dépend de Réglages : elles disent le
 * soin, pas une prestation que le tunnel réserverait.
 *
 * Les libellés des photos vivent dans `gallery.photos`, repérés par la même
 * clé que ci-dessous ; seul leur texte de remplacement sert encore. Les
 * fichiers sont en format portrait : le cadre impose un rapport 2/3 et
 * recadre au centre.
 */
const PHOTOS = [
  { key: "chemises",  src: "/travaux/surchemises.jpg",         w: 1000, h: 1500 },
  { key: "veston",    src: "/travaux/veston-noir.jpg",         w: 1000, h: 1500 },
  { key: "gilet",     src: "/travaux/gilet-carreaux.jpg",      w: 1000, h: 1500 },
  { key: "ceremonie", src: "/travaux/smoking-bleu.jpg",        w: 1000, h: 1500 },
  { key: "uniformes", src: "/travaux/uniformes-scolaires.jpg", w: 858,  h: 1040 },
] as const;

export function Services({ t }: { t: Dict }) {
  return (
    <section id="prestations" className="scroll-mt-24 bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-7 sm:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t.services.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.services.title}
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden border border-gold-300/40 bg-gold-300/30 sm:grid-cols-2 lg:grid-cols-5">
          {t.services.items.map((s, i) => (
            <Reveal key={s.name} as="article" delay={i * 70}
              className="group relative bg-linen-50 p-8 transition-colors duration-700 hover:bg-linen-100 sm:last:col-span-2 lg:last:col-span-1">
              <span aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gold-500 transition-transform duration-700 group-hover:scale-x-100"
                style={{ transitionTimingFunction: "var(--ease-silk)" }} />
              <ServiceIcon name={s.icon} className="h-7 w-7 text-gold-500 transition-transform duration-700 group-hover:-translate-y-1" />
              <h3 className="mt-5 font-display text-[1.3rem] font-normal leading-snug text-ink-800">{s.name}</h3>
              <p className="mt-2.5 text-[0.88rem] font-light leading-[1.8] text-ink-500">{s.body}</p>
            </Reveal>
          ))}
        </div>

        {/* Les pièces reçues, en images seulement. Au téléphone, la rangée
            défile latéralement plutôt que de s'empiler : la section reste
            courte. */}
        <ul className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
          {PHOTOS.map((photo, i) => (
            <Reveal key={photo.key} as="li" delay={i * 60} className="w-[42%] flex-none snap-start sm:w-auto">
              <div className="overflow-hidden border border-gold-300/50 bg-linen-100">
                <Image
                  src={photo.src}
                  alt={t.gallery.photos[photo.key].alt}
                  width={photo.w}
                  height={photo.h}
                  sizes="(min-width: 1024px) 18vw, (min-width: 640px) 19vw, 42vw"
                  className="aspect-[2/3] w-full object-cover transition-transform duration-[1.2s] hover:scale-[1.04]"
                  style={{ transitionTimingFunction: "var(--ease-silk)" }}
                />
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

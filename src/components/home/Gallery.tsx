import Image from "next/image";
import { Reveal } from "../Reveal";
import type { Dict } from "@/lib/i18n";

/**
 * Les pièces que nous traitons.
 *
 * Les libellés vivent dans les dictionnaires, repérés par la même clé que
 * ci-dessous : l'ordre de la grille peut changer sans déplacer les textes.
 * Les fichiers sont en format portrait ; le cadre impose un rapport 2/3 et
 * recadre au centre, de sorte qu'une photo d'une autre proportion s'aligne
 * sur les autres.
 */
const PHOTOS = [
  { key: "gilet",     src: "/travaux/gilet-carreaux.jpg",      w: 1000, h: 1500 },
  { key: "veston",    src: "/travaux/veston-noir.jpg",         w: 1000, h: 1500 },
  { key: "chemises",  src: "/travaux/surchemises.jpg",         w: 1000, h: 1500 },
  { key: "ceremonie", src: "/travaux/smoking-bleu.jpg",        w: 1000, h: 1500 },
  { key: "uniformes", src: "/travaux/uniformes-scolaires.jpg", w: 858,  h: 1040 },
] as const;

export function Gallery({ t }: { t: Dict }) {
  return (
    <section id="pieces" className="scroll-mt-24 bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-7 sm:px-10">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">{t.gallery.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.gallery.title}
          </h2>
          <p className="mt-6 text-[0.97rem] font-light leading-[1.95] text-ink-500">{t.gallery.lede}</p>
        </Reveal>

        <ul className="mt-14 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {PHOTOS.map((photo, i) => {
            const text = t.gallery.photos[photo.key];
            return (
              <Reveal key={photo.key} as="li" delay={i * 60}>
                <div className="overflow-hidden border border-gold-300/50 bg-linen-100">
                  <Image
                    src={photo.src}
                    alt={text.alt}
                    width={photo.w}
                    height={photo.h}
                    sizes="(min-width: 1024px) 18vw, (min-width: 640px) 30vw, 45vw"
                    className="aspect-[2/3] w-full object-cover transition-transform duration-[1.2s] hover:scale-[1.04]"
                    style={{ transitionTimingFunction: "var(--ease-silk)" }}
                  />
                </div>
                <h3 className="mt-4 font-display text-[1.05rem] leading-snug text-ink-800">{text.name}</h3>
                <p className="mt-1.5 text-[0.82rem] font-light leading-[1.7] text-ink-500">{text.detail}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

import Image from "next/image";
import { Reveal } from "../Reveal";
import type { Dict } from "@/lib/i18n";

/**
 * Avant / après, en deux photos entières.
 *
 * Un curseur de comparaison semblait plus vivant, mais il suppose deux
 * cadrages jumeaux : il découpe une image par-dessus l'autre, et le moindre
 * décalage de l'appareil fait sauter le vêtement à la jointure. Ces photos
 * ont été prises à main levée, à des moments différents — les montrer
 * entières, côte à côte, est la seule façon honnête de les présenter.
 *
 * L'œil compare mieux deux images complètes qu'une image coupée, de toute
 * façon : le col, l'épaule et l'ourlet se lisent d'un coup, au lieu d'être
 * tranchés au milieu.
 */
function Pair({ item, labels }: {
  item: { key: string; name: string; altBefore: string; altAfter: string };
  labels: { before: string; after: string };
}) {
  const shot = (side: "avant" | "apres", alt: string, label: string) => (
    <div className="relative overflow-hidden bg-linen-200">
      <div className="relative aspect-[3/4]">
        <Image
          src={`/images/avant-apres/${item.key}-${side}.jpg`}
          alt={alt}
          fill sizes="(min-width: 1024px) 25vw, 50vw"
          loading="lazy"
          className="object-cover"
        />
      </div>
      <span className="absolute left-2.5 top-2.5 bg-ink-800/75 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-linen-100 sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
        {label}
      </span>
    </div>
  );

  return (
    <figure className="m-0">
      {/* Un seul filet d'or entre les deux : la séparation se voit sans
          qu'on ait besoin d'une bordure autour de chaque photo. */}
      <div className="grid grid-cols-2 gap-px border border-gold-300/50 bg-gold-300/50">
        {shot("avant", item.altBefore, labels.before)}
        {shot("apres", item.altAfter, labels.after)}
      </div>
      <figcaption className="mt-3.5 text-center text-[0.88rem] font-light text-ink-600">{item.name}</figcaption>
    </figure>
  );
}

export function BeforeAfter({ t }: { t: Dict }) {
  return (
    <section id="avant-apres" className="scroll-mt-24 bg-linen-100 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-7 sm:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t.beforeAfter.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.beforeAfter.title}
          </h2>
          <p className="mt-6 text-[0.97rem] font-light leading-[1.95] text-ink-500">{t.beforeAfter.lede}</p>
        </Reveal>

        {/* Une paire par rangée au téléphone, deux à l'écran large : chaque
            paire vaut deux photos, elle occupe donc la place de deux. */}
        <div className="mt-16 grid gap-10 sm:gap-8 lg:grid-cols-2">
          {t.beforeAfter.items.map((item, i) => (
            <Reveal key={item.key} delay={i * 70}>
              <Pair item={item} labels={t.beforeAfter.labels} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Le bandeau pleine largeur, et la phrase qu'il porte. */
export function BeforeAfterBanner({ t }: { t: Dict }) {
  return (
    <section className="relative isolate">
      <div className="relative h-[46vh] min-h-[280px] w-full sm:h-[56vh]">
        <Image
          src="/images/avant-apres/bandeau-penderie-16x9.jpg"
          alt={t.beforeAfter.bannerAlt}
          fill sizes="100vw" loading="lazy"
          className="object-cover object-center"
        />
        {/* Un voile d'encre, assez dense pour que la phrase reste lisible
            quelle que soit la portion d'image qui tombe derrière elle. */}
        <div aria-hidden="true" className="absolute inset-0 bg-ink-900/35" />
        <div className="absolute inset-0 flex items-end justify-center p-8 sm:items-center sm:p-12">
          <p className="max-w-xl text-center font-display text-[2rem] font-light leading-tight text-linen-50 drop-shadow-[0_1px_12px_rgba(20,17,13,0.5)] sm:text-5xl">
            {t.beforeAfter.banner}
          </p>
        </div>
      </div>
    </section>
  );
}

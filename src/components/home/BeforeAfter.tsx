"use client";

import { useCallback, useId, useRef, useState } from "react";
import Image from "next/image";
import { Reveal } from "../Reveal";
import type { Dict } from "@/lib/i18n";

/**
 * Curseur de comparaison « avant / après ».
 *
 * Les deux photos sont cadrées à l'identique : la seconde se découpe à la
 * position du curseur et laisse voir la première en dessous. Rien ne se
 * déplace, rien ne se redimensionne — seul le découpage bouge, ce qui tient
 * à soixante images par seconde même sur un téléphone modeste.
 *
 * La poignée est un vrai curseur de formulaire, transparent et étendu sur
 * toute la surface : le doigt l'attrape n'importe où sur la photo, le
 * clavier la déplace avec les flèches, et les lecteurs d'écran annoncent
 * une valeur de zéro à cent. Rien de tout cela n'aurait été gratuit avec
 * un gestionnaire d'événements maison.
 */
function Slider({ item, labels }: {
  item: { key: string; name: string; altBefore: string; altAfter: string };
  labels: { before: string; after: string; instruction: string };
}) {
  const [pos, setPos] = useState(50);
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);

  /* La barre suit le curseur sans repasser par React à chaque pixel. */
  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPos(Number(e.target.value));
  }, []);

  return (
    <figure className="m-0">
      <div ref={frame} className="group relative overflow-hidden border border-gold-300/50 bg-linen-200">
        <div className="relative aspect-[3/4]">
          {/* — Avant : le fond, toujours entier — */}
          <Image
            src={`/images/avant-apres/${item.key}-avant.jpg`}
            alt={item.altBefore}
            fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            loading="lazy"
            className="object-cover"
          />

          {/* — Après : découpé à la position du curseur — */}
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
            <Image
              src={`/images/avant-apres/${item.key}-apres.jpg`}
              alt={item.altAfter}
              fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              loading="lazy"
              className="object-cover"
            />
          </div>

          {/* — Étiquettes — */}
          <span className="pointer-events-none absolute left-3 top-3 bg-ink-800/75 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-linen-100">
            {labels.before}
          </span>
          <span className="pointer-events-none absolute right-3 top-3 bg-ink-800/75 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-linen-100">
            {labels.after}
          </span>

          {/* — La ligne de partage et sa poignée — */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-linen-50/90 shadow-[0_0_0_1px_rgba(31,27,22,0.25)]"
            style={{ left: `${pos}%` }}>
            <span className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gold-400 bg-linen-50 text-[0.7rem] tracking-[0.1em] text-gold-700 shadow-[0_2px_10px_rgba(31,27,22,0.22)]">
              ‹ ›
            </span>
          </div>

          {/* — La commande : invisible, mais c'est elle qu'on manipule — */}
          <input
            id={id} type="range" min={0} max={100} step={0.1} value={pos}
            onChange={onInput}
            aria-label={`${item.name} — ${labels.instruction}`}
            className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-500)]"
          />
        </div>
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

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {t.beforeAfter.items.map((item, i) => (
            <Reveal key={item.key} delay={i * 70}>
              <Slider item={item} labels={t.beforeAfter.labels} />
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

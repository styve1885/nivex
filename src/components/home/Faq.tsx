"use client";

import { useState } from "react";
import { Reveal } from "../Reveal";
import { perHour } from "@/lib/pricing";
import type { Dict } from "@/lib/i18n";
import type { Settings } from "@/lib/settings";

export function Faq({ t, settings }: { t: Dict; settings: Settings }) {
  const [open, setOpen] = useState<number | null>(0);

  /* La cadence citée dans une réponse doit être celle du moteur, sinon la
     foire aux questions contredit la grille deux écrans plus haut. */
  const shirt = settings.services.find((x) => x.key === "shirt" && x.enabled);
  const fill = (s: string) => s.replace("{shirts}", shirt ? String(perHour(shirt.minutesPerUnit)) : "");

  return (
    <section id="questions" className="scroll-mt-24 bg-linen-100 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-7 sm:px-10">
        <Reveal className="text-center">
          <p className="eyebrow">{t.faq.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">{t.faq.title}</h2>
        </Reveal>

        <dl className="mt-16">
          {t.faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 50} className="border-b border-gold-300/40 first:border-t">
                <dt>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    className="flex w-full items-start justify-between gap-6 py-6 text-left transition-colors hover:text-gold-700"
                  >
                    <span className="font-display text-[1.25rem] font-normal leading-snug text-ink-800 sm:text-[1.35rem]">
                      {item.q}
                    </span>
                    <span aria-hidden="true"
                      className={`relative mt-2 h-3 w-3 flex-none transition-transform duration-500 ${isOpen ? "rotate-45" : ""}`}
                      style={{ transitionTimingFunction: "var(--ease-silk)" }}>
                      <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-gold-600" />
                      <span className={`absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-gold-600 transition-opacity duration-500 ${isOpen ? "opacity-0" : ""}`} />
                    </span>
                  </button>
                </dt>
                <dd id={`faq-panel-${i}`}
                  className="grid transition-[grid-template-rows] duration-600"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-silk)" }}>
                  <div className="overflow-hidden">
                    <p className="pb-7 pr-10 text-[0.93rem] font-light leading-[2] text-ink-500">{fill(item.a)}</p>
                  </div>
                </dd>
              </Reveal>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

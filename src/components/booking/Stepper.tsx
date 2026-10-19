/**
 * La progression du tunnel. Au téléphone, l'intitulé des étapes s'efface de
 * l'écran mais reste lu par les lecteurs d'écran : la liste ne se réduit pas
 * à « 1 2 3 4 ». Son nom vient du dictionnaire, comme tout texte du site.
 */
export function Stepper({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <ol className="mx-auto flex max-w-2xl items-center justify-between gap-1" aria-label={label}>
      {steps.map((name, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={name} className="flex flex-1 items-center gap-2 last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                aria-current={active ? "step" : undefined}
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[10px] transition-all duration-500 ${
                  done
                    ? "border-gold-500 bg-gold-500 text-white"
                    : active
                      ? "border-gold-500 text-gold-700"
                      : "border-gold-300/60 text-ink-400"
                }`}
                style={{ transitionTimingFunction: "var(--ease-silk)" }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`sr-only text-[10px] uppercase tracking-[0.18em] transition-colors sm:not-sr-only ${
                active ? "text-ink-800" : "text-ink-400"
              }`}>
                {name}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="h-px flex-1 bg-gold-300/50">
                <span className="block h-px origin-left bg-gold-500 transition-transform duration-700"
                  style={{ transform: `scaleX(${done ? 1 : 0})`, transitionTimingFunction: "var(--ease-silk)" }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

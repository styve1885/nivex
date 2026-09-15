type Props = { className?: string; withSteam?: boolean; title?: string };

/**
 * Le cintre-monogramme de la carte : un N évidé suspendu à un cintre,
 * trois volutes de vapeur qui montent de l'épaule droite.
 *
 * Le N est une lettre au trait, pas un jambage plein : le fil du cintre
 * passe derrière et se voit au travers, comme sur l'imprimé. À très petite
 * taille les deux filets se referment et la lettre se lit pleine — la
 * dégradation est douce, et c'est voulu.
 *
 * Le viewBox reste 120 × 76 : les volutes s'animent en unités SVG
 * (voir @keyframes steam dans globals.css), et les hauteurs appelées
 * ailleurs (h-7, h-9, h-20…) en dépendent.
 */
export function HangerMark({ className = "h-12 w-auto", withSteam = true, title }: Props) {
  return (
    <svg viewBox="0 0 120 76" fill="none" className={className} role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      {/* crochet : montée depuis la pointe, boucle vers la gauche, queue libre */}
      <path
        d="M60 22V14a6.5 8 0 1 0-12.39 3.38"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />

      {/* corps du cintre : deux épaules, une barre, des extrémités arrondies */}
      <path
        d="M60 22 12.5 51.5c-2.4 1.6-1.3 5.4 1.6 5.4h91.8c2.9 0 4-3.8 1.6-5.4L60 22Z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
      />

      {/* N — lettre évidée, posée sur la barre, les épaules lui passent au travers */}
      <path
        d="M47 25h5l16 22.86V25h5v30h-5L52 32.14V55h-5Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />

      {/* vapeur, dégagée de l'épaule droite */}
      {withSteam && (
        <g className="steam" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85">
          <path d="M86 31c4.2-3.8 4.2-7.6 0-11.4s-4.2-7.6 0-11.4" />
          <path d="M95.5 34c4.2-3.8 4.2-7.6 0-11.4s-4.2-7.6 0-11.4" />
          <path d="M105 30c3.4-3.1 3.4-6.2 0-9.3s-3.4-6.2 0-9.3" />
        </g>
      )}
    </svg>
  );
}

/** Monogramme circulaire, laurier stylisé — pour le pied de page et l'admin. */
export function Crest({ className = "h-14 w-14" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      {/* le même N évidé que la marque au cintre */}
      <path d="M35 33h5.5l19 26.37V33H65v34h-5.5L40.5 40.63V67H35Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {[-1, 1].map((s) => (
        <g key={s} transform={`translate(50,50) scale(${s},1) translate(-50,-50)`} opacity="0.55">
          <path d="M26 62c-5-6-6-14-3-21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx={24.5 - i * 0.6} cy={58 - i * 5} rx="2.6" ry="1.5"
              transform={`rotate(${-38 - i * 6} ${24.5 - i * 0.6} ${58 - i * 5})`}
              fill="currentColor" opacity="0.75" />
          ))}
        </g>
      ))}
      <path d="M50 12v5M50 83v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** Le mot NIVEX, lettré. */
export function Wordmark({ className = "", as: Tag = "span" }: { className?: string; as?: "span" | "h1" | "div" }) {
  return (
    <Tag className={`font-display font-normal leading-none tracking-[0.24em] ${className}`}>
      NIVEX
    </Tag>
  );
}

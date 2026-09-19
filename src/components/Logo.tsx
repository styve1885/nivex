import Image from "next/image";

/**
 * Le logo NIVEX.
 *
 * Il nous vient en image, pas en vecteur : le fichier d'origine est une
 * peinture de 4000 × 4000 px, détourée ici de son fond blanc. D'où deux
 * précautions. La marque compacte ne descend pas sous la trentaine de
 * pixels, faute de quoi le fer se referme en tache. Et le verrou complet
 * ne se pose que sur les fonds clairs : son lettrage vert foncé disparaît
 * sur l'encre du pied de page, où l'on garde le mot composé en caractères.
 */

/** Le fer et sa vapeur, découpés du logo — pour les emplois compacts. */
export function Mark({ className = "h-12 w-auto", alt }: { className?: string; alt?: string }) {
  return (
    <Image
      src="/marque-nivex.png"
      alt={alt ?? ""}
      width={560}
      height={368}
      className={className}
      aria-hidden={alt ? undefined : true}
    />
  );
}

/** Le logo entier : le fer, le nom et la signature. Fonds clairs seulement. */
export function Lockup({
  className = "h-32 w-auto", alt = "NIVEX — repassage à domicile", priority = false,
}: { className?: string; alt?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo-nivex.png"
      alt={alt}
      width={1200}
      height={739}
      className={className}
      priority={priority}
    />
  );
}

/** Le mot NIVEX, lettré — quand l'image ne peut pas tenir. */
export function Wordmark({ className = "", as: Tag = "span" }: { className?: string; as?: "span" | "h1" | "div" }) {
  return (
    <Tag className={`font-display font-normal leading-none tracking-[0.24em] ${className}`}>
      NIVEX
    </Tag>
  );
}

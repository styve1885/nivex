import Image from "next/image";

/**
 * Une photographie de l'artisan, dans son cadre.
 *
 * Le rapport 4:5 est celui des fichiers d'origine : `object-cover` ne recadre
 * donc rien, il se contente d'ancrer l'image si un cadre venait à changer de
 * proportion. Le chargement est différé par défaut — aucune de ces photos ne
 * se trouve au premier écran.
 */
export function Photo({
  src, alt, sizes, className = "", frameClassName = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  frameClassName?: string;
}) {
  return (
    <figure className={`overflow-hidden border border-gold-300/50 bg-linen-200 ${frameClassName}`}>
      <Image
        src={src}
        alt={alt}
        width={1160}
        height={1450}
        sizes={sizes}
        className={`aspect-[4/5] w-full object-cover ${className}`}
      />
    </figure>
  );
}

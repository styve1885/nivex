import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { ZonePolicy } from "@/lib/travel";
import { areaLabel, servedAreas } from "@/lib/areas";

/**
 * La liste de quartiers de l'artisan (lib/areas.ts), Montréal puis la
 * Rive-Sud : la section « Secteurs desservis » de l'accueil, centrée, et la
 * page Tarifs, près des frais de déplacement. Seuls paraissent les quartiers
 * que la réservation accepte.
 *
 * Composant serveur : il ne reçoit que les textes qu'il affiche et la grille.
 */
type AreaText = Pick<Dict["areas"], "montreal" | "south">;

/* Un nom ne se coupe pas — ni à l'espace de « Ville de Mont-Royal », ni au
   trait d'union de « Vieux-Montréal » — sauf devant sa parenthèse : au
   téléphone, « (dont le Vieux-Longueuil) » passe à la ligne d'un bloc. */
function Name({ text }: { text: string }) {
  const i = text.indexOf(" (");
  if (i < 0) return <span className="whitespace-nowrap">{text}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{text.slice(0, i)}</span>{" "}
      <span className="whitespace-nowrap">{text.slice(i + 1)}</span>
    </>
  );
}

export function AreaList({ t, locale, policy, align = "center", className = "" }: {
  t: AreaText; locale: "fr" | "en"; policy: ZonePolicy; align?: "center" | "left"; className?: string;
}) {
  const groups = servedAreas(policy);
  if (!groups.length) return null;
  const center = align === "center";

  return (
    <div className={`grid gap-9 ${center ? "text-center" : ""} ${className}`}>
      {groups.map((g) => (
        <div key={g.region}>
          <h3 className="text-[10px] uppercase tracking-[0.24em] text-gold-700">
            {g.region === "montreal" ? t.montreal : t.south}
          </h3>
          {/* Une liste lue comme telle ; les points qui séparent les noms ne
              se lisent pas, et restent collés au nom qui les précède. */}
          <ul className="mt-3 font-display text-[1.2rem] font-light leading-[1.85] text-ink-800 sm:text-[1.35rem]">
            {g.areas.map((a, i) => (
              <li key={a.key} className="inline">
                <Name text={areaLabel(a, locale)} />
                {i < g.areas.length - 1 && (
                  <>
                    <span aria-hidden="true" className="px-2 text-gold-500">·</span>{" "}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * « Votre secteur n'y est pas ? Écrivez-nous : nous vous répondons
 * rapidement. », « Écrivez-nous » menant au bloc « Nous écrire » de
 * l'accueil.
 */
export function AreaMissing({ t, href, className = "" }: {
  t: Pick<Dict["areas"], "missing" | "write">; href: string; className?: string;
}) {
  const [before, after = ""] = t.missing.split("{write}");
  const link = "text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-600";
  return (
    <p className={`text-[0.88rem] font-light leading-relaxed text-ink-500 ${className}`}>
      {before}
      {href.startsWith("#")
        ? <a href={href} className={link}>{t.write}</a>
        : <Link href={href} className={link}>{t.write}</Link>}
      {after}
    </p>
  );
}

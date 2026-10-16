/**
 * Provenance d'une réservation, et journal anonyme des visites.
 *
 * Deux mesures qui ne se confondent pas, et dont la frontière est la ligne
 * que la Loi 25 demande de tenir :
 *
 *  — Le journal des visites est anonyme et agrégé. Il ne sait pas qui passe,
 *    seulement combien, d'où et sur quelle page. Aucune adresse IP n'y entre,
 *    aucun identifiant ne relie deux visites entre elles.
 *
 *  — La provenance, elle, est nominative : elle finit attachée à une
 *    réservation, donc à une personne. C'est pourquoi elle reste dans le
 *    navigateur du visiteur, et ne traverse le réseau qu'au moment où cette
 *    personne décide de réserver. Tant qu'elle n'a rien demandé, le serveur
 *    ne sait rien d'elle.
 *
 * Ce module ne dépend de rien : il est lu côté client comme côté serveur.
 */

/** Clé de rangement de la provenance, dans le navigateur du visiteur. */
export const ATTRIBUTION_KEY = "nivex.origin";

/** Marqueur posé par l'artisan pour que son propre appareil ne compte pas. */
export const OPT_OUT_KEY = "nivex.optout";

/** Durée de conservation du journal des visites. */
export const VISIT_RETENTION_MONTHS = 12;

/**
 * Ce que le navigateur retient de la toute première visite.
 *
 * Toute première : les campagnes qui suivent ne l'écrasent pas. Ce qu'on
 * cherche à savoir, c'est quelle carte ou quelle publication a amené la
 * personne la première fois — pas par quel chemin elle est revenue.
 */
export type Attribution = {
  source: string | null;        // utm_source, ou le domaine référent
  medium: string | null;        // utm_medium
  campaign: string | null;      // utm_campaign
  referrer: string | null;      // le référent complet, tel que le navigateur le donne
  landing: string | null;       // la page d'arrivée
  firstSeen: string | null;     // date et heure de la première visite (ISO)
  visits: number;               // nombre de visites avant la réservation
};

export const EMPTY_ATTRIBUTION: Attribution = {
  source: null, medium: null, campaign: null,
  referrer: null, landing: null, firstSeen: null, visits: 0,
};

/* ====================== Comment nous avez-vous connus ? ====================== */

/**
 * Les réponses possibles à la question du formulaire. La carte remise en main
 * propre et l'accroche-porte viennent en tête : ce sont les deux seuls canaux
 * qu'aucune mesure automatique ne peut voir.
 */
export const HEARD_FROM = [
  "carte", "accroche-porte", "instagram", "facebook",
  "google", "assistant-ia", "recommandation", "autre",
] as const;

export type HeardFrom = (typeof HEARD_FROM)[number];

export function isHeardFrom(v: unknown): v is HeardFrom {
  return typeof v === "string" && (HEARD_FROM as readonly string[]).includes(v);
}

/** Libellés de l'artisan — l'espace d'administration est en français. */
export const HEARD_FROM_FR: Record<HeardFrom, string> = {
  "carte": "Carte remise en main propre",
  "accroche-porte": "Accroche-porte",
  "instagram": "Instagram",
  "facebook": "Facebook",
  "google": "Recherche Google",
  "assistant-ia": "Assistant IA (ChatGPT, etc.)",
  "recommandation": "Recommandation",
  "autre": "Autre",
};

/* ============================ Normalisation ============================ */

/**
 * Un référent ramené à son domaine, débarrassé du « www. ».
 *
 * Le référent complet garde parfois un chemin et une interrogation entière —
 * utile pour comprendre un cas précis, encombrant pour regrouper. La source
 * retient donc le domaine seul.
 */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * La source d'une visite ou d'une réservation, en un mot.
 *
 * L'étiquette de campagne l'emporte quand elle existe : c'est celle que
 * l'artisan a choisie lui-même, et elle vaut mieux que le domaine deviné.
 * Un visiteur sans référent et sans campagne est venu de nulle part de
 * visible — il a tapé l'adresse, ou suivi un lien qui ne se déclare pas.
 */
export function visitSource(utmSource: string | null, referrer: string | null): string {
  const utm = utmSource?.trim().toLowerCase();
  if (utm) return utm.slice(0, 60);
  const host = referrerHost(referrer);
  if (host) return host.slice(0, 60);
  return "direct";
}

/** Catégorie d'appareil, assez grossière pour ne distinguer personne. */
export function deviceType(userAgent: string | null | undefined): "mobile" | "tablette" | "ordinateur" {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablette";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "mobile";
  return "ordinateur";
}

/** Une chaîne bornée, ou rien — pour ne jamais écrire n'importe quoi en base. */
export function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

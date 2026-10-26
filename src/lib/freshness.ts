import { createHash } from "node:crypto";
import { ensureSchema, isDbConfigured, logEvent, sql } from "./db";
import { getSettingsStrict, type Settings } from "./settings";
import { sectorsByRegion } from "./travel";

/**
 * La date à laquelle les réglages qui paraissent sur les pages publiques ont
 * changé pour la dernière fois.
 *
 * Les pages publiques se réécrivent sans déploiement : un tarif, un horaire
 * ou une zone enregistrés depuis /admin changent les prix affichés, le texte
 * de la zone desservie, les conditions et la fiche des moteurs de toutes les
 * pages. La date de lib/pages.ts n'en sait rien. On garde donc l'empreinte de
 * ces réglages, et le jour où elle a changé ; le plan du site et IndexNow
 * prennent, page par page, la plus récente des deux dates (`pageDate`).
 *
 * L'empreinte ne porte que sur les valeurs des réglages qui se voient, jamais
 * sur les textes du code : une virgule corrigée dans un dictionnaire ne fait
 * pas avancer la date de toutes les pages. Ce que change le code se date dans
 * PUBLIC_PAGES, page par page. Un réglage sans effet visible (le lien d'avis,
 * la pause, l'agenda, les prestations des sections retirées) n'y entre pas.
 *
 * La date est un jour, à l'heure de Montréal : deux enregistrements le même
 * jour ne font qu'un changement, et IndexNow ne renvoie pas une adresse plus
 * d'une fois par jour pour cette raison.
 */

/**
 * Ce que les pages publiques montrent des réglages, sous une forme fixe :
 * prix et durée, pas des créneaux, préavis et horizon (conditions), offre de
 * la première heure, jours et heures d'ouverture (pied de page, fiche), et
 * les secteurs actifs dans l'ordre de l'affichage, avec les zones qui en ont
 * et leurs frais. Les préfixes ne se lisent nulle part ; seul compte ce
 * qu'ils décident, Rive-Sud ou Montréal.
 */
export function publicSettings(s: Settings) {
  const { south, montreal } = sectorsByRegion(s.zonePolicy);
  const sectors = [...south, ...montreal];
  return {
    hourlyRate: s.hourlyRate,
    currency: s.currency,
    minMinutes: s.minMinutes,
    slotStep: s.slotStep,
    leadHours: s.leadHours,
    horizonDays: s.horizonDays,
    firstHourFree: s.firstHourFree,
    hours: s.hours.filter((h) => h.enabled).map((h) => [h.day, h.open, h.close]),
    zones: s.zonePolicy.zones
      .filter((z) => sectors.some((x) => x.zoneKey === z.key))
      .map((z) => [z.key, z.nameFr, z.nameEn, z.shortFeeCents, z.longFeeCents, z.thresholdMinutes]),
    sectors: sectors.map((x) => [x.nameFr, x.nameEn, x.zoneKey, montreal.includes(x)]),
  };
}

/** L'empreinte de ce que les pages publiques montrent des réglages. */
export function publicFingerprint(s: Settings): string {
  return createHash("sha256").update(JSON.stringify(publicSettings(s))).digest("hex");
}

/** Aujourd'hui, « AAAA-MM-JJ », à l'heure de Montréal : le serveur vit en UTC. */
export function todayInMontreal(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/**
 * Inscrit l'empreinte du contenu tiré de ces réglages, et rend le jour du
 * dernier changement. La toute première inscription sert de référence et
 * n'avance aucune date (« » : aucun changement relevé depuis). Une seule
 * instruction : deux appels simultanés ne se marchent pas dessus.
 */
export async function recordPublicContent(s: Settings): Promise<string> {
  if (!isDbConfigured()) return "";
  await ensureSchema();
  const rows = (await sql()`
    INSERT INTO nivex_public_content (id, fingerprint, changed_on)
    VALUES (1, ${publicFingerprint(s)}, '')
    ON CONFLICT (id) DO UPDATE SET
      changed_on = CASE WHEN nivex_public_content.fingerprint <> EXCLUDED.fingerprint
                        THEN ${todayInMontreal()} ELSE nivex_public_content.changed_on END,
      fingerprint = EXCLUDED.fingerprint,
      checked_at = now()
    RETURNING changed_on`) as { changed_on: string }[];
  return rows[0]?.changed_on ?? "";
}

/** Le jour du dernier changement relevé, ou « » s'il n'y en a pas encore. */
export async function publicChangedOn(): Promise<string> {
  if (!isDbConfigured()) return "";
  await ensureSchema();
  const rows = (await sql()`SELECT changed_on FROM nivex_public_content WHERE id = 1`) as { changed_on: string }[];
  return rows[0]?.changed_on ?? "";
}

/**
 * Pour les routes qui enregistrent des réglages : inscrire le contenu tiré
 * des réglages en base, avant l'enregistrement (la référence, pour que le
 * tout premier changement compte) puis après. La lecture est stricte : des
 * valeurs par défaut prises pour les vraies feraient avancer la date à tort.
 * Jamais en erreur : un enregistrement réussi ne doit pas échouer pour une
 * date de plan du site.
 */
export async function notePublicContent(): Promise<void> {
  try {
    await recordPublicContent(await getSettingsStrict());
  } catch (e) {
    await logEvent("freshness_failed", { message: e instanceof Error ? e.message : String(e) });
  }
}

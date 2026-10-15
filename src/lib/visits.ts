import { ensureSchema, sql, isDbConfigured } from "./db";
import { clip, deviceType, visitSource, VISIT_RETENTION_MONTHS } from "./attribution";

/**
 * Journal anonyme des visites.
 *
 * Une ligne par page vue : l'heure, la page, la provenance, le type
 * d'appareil et la ville approximative. Rien d'autre, et surtout pas
 * l'adresse IP d'où la ville est déduite — l'en-tête de l'hébergeur est lu
 * puis jeté, seule la ville survit.
 *
 * Aucune écriture ici ne doit pouvoir faire échouer l'affichage d'une page :
 * un journal est un confort, pas une fondation.
 */

export type Visit = {
  id: string;
  path: string;
  source: string;
  referrer: string | null;
  device: string;
  city: string | null;
  region: string | null;
  country: string | null;
  locale: string | null;
  createdAt: Date;
};

type Row = Record<string, unknown>;

function hydrate(r: Row): Visit {
  return {
    id: String(r.id),
    path: r.path as string,
    source: (r.source as string) || "direct",
    referrer: (r.referrer as string) ?? null,
    device: (r.device as string) || "ordinateur",
    city: (r.city as string) ?? null,
    region: (r.region as string) ?? null,
    country: (r.country as string) ?? null,
    locale: (r.locale as string) ?? null,
    createdAt: new Date(r.created_at as string),
  };
}

/** Ce que l'appel du navigateur apporte, avant d'être nettoyé. */
export type VisitInput = {
  path: string;
  utmSource?: string | null;
  referrer?: string | null;
  locale?: string | null;
};

/** Ce que l'hébergeur ajoute de son côté, à partir du réseau. */
export type VisitContext = {
  userAgent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

/**
 * Les pages de l'espace artisan ne se comptent jamais.
 *
 * Le filtre vit ici, du côté serveur, et non seulement dans le navigateur :
 * un appel bricolé à la main ne doit pas pouvoir polluer la mesure.
 */
export function isCounted(path: string): boolean {
  return !/^\/admin(\/|$)/.test(path) && !/^\/api(\/|$)/.test(path);
}

export async function recordVisit(input: VisitInput, ctx: VisitContext): Promise<boolean> {
  if (!isDbConfigured()) return false;

  const path = clip(input.path, 300) ?? "/";
  if (!isCounted(path)) return false;

  const referrer = clip(input.referrer, 400);
  const source = visitSource(clip(input.utmSource, 60), referrer);

  try {
    await ensureSchema();
    await sql()`
      INSERT INTO nivex_visits (path, source, referrer, device, city, region, country, locale)
      VALUES (${path}, ${source}, ${referrer}, ${deviceType(ctx.userAgent)},
              ${clip(ctx.city, 120)}, ${clip(ctx.region, 120)}, ${clip(ctx.country, 8)},
              ${clip(input.locale, 8)})`;
    await maybePurge();
    return true;
  } catch (e) {
    console.warn("[nivex] visite non consignée :", (e as Error).message);
    return false;
  }
}

/**
 * Oubli automatique au-delà de douze mois.
 *
 * Le ménage ne se fait pas à chaque visite : ce serait une suppression par
 * page vue pour une ligne effacée de temps en temps. Un tirage au sort suffit
 * — sur la durée, le journal ne dépasse jamais sa fenêtre de beaucoup, et
 * aucune visite ne paie l'addition.
 */
async function maybePurge(): Promise<void> {
  if (Math.random() > 0.02) return;
  await purgeOldVisits().catch(() => {});
}

export async function purgeOldVisits(): Promise<number> {
  await ensureSchema();
  const rows = (await sql()`
    DELETE FROM nivex_visits
    WHERE created_at < now() - make_interval(months => ${VISIT_RETENTION_MONTHS})
    RETURNING 1`) as Row[];
  return rows.length;
}

/* ============================ Lecture ============================ */

export type VisitQuery = {
  /** Nombre de jours à remonter. `0` ou absent : tout ce qui reste. */
  days?: number;
  /** Une source précise, ou rien pour toutes. */
  source?: string | null;
  limit?: number;
};

export async function listVisits(opts: VisitQuery = {}): Promise<Visit[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000);
  const days = opts.days && opts.days > 0 ? Math.min(opts.days, 400) : null;
  const source = opts.source?.trim() || null;

  /* Les deux filtres sont facultatifs et indépendants. Plutôt que de coudre
     la requête à la main — et d'ouvrir une porte à l'injection —, on laisse
     chaque condition s'annuler d'elle-même quand son paramètre est nul. */
  const rows = (await sql()`
    SELECT * FROM nivex_visits
    WHERE (${days}::int IS NULL OR created_at >= now() - make_interval(days => ${days}::int))
      AND (${source}::text IS NULL OR source = ${source}::text)
    ORDER BY created_at DESC
    LIMIT ${limit}`) as Row[];

  return rows.map(hydrate);
}

/** Les sources rencontrées, les plus fréquentes en tête — pour le filtre. */
export async function visitSources(days?: number): Promise<{ source: string; count: number }[]> {
  await ensureSchema();
  const d = days && days > 0 ? Math.min(days, 400) : null;
  const rows = (await sql()`
    SELECT source, count(*)::int AS n FROM nivex_visits
    WHERE (${d}::int IS NULL OR created_at >= now() - make_interval(days => ${d}::int))
    GROUP BY source
    ORDER BY n DESC, source ASC
    LIMIT 40`) as Row[];
  return rows.map((r) => ({ source: r.source as string, count: Number(r.n) }));
}

/** Quelques totaux, pour coiffer la liste. */
export async function visitSummary(days?: number): Promise<{
  views: number; firstSeen: Date | null; cities: number;
}> {
  await ensureSchema();
  const d = days && days > 0 ? Math.min(days, 400) : null;
  const rows = (await sql()`
    SELECT count(*)::int                        AS views,
           min(created_at)                      AS first_seen,
           count(DISTINCT city)::int            AS cities
    FROM nivex_visits
    WHERE (${d}::int IS NULL OR created_at >= now() - make_interval(days => ${d}::int))`) as Row[];
  const r = rows[0] ?? {};
  return {
    views: Number(r.views ?? 0),
    firstSeen: r.first_seen ? new Date(r.first_seen as string) : null,
    cities: Number(r.cities ?? 0),
  };
}

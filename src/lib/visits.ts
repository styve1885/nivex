import { ensureSchema, sql, isDbConfigured } from "./db";
import {
  clip, deviceType, isPrivatePath, isRobotReason, refName, robotReason, visitGroup, visitSource,
  SOURCE_GROUPS, VISIT_RETENTION_MONTHS, type RobotReason, type SourceGroup,
} from "./attribution";

/**
 * Journal anonyme des visites.
 *
 * Une ligne par page vue : l'heure, la page, la provenance, le type
 * d'appareil et la ville approximative. Rien d'autre, et surtout pas
 * l'adresse IP d'où la ville est déduite — l'en-tête de l'hébergeur est lu
 * puis jeté, seule la ville survit. L'agent du navigateur et son fuseau
 * servent à reconnaître un robot, puis sont oubliés de la même façon : seul
 * le motif du marquage reste.
 *
 * Aucune écriture ici ne doit pouvoir faire échouer l'affichage d'une page :
 * un journal est un confort, pas une fondation.
 */

export type Visit = {
  id: string;
  path: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  /** Le prénom d'un lien de recommandation. */
  referral: string | null;
  group: SourceGroup;
  referrer: string | null;
  device: string;
  city: string | null;
  region: string | null;
  country: string | null;
  locale: string | null;
  /** Pourquoi la visite est celle d'un robot, ou rien. */
  robot: RobotReason | null;
  createdAt: Date;
};

type Row = Record<string, unknown>;

function hydrate(r: Row): Visit {
  const source = (r.source as string) || "direct";
  const referral = (r.referral as string) ?? null;
  return {
    id: String(r.id),
    path: r.path as string,
    source,
    medium: (r.medium as string) ?? null,
    campaign: (r.campaign as string) ?? null,
    referral,
    group: visitGroup({ source, referral }),
    referrer: (r.referrer as string) ?? null,
    device: (r.device as string) || "ordinateur",
    city: (r.city as string) ?? null,
    region: (r.region as string) ?? null,
    country: (r.country as string) ?? null,
    locale: (r.locale as string) ?? null,
    robot: isRobotReason(r.robot) ? r.robot : null,
    createdAt: new Date(r.created_at as string),
  };
}

/**
 * Ce que l'appel du navigateur apporte, avant d'être nettoyé. La provenance
 * est celle de l'arrivée dans la session, pas de la page elle-même : la
 * deuxième page lue a perdu l'étiquette du lien qui a amené la première.
 */
export type VisitInput = {
  path: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  ref?: string | null;
  referrer?: string | null;
  locale?: string | null;
  /** `navigator.webdriver`, lu puis oublié. */
  webdriver?: unknown;
  /** Le fuseau de l'horloge du navigateur, lu puis oublié. */
  timeZone?: unknown;
};

/** Ce que l'hébergeur ajoute de son côté, à partir du réseau. */
export type VisitContext = {
  userAgent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

/**
 * Les pages de l'espace artisan, celle qui retire un navigateur du décompte
 * et les liens personnels de réservation et d'abonnement, dont l'adresse
 * porte un jeton, ne se comptent jamais.
 *
 * Le filtre vit ici, du côté serveur, et non seulement dans le navigateur :
 * un appel bricolé à la main ne doit pas pouvoir polluer la mesure.
 */
export function isCounted(path: string): boolean {
  return !isPrivatePath(path) && !/^\/api(\/|$)/.test(path);
}

export async function recordVisit(input: VisitInput, ctx: VisitContext): Promise<boolean> {
  if (!isDbConfigured()) return false;

  const path = clip(input.path, 300) ?? "/";
  if (!isCounted(path)) return false;

  const referrer = clip(input.referrer, 400);
  const source = visitSource(clip(input.utmSource, 60), referrer);
  const referral = refName(input.ref);
  const device = deviceType(ctx.userAgent);
  const city = clip(ctx.city, 120);
  const country = clip(ctx.country, 8);
  const robot = robotReason({
    userAgent: ctx.userAgent, webdriver: input.webdriver, timeZone: input.timeZone,
    country, city, source, device, referral,
  });

  try {
    await ensureSchema();
    await sql()`
      INSERT INTO nivex_visits (path, source, medium, campaign, referral, referrer, device,
                                city, region, country, locale, robot)
      VALUES (${path}, ${source}, ${clip(input.utmMedium, 60)}, ${clip(input.utmCampaign, 120)},
              ${referral}, ${referrer}, ${device},
              ${city}, ${clip(ctx.region, 120)}, ${country},
              ${clip(input.locale, 8)}, ${robot})`;
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

/** Les périodes de l'onglet Visites. `0` veut dire « tout ce qui reste ». */
export const PERIODS = [7, 30, 90, 0] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(v: number): v is Period {
  return (PERIODS as readonly number[]).includes(v);
}

/** Les robots : cachés (par défaut), seuls, ou mêlés au reste. */
export type RobotFilter = "hide" | "only" | "all";

/**
 * Le journal résumé : une ligne par source, recommandation, marquage robot
 * et ville, avec le nombre de pages vues sur chaque période.
 *
 * C'est assez pour tout compter — les familles de sources, le bilan, les
 * villes — sans relire une ligne par visite. Le regroupement en familles se
 * fait ensuite ici, en clair, par les mêmes fonctions que le reste du site.
 */
export type DigestRow = {
  source: string; hasRef: boolean; robot: boolean; city: string | null;
  counts: Record<Period, number>;
};

export async function visitDigest(): Promise<DigestRow[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT source, (referral IS NOT NULL) AS has_ref, (robot IS NOT NULL) AS is_robot, city,
           count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS d7,
           count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS d30,
           count(*) FILTER (WHERE created_at >= now() - interval '90 days')::int AS d90,
           count(*)::int AS total
    FROM nivex_visits
    GROUP BY 1, 2, 3, 4`) as Row[];
  return rows.map((r) => ({
    source: (r.source as string) || "direct",
    hasRef: r.has_ref === true,
    robot: r.is_robot === true,
    city: (r.city as string) ?? null,
    counts: { 7: Number(r.d7), 30: Number(r.d30), 90: Number(r.d90), 0: Number(r.total) },
  }));
}

const groupOf = (r: DigestRow) => visitGroup({ source: r.source, referral: r.hasRef ? "x" : null });
const keeps = (r: DigestRow, robots: RobotFilter) =>
  robots === "all" || r.robot === (robots === "only");

/**
 * Ce qui coiffe la liste, pour une période et un filtre de robots : les
 * familles rencontrées et leur nombre de pages, puis, pour la famille
 * choisie, le total, les villes, et combien de pages de robots y sont.
 */
export function digestSummary(rows: DigestRow[], period: Period, robots: RobotFilter, group: SourceGroup | null) {
  const groups = new Map<SourceGroup, number>();
  const cities = new Set<string>();
  let views = 0;
  let robotViews = 0;

  for (const r of rows) {
    const n = r.counts[period];
    if (!n) continue;
    const g = groupOf(r);
    if (keeps(r, robots)) groups.set(g, (groups.get(g) ?? 0) + n);
    if (group && g !== group) continue;
    if (r.robot) robotViews += n;
    if (!keeps(r, robots)) continue;
    views += n;
    if (r.city) cities.add(r.city.toLowerCase());
  }

  return {
    groups: SOURCE_GROUPS.filter((g) => groups.has(g)).map((g) => ({ group: g, count: groups.get(g)! })),
    views,
    cities: cities.size,
    robots: robotViews,
  };
}

/** Les sources de la colonne `source` qui tombent dans une famille. */
export function sourcesOf(rows: DigestRow[], group: SourceGroup): string[] {
  return [...new Set(rows.filter((r) => !r.hasRef && groupOf(r) === group).map((r) => r.source))];
}

/** Le bilan : les pages vues par des humains, par famille et par période. */
export function visitBilan(rows: DigestRow[]): Record<SourceGroup, Record<Period, number>> {
  const out = Object.fromEntries(SOURCE_GROUPS.map((g) => [g, { 7: 0, 30: 0, 90: 0, 0: 0 }])) as
    Record<SourceGroup, Record<Period, number>>;
  for (const r of rows) {
    if (r.robot) continue;
    const g = groupOf(r);
    for (const p of PERIODS) out[g][p] += r.counts[p];
  }
  return out;
}

export type VisitQuery = {
  /** Nombre de jours à remonter. `0` ou absent : tout ce qui reste. */
  days?: number;
  /** Une famille de sources, ou rien pour toutes. */
  group?: SourceGroup | null;
  /** Les valeurs de `source` de cette famille, tirées du résumé. */
  sources?: string[];
  robots?: RobotFilter;
  limit?: number;
};

export async function listVisits(opts: VisitQuery = {}): Promise<Visit[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000);
  const days = opts.days && opts.days > 0 ? Math.min(opts.days, 400) : null;
  const group = opts.group ?? null;
  const sources = opts.sources ?? [];
  const robots = opts.robots ?? "hide";

  /* Les filtres sont facultatifs et indépendants. Plutôt que de coudre la
     requête à la main — et d'ouvrir une porte à l'injection —, on laisse
     chaque condition s'annuler d'elle-même quand son paramètre est nul. La
     famille « Recommandation » se reconnaît au prénom ; les autres, aux
     sources qui la composent, sans lien de recommandation. */
  const rows = (await sql()`
    SELECT * FROM nivex_visits
    WHERE (${days}::int IS NULL OR created_at >= now() - make_interval(days => ${days}::int))
      AND (${robots}::text = 'all' OR (robot IS NOT NULL) = (${robots}::text = 'only'))
      AND (${group}::text IS NULL
           OR (${group}::text = 'recommandation' AND referral IS NOT NULL)
           OR (${group}::text <> 'recommandation' AND referral IS NULL AND source = ANY(${sources}::text[])))
    ORDER BY created_at DESC
    LIMIT ${limit}`) as Row[];

  return rows.map(hydrate);
}

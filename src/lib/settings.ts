import { ensureSchema, sql, isDbConfigured } from "./db";
import { decrypt, encrypt } from "./crypto";
import {
  DEFAULT_ZONE_POLICY, POLICY_VERSION, PREFIX_RE, describeChanges,
  type Sector, type Zone, type ZonePolicy,
} from "./travel";
import { DEFAULT_SERVICES, type DayHours, type ServiceItem } from "./services";

/* Les prestations du code et la forme d'un horaire vivent dans `services.ts`,
   qui n'importe rien : un composant client peut les lire sans emporter la
   base dans le navigateur. Elles restent lisibles d'ici. */
export { DEFAULT_SERVICES, type DayHours, type ServiceItem };

export type Settings = {
  ownerEmail: string | null;
  ownerName: string | null;
  ownerPicture: string | null;
  connected: boolean;
  calendarId: string;
  timezone: string;
  businessName: string;
  hourlyRate: number;      // en cents
  currency: string;
  minMinutes: number;
  bufferMinutes: number;
  leadHours: number;
  horizonDays: number;
  slotStep: number;
  firstHourFree: boolean;
  paused: boolean;
  hours: DayHours[];
  zonePolicy: ZonePolicy;
  services: ServiceItem[];
  connectedAt: string | null;
};

/**
 * Taux horaire par défaut, en cents.
 *
 * Le taux réel vit en base et se règle depuis /admin ; celui-ci ne sert que
 * lorsque la base est absente ou muette. Les deux doivent dire la même chose :
 * sinon, une base injoignable fait afficher au site — et à ses conditions
 * d'utilisation — un tarif que l'entreprise ne pratique plus.
 *
 * La valeur par défaut de la colonne `hourly_rate`, dans db.ts, suit celle-ci.
 */
export const DEFAULT_HOURLY_RATE = 5000;

export const DEFAULT_HOURS: DayHours[] = [
  { day: 0, enabled: false, open: "07:00", close: "22:00" }, // dimanche — fermé par défaut
  { day: 1, enabled: true,  open: "07:00", close: "22:00" },
  { day: 2, enabled: true,  open: "07:00", close: "22:00" },
  { day: 3, enabled: true,  open: "07:00", close: "22:00" },
  { day: 4, enabled: true,  open: "07:00", close: "22:00" },
  { day: 5, enabled: true,  open: "07:00", close: "22:00" },
  { day: 6, enabled: true,  open: "07:00", close: "22:00" }, // samedi
];

export const FALLBACK_SETTINGS: Settings = {
  ownerEmail: null, ownerName: null, ownerPicture: null, connected: false,
  calendarId: "primary", timezone: "America/Toronto", businessName: "NIVEX",
  hourlyRate: DEFAULT_HOURLY_RATE, currency: "CAD", minMinutes: 120, bufferMinutes: 30,
  leadHours: 24, horizonDays: 45, slotStep: 30, firstHourFree: true, paused: false,
  hours: DEFAULT_HOURS, zonePolicy: DEFAULT_ZONE_POLICY,
  services: DEFAULT_SERVICES,
  connectedAt: null,
};

type Row = Record<string, unknown>;

function hydrate(row: Row | undefined): Settings {
  if (!row) return FALLBACK_SETTINGS;
  return {
    ownerEmail: (row.owner_email as string) ?? null,
    ownerName: (row.owner_name as string) ?? null,
    ownerPicture: (row.owner_picture as string) ?? null,
    connected: Boolean(row.refresh_token),
    calendarId: (row.calendar_id as string) || "primary",
    timezone: (row.timezone as string) || "America/Toronto",
    businessName: (row.business_name as string) || "NIVEX",
    hourlyRate: Number(row.hourly_rate ?? DEFAULT_HOURLY_RATE),
    currency: (row.currency as string) || "CAD",
    minMinutes: Number(row.min_minutes ?? 120),
    bufferMinutes: Number(row.buffer_minutes ?? 30),
    leadHours: Number(row.lead_hours ?? 24),
    horizonDays: Number(row.horizon_days ?? 45),
    slotStep: Number(row.slot_step ?? 30),
    firstHourFree: row.first_hour_free !== false,
    paused: row.paused === true,
    hours: (row.hours as DayHours[]) ?? DEFAULT_HOURS,
    zonePolicy: readZonePolicy(row.travel_policy),
    services: mergeServices(row.services as ServiceItem[] | null),
    connectedAt: row.connected_at ? new Date(row.connected_at as string).toISOString() : null,
  };
}

/**
 * Les prestations enregistrées l'emportent — l'artisan a réglé ses minutes,
 * on ne les écrase pas. Mais une prestation ajoutée au code depuis doit
 * quand même apparaître, sinon elle reste invisible pour toujours : la
 * colonne de la base gagne, et personne ne peut ajouter ce qu'il ne voit
 * pas. Les nouvelles clés viennent donc s'ajouter à la suite, avec leurs
 * valeurs par défaut, jusqu'à ce que l'artisan les enregistre à son tour.
 */
function mergeServices(stored: ServiceItem[] | null): ServiceItem[] {
  if (!stored?.length) return DEFAULT_SERVICES;
  const known = new Set(stored.map((x) => x.key));
  return [...stored, ...DEFAULT_SERVICES.filter((d) => !known.has(d.key))];
}

/**
 * Les zones et les secteurs, et la bascule depuis les grilles d'avant.
 *
 * La colonne `travel_policy` a porté successivement une liste de zones à
 * frais, une politique de temps de trajet, puis trois cercles de préfixes.
 * Elle porte maintenant des secteurs rattachés à des zones, marqués
 * `version: 2`. Plutôt que de deviner laquelle de ces formes on relit, on
 * exige celle d'aujourd'hui : tout le reste — null, un tableau, les trois
 * cercles — se lit comme « jamais réglé », et la grille par défaut
 * s'applique. `bootstrap()` l'écrit d'ailleurs en base une fois pour toutes.
 *
 * C'est délibérément brutal, et c'est le bon choix ici : une grille à moitié
 * relue facturerait des montants que personne n'a décidés.
 *
 * L'ancienne colonne `service_area` n'est plus lue du tout, ni pour les
 * préfixes ni pour le texte : le COALESCE de `saveConnection` peut bien la
 * conserver, elle ne décide plus de rien.
 */
export function readZonePolicy(stored: unknown): ZonePolicy {
  if (!isRecord(stored) || stored.version !== POLICY_VERSION) return DEFAULT_ZONE_POLICY;
  if (!Array.isArray(stored.zones) || !Array.isArray(stored.sectors)) return DEFAULT_ZONE_POLICY;

  const zones: Zone[] = [];
  for (const z of stored.zones.filter(isRecord).map(hydrateZone)) {
    if (z && !zones.some((x) => x.key === z.key)) zones.push(z);
  }
  if (zones.length === 0) return DEFAULT_ZONE_POLICY;

  /* Un secteur rattaché à une zone disparue ne reconnaît plus rien : on le
     laisse de côté plutôt que de l'afficher sans tarif. */
  const known = new Set(zones.map((z) => z.key));
  const sectors: Sector[] = [];
  for (const s of stored.sectors.filter(isRecord).map(hydrateSector)) {
    if (s && known.has(s.zoneKey) && !sectors.some((x) => x.key === s.key)) sectors.push(s);
  }

  return { version: POLICY_VERSION, zones, sectors };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Une zone enregistrée, ramenée à une forme sûre — ou rien si elle n'a pas de clé. */
function hydrateZone(z: Record<string, unknown>): Zone | null {
  const key = text(z.key, 60);
  if (!key) return null;
  const cents = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(50_000, Math.round(n)) : 0;
  };
  const seuil = Number(z.thresholdMinutes);
  return {
    key,
    nameFr: text(z.nameFr, 80) || key.toUpperCase(),
    nameEn: text(z.nameEn, 80),
    shortFeeCents: cents(z.shortFeeCents),
    longFeeCents: cents(z.longFeeCents),
    thresholdMinutes: Number.isFinite(seuil) && seuil >= 30 && seuil <= 960 ? Math.round(seuil) : 180,
  };
}

/** Un secteur enregistré, ramené à une forme sûre. Les préfixes mal formés tombent. */
function hydrateSector(s: Record<string, unknown>): Sector | null {
  const key = text(s.key, 60);
  const nameFr = text(s.nameFr, 80);
  if (!key || !nameFr) return null;
  const prefixes = Array.isArray(s.prefixes)
    ? [...new Set((s.prefixes as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toUpperCase())
        .filter((x) => PREFIX_RE.test(x)))]
    : [];
  return {
    key, nameFr,
    nameEn: text(s.nameEn, 80),
    prefixes,
    zoneKey: text(s.zoneKey, 60),
    enabled: s.enabled !== false,
  };
}

/**
 * Lecture tolérante : si la base n'est pas branchée, on renvoie les valeurs
 * par défaut plutôt que de faire tomber la page.
 *
 * Cette tolérance a un prix, et il faut le connaître : les valeurs par
 * défaut portent `connected: false`. Une base qui répond mal se lit donc
 * exactement comme un compte Google absent, et l'espace artisan annonce
 * « Non connecté » alors que le jeton se porte bien. On consigne donc la
 * cause au passage — sans elle, le diagnostic part dans la mauvaise
 * direction.
 */
export async function getSettings(): Promise<Settings> {
  if (!isDbConfigured()) return FALLBACK_SETTINGS;
  try {
    await ensureSchema();
    const rows = (await sql()`SELECT * FROM nivex_settings WHERE id = 1`) as Row[];
    return hydrate(rows[0]);
  } catch (e) {
    lastReadError = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("[nivex] réglages illisibles, retour aux valeurs par défaut :", lastReadError);
    return FALLBACK_SETTINGS;
  }
}

let lastReadError: string | null = null;

/** Pourquoi la dernière lecture des réglages a échoué, s'il y a lieu. */
export function settingsReadError(): string | null {
  return lastReadError;
}

/** Jeton de rafraîchissement déchiffré — usage serveur uniquement. */
export async function getRefreshToken(): Promise<string | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const rows = (await sql()`SELECT refresh_token FROM nivex_settings WHERE id = 1`) as Row[];
  const enc = rows[0]?.refresh_token as string | undefined;
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

export async function saveConnection(input: {
  email: string; name: string | null; picture: string | null; refreshToken?: string | null;
}) {
  await ensureSchema();
  const enc = input.refreshToken ? encrypt(input.refreshToken) : null;
  await sql()`
    INSERT INTO nivex_settings (id, owner_email, owner_name, owner_picture, refresh_token,
                                hours, travel_policy, services, connected_at, updated_at)
    VALUES (1, ${input.email}, ${input.name}, ${input.picture}, ${enc},
            ${JSON.stringify(DEFAULT_HOURS)}::jsonb,
            ${JSON.stringify(DEFAULT_ZONE_POLICY)}::jsonb,
            ${JSON.stringify(DEFAULT_SERVICES)}::jsonb,
            now(), now())
    ON CONFLICT (id) DO UPDATE SET
      owner_email   = EXCLUDED.owner_email,
      owner_name    = EXCLUDED.owner_name,
      owner_picture = EXCLUDED.owner_picture,
      refresh_token = COALESCE(EXCLUDED.refresh_token, nivex_settings.refresh_token),
      hours         = COALESCE(nivex_settings.hours, EXCLUDED.hours),
      /* Une grille déjà migrée reste ; toute autre forme cède la place à la
         grille par défaut, jamais l'inverse. */
      travel_policy = CASE WHEN nivex_settings.travel_policy->>'version' = '2'
                           THEN nivex_settings.travel_policy ELSE EXCLUDED.travel_policy END,
      services      = COALESCE(nivex_settings.services, EXCLUDED.services),
      connected_at  = now(),
      updated_at    = now()`;
}

export async function disconnect() {
  await ensureSchema();
  await sql()`UPDATE nivex_settings
              SET refresh_token = NULL, connected_at = NULL, updated_at = now()
              WHERE id = 1`;
}

export type SettingsPatch = Partial<Pick<Settings,
  "calendarId" | "timezone" | "businessName" | "hourlyRate" | "currency" | "minMinutes" |
  "bufferMinutes" | "leadHours" | "horizonDays" | "slotStep" | "firstHourFree" | "paused" |
  "hours" | "services">>;

export async function updateSettings(patch: SettingsPatch) {
  await ensureSchema();
  const cur = await getSettings();
  const n = { ...cur, ...patch };
  await sql()`
    UPDATE nivex_settings SET
      calendar_id     = ${n.calendarId},
      timezone        = ${n.timezone},
      business_name   = ${n.businessName},
      hourly_rate     = ${Math.round(n.hourlyRate)},
      currency        = ${n.currency},
      min_minutes     = ${Math.round(n.minMinutes)},
      buffer_minutes  = ${Math.round(n.bufferMinutes)},
      lead_hours      = ${Math.round(n.leadHours)},
      horizon_days    = ${Math.round(n.horizonDays)},
      slot_step       = ${Math.round(n.slotStep)},
      first_hour_free = ${n.firstHourFree},
      paused          = ${n.paused},
      hours           = ${JSON.stringify(n.hours)}::jsonb,
      services        = ${JSON.stringify(n.services)}::jsonb,
      updated_at      = now()
    WHERE id = 1`;
  return n;
}

/** Le site accepte-t-il des réservations en ligne en ce moment ? */
export function isBookable(s: Settings): boolean {
  return s.connected && !s.paused;
}

/* ============================ Zones et frais ============================ */

/**
 * Enregistre la grille des zones et note ce qui a changé.
 *
 * À part des autres réglages, et c'est voulu : l'onglet Réglages garde sa
 * propre copie de tout ce qu'il affiche, et l'enregistrer ne doit jamais
 * ramener une grille de zones lue avant qu'on la modifie ailleurs. La grille
 * ne s'écrit donc qu'ici, et seulement depuis l'onglet « Zones et frais ».
 */
export async function saveZonePolicy(next: ZonePolicy, author: string | null): Promise<string[]> {
  await ensureSchema();
  const cur = (await getSettings()).zonePolicy;
  const changes = describeChanges(cur, next);
  await sql()`
    INSERT INTO nivex_settings (id, travel_policy, updated_at)
    VALUES (1, ${JSON.stringify(next)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET travel_policy = EXCLUDED.travel_policy, updated_at = now()`;
  if (changes.length) {
    await sql()`
      INSERT INTO nivex_zone_history (summary, author)
      SELECT value, ${author}
      FROM jsonb_array_elements_text(${JSON.stringify(changes)}::jsonb) WITH ORDINALITY
      ORDER BY ordinality`;
  }
  return changes;
}

export type ZoneHistoryEntry = { at: string; summary: string; author: string | null };

export async function zoneHistory(limit = 150): Promise<ZoneHistoryEntry[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const rows = (await sql()`
    SELECT created_at, summary, author FROM nivex_zone_history
    ORDER BY id DESC LIMIT ${limit}`) as Row[];
  return rows.map((r) => ({
    at: new Date(r.created_at as string).toISOString(),
    summary: r.summary as string,
    author: (r.author as string) ?? null,
  }));
}

import { ensureSchema, sql, isDbConfigured } from "./db";
import { decrypt, encrypt } from "./crypto";

export type DayHours = { day: number; enabled: boolean; open: string; close: string };
export type ServiceItem = {
  key: string;
  icon: string;
  fr: string;
  en: string;
  minutesPerUnit: number;
  unitFr: string;
  unitEn: string;
  enabled: boolean;
};
export type ServiceArea = { prefixes: string[]; labelFr: string; labelEn: string };

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
  serviceArea: ServiceArea;
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

export const DEFAULT_SERVICES: ServiceItem[] = [
  { key: "shirt",    icon: "shirt",  fr: "Chemises",              en: "Shirts",              minutesPerUnit: 6,  unitFr: "chemise",  unitEn: "shirt",   enabled: true },
  { key: "delicate", icon: "dress",  fr: "Robes & délicats",      en: "Dresses & delicates", minutesPerUnit: 11, unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "suit",     icon: "suit",   fr: "Costumes & vestes",     en: "Suits & jackets",     minutesPerUnit: 16, unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "trousers", icon: "badge",  fr: "Pantalons & jupes",     en: "Trousers & skirts",   minutesPerUnit: 7,  unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "linen",    icon: "linen",  fr: "Linge de maison",       en: "Household linen",     minutesPerUnit: 5,  unitFr: "pièce",    unitEn: "piece",   enabled: true },
  { key: "uniform",  icon: "clock",  fr: "Uniformes (ensemble)",  en: "Uniforms (set)",      minutesPerUnit: 9,  unitFr: "ensemble", unitEn: "set",     enabled: true },
];

export const DEFAULT_AREA: ServiceArea = {
  // Longueuil et ses arrondissements, puis la Rive-Sud immédiate.
  prefixes: [
    "J4G","J4H","J4J","J4K","J4L","J4M","J4N",   // Vieux-Longueuil
    "J3Y","J4T",                                  // Saint-Hubert
    "J4V",                                        // Greenfield Park
    "J4P","J4R","J4S",                            // Saint-Lambert
    "J4W","J4X","J4Y","J4Z",                      // Brossard
    "J4B",                                        // Boucherville
    "J3V",                                        // Saint-Bruno-de-Montarville
    "J3E","J3L","J3X","J5R",                      // Sainte-Julie, Chambly, Varennes, La Prairie
  ],
  labelFr: "Longueuil (Vieux-Longueuil, Saint-Hubert, Greenfield Park), Brossard, Saint-Lambert, Boucherville, Saint-Bruno et la Rive-Sud environnante",
  labelEn: "Longueuil (Vieux-Longueuil, Saint-Hubert, Greenfield Park), Brossard, Saint-Lambert, Boucherville, Saint-Bruno and the surrounding South Shore",
};

export const FALLBACK_SETTINGS: Settings = {
  ownerEmail: null, ownerName: null, ownerPicture: null, connected: false,
  calendarId: "primary", timezone: "America/Toronto", businessName: "NIVEX",
  hourlyRate: DEFAULT_HOURLY_RATE, currency: "CAD", minMinutes: 120, bufferMinutes: 30,
  leadHours: 24, horizonDays: 45, slotStep: 30, firstHourFree: true, paused: false,
  hours: DEFAULT_HOURS, serviceArea: DEFAULT_AREA, services: DEFAULT_SERVICES,
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
    serviceArea: (row.service_area as ServiceArea) ?? DEFAULT_AREA,
    services: (row.services as ServiceItem[]) ?? DEFAULT_SERVICES,
    connectedAt: row.connected_at ? new Date(row.connected_at as string).toISOString() : null,
  };
}

/** Lecture tolérante : si la base n'est pas encore branchée, on renvoie les valeurs par défaut. */
export async function getSettings(): Promise<Settings> {
  if (!isDbConfigured()) return FALLBACK_SETTINGS;
  try {
    await ensureSchema();
    const rows = (await sql()`SELECT * FROM nivex_settings WHERE id = 1`) as Row[];
    return hydrate(rows[0]);
  } catch {
    return FALLBACK_SETTINGS;
  }
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
                                hours, service_area, services, connected_at, updated_at)
    VALUES (1, ${input.email}, ${input.name}, ${input.picture}, ${enc},
            ${JSON.stringify(DEFAULT_HOURS)}::jsonb,
            ${JSON.stringify(DEFAULT_AREA)}::jsonb,
            ${JSON.stringify(DEFAULT_SERVICES)}::jsonb,
            now(), now())
    ON CONFLICT (id) DO UPDATE SET
      owner_email   = EXCLUDED.owner_email,
      owner_name    = EXCLUDED.owner_name,
      owner_picture = EXCLUDED.owner_picture,
      refresh_token = COALESCE(EXCLUDED.refresh_token, nivex_settings.refresh_token),
      hours         = COALESCE(nivex_settings.hours, EXCLUDED.hours),
      service_area  = COALESCE(nivex_settings.service_area, EXCLUDED.service_area),
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
  "hours" | "serviceArea" | "services">>;

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
      service_area    = ${JSON.stringify(n.serviceArea)}::jsonb,
      services        = ${JSON.stringify(n.services)}::jsonb,
      updated_at      = now()
    WHERE id = 1`;
  return n;
}

/** Le site accepte-t-il des réservations en ligne en ce moment ? */
export function isBookable(s: Settings): boolean {
  return s.connected && !s.paused;
}

export function inServiceArea(postal: string, area: ServiceArea): boolean {
  const p = postal.replace(/\s+/g, "").toUpperCase().slice(0, 3);
  return area.prefixes.some((x) => x.toUpperCase() === p);
}

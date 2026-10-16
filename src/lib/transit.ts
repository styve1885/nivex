import { ensureSchema, sql, isDbConfigured, logEvent } from "./db";
import { postalHead } from "./travel";

/**
 * Temps de trajet en transport en commun, depuis le domicile de l'artisan.
 *
 * Trois choses à savoir avant de toucher à ce fichier.
 *
 *  — L'adresse de départ ne quitte jamais le serveur. Elle vit dans
 *    NIVEX_HOME_ADDRESS, n'est jamais envoyée au navigateur, jamais écrite
 *    en base, et n'apparaît dans aucune réponse d'API. Ce qui ressort d'ici,
 *    c'est un nombre de minutes.
 *
 *  — Chaque appel coûte de l'argent. Le cache est donc la règle et l'appel
 *    l'exception : une mesure par code postal et par jour de la semaine,
 *    gardée un mois.
 *
 *  — Un échec n'est jamais une exception qui remonte. L'API peut être lente,
 *    refuser la clé, ne trouver aucun itinéraire un dimanche soir. Dans tous
 *    ces cas la fonction rend `null`, et c'est à l'appelant de décider — la
 *    liste de secours, dans `travel.ts`. Une panne chez Google ne doit pas
 *    fermer la boutique.
 */

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * Adresse de l'API, détournable pour les essais.
 *
 * Même double verrou que le mode démonstration : la variable doit être
 * posée **et** l'exécution ne doit pas être en production Vercel. Il n'y a
 * donc aucun chemin par lequel le site public interrogerait autre chose que
 * Google.
 */
function endpoint(): string {
  const sub = process.env.NIVEX_ROUTES_ENDPOINT?.trim();
  if (sub && process.env.VERCEL_ENV !== "production") return sub;
  return ENDPOINT;
}

/** Au-delà, on renonce : mieux vaut la liste de secours qu'une page qui pend. */
const TIMEOUT_MS = 6000;

export function transitConfigured(): boolean {
  return Boolean(homeAddress() && apiKey());
}

function homeAddress(): string | null {
  return process.env.NIVEX_HOME_ADDRESS?.trim() || null;
}

function apiKey(): string | null {
  return (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY)?.trim() || null;
}

/** Pourquoi la dernière mesure a échoué — lu par /api/health. */
let lastError: string | null = null;
export function transitError(): string | null {
  return lastError;
}

/* ============================ Cache ============================ */

/**
 * Une mesure par code postal et par jour de la semaine.
 *
 * Le jour compte : le dimanche, les autobus se font rares, et un trajet de
 * cinquante minutes en semaine peut en demander quatre-vingt-dix. L'heure
 * compte aussi, mais moins, et la retenir multiplierait les appels par le
 * nombre de créneaux. On s'arrête donc au jour — c'est le compromis assumé.
 */
async function readCache(postal: string, weekday: number, maxAgeDays: number): Promise<number | null> {
  if (!isDbConfigured()) return null;
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT minutes FROM nivex_transit_cache
      WHERE postal = ${postal} AND weekday = ${weekday}
        AND computed_at > now() - make_interval(days => ${Math.max(1, Math.round(maxAgeDays))})
      LIMIT 1`) as { minutes: number }[];
    return rows[0] ? Number(rows[0].minutes) : null;
  } catch {
    return null;
  }
}

async function writeCache(postal: string, weekday: number, minutes: number): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await ensureSchema();
    await sql()`
      INSERT INTO nivex_transit_cache (postal, weekday, minutes, computed_at)
      VALUES (${postal}, ${weekday}, ${minutes}, now())
      ON CONFLICT (postal, weekday) DO UPDATE
        SET minutes = EXCLUDED.minutes, computed_at = now()`;
  } catch {
    /* un cache qui refuse d'écrire coûte des appels, pas des erreurs */
  }
}

/** Vide le cache — l'artisan s'en sert quand il déménage ou qu'un tarif change. */
export async function clearTransitCache(): Promise<number> {
  await ensureSchema();
  const rows = (await sql()`DELETE FROM nivex_transit_cache RETURNING 1`) as unknown[];
  return rows.length;
}

/* ============================ Mesure ============================ */

/**
 * Le jour de la semaine à Montréal, pour une date donnée.
 *
 * Le serveur vit en UTC : un rendez-vous le dimanche à 20 h y tombe un lundi.
 * Lire le jour sans fuseau reviendrait à mesurer un lundi l'horaire d'un
 * dimanche — exactement l'erreur que ce module existe pour éviter.
 */
export function weekdayIn(date: Date, timeZone: string): number {
  const nom = new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "short" }).format(date);
  const jours = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const i = jours.indexOf(nom.slice(0, 3));
  return i < 0 ? date.getUTCDay() : i;
}

export type TransitLookup = {
  minutes: number | null;
  cached: boolean;
  reason: string | null;
};

/**
 * Le trajet jusqu'à un code postal, pour une arrivée donnée.
 *
 * `arriveBy` est l'heure à laquelle l'artisan doit être sur place — le début
 * de la séance moins son quart d'heure d'installation. C'est bien une heure
 * d'arrivée qu'on demande à Google, pas une heure de départ : un horaire
 * d'autobus ne se renverse pas.
 */
export async function transitMinutes(
  postalCode: string,
  arriveBy: Date,
  opts: { timeZone: string; cacheDays: number },
): Promise<TransitLookup> {
  const postal = postalHead(postalCode);
  if (postal.length !== 3) return { minutes: null, cached: false, reason: "code postal incomplet" };

  const weekday = weekdayIn(arriveBy, opts.timeZone);

  const hit = await readCache(postal, weekday, opts.cacheDays);
  if (hit != null) return { minutes: hit, cached: true, reason: null };

  const home = homeAddress();
  const key = apiKey();
  if (!home || !key) {
    lastError = !home ? "NIVEX_HOME_ADDRESS manquante" : "GOOGLE_MAPS_API_KEY manquante";
    return { minutes: null, cached: false, reason: lastError };
  }

  /* Google n'accepte une heure d'arrivée que dans une fenêtre bornée autour
     du présent. Une date hors fenêtre n'est pas une erreur du client : on
     mesure alors la même journée de la semaine, à la même heure, dans la
     semaine qui vient. */
  const when = clampToWindow(arriveBy);

  let res: Response;
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    res = await fetch(endpoint(), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        /* Un masque étroit : on ne demande que la durée. Google facture et
           renvoie ce qu'on nomme, rien d'autre. */
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify({
        origin: { address: home },
        destination: { address: `${postalCode.toUpperCase()}, Québec, Canada` },
        travelMode: "TRANSIT",
        arrivalTime: when.toISOString(),
        languageCode: "fr-CA",
        units: "METRIC",
      }),
    });
  } catch (e) {
    lastError = (e as Error).name === "AbortError"
      ? `pas de réponse en ${TIMEOUT_MS / 1000} s`
      : String((e as Error).message).slice(0, 200);
    await logEvent("transit_failed", { postal, weekday, reason: lastError });
    return { minutes: null, cached: false, reason: lastError };
  } finally {
    clearTimeout(minuteur);
  }

  if (!res.ok) {
    const corps = await res.text().catch(() => "");
    lastError = `HTTP ${res.status} · ${corps.slice(0, 200)}`;
    await logEvent("transit_failed", { postal, weekday, reason: lastError });
    return { minutes: null, cached: false, reason: lastError };
  }

  const minutes = parseDuration(await res.json().catch(() => null));
  if (minutes == null) {
    /* Pas d'itinéraire : c'est une réponse valable de Google, pas une panne.
       Un dimanche soir vers une adresse mal desservie en est le cas type. */
    lastError = "aucun itinéraire en transport en commun";
    await logEvent("transit_no_route", { postal, weekday });
    return { minutes: null, cached: false, reason: lastError };
  }

  lastError = null;
  await writeCache(postal, weekday, minutes);
  return { minutes, cached: false, reason: null };
}

/**
 * La durée du premier itinéraire, en minutes.
 *
 * Écrit pour se taire plutôt que pour deviner : si la réponse n'a pas la
 * forme attendue — un champ renommé, une version qui change —, on rend
 * `null` et la liste de secours prend le relais. Mieux vaut une réservation
 * marquée « trajet non vérifié » qu'un nombre inventé.
 */
function parseDuration(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const d = (routes[0] as { duration?: unknown }).duration;
  if (typeof d !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d.trim());
  if (!m) return null;
  const secondes = Number(m[1]);
  if (!Number.isFinite(secondes) || secondes <= 0) return null;
  return Math.round(secondes / 60);
}

/** Ramène une date dans la fenêtre que Google accepte, en gardant le jour et l'heure. */
function clampToWindow(d: Date): Date {
  const now = Date.now();
  const max = now + 95 * 86400_000;   // Google va jusqu'à 100 jours ; on garde une marge
  const min = now + 60_000;
  if (d.getTime() >= min && d.getTime() <= max) return d;
  if (d.getTime() > max) {
    /* Reculer de semaines entières préserve le jour de la semaine et l'heure. */
    const semaines = Math.ceil((d.getTime() - max) / (7 * 86400_000));
    return new Date(d.getTime() - semaines * 7 * 86400_000);
  }
  const semaines = Math.ceil((min - d.getTime()) / (7 * 86400_000));
  return new Date(d.getTime() + semaines * 7 * 86400_000);
}

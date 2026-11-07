import { getRefreshToken, getSettings } from "./settings";
import { SITE_URL } from "./brand";

/**
 * Client Google minimaliste (OAuth 2.0 + Calendar + Gmail) en fetch pur.
 * Aucune dépendance lourde : moins de surface, démarrage à froid plus rapide.
 */

export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants");
  return { id, secret };
}

/** Origine canonique du site — doit correspondre à l'URI de redirection déclarée chez Google. */
export function siteOrigin(fallbackHost?: string | null): string {
  /* En production, l'adresse canonique, avec www, quoi que dise la variable :
     voir SITE_URL dans brand.ts. */
  if (process.env.VERCEL_ENV === "production") return SITE_URL;
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (fallbackHost) return `http${fallbackHost.startsWith("localhost") ? "" : "s"}://${fallbackHost}`;
  return "http://localhost:3000";
}

export function redirectUri(host?: string | null): string {
  return `${siteOrigin(host)}/api/auth/google/callback`;
}

export function authUrl(state: string, host?: string | null): string {
  const { id } = creds();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(host),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",              // force la remise d'un refresh_token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
};

export async function exchangeCode(code: string, host?: string | null): Promise<TokenSet> {
  const { id, secret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri(host),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new GoogleError("token_exchange", res.status, await res.text());
  return res.json();
}

export class GoogleError extends Error {
  constructor(public op: string, public status: number, public body: string) {
    super(`Google ${op} a échoué (${status}): ${body.slice(0, 400)}`);
    this.name = "GoogleError";
  }
  /** Le propriétaire a révoqué l'accès ou le jeton est mort. */
  get needsReconnect() {
    return this.status === 400 || this.status === 401 ||
      /invalid_grant|unauthorized|Token has been expired or revoked/i.test(this.body);
  }
}

/* — Cache mémoire du jeton d'accès, par instance serverless — */
let cache: { token: string; expires: number } | null = null;

export async function refreshAccessToken(refresh: string): Promise<string> {
  const { id, secret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new GoogleError("refresh_token", res.status, await res.text());
  const data = (await res.json()) as TokenSet;
  cache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

/** Jeton d'accès pour le compte du propriétaire. `null` si personne n'est branché. */
export async function ownerAccessToken(): Promise<string | null> {
  if (cache && cache.expires > Date.now()) return cache.token;
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  return refreshAccessToken(refresh);
}

export function clearTokenCache() { cache = null; }

async function api<T>(op: string, url: string, init: RequestInit, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new GoogleError(op, res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ============================ Profil ============================ */

export type GoogleProfile = { email: string; name?: string; picture?: string; verified_email?: boolean };

export async function userInfo(accessToken: string): Promise<GoogleProfile> {
  return api("userinfo", "https://www.googleapis.com/oauth2/v2/userinfo", { method: "GET" }, accessToken);
}

/* ============================ Calendar ============================ */

export type CalendarSummary = { id: string; summary: string; primary?: boolean; accessRole: string; backgroundColor?: string };

export async function listCalendars(accessToken: string): Promise<CalendarSummary[]> {
  const data = await api<{ items?: CalendarSummary[] }>(
    "calendarList",
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250",
    { method: "GET" }, accessToken,
  );
  return data.items ?? [];
}

export type Busy = { start: string; end: string };

export async function freeBusy(
  accessToken: string, calendarId: string, timeMin: string, timeMax: string, timeZone: string,
): Promise<Busy[]> {
  const data = await api<{ calendars?: Record<string, { busy?: Busy[]; errors?: unknown[] }> }>(
    "freeBusy",
    "https://www.googleapis.com/calendar/v3/freeBusy",
    { method: "POST", body: JSON.stringify({ timeMin, timeMax, timeZone, items: [{ id: calendarId }] }) },
    accessToken,
  );
  const cal = data.calendars?.[calendarId] ?? Object.values(data.calendars ?? {})[0];
  return cal?.busy ?? [];
}

export type EventInput = {
  calendarId: string;
  /** L'identifiant choisi par nous (`newEventId`) : une création reprise ne double rien. */
  id?: string;
  summary: string;
  description: string;
  location: string;
  start: string;          // ISO
  end: string;            // ISO
  timeZone: string;
  attendeeEmail?: string;
  attendeeName?: string;
};

export async function createEvent(accessToken: string, e: EventInput): Promise<{ id: string; htmlLink: string }> {
  const body: Record<string, unknown> = {
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: { dateTime: e.start, timeZone: e.timeZone },
    end: { dateTime: e.end, timeZone: e.timeZone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 120 }, { method: "email", minutes: 1440 }] },
    source: { title: "NIVEX", url: siteOrigin() },
    transparency: "opaque",
  };
  if (e.id) body.id = e.id;
  if (e.attendeeEmail) {
    body.attendees = [{ email: e.attendeeEmail, displayName: e.attendeeName, responseStatus: "needsAction" }];
  }
  return api(
    "events.insert",
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(e.calendarId)}/events` +
      `?sendUpdates=${e.attendeeEmail ? "all" : "none"}&conferenceDataVersion=0`,
    { method: "POST", body: JSON.stringify(body) },
    accessToken,
  );
}

export async function deleteEvent(
  accessToken: string, calendarId: string, eventId: string, opts: { notify?: boolean } = {},
): Promise<void> {
  /* Une annulation prévient l'invité ; l'effacement d'une vieille séance, à
     l'anonymisation, ne prévient personne. */
  const send = opts.notify === false ? "none" : "all";
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${send}`,
    { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } },
  );
  // 410 = déjà supprimé, 404 = introuvable : dans les deux cas, l'objectif est atteint.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new GoogleError("events.delete", res.status, await res.text());
  }
}

/* ============================ Séries ============================ */

/**
 * Un événement récurrent, pour une série d'abonnement.
 *
 * Aucun invité : chaque retouche d'une occurrence — un numéro de visite qui
 * change, une visite déplacée — enverrait sinon un courriel de Google au
 * client. Il reçoit les nôtres. L'heure de départ porte le fuseau : c'est
 * lui qui garde 10 h à 10 h de part et d'autre du changement d'heure.
 */
export async function createRecurringEvent(
  accessToken: string,
  e: Omit<EventInput, "attendeeEmail" | "attendeeName"> & { rrule: string },
): Promise<{ id: string }> {
  return api(
    "events.insert",
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(e.calendarId)}/events?sendUpdates=none`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: { dateTime: e.start, timeZone: e.timeZone },
        end: { dateTime: e.end, timeZone: e.timeZone },
        recurrence: [e.rrule],
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 120 }] },
        source: { title: "NIVEX", url: siteOrigin() },
        transparency: "opaque",
      }),
    },
    accessToken,
  );
}

export type Instance = { id: string; originalStart: string };

/** Les occurrences d'un événement récurrent, avec leur heure d'origine. */
export async function listInstances(accessToken: string, calendarId: string, eventId: string): Promise<Instance[]> {
  const out: Instance[] = [];
  let page: string | undefined;
  do {
    const data = await api<{
      items?: { id: string; originalStartTime?: { dateTime?: string } }[];
      nextPageToken?: string;
    }>(
      "events.instances",
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/instances` +
        `?maxResults=250${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
      { method: "GET" }, accessToken,
    );
    for (const i of data.items ?? []) {
      if (i.originalStartTime?.dateTime) out.push({ id: i.id, originalStart: i.originalStartTime.dateTime });
    }
    page = data.nextPageToken;
  } while (page);
  return out;
}

/** Un moment d'un événement, tel que Google l'écrit : une heure, ou un jour entier. */
export type EventMoment = { dateTime?: string; date?: string };

/**
 * Retouche d'un événement ou d'une seule occurrence d'une série.
 *
 * Sur une occurrence, Google en fait une exception : le reste de la série ne
 * bouge pas. C'est ainsi que chaque visite porte son propre rang, « 3/4 ».
 * Google renvoie l'événement retouché : son heure se vérifie.
 */
export async function patchEvent(
  accessToken: string, calendarId: string, eventId: string,
  p: { summary?: string; description?: string; start?: string; end?: string; timeZone?: string },
): Promise<{ status?: string; start?: EventMoment; end?: EventMoment } | undefined> {
  const body: Record<string, unknown> = {};
  if (p.summary !== undefined) body.summary = p.summary;
  if (p.description !== undefined) body.description = p.description;
  if (p.start && p.timeZone) body.start = { dateTime: p.start, timeZone: p.timeZone };
  if (p.end && p.timeZone) body.end = { dateTime: p.end, timeZone: p.timeZone };
  return api(
    "events.patch",
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "PATCH", body: JSON.stringify(body) },
    accessToken,
  );
}

/**
 * Un événement tel que l'agenda le liste, occurrences de série dépliées : ce
 * qu'il faut pour savoir s'il occupe l'artisan, et pour le nommer.
 */
export type CalendarItem = {
  id: string;
  recurringEventId?: string;
  status?: string;
  summary?: string;
  start?: EventMoment;
  end?: EventMoment;
  transparency?: string;
  eventType?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/**
 * Les événements d'une plage, chacun avec son identifiant.
 *
 * La disponibilité (`freeBusy`) ne dit que des heures, fondues ensemble :
 * impossible d'y reconnaître une visite qu'on déplace, ni de nommer ce qui
 * gêne. La liste, si. Google borne une page à 2 500 événements ; dix pages
 * couvrent bien plus que les quelques jours qu'on lui demande.
 */
export async function listEvents(
  accessToken: string, calendarId: string, timeMin: string, timeMax: string,
): Promise<CalendarItem[]> {
  const out: CalendarItem[] = [];
  let page: string | undefined;
  let pages = 0;
  do {
    const q = new URLSearchParams({
      timeMin, timeMax, singleEvents: "true", maxResults: "2500",
      fields: "items(id,recurringEventId,status,summary,start,end,transparency,eventType,attendees(self,responseStatus)),nextPageToken",
    });
    if (page) q.set("pageToken", page);
    const data = await api<{ items?: CalendarItem[]; nextPageToken?: string }>(
      "events.list",
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${q}`,
      { method: "GET" }, accessToken,
    );
    out.push(...(data.items ?? []));
    page = data.nextPageToken;
  } while (page && ++pages < 10);
  return out;
}

/* ============================ Reprises ============================ */

/**
 * Une erreur passagère : débit dépassé, conflit d'écriture, Google en
 * panne, réseau coupé. La même demande, un instant plus tard, peut passer.
 * Une heure refusée, un événement introuvable ou un compte révoqué, non.
 */
export function transientGoogleError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (!(e instanceof GoogleError)) return false;
  if (e.status === 409 || e.status === 429 || e.status >= 500) return true;
  return e.status === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(e.body);
}

/** L'événement n'existe plus : effacé à la main, ou déjà retiré. */
export function goneGoogleError(e: unknown): boolean {
  return e instanceof GoogleError && (e.status === 404 || e.status === 410);
}

export type RetryOptions = { attempts?: number; sleep?: (ms: number) => Promise<void> };

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Trois essais au plus, à 0,4 puis 1,2 seconde d'intervalle, pour une erreur passagère seulement. */
export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const attempts = o.attempts ?? 3;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !transientGoogleError(e)) throw e;
      await (o.sleep ?? pause)(400 * 3 ** (i - 1));
    }
  }
}

/* ============================ Déplacer un événement ============================ */

/**
 * Ce qu'est devenu l'événement d'un rendez-vous déplacé.
 *
 * - `moved` : retouché sur place, même identifiant ; l'ancien créneau est libre.
 * - `replaced` : la retouche a été refusée ; l'ancien a été supprimé et un
 *   nouveau créé à la bonne heure (`reason` dit pourquoi).
 * - `created` : il n'y avait plus d'événement (effacé à la main, ou gardé
 *   par Google à l'état supprimé) ; un nouveau est créé.
 * - `failed` : Google a refusé. `stale` : l'ancien événement est resté à
 *   l'ancienne heure, et rien n'a été créé à la nouvelle.
 */
export type EventMove =
  | { status: "moved"; eventId: string }
  | { status: "replaced"; eventId: string; previous: string; reason: string }
  | { status: "created"; eventId: string }
  | { status: "failed"; eventId: string | null; stale: boolean; error: string };

/**
 * Un identifiant d'événement choisi par nous : 26 caractères de l'alphabet
 * que Google accepte (base32hex, de 0 à 9 et de a à v), 130 bits de hasard.
 * Une création reprise après une réponse perdue reçoit alors 409 au lieu de
 * créer un second événement.
 */
export function newEventId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuv";
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(26)), (b) => alphabet[b % 32]).join("");
}

function sameInstant(m: EventMoment | undefined, iso: string): boolean {
  return Boolean(m?.dateTime) && Date.parse(m!.dateTime!) === Date.parse(iso);
}

function errorText(e: unknown): string {
  if (e instanceof GoogleError) return `${e.op} — HTTP ${e.status} · ${e.body.slice(0, 300)}`;
  return String((e as Error)?.message ?? e).slice(0, 300);
}

/**
 * Met l'événement d'un rendez-vous à sa nouvelle heure, sans jamais le doubler.
 *
 * D'abord la retouche de l'événement lui-même : une occurrence de série
 * devient une exception et garde son identifiant. Google renvoie l'événement
 * retouché, et l'heure se vérifie. Si la retouche est refusée, ou si l'heure
 * n'a pas suivi, l'événement est supprimé puis recréé à la bonne heure.
 * Si même la suppression échoue, rien n'est créé : deux événements pour un
 * rendez-vous feraient croire à deux rendez-vous. L'échec remonte alors,
 * ancien événement compris.
 *
 * Avant le 7 novembre 2026, une visite d'abonné déplacée était retouchée
 * dans un lot avec toutes les autres, sans vérification ni repli : un refus
 * de Google laissait l'événement à l'ancienne heure, qui restait bloquée.
 */
export async function moveEvent(
  accessToken: string, calendarId: string, currentId: string | null,
  e: { summary: string; description: string; location: string; start: string; end: string; timeZone: string },
  o: RetryOptions = {},
): Promise<EventMove> {
  let previous = currentId;
  let reason = "";
  if (previous) {
    try {
      const ev = await withRetry(() => patchEvent(accessToken, calendarId, previous!, e), o);
      if (ev?.status === "cancelled") {
        /* Google garde quelque temps un événement supprimé, et peut en
           accepter la retouche sans le rendre visible : il est parti. */
        previous = null;
      } else if (!ev?.start || (sameInstant(ev.start, e.start) && sameInstant(ev.end, e.end))) {
        /* Une réponse sans heure ne prouve rien contre la retouche : Google
           l'a acceptée. */
        return { status: "moved", eventId: previous };
      } else {
        reason = `l'événement n'a pas pris la nouvelle heure (${ev.start.dateTime ?? ev.start.date ?? "?"})`;
      }
    } catch (err) {
      if (goneGoogleError(err)) previous = null;
      else reason = errorText(err);
    }
    if (previous) {
      try {
        await withRetry(() => deleteEvent(accessToken, calendarId, previous!, { notify: false }), o);
      } catch (err) {
        return { status: "failed", eventId: previous, stale: true, error: `${reason} ; suppression : ${errorText(err)}` };
      }
    }
  }
  const id = newEventId();
  try {
    await withRetry(async () => {
      try {
        await createEvent(accessToken, { calendarId, ...e, id });
      } catch (err) {
        /* Créé chez Google, mais la réponse s'est perdue : la reprise reçoit
           409, et l'événement existe déjà sous notre identifiant. */
        if (!(err instanceof GoogleError && err.status === 409)) throw err;
      }
    }, o);
    return previous
      ? { status: "replaced", eventId: id, previous, reason }
      : { status: "created", eventId: id };
  } catch (err) {
    return { status: "failed", eventId: null, stale: false, error: errorText(err) };
  }
}

/* ============================ Gmail ============================ */

function encodeHeader(v: string): string {
  // RFC 2047 pour les accents dans Subject / From
  return /[^\x20-\x7E]/.test(v) ? `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=` : v;
}

/**
 * Le nom affiché d'un destinataire, tel que l'en-tête To: peut le porter.
 *
 * Ce nom, c'est le client qui l'a tapé. Laissé tel quel, « Tremblay, Jean »
 * se lit comme deux adresses, dont une fausse, et Gmail refuse l'envoi ;
 * « Ann <a@x.org>, Bob » ajoute des destinataires au choix de qui remplit
 * le formulaire. En ASCII, le nom passe donc entre guillemets, guillemets
 * et barres obliques inverses échappés ; avec un accent, il est encodé en entier
 * (RFC 2047) — ce qui couvre aussi tout retour à la ligne.
 */
export function displayName(name: string): string {
  if (/[^\x20-\x7E]/.test(name)) return encodeHeader(name);
  return `"${name.replace(/[\\"]/g, "\\$&")}"`;
}

export async function sendGmail(
  accessToken: string,
  msg: { to: string; toName?: string; subject: string; html: string; text: string; fromName: string; replyTo?: string; bcc?: string },
): Promise<{ id: string }> {
  const boundary = `nivex_${Math.random().toString(36).slice(2)}`;
  const to = msg.toName ? `${displayName(msg.toName)} <${msg.to}>` : msg.to;

  const headers = [
    `From: ${encodeHeader(msg.fromName)} <me>`,
    `To: ${to}`,
    msg.bcc ? `Bcc: ${msg.bcc}` : null,
    msg.replyTo ? `Reply-To: ${msg.replyTo}` : null,
    `Subject: ${encodeHeader(msg.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean).join("\r\n");

  const body = [
    "", `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64", "",
    Buffer.from(msg.text, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64", "",
    Buffer.from(msg.html, "utf8").toString("base64"),
    `--${boundary}--`, "",
  ].join("\r\n");

  /* Une ligne vide sépare les en-têtes du corps (RFC 5322). Sans elle, la
     première frontière se lisait comme un en-tête mal formé : Gmail le
     tolère, un relais plus strict perdrait la structure du message. */
  const raw = Buffer.from(`${headers}\r\n${body}`, "utf8").toString("base64url");

  return api(
    "gmail.send",
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    { method: "POST", body: JSON.stringify({ raw }) },
    accessToken,
  );
}

/** Révoque le jeton côté Google (déconnexion propre). */
export async function revoke(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }).catch(() => {});
}

/** Raccourci : jeton + réglages, ou `null` si le service n'est pas branché. */
export async function ownerContext() {
  const settings = await getSettings();
  if (!settings.connected || !googleConfigured()) return null;
  const accessToken = await ownerAccessToken();
  if (!accessToken) return null;
  return { accessToken, settings };
}

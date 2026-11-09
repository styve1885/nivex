import { PHONE } from "./brand";
import { ensureSchema, isDbConfigured, logEvent, sql } from "./db";
import { isCanadianNumber, knownClientName, OPT_OUT, ownerSmsNumber, smsConfigured, toE164 } from "./sms";
import { ADMIN_TEXT_MAX, smsSegments } from "./phone";

/**
 * Les textos échangés avec les clients, pour l'onglet Messages.
 *
 * Rien n'est gardé sur le site : Twilio a déjà une copie de chaque texto,
 * envoyé ou reçu, et l'onglet la lit chez lui à l'affichage. Une
 * conversation, c'est tout ce qui est parti vers un numéro (confirmations,
 * rappels, messages de l'artisan) et tout ce qui en est venu, dans l'ordre.
 * Les avis de l'artisan, envoyés à son cellulaire, n'en font jamais partie.
 *
 * L'artisan écrit depuis l'onglet, et le texto part du numéro de la maison,
 * comme les autres. Comme partout, seuls les numéros canadiens reçoivent des
 * textos (`isCanadianNumber`). Les réponses du client lui sont toujours
 * relayées sur son cellulaire (/api/sms/incoming) ; l'onglet ne fait que les
 * montrer.
 */

const API = "https://api.twilio.com";

/** Au-delà, l'onglet n'écrit plus pendant l'heure : une session volée ne fait pas partir des centaines de textos. */
export const ADMIN_TEXTS_PER_HOUR = 60;

/** Les conversations récentes : ce qui s'est échangé depuis ce nombre de jours. */
export const RECENT_DAYS = 60;

/** Une conversation montre ses derniers textos, au plus ce nombre. */
export const CONVERSATION_MAX = 200;

/** Les images qu'on montre dans la page ; toute autre pièce jointe se télécharge. */
export const INLINE_IMAGES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Une pièce jointe : `inline`, une image ordinaire, qui s'affiche dans la page. */
export type TextMedia = { sid: string; type: string; inline: boolean };

/** Un texto de la conversation, tel que l'onglet l'affiche. */
export type TextMessage = {
  sid: string;
  /** « in » : le client écrit ; « out » : la maison (l'artisan, ou un texto automatique). */
  direction: "in" | "out";
  body: string;
  /** L'heure d'envoi, ou de création pour un texto pas encore parti. */
  at: string;
  /** L'état chez Twilio : queued, sent, delivered, undelivered, failed, scheduled, received… */
  status: string;
  /** Pourquoi le texto n'est pas arrivé, en clair. */
  problem: string | null;
  numMedia: number;
  media: TextMedia[];
};

export type ConversationSummary = {
  number: string;
  name: string | null;
  canText: boolean;
  at: string;
  direction: "in" | "out";
  excerpt: string;
  /** Le dernier mot vient du client : il attend sans doute une réponse. */
  awaiting: boolean;
};

export type Conversation = {
  number: string;
  name: string | null;
  canText: boolean;
  messages: TextMessage[];
  /** Le client a répondu STOP, et pas START depuis : Twilio refusera de lui écrire. */
  optedOut: boolean;
  /** Il y a plus ancien que ce qui est montré. */
  truncated: boolean;
};

export type ClientEntry = { name: string; number: string; canText: boolean };

/** Un message tel que Twilio le rend : les seuls champs dont on se sert. */
export type TwilioMessage = {
  sid: string;
  body?: string | null;
  direction?: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
  date_sent?: string | null;
  date_created?: string | null;
  error_code?: number | null;
  num_media?: string | number | null;
};

/* ============================ Fonctions pures ============================ */

/**
 * Les raisons d'un refus ou d'un texto non remis, selon le code de Twilio.
 * Les codes 21… arrivent au moment d'écrire ; les 30…, plus tard, sur un
 * texto parti que l'opérateur n'a pas remis.
 */
const PROBLEMS: Record<number, string> = {
  21211: "ce numéro n'est pas valide",
  21408: "Twilio n'écrit pas vers cette région (permissions géographiques)",
  21610: "le client a répondu STOP : Twilio ne lui écrit plus tant qu'il n'a pas répondu START",
  21612: "ce numéro ne reçoit pas de textos",
  21614: "ce numéro ne reçoit pas de textos, une ligne fixe peut-être",
  30003: "téléphone éteint ou hors réseau",
  30004: "le destinataire bloque les textos",
  30005: "numéro inconnu de l'opérateur",
  30006: "ligne fixe, ou numéro qui ne reçoit pas de textos",
  30007: "filtré par l'opérateur",
  30008: "erreur de l'opérateur",
};

export function deliveryProblem(code: number | null | undefined): string {
  if (code && PROBLEMS[code]) return PROBLEMS[code];
  return code ? `refusé par Twilio (code ${code})` : "non remis";
}

/** Le moment d'un message : son envoi, ou sa création s'il n'est pas encore parti. */
function momentOf(m: TwilioMessage): string {
  const d = new Date(m.date_sent ?? m.date_created ?? 0);
  return (Number.isNaN(d.getTime()) ? new Date(0) : d).toISOString();
}

/** L'autre bout d'un message : celui qui écrit, ou celui à qui l'on écrit. */
export function partyOf(m: TwilioMessage): string | null {
  const n = m.direction === "inbound" ? m.from : m.to;
  return typeof n === "string" && /^\+\d{8,15}$/.test(n) ? n : null;
}

export function textFrom(m: TwilioMessage): TextMessage {
  const status = String(m.status ?? "");
  return {
    sid: m.sid,
    direction: m.direction === "inbound" ? "in" : "out",
    body: String(m.body ?? ""),
    at: momentOf(m),
    status,
    problem: status === "failed" || status === "undelivered" ? deliveryProblem(m.error_code) : null,
    numMedia: Number(m.num_media ?? 0) || 0,
    media: [],
  };
}

const byTime = (a: { at: string }, b: { at: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/** Une ligne pour la liste : le début du texte, ou ce qu'il porte. */
export function excerpt(t: TextMessage): string {
  const text = t.body.replace(/\s+/g, " ").trim();
  if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;
  if (t.numMedia > 0) return t.numMedia > 1 ? `${t.numMedia} pièces jointes` : "Une pièce jointe";
  return "(message vide)";
}

/**
 * Les conversations, la plus récente d'abord : le dernier texto échangé avec
 * chaque numéro. Les numéros de la maison et le cellulaire de l'artisan
 * (`exclude`) n'en sont pas : ce sont ses avis, pas des clients. Un texto
 * programmé puis décommandé n'est jamais parti : il ne compte pas.
 */
export function groupConversations(
  messages: TwilioMessage[], o: { exclude: Iterable<string>; names: Map<string, string> },
): ConversationSummary[] {
  const skip = new Set(o.exclude);
  const latest = new Map<string, TextMessage>();
  for (const m of messages) {
    if (m.status === "canceled") continue;
    const party = partyOf(m);
    if (!party || skip.has(party)) continue;
    const t = textFrom(m);
    const cur = latest.get(party);
    if (!cur || t.at > cur.at) latest.set(party, t);
  }
  return [...latest.entries()]
    .map(([number, t]) => ({
      number,
      name: o.names.get(number.slice(-10)) ?? null,
      canText: isCanadianNumber(number),
      at: t.at,
      direction: t.direction,
      excerpt: excerpt(t),
      awaiting: t.direction === "in" && !OPT_OUT.test(t.body),
    }))
    .sort((a, b) => byTime(b, a));
}

/** Les mots qui réinscrivent chez Twilio. */
const OPT_IN = /^\s*(start|yes|unstop)\s*$/i;

/** Le client s'est-il désinscrit, à lire ce qu'il a écrit dans l'ordre ? */
export function optedOut(texts: TextMessage[]): boolean {
  let out = false;
  for (const t of texts) {
    if (t.direction !== "in") continue;
    if (OPT_OUT.test(t.body)) out = true;
    else if (OPT_IN.test(t.body)) out = false;
  }
  return out;
}

/** Une conversation : ses textos dans l'ordre, les plus récents seulement, sans ceux qui ne sont jamais partis. */
export function threadFrom(messages: TwilioMessage[]): TextMessage[] {
  const seen = new Set<string>();
  return messages
    .filter((m) => m.status !== "canceled" && !seen.has(m.sid) && Boolean(seen.add(m.sid)))
    .map(textFrom)
    .sort(byTime)
    .slice(-CONVERSATION_MAX);
}

/* ============================ Lecture chez Twilio ============================ */

export class TwilioReadError extends Error {
  constructor(readonly status: number, readonly code: number | null) {
    super(`Twilio ${status}${code ? ` (${code})` : ""}`);
    this.name = "TwilioReadError";
  }
}

/** Ce que l'onglet dit quand Twilio ne répond pas, sans rien qui ressemble à une clé. */
export function readFailure(e: unknown): string {
  if (e instanceof TwilioReadError) {
    if (e.status === 401 || e.status === 403) return "Twilio refuse la lecture : vérifiez TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN chez Vercel.";
    if (e.status === 429) return "Twilio limite les lectures pour l'instant : réessayez dans une minute.";
    return `Twilio n'a pas répondu comme prévu (HTTP ${e.status}). Réessayez.`;
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "Twilio n'a pas répondu à temps. Réessayez.";
  return "Twilio est injoignable pour l'instant. Réessayez.";
}

function authorization(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  return `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN ?? ""}`).toString("base64")}`;
}

function account(path: string): string {
  return `${API}/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID ?? "")}/${path}`;
}

async function readTwilio<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { authorization: authorization(), accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const code = await res.json().then((j) => Number(j?.code) || null).catch(() => null);
    throw new TwilioReadError(res.status, code);
  }
  return (await res.json()) as T;
}

/**
 * Les messages du compte qui répondent au filtre (`To`, `From`, `DateSent>`),
 * les plus récents d'abord, sur `pages` pages au plus. `more` dit s'il en
 * reste au-delà.
 */
export async function listTwilioMessages(
  filter: Record<string, string>, o: { pageSize?: number; pages?: number } = {},
): Promise<{ messages: TwilioMessage[]; more: boolean }> {
  const query = new URLSearchParams({ ...filter, PageSize: String(o.pageSize ?? CONVERSATION_MAX) });
  let url: string | null = `${account("Messages.json")}?${query}`;
  const messages: TwilioMessage[] = [];
  for (let page = 0; url && page < (o.pages ?? 1); page++) {
    const got: { messages?: TwilioMessage[]; next_page_uri?: string | null } = await readTwilio(url);
    messages.push(...(got.messages ?? []));
    const next = got.next_page_uri;
    url = typeof next === "string" && next.startsWith("/2010-04-01/") ? `${API}${next}` : null;
  }
  return { messages, more: url !== null };
}

/** Les pièces jointes d'un message : leur identifiant et leur type. */
async function mediaOf(messageSid: string): Promise<TextMedia[]> {
  const got: { media_list?: { sid?: string; content_type?: string }[] } = await readTwilio(account(`Messages/${messageSid}/Media.json`));
  return (got.media_list ?? [])
    .filter((m): m is { sid: string; content_type?: string } => typeof m.sid === "string" && /^ME[0-9a-f]{32}$/.test(m.sid))
    .map((m) => {
      const type = String(m.content_type ?? "application/octet-stream").toLowerCase();
      return { sid: m.sid, type, inline: INLINE_IMAGES.has(type) };
    });
}

/** Les numéros qui ne sont pas des clients : la maison, et le cellulaire de l'artisan. */
function houseNumbers(): string[] {
  return [ownerSmsNumber(), toE164(process.env.TWILIO_FROM), toE164(PHONE)].filter((n): n is string => Boolean(n));
}

/** Les conversations des derniers jours, la plus récente d'abord. */
export async function loadRecent(names: Map<string, string>): Promise<ConversationSummary[]> {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const { messages } = await listTwilioMessages({ "DateSent>": since }, { pageSize: 1000, pages: 3 });
  return groupConversations(messages, { exclude: houseNumbers(), names }).slice(0, 60);
}

/** Tout ce qui s'est échangé avec ce numéro, dans l'ordre, photos comprises. */
export async function loadConversation(number: string): Promise<Conversation> {
  const [sent, received] = await Promise.all([
    listTwilioMessages({ To: number }),
    listTwilioMessages({ From: number }),
  ]);
  const messages = threadFrom([...sent.messages, ...received.messages]);
  /* Les pièces jointes ne viennent qu'à la demande, une liste par message. */
  await Promise.all(messages.filter((t) => t.numMedia > 0).slice(-30).map(async (t) => {
    t.media = await mediaOf(t.sid).catch(() => []);
  }));
  return {
    number,
    name: await knownClientName(number),
    canText: isCanadianNumber(number),
    messages,
    optedOut: optedOut(messages),
    truncated: sent.more || received.more,
  };
}

/**
 * Une pièce jointe, lue chez Twilio pour la page de l'artisan. Twilio exige
 * la clé, puis renvoie souvent vers son stockage, qui la refuse : on suit le
 * renvoi sans elle. Seules les images ordinaires s'affichent dans la page ;
 * le reste (une image SVG pourrait porter du code) se télécharge.
 */
export async function fetchMedia(messageSid: string, mediaSid: string): Promise<Response> {
  const notFound = () => new Response("not found", { status: 404 });
  if (!/^MM[0-9a-f]{32}$/.test(messageSid) || !/^ME[0-9a-f]{32}$/.test(mediaSid)) return notFound();
  let res = await fetch(account(`Messages/${messageSid}/Media/${mediaSid}`), {
    headers: { authorization: authorization() }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const location = res && res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
  if (location?.startsWith("https://")) {
    res = await fetch(location, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  }
  if (!res?.ok || !res.body) return notFound();
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const inline = INLINE_IMAGES.has(type);
  return new Response(res.body, {
    headers: {
      "content-type": inline ? type : "application/octet-stream",
      "content-disposition": inline ? "inline" : 'attachment; filename="piece-jointe"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/* ============================ L'annuaire et l'envoi ============================ */

/**
 * Les clients à qui l'on peut écrire : un nom et un numéro par personne, le
 * nom le plus récent, tirés des rendez-vous et des abonnements. Un client
 * anonymisé (trois ans après sa dernière séance) n'a plus de numéro : il
 * n'y figure pas.
 */
export async function clientDirectory(): Promise<ClientEntry[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const rows = (await sql()`
    SELECT DISTINCT ON (ten) ten, client_name FROM (
      SELECT right(regexp_replace(client_phone, '\\D', '', 'g'), 10) AS ten, client_name, created_at FROM nivex_bookings
      UNION ALL
      SELECT right(regexp_replace(client_phone, '\\D', '', 'g'), 10) AS ten, client_name, created_at FROM nivex_subscriptions
    ) t
    WHERE length(ten) = 10
    ORDER BY ten, created_at DESC`) as { ten: string; client_name: string }[];
  const own = new Set(houseNumbers());
  return rows
    .map((r) => ({ name: String(r.client_name ?? "").trim(), number: toE164(r.ten) }))
    .filter((r): r is { name: string; number: string } => Boolean(r.name && r.number && !own.has(r.number)))
    .map((r) => ({ ...r, canText: isCanadianNumber(r.number) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function adminTextsCapped(): Promise<boolean> {
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT count(*)::int AS n FROM nivex_events
      WHERE kind = 'sms_admin_sent' AND created_at > now() - interval '1 hour'`) as { n: number }[];
    return (rows[0]?.n ?? 0) >= ADMIN_TEXTS_PER_HOUR;
  } catch {
    return false;
  }
}

export type SendOutcome = { ok: true; message: TextMessage } | { ok: false; status: number; reason: string };

/**
 * Un texto de l'artisan à un client, depuis le numéro de la maison. Le
 * journal note qu'il est parti et sa longueur en tranches, jamais le numéro
 * ni le texte.
 */
export async function sendText(o: { to: string; body: string }): Promise<SendOutcome> {
  if (!smsConfigured()) {
    return { ok: false, status: 503, reason: "Les textos ne sont pas réglés : il manque une variable Twilio chez Vercel." };
  }
  const to = toE164(o.to);
  if (!to) return { ok: false, status: 400, reason: "Ce numéro n'est pas un numéro nord-américain à dix chiffres." };
  if (!isCanadianNumber(to)) return { ok: false, status: 400, reason: "Seuls les numéros canadiens reçoivent des textos." };
  const body = o.body.trim();
  if (!body) return { ok: false, status: 400, reason: "Le message est vide." };
  if (body.length > ADMIN_TEXT_MAX) {
    return { ok: false, status: 400, reason: `Le message dépasse ${ADMIN_TEXT_MAX} caractères : raccourcissez-le, ou envoyez-le en deux fois.` };
  }
  if (await adminTextsCapped()) {
    return { ok: false, status: 429, reason: `Plus de ${ADMIN_TEXTS_PER_HOUR} textos dans l'heure depuis l'onglet : réessayez un peu plus tard.` };
  }

  const res = await fetch(account("Messages.json"), {
    method: "POST",
    headers: { authorization: authorization(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: unknown) => e as Error);

  if (res instanceof Error) {
    await logEvent("sms_failed", { ref: "admin", error: res.name });
    return { ok: false, status: 502, reason: "Twilio est injoignable : le texto n'est pas parti. Réessayez." };
  }
  if (!res.ok) {
    const code = await res.json().then((j) => Number(j?.code) || null).catch(() => null);
    await logEvent("sms_failed", { ref: "admin", status: res.status, code });
    return { ok: false, status: 502, reason: `Le texto n'est pas parti : ${deliveryProblem(code)}.` };
  }
  const sent = (await res.json().catch(() => ({}))) as TwilioMessage;
  await logEvent("sms_admin_sent", { segments: smsSegments(body).segments });
  return {
    ok: true,
    message: textFrom({ ...sent, sid: typeof sent.sid === "string" ? sent.sid : `envoi-${Date.now()}`, direction: "outbound-api", body }),
  };
}

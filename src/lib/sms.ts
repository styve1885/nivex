import { createHmac, timingSafeEqual } from "node:crypto";
import { logEvent } from "./db";
import { PHONE, SMS_SIGNATURE } from "./brand";
import { toWall } from "./time";

/**
 * Les textos, par Twilio, en `fetch` pur.
 *
 * Un texto est un doublon commode du courriel, jamais une étape : il ne fait
 * échouer ni une réservation, ni une annulation, ni la tâche quotidienne. Une
 * clé absente, un numéro mal saisi, un refus de Twilio — tout se note au
 * journal et la maison continue.
 *
 * Trois variables : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (le
 * numéro acheté chez Twilio). Une quatrième, facultative, SMS_OWNER_TO, dit
 * où l'artisan reçoit les siens ; sans elle, le numéro de la maison. Une
 * cinquième, TWILIO_MESSAGING_SERVICE_SID, ouvre les textos programmés : le
 * « je serai chez vous » de deux heures avant. Twilio ne programme un envoi
 * que par un service de messagerie, jamais depuis un simple numéro.
 */

export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

/** Les textos programmés : il faut en plus un service de messagerie chez Twilio. */
export function smsScheduleConfigured(): boolean {
  return smsConfigured() && Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID);
}

/**
 * Un numéro nord-américain au format E.164, « +14509431217 », ou rien.
 *
 * Le formulaire accepte « 450 943-1217 », « (450) 943 1217 » ou « +1 450… » :
 * on garde les chiffres, on retire l'indicatif 1 s'il y est, et il doit en
 * rester dix. Ce qui ne s'y ramène pas n'est pas un numéro où écrire.
 * Qu'il soit canadien se vérifie à part, au moment d'écrire.
 */
export function toE164(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `+1${ten}`;
}

/**
 * Les indicatifs régionaux du Canada.
 *
 * Le plan nord-américain mêle au Canada les États-Unis et une vingtaine de
 * pays des Caraïbes (876 Jamaïque, 809 République dominicaine…), que Twilio
 * facture au tarif international. Écrire à n'importe quel « +1 » saisi dans
 * un formulaire public, c'est laisser un fraudeur faire partir des textos à
 * nos frais : on n'écrit donc qu'aux numéros canadiens. Un client dont le
 * numéro vient d'ailleurs réserve comme les autres, et garde ses courriels.
 */
const CANADA = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368",
  "382", "403", "416", "418", "428", "431", "437", "438", "450", "460", "468", "474", "506", "514",
  "519", "548", "579", "581", "584", "587", "604", "613", "639", "647", "672", "683", "705", "709",
  "742", "753", "778", "780", "782", "807", "819", "825", "867", "873", "879", "902", "905", "942",
]);

/** Un numéro canadien, au format E.164 : le seul où l'on écrit. */
export function isCanadianNumber(e164: string): boolean {
  return /^\+1\d{10}$/.test(e164) && CANADA.has(e164.slice(2, 5));
}

/** Le numéro où l'artisan reçoit ses textos. */
export function ownerSmsNumber(): string | null {
  return toE164(process.env.SMS_OWNER_TO || PHONE);
}

/**
 * Le numéro où écrire, ou la raison de ne pas écrire. Hors du Canada, le
 * texto ne part pas, et rien d'autre ne change : la réservation tient, le
 * courriel part. Seul l'indicatif est noté — il dit d'où venait le numéro
 * sans dire à qui il appartient.
 */
async function recipient(to: string | null | undefined, ref?: string): Promise<string | null> {
  const number = toE164(to);
  if (!number) {
    await logEvent("sms_skipped", { ref, reason: "invalid_number" });
    return null;
  }
  if (!isCanadianNumber(number)) {
    await logEvent("sms_skipped", { ref, reason: "not_canadian", area: number.slice(2, 5) });
    return null;
  }
  return number;
}

/** Un appel à l'API des messages : la réponse lue, ou le code d'erreur noté. */
async function twilio(path: string, params: Record<string, string>, ref?: string): Promise<{ sid: string } | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });
    if (!res.ok) {
      /* Twilio rend un code (21608 : numéro non vérifié en compte d'essai,
         21610 : destinataire désabonné par STOP…) et un message qui cite
         souvent le numéro. Le journal garde le code, pas le message. */
      const code = await res.json().then((j) => Number(j?.code) || null).catch(() => null);
      await logEvent("sms_failed", { ref, status: res.status, code });
      return null;
    }
    const json = await res.json().catch(() => ({}));
    return { sid: typeof json?.sid === "string" ? json.sid : "" };
  } catch (e) {
    await logEvent("sms_failed", { ref, error: String((e as Error)?.message ?? e).slice(0, 300) });
    return null;
  }
}

/** Envoie un texto. Vrai s'il est parti ; jamais d'exception. */
export async function sendSms(to: string | null | undefined, body: string, ref?: string): Promise<boolean> {
  if (!smsConfigured()) {
    await logEvent("sms_skipped", { ref, reason: "not_configured" });
    return false;
  }
  const number = await recipient(to, ref);
  if (!number) return false;
  const sent = await twilio("Messages.json", { To: number, From: process.env.TWILIO_FROM!, Body: body }, ref);
  if (!sent) return false;
  await logEvent("sms_sent", { ref });
  return true;
}

/**
 * Programme un texto chez Twilio, qui le fera partir à l'heure dite.
 *
 * Rend l'identifiant du message, pour pouvoir l'annuler si la séance bouge.
 * `retry` dit si un nouvel essai a un sens : pas pour un numéro étranger ou
 * mal saisi, qui le restera. Twilio exige un envoi entre quinze minutes et
 * trente-cinq jours d'avance ; l'appelant s'en charge. Jamais d'exception.
 */
export async function scheduleSms(
  to: string | null | undefined, body: string, sendAt: Date, ref?: string,
): Promise<{ sid: string | null; retry: boolean }> {
  if (!smsScheduleConfigured()) return { sid: null, retry: true };
  const number = await recipient(to, ref);
  if (!number) return { sid: null, retry: false };
  const sent = await twilio("Messages.json", {
    To: number,
    MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
    Body: body,
    ScheduleType: "fixed",
    SendAt: sendAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
  }, ref);
  if (!sent?.sid) return { sid: null, retry: true };
  await logEvent("sms_scheduled", { ref, at: sendAt.toISOString() });
  return { sid: sent.sid, retry: false };
}

/** Annule un texto programmé. Vrai si Twilio l'a retiré ; jamais d'exception. */
export async function cancelScheduledSms(messageSid: string, ref?: string): Promise<boolean> {
  if (!smsConfigured() || !/^SM[0-9a-f]{32}$/i.test(messageSid)) return false;
  const done = await twilio(`Messages/${encodeURIComponent(messageSid)}.json`, { Status: "canceled" }, ref);
  if (done) await logEvent("sms_unscheduled", { ref });
  return Boolean(done);
}

/* ============================ Les messages ============================ */

/*
 * Courts, sans fioriture : un texto se lit d'un coup d'œil, et chaque
 * tranche de 70 caractères accentués se paie. Le ton reste celui de la
 * maison — aucun point d'exclamation. Le client lit dans sa langue,
 * l'artisan en français.
 */

type Locale = "fr" | "en";

/** « mardi 20 octobre à 9 h 00 » / « Tuesday, October 20 at 9:00 a.m. » */
export function smsWhen(d: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", hour12: locale === "en",
  }).format(d);
}

/** « mardi 20 octobre » / « Tuesday, October 20 ». */
export function smsDay(d: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long",
  }).format(d);
}

/** « 12 h », « 9 h 30 » ; « 12 p.m. », « 9:30 a.m. » — à l'heure de Montréal. */
export function smsTime(d: Date, tz: string, locale: Locale): string {
  const { hour: h, minute: m } = toWall(d, tz);
  const mm = String(m).padStart(2, "0");
  if (locale === "fr") return m ? `${h} h ${mm}` : `${h} h`;
  const suffix = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${mm} ${suffix}` : `${h12} ${suffix}`;
}

/*
 * Comment ne plus en recevoir. Dit une fois, dans la confirmation : les
 * opérateurs l'attendent, et le répéter à chaque texto ferait payer une
 * tranche de plus.
 */
const STOP_LINE = { fr: " Répondez STOP pour ne plus recevoir de textos.", en: " Reply STOP to opt out." } as const;

/* La signature des trois textos de la séance, posée en dernier. Leur
   « NIVEX - » remplace le tiret cadratin des modèles : il ferait passer le
   texto en Unicode, payé deux tranches. */
const SIGN = ` ${SMS_SIGNATURE}`;

/* Une phrase qui finit sur une heure anglaise (« 2:00 p.m. ») a déjà son
   point : on n'en ajoute pas un second. */
const period = (s: string) => (s.endsWith(".") ? s : `${s}.`);

export const SMS = {
  /** Une séance ponctuelle vient d'être réservée : le jour, l'heure du début et celle de la fin. */
  bookingConfirmed: (l: Locale, day: string, start: string, end: string) => (l === "en"
    ? `NIVEX - Your session is confirmed for ${day}, from ${start} to ${period(end)} All you need to provide is the ironing board.`
    : `NIVEX - Votre séance est confirmée le ${day}, de ${start} à ${end}. Vous n'avez que la planche à prévoir.`) + STOP_LINE[l] + SIGN,

  /** Un abonnement vient d'être posé. */
  subscriptionConfirmed: (l: Locale, plan: string, when: string, rhythm: string, url: string) => (l === "en"
    ? `NIVEX: your ${plan} subscription is in place. First visit ${when}, then ${rhythm}. Manage: ${url}`
    : `NIVEX : votre abonnement ${plan} est en place. Première visite le ${when}, puis ${rhythm}. Gérer : ${url}`) + STOP_LINE[l],

  /**
   * Le rappel de la veille, ou du jour même pour une séance prise tard.
   * `arrival` est l'heure où l'artisan sonne : le début de la séance, ou un
   * quart d'heure avant pour un abonné resté à l'ancien déroulement. Le
   * montant n'y figure qu'à la première visite d'un cycle à régler.
   */
  reminder: (l: Locale, day: string, arrival: string, today: boolean, payment: string | null) => {
    const pay = payment ? (l === "en" ? ` Payment for the cycle at this visit: ${payment}.` : ` Paiement du cycle à cette visite : ${payment}.`) : "";
    if (l === "en") {
      return today
        ? `NIVEX - Reminder: today, ${day}, I arrive at ${period(arrival)}${pay} See you soon.${SIGN}`
        : `NIVEX - Reminder: tomorrow, ${day}, I arrive at ${period(arrival)}${pay} See you tomorrow.${SIGN}`;
    }
    return today
      ? `NIVEX - Rappel : aujourd'hui ${day}, j'arrive à ${arrival}.${pay} À tout à l'heure.${SIGN}`
      : `NIVEX - Rappel : demain ${day}, j'arrive à ${arrival}.${pay} À demain.${SIGN}`;
  },

  /** Deux heures avant l'arrivée, programmé chez Twilio. */
  soon: (l: Locale, arrival: string) => l === "en"
    ? `NIVEX - I will be at your door at ${period(arrival)}${SIGN}`
    : `NIVEX - Je serai chez vous à ${arrival}.${SIGN}`,

  /** Une séance ponctuelle annulée par l'artisan. */
  bookingCancelled: (l: Locale, when: string) => l === "en"
    ? `NIVEX: your session on ${when} is cancelled. Nothing will be charged.`
    : `NIVEX : votre séance du ${when} est annulée. Aucun montant ne vous sera facturé.`,

  /** Une visite d'abonnement annulée, avec son remplacement s'il y en a un. */
  visitCancelled: (l: Locale, when: string, replacement: string | null) => l === "en"
    ? `NIVEX: your visit on ${when} is cancelled.${replacement ? ` It is replaced on ${period(replacement)}` : ""}`
    : `NIVEX : votre visite du ${when} est annulée.${replacement ? ` Elle est remplacée le ${replacement}.` : ""}`,

  visitMoved: (l: Locale, from: string, to: string) => l === "en"
    ? `NIVEX: your visit on ${from} is moved to ${period(to)}`
    : `NIVEX : votre visite du ${from} est déplacée au ${to}.`,

  /** Une visite de remplacement posée à la main par l'artisan. */
  visitPlaced: (l: Locale, when: string) => l === "en"
    ? `NIVEX: your replacement visit is booked for ${period(when)}`
    : `NIVEX : votre visite de remplacement est posée le ${when}.`,

  /** La série suivante d'un abonnement, posée par l'artisan. */
  seriesRenewed: (l: Locale, when: string, rhythm: string, url: string) => l === "en"
    ? `NIVEX: your subscription continues. Next series: first visit ${when}, then ${rhythm}. Manage: ${url}`
    : `NIVEX : votre abonnement se poursuit. Série suivante : première visite le ${when}, puis ${rhythm}. Gérer : ${url}`,

  /** Un abonnement qui prend fin, et les visites à venir qu'il retire. */
  subscriptionEnded: (l: Locale, count: number) => l === "en"
    ? `NIVEX: your subscription is ending. ${count === 1 ? "Your upcoming visit is cancelled." : `Your ${count} upcoming visits are cancelled.`}`
    : `NIVEX : votre abonnement prend fin. ${count === 1 ? "Votre visite à venir est annulée." : `Vos ${count} visites à venir sont annulées.`}`,

  /** Pour l'artisan. Sans tiret cadratin, et ramenés à l'alphabet des
      textos (`toGsm7`) : un seul caractère hors de cet alphabet — le û
      d'« août », le ç de François — ferait passer tout le message en
      Unicode, payé deux tranches. */
  owner: {
    newBooking: (name: string, when: string, city: string) => toGsm7(`NIVEX : nouvelle séance, ${name}, ${when}, ${city}.`),
    newSubscription: (name: string, plan: string, when: string) => toGsm7(`NIVEX : nouvel abonnement ${plan}, ${name}, première visite le ${when}.`),
    cancelled: (name: string, when: string) => toGsm7(`NIVEX : ${name} a annulé sa visite du ${when}.`),
    moved: (name: string, from: string, to: string) => toGsm7(`NIVEX : ${name} a déplacé sa visite du ${from} au ${to}.`),
  },
};

/* L'alphabet des textos (GSM 03.38, table de base). */
const GSM7 = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const TYPOGRAPHY: Record<string, string> = {
  "’": "'", "‘": "'", "«": "\"", "»": "\"", "“": "\"", "”": "\"", "–": "-", "—": "-", "…": "...",
  "\u00a0": " ", "\u202f": " ", "œ": "oe", "Œ": "OE",
};

/**
 * Ramène un texte à l'alphabet des textos : ce qui en sort perd son accent
 * (û devient u, ç devient c), le reste garde le sien (é, è, à, ù). Pour les
 * textos de l'artisan seulement ; ceux du client gardent leur orthographe.
 * Un texte qui ne s'y ramène pas entièrement — un nom en caractères
 * chinois — reste tel quel : mieux vaut deux tranches qu'un nom illisible.
 */
export function toGsm7(s: string): string {
  const out = [...s].map((c) => {
    if (GSM7.has(c)) return c;
    if (TYPOGRAPHY[c] !== undefined) return TYPOGRAPHY[c];
    return c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }).join("");
  return [...out].every((c) => GSM7.has(c)) ? out : s;
}

/* ============================ Les réponses des clients ============================ */

/**
 * La signature que Twilio pose sur chaque requête qu'il nous envoie.
 *
 * HMAC-SHA1 du jeton d'authentification, sur l'adresse exacte appelée suivie
 * de chaque paramètre du formulaire, clé puis valeur, triés par clé ; le tout
 * en base64. Sans elle, n'importe qui pourrait faire parvenir des « réponses »
 * au téléphone de l'artisan en appelant la route à la main.
 */
export function twilioSignature(url: string, params: Record<string, string>, token: string): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

export function twilioSignatureValid(
  urls: string[], params: Record<string, string>, signature: string | null, token: string,
): boolean {
  if (!signature || !token) return false;
  const got = Buffer.from(signature);
  return urls.some((u) => {
    const want = Buffer.from(twilioSignature(u, params, token));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

function xml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Une réponse TwiML vide : Twilio n'envoie rien. */
export const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Une réponse TwiML qui fait partir un texto vers un autre numéro que
 * l'expéditeur — et, s'il y a lieu, un second vers l'expéditeur lui-même.
 */
export function twimlForward(to: string, body: string, reply?: string | null): string {
  const back = reply ? `<Message>${xml(reply)}</Message>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${xml(to)}">${xml(body)}</Message>${back}</Response>`;
}

/**
 * Les mots qui désabonnent chez Twilio, sur un numéro ordinaire : l'artisan
 * doit savoir que ce client n'en recevra plus. Ce sont des mots anglais
 * seulement : le français n'y figure pas sans un service de messagerie réglé
 * exprès, et nos textos partent d'un simple numéro.
 */
const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout)\s*$/i;

/** « Arrêt », « ARRÊTER »… : la demande est claire, mais Twilio ne la comprend pas. */
const OPT_OUT_FR = /^\s*arr[eê]te?r?\s*\.?\s*$/i;

/**
 * Ce qu'on répond au client qui écrit « ARRÊT » : le mot qui le désabonne
 * vraiment. On ne prétend pas l'avoir fait à sa place.
 */
export function stopHint(body: string): string | null {
  return OPT_OUT_FR.test(body) ? "NIVEX : pour ne plus recevoir de textos, répondez STOP." : null;
}

/** « +1 450 555 0222 » — lisible sur un téléphone. */
function readable(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

/**
 * Le texto que reçoit l'artisan quand un client répond.
 *
 * Le nom quand on le connaît, le numéro toujours — c'est lui qu'on rappelle.
 * Le message est tronqué au-delà de mille caractères : un texto en plusieurs
 * tranches se paie à la tranche. `hinted` dit qu'on vient de répondre au
 * client d'écrire STOP : il reste inscrit, et l'artisan doit le savoir.
 */
export function forwardedReply(o: { from: string; name: string | null; body: string; media: number; hinted?: boolean }): string {
  const who = o.name ? `${o.name} (${readable(o.from)})` : readable(o.from);
  const text = o.body.trim().slice(0, 1000) || "(message vide)";
  const media = o.media > 0 ? ` [${o.media} pièce${o.media > 1 ? "s" : ""} jointe${o.media > 1 ? "s" : ""}, à voir dans la console Twilio]` : "";
  const stop = OPT_OUT.test(o.body) ? " (ce client ne recevra plus de textos)"
    : o.hinted ? " (toujours inscrit : on lui a répondu d'écrire STOP)"
    : "";
  return `NIVEX : réponse de ${who} : ${text}${media}${stop}`;
}

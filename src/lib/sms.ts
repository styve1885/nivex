import { createHmac, timingSafeEqual } from "node:crypto";
import { logEvent } from "./db";
import { PHONE, SETUP_MINUTES } from "./brand";

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
 * où l'artisan reçoit les siens ; sans elle, le numéro de la maison.
 */

export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
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

/** Envoie un texto. Vrai s'il est parti ; jamais d'exception. */
export async function sendSms(to: string | null | undefined, body: string, ref?: string): Promise<boolean> {
  if (!smsConfigured()) {
    await logEvent("sms_skipped", { ref, reason: "not_configured" });
    return false;
  }
  const number = toE164(to);
  if (!number) {
    await logEvent("sms_skipped", { ref, reason: "invalid_number" });
    return false;
  }
  /* Hors du Canada, le texto ne part pas, et rien d'autre ne change : la
     réservation tient, le courriel part. Seul l'indicatif est noté — il dit
     d'où venait le numéro sans dire à qui il appartient. */
  if (!isCanadianNumber(number)) {
    await logEvent("sms_skipped", { ref, reason: "not_canadian", area: number.slice(2, 5) });
    return false;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: number, From: process.env.TWILIO_FROM!, Body: body }),
    });
    if (!res.ok) {
      /* Twilio rend un code et un message lisibles (numéro non vérifié en
         compte d'essai, destinataire désabonné par STOP…) : on les garde. */
      const detail = (await res.text()).slice(0, 300);
      await logEvent("sms_failed", { ref, status: res.status, detail });
      return false;
    }
    await logEvent("sms_sent", { ref });
    return true;
  } catch (e) {
    await logEvent("sms_failed", { ref, error: String((e as Error)?.message ?? e).slice(0, 300) });
    return false;
  }
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

/*
 * Comment ne plus en recevoir. Dit une fois, dans la confirmation : les
 * opérateurs l'attendent, et le répéter à chaque texto ferait payer une
 * tranche de plus.
 */
const STOP_LINE = { fr: " Répondez STOP pour ne plus recevoir de textos.", en: " Reply STOP to opt out." } as const;

export const SMS = {
  /** Une séance ponctuelle vient d'être réservée. */
  bookingConfirmed: (l: Locale, when: string, url: string) => (l === "en"
    ? `NIVEX: your session on ${when} is confirmed. Manage it: ${url}`
    : `NIVEX : votre séance du ${when} est confirmée. Gérer : ${url}`) + STOP_LINE[l],

  /** Un abonnement vient d'être posé. */
  subscriptionConfirmed: (l: Locale, plan: string, when: string, rhythm: string, url: string) => (l === "en"
    ? `NIVEX: your ${plan} subscription is in place. First visit ${when}, then ${rhythm}. Manage: ${url}`
    : `NIVEX : votre abonnement ${plan} est en place. Première visite le ${when}, puis ${rhythm}. Gérer : ${url}`) + STOP_LINE[l],

  /** Le rappel de la veille. Le montant n'y figure qu'à la première visite d'un cycle à régler. */
  reminder: (l: Locale, when: string, today: boolean, payment: string | null) => {
    const day = today ? (l === "en" ? "today" : "aujourd'hui") : (l === "en" ? "tomorrow" : "demain");
    const pay = payment ? (l === "en" ? ` Payment for the cycle at this visit: ${payment}.` : ` Paiement du cycle à cette visite : ${payment}.`) : "";
    return l === "en"
      ? `NIVEX: reminder, your visit is ${day}, ${when}. We arrive ${SETUP_MINUTES} minutes early to set up.${pay}`
      : `NIVEX : rappel, votre visite a lieu ${day}, ${when}. Nous arrivons ${SETUP_MINUTES} minutes avant pour nous installer.${pay}`;
  },

  /** Une séance ponctuelle annulée par l'artisan. */
  bookingCancelled: (l: Locale, when: string) => l === "en"
    ? `NIVEX: your session on ${when} is cancelled. Nothing will be charged.`
    : `NIVEX : votre séance du ${when} est annulée. Aucun montant ne vous sera facturé.`,

  /** Une visite d'abonnement annulée, avec son remplacement s'il y en a un. */
  visitCancelled: (l: Locale, when: string, replacement: string | null) => l === "en"
    ? `NIVEX: your visit on ${when} is cancelled.${replacement ? ` It is replaced on ${replacement}.` : ""}`
    : `NIVEX : votre visite du ${when} est annulée.${replacement ? ` Elle est remplacée le ${replacement}.` : ""}`,

  visitMoved: (l: Locale, from: string, to: string) => l === "en"
    ? `NIVEX: your visit on ${from} is moved to ${to}.`
    : `NIVEX : votre visite du ${from} est déplacée au ${to}.`,

  /** Pour l'artisan. Sans tiret cadratin : absent de l'alphabet des textos,
      il ferait passer tout le message en Unicode, payé deux tranches. */
  owner: {
    newBooking: (name: string, when: string, city: string) => `NIVEX : nouvelle séance, ${name}, ${when}, ${city}.`,
    newSubscription: (name: string, plan: string, when: string) => `NIVEX : nouvel abonnement ${plan}, ${name}, première visite le ${when}.`,
    cancelled: (name: string, when: string) => `NIVEX : ${name} a annulé sa visite du ${when}.`,
    moved: (name: string, from: string, to: string) => `NIVEX : ${name} a déplacé sa visite du ${from} au ${to}.`,
  },
};

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

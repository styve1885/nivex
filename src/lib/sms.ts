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
 */
export function toE164(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `+1${ten}`;
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

/** « mardi 20 octobre, 14 h 00 » / « Tuesday, October 20, 2:00 p.m. » */
export function smsWhen(d: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: locale === "en",
  }).format(d);
}

export const SMS = {
  /** Une séance ponctuelle vient d'être réservée. */
  bookingConfirmed: (l: Locale, when: string, url: string) => l === "en"
    ? `NIVEX: your session on ${when} is confirmed. Manage it: ${url}`
    : `NIVEX : votre séance du ${when} est confirmée. Gérer : ${url}`,

  /** Un abonnement vient d'être posé. */
  subscriptionConfirmed: (l: Locale, plan: string, when: string, rhythm: string, url: string) => l === "en"
    ? `NIVEX: your ${plan} subscription is in place. First visit ${when}, then ${rhythm}. Manage: ${url}`
    : `NIVEX : votre abonnement ${plan} est en place. Première visite le ${when}, puis ${rhythm}. Gérer : ${url}`,

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

  /** Pour l'artisan. */
  owner: {
    newBooking: (name: string, when: string, city: string) => `NIVEX — nouvelle séance : ${name}, ${when}, ${city}.`,
    newSubscription: (name: string, plan: string, when: string) => `NIVEX — nouvel abonnement ${plan} : ${name}, première visite le ${when}.`,
    cancelled: (name: string, when: string) => `NIVEX — ${name} a annulé sa visite du ${when}.`,
    moved: (name: string, from: string, to: string) => `NIVEX — ${name} a déplacé sa visite du ${from} au ${to}.`,
  },
};

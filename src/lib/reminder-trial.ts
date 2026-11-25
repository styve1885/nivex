import { contactEmail, PHONE, REQUEST_INBOX, SMS_SIGNATURE } from "./brand";
import { logEvent } from "./db";
import { sessionReminder, type BookingEmailData } from "./email";
import { GoogleError, ownerAccessToken, sendGmail } from "./google";
import { dayHours } from "./hours";
import { SESSION_KEY } from "./items";
import { sessionLength, sessionPriceCents } from "./pricing";
import { sessionLabel } from "./bookings";
import { ownerSmsNumber, sendSms, SMS, smsConfigured, smsDay, smsTime } from "./sms";
import { addDaysToKey, dateKey, formatDateTime, fromWall, parseDateKey, parseHM } from "./time";
import type { Settings } from "./settings";

/**
 * L'essai du rappel de la veille, lancé depuis l'onglet Connexion.
 *
 * Le courriel et le texto qu'un client à la carte reçoit la veille de sa
 * séance, mêmes gabarits que la tâche du matin (`runDaily`), pour une séance
 * fictive de demain, à l'heure d'ouverture du jour : la séance d'essai, au
 * tarif en vigueur, à une adresse d'exemple. Ils ne partent que vers
 * l'artisan — la boîte de la maison (REQUEST_INBOX) et son cellulaire
 * (SMS_OWNER_TO) —, par le même chemin que les vrais. Rien ne s'écrit en
 * base, et aucun client ne reçoit quoi que ce soit.
 *
 * Seul le lien « Gérer ma réservation » diffère : il n'y a pas de
 * réservation à gérer, et il mène à l'accueil.
 */
export function trialReminder(s: Settings, origin: string, now = new Date()) {
  const tz = s.timezone;
  const day = addDaysToKey(dateKey(now, tz), 1);
  const hours = dayHours(s, day);
  /* Demain à l'ouverture ; à 18 h si demain est fermé, ce que l'horaire de
     la maison ne fait plus. Le rappel dit « demain » : la date doit l'être. */
  const open = hours?.enabled ? parseHM(hours.open) : 18 * 60;
  const startsAt = fromWall({ ...parseDateKey(day), hour: Math.floor(open / 60), minute: open % 60 }, tz);
  const minutes = sessionLength(s);

  const data: BookingEmailData = {
    ref: "ESSAI", locale: "fr", clientName: SMS_SIGNATURE, clientEmail: REQUEST_INBOX, clientPhone: "",
    address: "123, rue de l'Exemple", city: "Longueuil", postalCode: "J4K 1A1", notes: null,
    items: [{ key: SESSION_KEY, label: sessionLabel(minutes, "fr"), qty: 1 }],
    startsAt, durationMinutes: minutes, setupMinutes: 0, estimateCents: sessionPriceCents(s),
    currency: s.currency, firstHourFree: false, travelFeeCents: 0, travelZone: null, timezone: tz,
    manageUrl: `${origin}/fr`, siteUrl: origin, businessPhone: PHONE, businessEmail: contactEmail(),
  };
  return {
    startsAt,
    email: sessionReminder(data, false),
    /* L'arrivée est le début de la séance : le déroulement d'aujourd'hui. */
    sms: SMS.reminder("fr", smsDay(startsAt, tz, "fr"), smsTime(startsAt, tz, "fr"), false, null, true),
  };
}

export type TrialChannel = { ok: boolean; to?: string; reason?: string };

/** Envoie l'essai. Chaque canal rend son résultat ; l'un qui échoue n'empêche pas l'autre. */
export async function sendReminderTrial(s: Settings, origin: string, now = new Date()): Promise<{
  email: TrialChannel; sms: TrialChannel; session: string;
}> {
  const t = trialReminder(s, origin, now);

  let email: TrialChannel = { ok: false, to: REQUEST_INBOX };
  try {
    const at = await ownerAccessToken();
    if (!at) email.reason = "Aucun compte Google branché : reconnectez-le plus haut.";
    else {
      await sendGmail(at, {
        to: REQUEST_INBOX, toName: SMS_SIGNATURE, subject: t.email.subject, html: t.email.html, text: t.email.text,
        fromName: s.businessName || "NIVEX", replyTo: contactEmail(),
      });
      email = { ok: true, to: REQUEST_INBOX };
    }
  } catch (e) {
    email.reason = e instanceof GoogleError
      ? `Google a refusé l'envoi (HTTP ${e.status}). Le courriel de test plus haut en donne la raison exacte.`
      : "Google est injoignable pour le moment. Réessayez dans un instant.";
  }

  let sms: TrialChannel = { ok: false };
  const cell = ownerSmsNumber();
  if (!smsConfigured()) sms.reason = "Les clés Twilio ne sont pas posées chez Vercel.";
  else if (!cell) sms.reason = "SMS_OWNER_TO est absente, ou égale au numéro de la maison.";
  else {
    const to = `…${cell.slice(-4)}`;
    sms = await sendSms(cell, t.sms, "ESSAI")
      ? { ok: true, to }
      : { ok: false, to, reason: "Twilio a refusé l'envoi. Le texto de test plus haut en donne la raison exacte." };
  }

  await logEvent("reminder_trial", { email: email.ok, sms: sms.ok });
  return { email, sms, session: formatDateTime(t.startsAt, s.timezone, "fr") };
}

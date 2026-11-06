import { readable, smsTime, toGsm7, xmlEscape } from "./sms";

/**
 * Les appels au numéro de la maison, par Twilio.
 *
 * Twilio demande à /api/voice/incoming quoi faire de chaque appel ; on lui
 * répond de faire sonner le cellulaire de l'artisan, sous le numéro de la
 * maison. Quand l'artisan ne répond pas, Twilio rappelle /api/voice/missed :
 * l'appelant entend un court message, et l'artisan reçoit un texto avec le
 * numéro de l'appelant, et son nom s'il est déjà client. Rien n'est conservé.
 *
 * Le TwiML Bin « NIVEX - transfert », réglé chez Twilio comme méthode de
 * secours, prend le relais si le site ne répond pas : l'appel sonne alors
 * comme avant, sans alerte.
 */

/**
 * Le temps de sonnerie, en secondes. Il doit rester plus court que le délai
 * de la boîte vocale du cellulaire, souvent de vingt à trente secondes selon
 * l'opérateur : si la boîte vocale décrochait la première, l'appel compterait
 * comme répondu, et aucune alerte ne partirait. Si l'artisan trouve des
 * messages dans sa boîte vocale au lieu d'alertes, on raccourcit.
 */
export const RING_SECONDS = 20;

/** Au-delà de ce nombre d'alertes dans l'heure, les suivantes ne partent pas. */
export const MISSED_ALERTS_PER_HOUR = 20;

const XML = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Faire sonner le cellulaire de l'artisan. `callerId` est le numéro de la
 * maison : l'artisan sait qu'un client appelle, et son opérateur ne refuse
 * pas un appel transféré sous un numéro qui n'est pas celui de Twilio.
 * `action` reçoit le sort de l'appel, répondu ou non.
 */
export function twimlRingOwner(o: { owner: string; callerId: string; action: string; seconds?: number }): string {
  const seconds = o.seconds ?? RING_SECONDS;
  return `${XML}<Response><Dial answerOnBridge="true" timeout="${seconds}" callerId="${xmlEscape(o.callerId)}" `
    + `action="${xmlEscape(o.action)}" method="POST"><Number>${xmlEscape(o.owner)}</Number></Dial></Response>`;
}

/**
 * Le numéro de l'appelant tel que Twilio le donne, ou rien s'il est masqué.
 *
 * Twilio écrit un numéro masqué en chiffres de clavier : « +266696687 »
 * (ANONYMOUS), « +7378742833 » (RESTRICTED), « +2562533 » (BLOCKED).
 * Le second ressemble à un numéro nord-américain une fois le « + » retiré :
 * on n'accepte donc qu'un « +1 » suivi de dix chiffres valides.
 */
export function callerNumber(from: string | null | undefined): string | null {
  const s = (from ?? "").trim();
  return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(s) ? s : null;
}

/** L'appel a-t-il été manqué ? Tout sauf « completed » : sans réponse, refusé, échoué, abandonné. */
export function callMissed(dialStatus: string | null | undefined): boolean {
  return dialStatus !== "completed";
}

/**
 * Ce qu'entend l'appelant quand l'artisan ne répond pas, en français puis en
 * anglais. Pas de boîte vocale : rien n'est enregistré, et l'artisan rappelle
 * grâce à l'alerte.
 */
export const MISSED_MESSAGE = {
  fr: "Bonjour, vous avez joint NIVEX, repassage à domicile. Je ne peux pas vous répondre pour le moment, "
    + "et je vous rappelle dès que possible. Vous pouvez aussi m'écrire un texto à ce numéro, "
    + "ou réserver en ligne sur nivexrepassage.ca. Merci.",
  en: "Hello, you have reached NIVEX in-home ironing. I cannot take your call right now, "
    + "and I will call you back as soon as possible. You can also text this number, "
    + "or book online at nivexrepassage.ca. Thank you.",
} as const;

export function twimlMissedMessage(): string {
  return `${XML}<Response>`
    + `<Say language="fr-CA" voice="Polly.Chantal">${xmlEscape(MISSED_MESSAGE.fr)}</Say>`
    + `<Say language="en-US" voice="Polly.Joanna">${xmlEscape(MISSED_MESSAGE.en)}</Say>`
    + `<Hangup/></Response>`;
}

/**
 * Le texto que reçoit l'artisan pour un appel manqué : qui, et à quelle
 * heure de Montréal. Le nom quand on le connaît, le numéro toujours, sauf
 * s'il est masqué. Ramené à l'alphabet des textos, comme ses autres avis.
 */
export function missedCallAlert(o: { from: string | null; name: string | null; at: Date; tz: string }): string {
  const who = !o.from ? "d'un numéro masqué"
    : o.name ? `de ${o.name} (${readable(o.from)})`
    : `du ${readable(o.from)}`;
  return toGsm7(`NIVEX : appel manqué ${who}, à ${smsTime(o.at, o.tz, "fr")}.`);
}

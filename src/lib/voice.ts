import { readable, smsTime, toGsm7, xmlEscape } from "./sms";

/**
 * Les appels au numéro de la maison, par Twilio.
 *
 * 1. Twilio demande à /api/voice/incoming quoi faire de chaque appel : on lui
 *    répond de faire sonner le cellulaire de l'artisan, sous le numéro de
 *    l'appelant (depuis le 9 novembre 2026 ; avant, sous celui de la maison,
 *    et l'artisan ne voyait pas qui appelait). Un numéro masqué sonne sous
 *    celui de la maison.
 * 2. Quand le cellulaire décroche, /api/voice/screen/<appelant> annonce qui
 *    appelle, et attend une touche (/api/voice/accept). L'artisan appuie : les
 *    deux sont reliés. Une boîte vocale n'appuie sur rien : on raccroche de
 *    son côté, sans relier. Sans ce filtre, une boîte vocale qui décroche
 *    compte pour Twilio comme un appel répondu, et aucune alerte ne part (vu
 *    le 6 novembre 2026).
 * 3. À la fin de l'appel, /api/voice/missed : un appel non relié est
 *    manqué. L'appelant entend un court message, et l'artisan reçoit un texto
 *    avec son numéro, et son nom s'il est déjà client. Un appel relié lui
 *    vaut aussi un texto, une fois raccroché : le numéro du client par écrit,
 *    son nom s'il est déjà client, et la marque d'un appel NIVEX, que
 *    l'affichage du téléphone ne donne plus. Rien n'est conservé.
 *
 * Le TwiML Bin « NIVEX - transfert », réglé chez Twilio comme méthode de
 * secours, prend le relais si le site ne répond pas : l'appel sonne alors
 * comme avant, sans annonce ni alerte.
 */

/**
 * Le temps de sonnerie, en secondes. Une boîte vocale qui décroche plus tôt
 * ne compte pas comme une réponse : le filtre la reconnaît, faute de touche.
 */
export const RING_SECONDS = 25;

/** Le temps laissé à l'artisan, après l'annonce, pour appuyer sur une touche. */
export const ACCEPT_SECONDS = 6;

/**
 * Au-delà de ce nombre de textos dans l'heure, les suivants ne partent pas :
 * vingt pour les appels manqués, vingt pour les appels répondus.
 */
export const MISSED_ALERTS_PER_HOUR = 20;

const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const FR_VOICE = 'language="fr-CA" voice="Polly.Chantal"';

/**
 * Faire sonner le cellulaire de l'artisan. Sans `callerId`, Twilio garde le
 * numéro de l'appelant : c'est lui qui s'affiche sur le cellulaire. Avec, le
 * cellulaire affiche ce numéro-là, celui de la maison. `screen` annonce
 * l'appelant à qui décroche ; `action` reçoit le sort de l'appel. L'appelant
 * entend sonner jusqu'à ce que les deux soient reliés (`answerOnBridge`, que
 * le filtre exige).
 */
export function twimlRingOwner(o: { owner: string; callerId: string | null; screen: string; action: string; seconds?: number }): string {
  const seconds = o.seconds ?? RING_SECONDS;
  const callerId = o.callerId ? ` callerId="${xmlEscape(o.callerId)}"` : "";
  return `${XML}<Response><Dial answerOnBridge="true" timeout="${seconds}"${callerId} `
    + `action="${xmlEscape(o.action)}" method="POST">`
    + `<Number url="${xmlEscape(o.screen)}" method="POST">${xmlEscape(o.owner)}</Number></Dial></Response>`;
}

/**
 * La sonnerie d'un appel : sous le numéro du client quand on le connaît et
 * que `passthrough` le permet, sinon sous celui de la maison (`house`). Un
 * appel sonné sous le numéro du client le dit à /api/voice/missed
 * (`?via=client`), qui peut alors refaire sonner sous celui de la maison.
 */
export function ringFor(o: { owner: string; from: string | null | undefined; house: string; origin: string; passthrough: boolean }): string {
  const caller = callerNumber(o.from);
  const through = o.passthrough && caller !== null;
  return twimlRingOwner({
    owner: o.owner,
    callerId: through ? null : o.house,
    screen: `${o.origin}/api/voice/screen/${callerKey(caller)}`,
    action: `${o.origin}/api/voice/missed${through ? "?via=client" : ""}`,
  });
}

/**
 * L'appel sonné sous le numéro du client a échoué d'emblée : un opérateur a
 * pu refuser un numéro qui n'appartient pas à Twilio. On refait sonner une
 * fois, sous celui de la maison, comme avant le 9 novembre 2026. Seul l'échec
 * compte : « occupé » dit aussi que l'artisan a refusé l'appel, et le
 * cellulaire ne doit pas sonner une seconde fois.
 */
export function passthroughRefused(status: string | null, via: string | null): boolean {
  return via === "client" && status === "failed";
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

/**
 * L'appelant dans l'adresse du filtre : ses onze chiffres, ou « masque ».
 * Rien à encoder, si bien que la signature de Twilio se vérifie sans
 * surprise. `callerFromKey` fait le chemin inverse, et refuse tout le reste.
 */
export function callerKey(e164: string | null): string {
  return e164 ? e164.slice(1) : "masque";
}

export function callerFromKey(key: string | null | undefined): string | null {
  return /^1[2-9]\d{2}[2-9]\d{6}$/.test(key ?? "") ? `+${key}` : null;
}

/** « 5 1 4, 5 5 5, 0 1 2 3 » : un numéro lu chiffre par chiffre, par groupes. */
export function spokenNumber(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].map((g) => g.split("").join(" ")).join(", ");
}

/** Ce qu'entend l'artisan quand il décroche. */
export function screenPrompt(o: { from: string | null; name: string | null }): string {
  const who = !o.from ? "d'un numéro masqué"
    : o.name ? `de ${o.name}, ${spokenNumber(o.from)}`
    : `du ${spokenNumber(o.from)}`;
  return `Appel NIVEX ${who}. Appuyez sur une touche pour répondre.`;
}

/**
 * L'annonce à qui décroche, puis une touche attendue. Sans touche, on
 * raccroche de ce côté seulement : l'appelant n'est pas relié, et l'appel
 * compte comme manqué.
 */
export function twimlScreen(o: { prompt: string; accept: string; seconds?: number }): string {
  return `${XML}<Response><Gather numDigits="1" timeout="${o.seconds ?? ACCEPT_SECONDS}" `
    + `action="${xmlEscape(o.accept)}" method="POST"><Say ${FR_VOICE}>${xmlEscape(o.prompt)}</Say></Gather>`
    + `<Hangup/></Response>`;
}

/** Une touche, n'importe laquelle : on relie. Rien : on raccroche de ce côté. */
export function twimlAccept(digits: string | null | undefined): string {
  return (digits ?? "").trim() ? `${XML}<Response></Response>` : `${XML}<Response><Hangup/></Response>`;
}

/**
 * L'appel a-t-il été manqué ? Tout appel qui n'a pas relié l'appelant à
 * l'artisan : sans réponse, refusé, échoué, abandonné (`DialCallStatus`), ou
 * pris par une boîte vocale que le filtre a écartée (`DialBridged` à
 * « false »). Sans `DialBridged`, un appel « completed » compte comme
 * répondu : mieux vaut une alerte en moins qu'une alerte après une vraie
 * conversation.
 */
export function callMissed(dialStatus: string | null | undefined, bridged?: string | null): boolean {
  return dialStatus !== "completed" || bridged === "false";
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
    + `<Say ${FR_VOICE}>${xmlEscape(MISSED_MESSAGE.fr)}</Say>`
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

/**
 * Le texto que reçoit l'artisan après un appel répondu : le numéro du client,
 * son nom s'il est déjà client, l'heure du début et la durée. Son téléphone,
 * lui, n'a montré que le numéro de la maison. Pour un numéro masqué, rien :
 * il n'y aurait rien à donner. La durée s'arrondit à la minute ; sous une
 * demi-minute, elle ne se dit pas.
 */
export function answeredCallAlert(o: { from: string; name: string | null; at: Date; tz: string; seconds?: number | null }): string {
  const who = o.name ? `de ${o.name} (${readable(o.from)})` : `du ${readable(o.from)}`;
  const minutes = Math.round((o.seconds ?? 0) / 60);
  return toGsm7(`NIVEX : appel ${who}, à ${smsTime(o.at, o.tz, "fr")}${minutes >= 1 ? `, ${minutes} min` : ""}.`);
}

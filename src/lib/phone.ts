/**
 * Les numéros de téléphone et la longueur d'un texto, sans aucune dépendance :
 * l'onglet Messages de l'espace artisan les importe dans le navigateur, sans
 * tirer le pilote de base ni Twilio. `lib/sms.ts` les réexporte.
 */

/**
 * Un numéro nord-américain au format E.164, « +15145550123 », ou rien.
 *
 * Le formulaire accepte « 514 555-0123 », « (514) 555 0123 » ou « +1 514… » :
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

/** « 514 555-0123 » : un numéro tel qu'on le lit et qu'on le rappelle. */
export function readable(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

/* L'alphabet des textos (GSM 03.38, table de base). */
export const GSM7 = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");

/* La table d'extension : chacun de ces signes compte pour deux. */
const GSM7_EXTENSION = new Set("^{}\\[~]|€\f");

/**
 * Ce que coûte un texte : son alphabet, sa longueur comptée comme Twilio la
 * compte, et le nombre de tranches facturées. Dans l'alphabet des textos,
 * 160 signes tiennent en une tranche, 153 par tranche au-delà. Un seul signe
 * hors de cet alphabet (ê, ô, ç, un tiret cadratin, un émoji) fait passer
 * tout le texte en Unicode : 70 signes, puis 67 par tranche.
 */
export function smsSegments(text: string): { unicode: boolean; length: number; segments: number } {
  let units = 0;
  for (const c of text) {
    if (GSM7.has(c)) units += 1;
    else if (GSM7_EXTENSION.has(c)) units += 2;
    else {
      const length = text.length;
      return { unicode: true, length, segments: length <= 70 ? 1 : Math.ceil(length / 67) };
    }
  }
  return { unicode: false, length: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
}

/** La longueur d'un message écrit depuis l'onglet Messages : neuf tranches au plus, même en Unicode. */
export const ADMIN_TEXT_MAX = 600;

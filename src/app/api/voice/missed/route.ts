import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, logEvent, sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { knownClientName, ownerSmsNumber, sendSms, TWIML_EMPTY } from "@/lib/sms";
import { readTwilioWebhook, twimlResponse } from "@/lib/twilio-webhook";
import {
  answeredCallAlert, callerNumber, callMissed, MISSED_ALERTS_PER_HOUR, missedCallAlert, twimlMissedMessage,
} from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/missed — la fin de l'appel chez l'artisan.
 *
 * Twilio appelle cette adresse quand le <Dial> de /api/voice/incoming prend
 * fin. Relié à l'artisan : l'appel est fini, et l'artisan reçoit un texto
 * avec le numéro du client, son nom s'il est déjà client, l'heure et la
 * durée, pour rappeler ou réserver ; son téléphone n'a montré que le numéro
 * de la maison. Sinon (sans réponse, refusé, échoué, abandonné, ou pris par
 * une boîte vocale que le filtre a écartée) : l'appelant entend le message
 * d'absence, et l'artisan reçoit l'alerte d'appel manqué. Le journal note le
 * sort de l'appel, jamais le numéro.
 */
export async function POST(req: NextRequest) {
  const got = await readTwilioWebhook(req, "/api/voice/missed");
  if (!got.ok) {
    if (got.status === 403) await logEvent("call_rejected", { reason: "bad_signature" });
    return new NextResponse(got.reason, { status: got.status });
  }

  const status = got.params.DialCallStatus ?? null;
  const bridged = got.params.DialBridged ?? null;
  if (!callMissed(status, bridged)) {
    await textAnsweredCall(got.params);
    return twimlResponse(TWIML_EMPTY);
  }

  /* Un numéro masqué arrive en chiffres de clavier : il reste masqué dans
     l'alerte. */
  const from = callerNumber(got.params.From);
  const name = from ? await knownClientName(from) : null;

  const owner = ownerSmsNumber();
  let alerted = false;
  if (owner && !(await alertsCapped("missed_call"))) {
    const { timezone } = await getSettings();
    alerted = await sendSms(owner, missedCallAlert({ from, name, at: new Date(), tz: timezone }), "missed-call");
  }

  await logEvent("missed_call", { status, bridged, known: Boolean(name), hidden: !from, alerted });
  return twimlResponse(twimlMissedMessage());
}

/**
 * Un appel relié, une fois raccroché : le numéro du client par texto à
 * l'artisan. Rien pour un numéro masqué. L'heure dite est celle du début de
 * la conversation, la durée celle que Twilio rend (`DialCallDuration`).
 */
async function textAnsweredCall(params: Record<string, string>): Promise<void> {
  const from = callerNumber(params.From);
  const seconds = Math.max(0, Number(params.DialCallDuration ?? 0) || 0);
  const owner = ownerSmsNumber();
  let known = false;
  let alerted = false;
  if (from && owner && !(await alertsCapped("answered_call"))) {
    const name = await knownClientName(from);
    known = Boolean(name);
    const { timezone } = await getSettings();
    const at = new Date(Date.now() - seconds * 1000);
    alerted = await sendSms(owner, answeredCallAlert({ from, name, at, tz: timezone, seconds }), "answered-call");
  }
  await logEvent("answered_call", { known, hidden: !from, alerted, minutes: Math.round(seconds / 60) });
}

/**
 * Des appels en rafale ne doivent pas faire partir des centaines de textos à
 * nos frais : au-delà de MISSED_ALERTS_PER_HOUR textos d'une même sorte dans
 * l'heure, les suivants attendent. Une base muette n'empêche pas le texto :
 * mieux vaut un texto de trop qu'un client perdu.
 */
async function alertsCapped(kind: "missed_call" | "answered_call"): Promise<boolean> {
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT count(*)::int AS n FROM nivex_events
      WHERE kind = ${kind} AND (detail->>'alerted') = 'true' AND created_at > now() - interval '1 hour'`) as { n: number }[];
    return (rows[0]?.n ?? 0) >= MISSED_ALERTS_PER_HOUR;
  } catch {
    return false;
  }
}

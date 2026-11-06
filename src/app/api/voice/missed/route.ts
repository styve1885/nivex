import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, logEvent, sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { knownClientName, ownerSmsNumber, sendSms, TWIML_EMPTY } from "@/lib/sms";
import { readTwilioWebhook, twimlResponse } from "@/lib/twilio-webhook";
import { callerNumber, callMissed, MISSED_ALERTS_PER_HOUR, missedCallAlert, twimlMissedMessage } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/missed — la fin de la sonnerie chez l'artisan.
 *
 * Twilio appelle cette adresse quand le cellulaire a fini de sonner (l'action
 * du <Dial> de /api/voice/incoming). Relié à l'artisan : rien à faire. Sinon
 * (sans réponse, refusé, échoué, abandonné, ou pris par une boîte vocale que
 * le filtre a écartée) : l'appelant entend le message d'absence, et l'artisan
 * reçoit un texto avec son numéro, et son nom s'il est déjà client. Le
 * journal note le sort de l'appel, jamais le numéro.
 */
export async function POST(req: NextRequest) {
  const got = await readTwilioWebhook(req, "/api/voice/missed");
  if (!got.ok) {
    if (got.status === 403) await logEvent("call_rejected", { reason: "bad_signature" });
    return new NextResponse(got.reason, { status: got.status });
  }

  const status = got.params.DialCallStatus ?? null;
  const bridged = got.params.DialBridged ?? null;
  if (!callMissed(status, bridged)) return twimlResponse(TWIML_EMPTY);

  /* Un numéro masqué arrive en chiffres de clavier : il reste masqué dans
     l'alerte. */
  const from = callerNumber(got.params.From);
  const name = from ? await knownClientName(from) : null;

  const owner = ownerSmsNumber();
  let alerted = false;
  if (owner && !(await alertsCapped())) {
    const { timezone } = await getSettings();
    alerted = await sendSms(owner, missedCallAlert({ from, name, at: new Date(), tz: timezone }), "missed-call");
  }

  await logEvent("missed_call", { status, bridged, known: Boolean(name), hidden: !from, alerted });
  return twimlResponse(twimlMissedMessage());
}

/**
 * Des appels en rafale ne doivent pas faire partir des centaines de textos à
 * nos frais : au-delà de MISSED_ALERTS_PER_HOUR alertes dans l'heure, les
 * suivantes attendent. Une base muette n'empêche pas l'alerte : mieux vaut un
 * texto de trop qu'un client perdu.
 */
async function alertsCapped(): Promise<boolean> {
  try {
    await ensureSchema();
    const rows = (await sql()`
      SELECT count(*)::int AS n FROM nivex_events
      WHERE kind = 'missed_call' AND (detail->>'alerted') = 'true' AND created_at > now() - interval '1 hour'`) as { n: number }[];
    return (rows[0]?.n ?? 0) >= MISSED_ALERTS_PER_HOUR;
  } catch {
    return false;
  }
}

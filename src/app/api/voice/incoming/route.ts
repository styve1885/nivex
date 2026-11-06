import { NextRequest, NextResponse } from "next/server";
import { PHONE } from "@/lib/brand";
import { logEvent } from "@/lib/db";
import { siteOrigin } from "@/lib/google";
import { ownerSmsNumber, toE164 } from "@/lib/sms";
import { readTwilioWebhook, twimlResponse } from "@/lib/twilio-webhook";
import { callerKey, callerNumber, twimlRingOwner } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/incoming — un appel arrive sur le numéro de la maison.
 *
 * Twilio appelle cette adresse à chaque appel (réglage « A call comes in » du
 * numéro, méthode principale). On lui répond de faire sonner le cellulaire de
 * l'artisan, sous le numéro de la maison ; quand le cellulaire décroche,
 * /api/voice/screen annonce l'appelant ; à la fin, /api/voice/missed dit si
 * l'appel a été manqué. Rien n'est conservé de l'appelant.
 */
export async function POST(req: NextRequest) {
  const got = await readTwilioWebhook(req, "/api/voice/incoming");
  if (!got.ok) {
    if (got.status === 403) await logEvent("call_rejected", { reason: "bad_signature" });
    return new NextResponse(got.reason, { status: got.status });
  }

  /* Sans cellulaire où sonner, une erreur fait passer Twilio à la méthode de
     secours du numéro, le TwiML Bin « NIVEX - transfert » : l'appel sonne
     comme avant, sans alerte, plutôt que de tomber dans le vide. */
  const owner = ownerSmsNumber();
  if (!owner) {
    await logEvent("call_no_owner");
    return new NextResponse("owner number missing", { status: 503 });
  }

  const callerId = toE164(got.params.To) ?? toE164(process.env.TWILIO_FROM) ?? toE164(PHONE)!;
  const origin = siteOrigin();
  await logEvent("call_received");
  return twimlResponse(twimlRingOwner({
    owner, callerId,
    screen: `${origin}/api/voice/screen/${callerKey(callerNumber(got.params.From))}`,
    action: `${origin}/api/voice/missed`,
  }));
}

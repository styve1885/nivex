import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/db";
import { readTwilioWebhook, twimlResponse } from "@/lib/twilio-webhook";
import { twimlAccept } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/accept — la touche de l'artisan, après l'annonce.
 *
 * Une touche, n'importe laquelle : la réponse vide termine l'annonce, et
 * Twilio relie l'appelant. Rien : on raccroche du côté du cellulaire, et
 * l'appel compte comme manqué (/api/voice/missed).
 */
export async function POST(req: NextRequest) {
  const got = await readTwilioWebhook(req, "/api/voice/accept");
  if (!got.ok) {
    if (got.status === 403) await logEvent("call_rejected", { reason: "bad_signature" });
    return new NextResponse(got.reason, { status: got.status });
  }
  return twimlResponse(twimlAccept(got.params.Digits));
}

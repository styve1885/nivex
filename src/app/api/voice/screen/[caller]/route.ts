import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/db";
import { siteOrigin } from "@/lib/google";
import { knownClientName } from "@/lib/sms";
import { readTwilioWebhook, twimlResponse } from "@/lib/twilio-webhook";
import { callerFromKey, screenPrompt, twimlScreen } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ caller: string }> };

/**
 * POST /api/voice/screen/<appelant> — le cellulaire de l'artisan vient de décrocher.
 *
 * Twilio joue ce qu'on lui répond à qui a décroché, avant de relier les deux
 * (l'attribut `url` du <Number> de /api/voice/incoming). On annonce
 * l'appelant, son nom s'il est déjà client, et on attend une touche
 * (/api/voice/accept). L'appelant, lui, entend toujours sonner.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { caller } = await ctx.params;
  const got = await readTwilioWebhook(req, `/api/voice/screen/${caller}`);
  if (!got.ok) {
    if (got.status === 403) await logEvent("call_rejected", { reason: "bad_signature" });
    return new NextResponse(got.reason, { status: got.status });
  }
  const from = callerFromKey(caller);
  const name = from ? await knownClientName(from) : null;
  return twimlResponse(twimlScreen({ prompt: screenPrompt({ from, name }), accept: `${siteOrigin()}/api/voice/accept` }));
}

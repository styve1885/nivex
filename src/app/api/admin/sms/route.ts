import { NextRequest, NextResponse } from "next/server";
import {
  type ConversationSummary, clientDirectory, loadConversation, loadRecent, readFailure, sendText,
} from "@/lib/conversations";
import { requireOwner } from "@/lib/session";
import { smsConfigured, toE164 } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/admin/sms — les textos échangés avec les clients (onglet Messages).
 *
 * GET : les conversations des derniers jours et l'annuaire des clients ; avec
 * `?number=+1…`, toute la conversation avec ce numéro. Tout se lit chez
 * Twilio à la demande : le site n'en garde rien.
 * POST { to, body } : un texto de l'artisan, depuis le numéro de la maison.
 */
export async function GET(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!smsConfigured()) return NextResponse.json({ ok: true, configured: false });

  const asked = req.nextUrl.searchParams.get("number");
  if (asked !== null) {
    const number = toE164(asked);
    if (!number) return NextResponse.json({ ok: false, reason: "Ce numéro n'est pas un numéro à dix chiffres." }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, configured: true, conversation: await loadConversation(number) });
    } catch (e) {
      return NextResponse.json({ ok: false, reason: readFailure(e) }, { status: 502 });
    }
  }

  /* Une base muette n'empêche pas de lire les conversations, ni l'inverse :
     l'artisan peut toujours taper un numéro et écrire. */
  const clients = await clientDirectory().catch((e) => {
    console.error("[nivex] annuaire des clients illisible :", e);
    return [];
  });
  const names = new Map(clients.map((c) => [c.number.slice(-10), c.name]));
  let conversations: ConversationSummary[] | null = null;
  let readError: string | null = null;
  try {
    conversations = await loadRecent(names);
  } catch (e) {
    readError = readFailure(e);
  }
  return NextResponse.json({ ok: true, configured: true, conversations, readError, clients });
}

export async function POST(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { to?: unknown; body?: unknown } | null;
  if (!body || typeof body.to !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ ok: false, reason: "Requête incomplète." }, { status: 400 });
  }
  const sent = await sendText({ to: body.to, body: body.body });
  if (!sent.ok) return NextResponse.json({ ok: false, reason: sent.reason }, { status: sent.status });
  return NextResponse.json({ ok: true, message: sent.message });
}

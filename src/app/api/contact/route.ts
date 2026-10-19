import { NextRequest, NextResponse } from "next/server";
import { ContactInput, ContactError, submitContact } from "@/lib/messages";
import { isDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = ContactInput.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Pot de miel : succès silencieux, le robot n'apprend rien — même statut,
  // même forme qu'un message reçu sans courriel.
  if (parsed.data.hp) return NextResponse.json({ ok: true, sent: false, acked: false }, { status: 201 });

  // Démonstration locale : on confirme sans rien enregistrer ni envoyer.
  if (isDemo()) return NextResponse.json({ ok: true, demo: true, sent: false, acked: false }, { status: 201 });

  try {
    const { sent, acked } = await submitContact(parsed.data);
    return NextResponse.json({ ok: true, sent, acked }, { status: 201 });
  } catch (e) {
    if (e instanceof ContactError) {
      return NextResponse.json({ ok: false, error: e.code }, { status: e.code === "rate_limited" ? 429 : 503 });
    }
    console.error("[nivex] contact failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

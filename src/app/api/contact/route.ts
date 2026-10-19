import { NextRequest, NextResponse } from "next/server";
import { ContactInput, ContactError, submitContact } from "@/lib/messages";
import { isDemo } from "@/lib/demo";
import { logEvent } from "@/lib/db";

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

  /* Pot de miel : le robot reçoit l'invitation à appeler. Une vraie personne
     dont le navigateur aurait rempli ce champ à son insu croirait sinon son
     message reçu, alors qu'il n'est enregistré nulle part. */
  if (parsed.data.hp) {
    await logEvent("honeypot", { form: "contact" });
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

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

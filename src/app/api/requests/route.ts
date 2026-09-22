import { NextRequest, NextResponse } from "next/server";
import { SlotRequestInput, SlotRequestError, submitSlotRequest, slotLabel } from "@/lib/requests";
import { bookingRef } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { isDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/requests — une demande de créneau.
 *
 * Rien n'est réservé ici : la demande part vers la boîte de l'artisan,
 * qui rappelle pour fixer l'heure. C'est le seul chemin depuis que le
 * tunnel ne lit plus l'agenda.
 */
export async function POST(req: NextRequest) {
  const parsed = SlotRequestInput.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Pot de miel : succès silencieux, le robot n'apprend rien.
  if (parsed.data.hp) return NextResponse.json({ ok: true, ref: bookingRef(), sent: false }, { status: 200 });

  // Démonstration locale : on confirme sans rien enregistrer ni envoyer.
  const { timezone } = await getSettings();
  const slot = slotLabel(parsed.data.startsAt, timezone, parsed.data.locale);

  if (isDemo()) {
    return NextResponse.json({ ok: true, demo: true, sent: false, ref: bookingRef(), slot }, { status: 201 });
  }

  try {
    const { ref, sent } = await submitSlotRequest(parsed.data);
    return NextResponse.json({ ok: true, ref, sent, slot }, { status: 201 });
  } catch (e) {
    if (e instanceof SlotRequestError) {
      const status = e.code === "rate_limited" ? 429 : e.code === "unavailable" ? 503 : 400;
      return NextResponse.json({ ok: false, error: e.code }, { status });
    }
    console.error("[nivex] slot request failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

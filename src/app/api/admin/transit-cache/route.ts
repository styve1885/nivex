import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/session";
import { clearTransitCache } from "@/lib/transit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vide les mesures de trajet gardées en cache.
 *
 * Utile le jour d'un déménagement, ou quand un horaire de transport change
 * pour de bon : sans cela, le site continuerait un mois durant à facturer
 * selon une carte périmée.
 */
export async function DELETE() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, cleared: await clearTransitCache() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String((e as Error).message).slice(0, 200) },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewSeries, SubscriptionError } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  planKey: z.string().min(1).max(40),
  startsAt: z.string().datetime({ offset: true }),
});

/**
 * POST /api/subscriptions/check — la série tient-elle ?
 *
 * Toutes les dates d'une série, vérifiées avant que le client confirme :
 * horaire, rendez-vous déjà pris, agenda de l'artisan. En cas de conflit,
 * les dates concernées et quelques autres créneaux dont la série entière est
 * libre. La création repose la même question : entre les deux, quelqu'un a
 * pu réserver.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const p = await previewSeries({ planKey: parsed.data.planKey, first: new Date(parsed.data.startsAt), checkLead: true });
    return NextResponse.json({
      ok: true,
      free: p.conflicts.length === 0,
      starts: p.starts.map((d) => d.toISOString()),
      conflicts: p.conflicts.map((c) => ({ startsAt: c.startsAt.toISOString(), reason: c.reason })),
      alternatives: p.alternatives.map((d) => d.toISOString()),
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SubscriptionError) return NextResponse.json({ ok: false, error: e.code }, { status: 422 });
    console.error("[nivex] series check failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

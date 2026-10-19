import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelVisit, clientChangeAllowed, findSubscriptionByToken, moveVisit, SubscriptionError } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), visitId: z.string().uuid() }),
  z.object({ action: z.literal("move"), visitId: z.string().uuid(), startsAt: z.string().datetime({ offset: true }) }),
]);

/**
 * PATCH /api/subscriptions/[jeton] — annuler ou déplacer UNE visite.
 *
 * Le jeton de l'abonnement ouvre ses visites, et seulement elles : une
 * visite d'un autre abonnement est introuvable ici. Le délai — 23 h 59 la
 * veille — est vérifié par subscriptions.ts, pas par la page. Le nombre de
 * changements en vingt-quatre heures aussi : chacun part en courriels et en
 * textos.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

  const full = await findSubscriptionByToken(token).catch(() => null);
  if (!full) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (full.sub.status !== "active") return NextResponse.json({ ok: false, error: "ended" }, { status: 409 });
  const visit = full.visits.find((v) => v.id === parsed.data.visitId);
  if (!visit) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!(await clientChangeAllowed(full, visit))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    if (parsed.data.action === "cancel") {
      const { replacement } = await cancelVisit(visit, "client", req.headers.get("host"));
      return NextResponse.json({ ok: true, replacement: replacement?.startsAt.toISOString() ?? null });
    }
    const moved = await moveVisit(visit, new Date(parsed.data.startsAt), "client", req.headers.get("host"));
    return NextResponse.json({ ok: true, startsAt: moved.startsAt.toISOString() });
  } catch (e) {
    if (e instanceof SubscriptionError) {
      return NextResponse.json({ ok: false, error: e.code }, { status: e.code === "too_late" || e.code === "slot_taken" || e.code === "invalid_slot" ? 409 : 422 });
    }
    console.error("[nivex] visit change failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

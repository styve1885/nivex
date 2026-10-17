import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runDaily } from "@/lib/subscriptions";
import { requireOwner } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/daily — rappels de la veille et courriels de fin de série.
 *
 * Vercel l'appelle chaque matin (vercel.json) avec l'en-tête
 * `Authorization: Bearer <CRON_SECRET>`. Sans la variable, la route refuse
 * tout : une tâche qui envoie des courriels ne s'ouvre pas au premier venu.
 * L'artisan connecté peut aussi la lancer à la main, depuis /admin.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const byCron = Boolean(secret) && safeEqual(header, `Bearer ${secret}`);
  if (!byCron && !(await requireOwner())) {
    return NextResponse.json({ ok: false, error: secret ? "unauthorized" : "cron_not_configured" }, { status: 401 });
  }

  try {
    const result = await runDaily(req.headers.get("host"));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[nivex] daily failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { withdrawQueuedReminders } from "@/lib/bookings";
import { requireOwner } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/reminders?sha=… — retire chez Twilio les textos de deux
 * heures avant encore programmés pour des séances dont les rappels sont
 * coupés : les abonnés, par défaut, depuis le 11 novembre 2026.
 *
 * Le workflow du déploiement l'appelle juste après chaque mise en ligne,
 * avec `CRON_SECRET` et le commit déployé : 409 tant que le domaine sert la
 * version précédente, comme /api/indexnow. La tâche du matin fait la même
 * chose, en filet. La réponse ne porte que des nombres : le journal du
 * workflow est public.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const byCron = Boolean(secret) && safeEqual(header, `Bearer ${secret}`);
  if (!byCron && !(await requireOwner())) {
    return NextResponse.json({ ok: false, error: secret ? "unauthorized" : "cron_not_configured" }, { status: 401 });
  }

  const expected = req.nextUrl.searchParams.get("sha");
  const live = process.env.VERCEL_GIT_COMMIT_SHA;
  if (expected && live && expected !== live) {
    return NextResponse.json({ ok: false, error: "not_live_yet", live }, { status: 409 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await withdrawQueuedReminders()) });
  } catch (e) {
    console.error("[nivex] retrait des rappels impossible :", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

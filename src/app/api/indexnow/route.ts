import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { submitIfProduction } from "@/lib/indexnow";
import { requireOwner } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/indexnow?sha=<commit> — signale à IndexNow les pages publiques
 * nouvelles ou modifiées (lib/indexnow.ts).
 *
 * Le workflow GitHub « IndexNow » l'appelle dès qu'un déploiement de
 * production a réussi, avec `Authorization: Bearer <CRON_SECRET>` et le
 * commit déployé. Tant que le domaine sert encore la version précédente, la
 * route répond 409 et le workflow réessaie : c'est la nouvelle version, et
 * ses dates, qui doivent partir. Sans la variable, elle refuse tout, comme la
 * tâche quotidienne ; l'artisan connecté peut aussi l'appeler.
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

  return NextResponse.json({ ok: true, ...(await submitIfProduction()) });
}

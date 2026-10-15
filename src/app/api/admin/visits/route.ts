import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/session";
import { listVisits, visitSources, visitSummary } from "@/lib/visits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le journal des visites, pour l'onglet Visites de l'espace artisan. */
export async function GET(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const raw = Number(sp.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 400) : undefined;
  const source = sp.get("source") || undefined;

  const [visits, sources, summary] = await Promise.all([
    listVisits({ days, source, limit: 400 }).catch(() => []),
    visitSources(days).catch(() => []),
    visitSummary(days).catch(() => ({ views: 0, firstSeen: null, cities: 0 })),
  ]);

  return NextResponse.json({
    ok: true,
    sources,
    summary: {
      views: summary.views,
      cities: summary.cities,
      firstSeen: summary.firstSeen?.toISOString() ?? null,
    },
    visits: visits.map((v) => ({
      id: v.id, path: v.path, source: v.source, referrer: v.referrer,
      device: v.device, city: v.city, region: v.region, country: v.country,
      locale: v.locale, createdAt: v.createdAt.toISOString(),
    })),
  });
}

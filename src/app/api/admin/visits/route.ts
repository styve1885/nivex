import { NextRequest, NextResponse } from "next/server";
import { optOutKey, requireOwner } from "@/lib/session";
import { siteOrigin } from "@/lib/google";
import { bookingSources } from "@/lib/bookings";
import { isSourceGroup, SOURCE_GROUPS, type SourceGroup } from "@/lib/attribution";
import {
  digestSummary, isPeriod, listVisits, sourcesOf, visitBilan, visitDigest,
  PERIODS, type Period, type RobotFilter,
} from "@/lib/visits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * Le journal des visites, pour l'onglet Visites de l'espace artisan : la
 * liste filtrée, ce qui la coiffe, le bilan par source et le lien personnel
 * qui retire un navigateur du décompte.
 */
export async function GET(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const raw = Number(sp.get("days"));
  const period: Period = isPeriod(raw) ? raw : 0;
  const g = sp.get("group");
  const group: SourceGroup | null = isSourceGroup(g) ? g : null;
  const r = sp.get("robots");
  const robots: RobotFilter = r === "only" || r === "all" ? r : "hide";

  /* Une base qui ne répond pas n'est pas un journal vide : l'onglet doit
     dire « lecture impossible », pas « aucune visite ». */
  let digest: Awaited<ReturnType<typeof visitDigest>>;
  let bookings: Awaited<ReturnType<typeof bookingSources>>;
  let visits: Awaited<ReturnType<typeof listVisits>>;
  try {
    [digest, bookings] = await Promise.all([visitDigest(), bookingSources()]);
    visits = await listVisits({
      days: period, group, robots, limit: 400,
      sources: group ? sourcesOf(digest, group) : [],
    });
  } catch (e) {
    console.error("[nivex] journal des visites illisible :", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
  const summary = digestSummary(digest, period, robots, group);

  /* Le bilan : pages vues sans les robots, réservations, par famille et par
     période. Les réservations se comptent à la date où elles ont été prises. */
  const seen = visitBilan(digest);
  const now = Date.now();
  const bilan = SOURCE_GROUPS.map((key) => ({
    group: key,
    periods: PERIODS.map((p) => ({
      days: p,
      visits: seen[key][p],
      bookings: bookings.filter((b) => b.group === key && (p === 0 || now - b.createdAt.getTime() <= p * DAY)).length,
    })),
  }));

  const key = optOutKey();
  return NextResponse.json({
    ok: true,
    groups: summary.groups,
    summary: { views: summary.views, cities: summary.cities, robots: summary.robots },
    bilan,
    optOutUrl: key ? `${siteOrigin()}/fr/ne-pas-compter?cle=${key}` : null,
    visits: visits.map((v) => ({
      id: v.id, path: v.path, group: v.group, source: v.source,
      campaign: v.campaign, referral: v.referral, referrer: v.referrer,
      device: v.device, city: v.city, region: v.region, country: v.country,
      locale: v.locale, robot: v.robot, createdAt: v.createdAt.toISOString(),
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { findSubscriptionByToken, visitMoveSlots } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/subscriptions/[jeton]/slots?visit=…&from=2027-03-08&days=14
 *
 * Les heures où déplacer UNE visite, pour le sélecteur de la page de
 * l'abonné. La grille de /api/schedule ne convient pas ici : elle s'arrête à
 * l'horizon des séances, et elle compte la visite elle-même comme occupée,
 * si bien qu'on ne pouvait ni la décaler d'une heure, ni toucher une visite
 * de mars. Le jeton ouvre ses visites, et seulement elles ; la durée vient de
 * la base, et le déplacement revérifie tout.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const sp = new URL(req.url).searchParams;

  const full = await findSubscriptionByToken(token).catch(() => null);
  if (!full) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (full.sub.status !== "active") return NextResponse.json({ ok: false, error: "ended" }, { status: 409 });
  const visit = full.visits.find((v) => v.id === sp.get("visit"));
  if (!visit) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (visit.status === "cancelled" || visit.doneAt) {
    return NextResponse.json({ ok: false, error: visit.doneAt ? "done" : "ended" }, { status: 409 });
  }

  const slots = await visitMoveSlots(visit, { from: sp.get("from"), days: Number(sp.get("days") ?? 14) });
  return NextResponse.json({ ok: true, ...slots }, { headers: { "cache-control": "no-store" } });
}

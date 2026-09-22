import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { computeSlots, estimateMinutes } from "@/lib/availability";
import { dateKey } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/schedule?items=shirt:10,suit:2&from=2026-09-26&days=14
 *
 * L'horaire de la maison, rien d'autre : les jours ouverts, les heures
 * d'ouverture, le délai de prévenance et l'horizon de réservation. Aucun
 * agenda n'est lu — ces heures sont celles où la maison travaille, pas
 * celles dont on jure qu'elles sont libres. C'est l'appel de l'artisan qui
 * tranche, et le tunnel le dit à la personne.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const settings = await getSettings();

  /* Durée : déduite du panier côté serveur, jamais confiée au navigateur. */
  let duration = Number(url.searchParams.get("duration") ?? 0);
  const rawItems = url.searchParams.get("items");
  if (rawItems) {
    const items = rawItems.split(",").map((p) => {
      const [key, qty] = p.split(":");
      return { key: key?.trim() ?? "", qty: Math.max(0, Math.min(200, Number(qty) || 0)) };
    }).filter((i) => i.key && i.qty > 0);
    duration = estimateMinutes(items, settings);
  }
  if (!Number.isFinite(duration) || duration <= 0) duration = settings.minMinutes;
  duration = Math.min(Math.max(duration, settings.minMinutes), 12 * 60);

  const today = dateKey(new Date(), settings.timezone);
  let from = url.searchParams.get("from") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = today;
  if (from < today) from = today;

  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 14), 1), 31);

  return NextResponse.json({
    timezone: settings.timezone,
    duration,
    horizonDays: settings.horizonDays,
    leadHours: settings.leadHours,
    today,
    days: computeSlots({ fromKey: from, days, durationMinutes: duration, settings, busy: [] }),
  }, { headers: { "cache-control": "no-store" } });
}

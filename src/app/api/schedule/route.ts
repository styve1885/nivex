import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { computeSlots, estimateMinutes, loadBusy } from "@/lib/availability";
import { ownerAccessToken } from "@/lib/google";
import { addDaysToKey, dateKey, fromWall, parseDateKey } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/schedule?items=shirt:10,suit:2&from=2026-09-26&days=14
 *
 * L'horaire de la maison — jours ouverts, heures d'ouverture, délai de
 * prévenance, horizon — duquel on retranche ce qui est déjà pris : les
 * rendez-vous en base, et l'agenda de l'artisan quand il répond.
 *
 * L'agenda est un bonus, jamais une condition. S'il ne répond pas, la
 * grille reste servie à partir de la base seule : un incident chez Google
 * ne doit pas fermer le tunnel. Le garde-fou qui compte est de toute façon
 * ailleurs — la contrainte de non-chevauchement, au moment de l'écriture.
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

  const accessToken = await ownerAccessToken().catch(() => null);
  const busy = await loadBusy({
    accessToken, settings,
    timeMin: fromWall({ ...parseDateKey(from), hour: 0, minute: 0 }, settings.timezone),
    timeMax: fromWall({ ...parseDateKey(addDaysToKey(from, days)), hour: 0, minute: 0 }, settings.timezone),
  }).catch(() => []);

  return NextResponse.json({
    timezone: settings.timezone,
    duration,
    horizonDays: settings.horizonDays,
    leadHours: settings.leadHours,
    today,
    days: computeSlots({ fromKey: from, days, durationMinutes: duration, settings, busy }),
  }, { headers: { "cache-control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { evaluateZone } from "@/lib/travel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTAL = /^[A-Za-z]\d[A-Za-z]\s?-?\d[A-Za-z]\d$/;

/**
 * Le vérificateur de code postal, ouvert à tous.
 *
 * La même règle que celle qui décide à la réservation, lue au même endroit :
 * deux calculs parallèles auraient fini par se contredire, et c'est le client
 * qui aurait découvert l'écart au moment de confirmer.
 */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const postal = (sp.get("postal") ?? "").trim();

  if (!POSTAL.test(postal)) {
    return NextResponse.json({ ok: false, error: "invalid_postal" }, { status: 400 });
  }

  const s = await getSettings();

  /* La durée départage le tarif court du tarif long. Le vérificateur des
     pages publiques n'en a pas : on répond alors pour la séance la plus
     courte possible, c'est-à-dire le tarif le moins avantageux. Annoncer le
     meilleur cas serait une promesse à tenir. */
  const demandee = Number(sp.get("minutes"));
  const durationMinutes = Number.isFinite(demandee) && demandee > 0
    ? Math.min(Math.round(demandee), 960)
    : s.minMinutes;

  const v = evaluateZone(postal, durationMinutes, s.zonePolicy);

  return NextResponse.json({
    ok: true,
    status: v.status,
    zoneKey: v.zoneKey,
    labelFr: v.labelFr,
    labelEn: v.labelEn,
    feeCents: v.feeCents,
    currency: s.currency,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getSettings, updateSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

const Patch = z.object({
  calendarId: z.string().min(1).max(200).optional(),
  timezone: z.string().min(1).max(60).optional(),
  businessName: z.string().min(1).max(80).optional(),
  hourlyRate: z.number().int().min(0).max(100_000).optional(),
  currency: z.enum(["CAD", "USD", "EUR"]).optional(),
  minMinutes: z.number().int().min(15).max(720).optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  leadHours: z.number().int().min(0).max(720).optional(),
  horizonDays: z.number().int().min(1).max(180).optional(),
  slotStep: z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(60)]).optional(),
  firstHourFree: z.boolean().optional(),
  paused: z.boolean().optional(),
  hours: z.array(z.object({
    day: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    open: z.string().regex(HM),
    close: z.string().regex(HM),
  })).length(7).optional(),
  serviceArea: z.object({
    prefixes: z.array(z.string().regex(/^[A-Za-z]\d[A-Za-z]$/)).max(200),
    labelFr: z.string().max(300),
    labelEn: z.string().max(300),
  }).optional(),
  /* La politique de déplacement, réglée depuis l'espace artisan. */
  travelPolicy: z.object({
    enabled: z.boolean(),
    freeUnderMinutes: z.number().int().min(0).max(600),
    feeShortCents: z.number().int().min(0).max(50_000),
    feeLongCents: z.number().int().min(0).max(50_000),
    longSessionMinutes: z.number().int().min(30).max(960),
    minSessionOverMinutes: z.number().int().min(0).max(600),
    maxMinutes: z.number().int().min(1).max(600),
    fallbackPrefixes: z.array(z.string().regex(/^[A-Za-z]\d[A-Za-z]$/)).max(300),
    cacheDays: z.number().int().min(1).max(365),
  }).optional(),
  services: z.array(z.object({
    key: z.string().min(1).max(40),
    icon: z.string().max(30),
    fr: z.string().min(1).max(80),
    en: z.string().min(1).max(80),
    minutesPerUnit: z.number().int().min(1).max(600),
    unitFr: z.string().max(40),
    unitEn: z.string().max(40),
    enabled: z.boolean(),
  })).max(30).optional(),
}).refine(
  (v) => !v.hours || v.hours.every((h) => !h.enabled || h.open < h.close),
  { message: "L'heure de fermeture doit suivre l'heure d'ouverture", path: ["hours"] },
).refine(
  /* Les trois seuils doivent rester dans l'ordre. Sans cette garde, une
     politique incohérente s'enregistrerait sans bruit : un trajet « gratuit »
     plus long que le maximum autorisé, et plus personne ne paierait rien. */
  (v) => {
    const t = v.travelPolicy;
    if (!t) return true;
    return t.freeUnderMinutes <= t.minSessionOverMinutes
      && t.minSessionOverMinutes <= t.maxMinutes;
  },
  { message: "Les seuils de trajet doivent aller du plus court au plus long", path: ["travelPolicy"] },
);

export async function GET() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await getSettings() });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Les clés de service doivent rester uniques : elles indexent les paniers.
  if (parsed.data.services) {
    const keys = parsed.data.services.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      return NextResponse.json({ ok: false, error: "duplicate_service_key" }, { status: 400 });
    }
  }

  const settings = await updateSettings(parsed.data);
  return NextResponse.json({ ok: true, settings });
}

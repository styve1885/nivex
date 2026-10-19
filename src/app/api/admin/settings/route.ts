import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
);

/* Les zones et les frais ne passent plus par ici : ils ont leur onglet et
   leur route (/api/admin/zones), pour qu'un enregistrement des réglages ne
   ramène jamais une grille lue avant qu'on la modifie ailleurs. */
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
  /* La vitrine se sert depuis le cache : tarif, horaire et prestations y
     paraissent dès la prochaine visite, sans attendre `revalidate`. */
  revalidatePath("/[locale]", "layout");
  return NextResponse.json({ ok: true, settings });
}

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/session";
import { getSettingsStrict } from "@/lib/settings";
import { siteOrigin } from "@/lib/google";
import { sendReminderTrial } from "@/lib/reminder-trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-reminder — l'essai du rappel de la veille.
 *
 * Le courriel et le texto que reçoit un client la veille de sa séance, pour
 * une séance fictive de demain, envoyés à l'artisan seul : la boîte de la
 * maison et son cellulaire (lib/reminder-trial.ts). Réservé à l'artisan ;
 * rien ne s'écrit en base.
 */
export async function POST() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  /* Les réglages lus strictement : un essai fait aux valeurs du code
     montrerait un tarif ou un horaire que la maison n'a peut-être plus. */
  const settings = await getSettingsStrict().catch(() => null);
  if (!settings) return NextResponse.json({ ok: false, error: "settings_unreadable" }, { status: 503 });

  const r = await sendReminderTrial(settings, siteOrigin());
  return NextResponse.json({ ok: r.email.ok && r.sms.ok, ...r });
}

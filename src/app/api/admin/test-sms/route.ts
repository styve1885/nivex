import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { ownerSmsNumber, smsConfigured, toE164 } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-sms — un texto pour de vrai, vers le téléphone de l'artisan.
 *
 * Comme pour le courriel d'essai : un texto qui n'arrive pas ne se
 * diagnostique qu'en essayant. La route rend la raison exacte donnée par
 * Twilio — un numéro non vérifié en compte d'essai, un numéro d'envoi mal
 * saisi —, sans rien qui ressemble à une clé.
 */
export async function POST() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!smsConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "Les variables TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM ne sont pas toutes posées dans Vercel.",
    });
  }
  const to = ownerSmsNumber();
  if (!to) {
    return NextResponse.json({ ok: false, reason: "Le numéro de l'artisan (SMS_OWNER_TO) n'est pas un numéro nord-américain valide." });
  }
  if (!toE164(process.env.TWILIO_FROM)) {
    return NextResponse.json({ ok: false, reason: "TWILIO_FROM doit être le numéro acheté chez Twilio, au format +1XXXXXXXXXX." });
  }

  const settings = await getSettings();
  const when = new Intl.DateTimeFormat("fr-CA", { timeZone: settings.timezone, dateStyle: "long", timeStyle: "short" }).format(new Date());
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to, From: process.env.TWILIO_FROM!,
      Body: `NIVEX : texto d'essai envoyé depuis l'espace artisan, le ${when}. Les confirmations et les rappels partiront par ce même chemin.`,
    }),
  }).catch((e) => e as Error);

  if (res instanceof Error) return NextResponse.json({ ok: false, reason: `Twilio injoignable : ${res.message.slice(0, 200)}` });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { code?: number; message?: string };
    return NextResponse.json({ ok: false, reason: `Twilio a refusé (HTTP ${res.status}${body.code ? `, code ${body.code}` : ""}) : ${body.message ?? ""}`.slice(0, 400) });
  }
  return NextResponse.json({ ok: true, to: `${to.slice(0, 5)}…${to.slice(-4)}` });
}

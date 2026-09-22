import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { GoogleError, ownerAccessToken, sendGmail, siteOrigin } from "@/lib/google";
import { REQUEST_INBOX } from "@/lib/brand";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-email — un envoi pour de vrai, vers la boîte de la maison.
 *
 * Un courriel qui n'arrive pas ne se diagnostique pas en lisant du code :
 * il faut essayer. Cette route essaie, et rend la raison exacte du refus
 * plutôt qu'un « échec » sans suite. Aucun secret n'en sort — seulement
 * l'opération, le code HTTP et le message de Google.
 */
export async function POST() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const settings = await getSettings();
  const to = REQUEST_INBOX;

  let at: string | null = null;
  try {
    at = await ownerAccessToken();
  } catch (e) {
    return NextResponse.json({
      ok: false, stage: "token", to,
      reason: describe(e),
      hint: "Le jeton de rafraîchissement n'est plus accepté par Google. Reconnectez le compte ci-dessus.",
    }, { status: 200 });
  }

  if (!at) {
    return NextResponse.json({
      ok: false, stage: "token", to,
      reason: "Aucun compte Google branché.",
      hint: "Connectez le compte Google de la maison pour que les courriels puissent partir.",
    }, { status: 200 });
  }

  const when = new Intl.DateTimeFormat("fr-CA", {
    timeZone: settings.timezone, dateStyle: "full", timeStyle: "short",
  }).format(new Date());

  try {
    await sendGmail(at, {
      to,
      subject: `Test d'envoi NIVEX — ${when}`,
      fromName: settings.businessName || "NIVEX",
      text: [
        "Ceci est un essai lancé depuis votre espace artisan.",
        "",
        `Si vous lisez ce message, les confirmations de réservation partent bien vers ${to}.`,
        "",
        `Envoyé le ${when}`,
        `${siteOrigin()}/admin`,
      ].join("\n"),
      html: `<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1F1B16;">
        Ceci est un essai lancé depuis votre espace artisan.<br><br>
        Si vous lisez ce message, les confirmations de réservation partent bien vers
        <strong>${to}</strong>.<br><br>
        <span style="color:#6B6459;font-size:13px;">Envoyé le ${when}</span>
      </p>`,
    });
  } catch (e) {
    await logEvent("test_email_failed", { to, error: describe(e).slice(0, 400) });
    const needsReconnect = e instanceof GoogleError && e.needsReconnect;
    return NextResponse.json({
      ok: false, stage: "send", to,
      reason: describe(e),
      hint: needsReconnect
        ? "Google a refusé le jeton. Reconnectez le compte ci-dessus."
        : "Vérifiez que la permission « Envoyer un courriel » (gmail.send) a bien été accordée au moment de la connexion.",
    }, { status: 200 });
  }

  await logEvent("test_email_sent", { to });
  return NextResponse.json({ ok: true, to, at: when });
}

/** Le message de Google, sans rien qui ressemble à un secret. */
function describe(e: unknown): string {
  if (e instanceof GoogleError) return `${e.op} — HTTP ${e.status} · ${e.body.slice(0, 300)}`;
  return String((e as Error)?.message ?? e).slice(0, 300);
}

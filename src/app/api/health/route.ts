import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { GoogleError, googleConfigured, ownerAccessToken, siteOrigin } from "@/lib/google";
import { getSettings } from "@/lib/settings";
import { REQUEST_INBOX } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic d'installation — aucun secret n'est exposé.
 *
 * Quand le jeton Google est refusé, on rend le code d'erreur d'OAuth
 * (`invalid_grant`, `unauthorized_client`…) et rien d'autre : c'est ce
 * mot qui dit s'il faut reconnecter le compte ou corriger la console
 * Google, et il ne révèle rien. Le message complet reste dans l'espace
 * artisan, derrière l'authentification.
 */
export async function GET() {
  const settings = await getSettings();

  let tokenUsable: boolean | null = null;
  let tokenError: string | null = null;

  if (!googleConfigured()) {
    tokenError = "google_not_configured";
  } else if (!settings.connected) {
    tokenError = "not_connected";
  } else {
    try {
      tokenUsable = Boolean(await ownerAccessToken());
      if (!tokenUsable) tokenError = "no_refresh_token";
    } catch (e) {
      tokenUsable = false;
      tokenError = oauthCode(e);
    }
  }

  return NextResponse.json({
    ok: true,
    origin: siteOrigin(),
    env: {
      database: isDbConfigured(),
      google: googleConfigured(),
      encryptionKey: Boolean(process.env.ENCRYPTION_KEY),
      sessionSecret: Boolean(process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY),
      setupCode: Boolean(process.env.ADMIN_SETUP_CODE),
    },
    owner: { connected: settings.connected, email: settings.ownerEmail, paused: settings.paused },
    calendar: { id: settings.calendarId, tokenUsable, timezone: settings.timezone },
    /* Ce qu'il faut savoir quand un courriel n'arrive pas. */
    email: {
      inbox: REQUEST_INBOX,
      canSend: tokenUsable === true,
      reason: tokenError,
      fix: tokenError ? FIX[tokenError] ?? FIX.default : null,
    },
  }, { headers: { "cache-control": "no-store" } });
}

const FIX: Record<string, string> = {
  invalid_grant:
    "Google a révoqué le jeton. C'est le cas typique quand l'application OAuth est restée en mode « Test » dans la console Google : les jetons y expirent au bout de sept jours. Publiez l'application « En production », puis reconnectez le compte depuis /admin.",
  unauthorized_client:
    "L'identifiant client n'a pas le droit de rafraîchir ce jeton. Vérifiez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET, puis reconnectez le compte.",
  invalid_client:
    "L'identifiant ou le secret client ne correspond pas à ceux déclarés chez Google. Corrigez les variables, puis reconnectez le compte.",
  no_refresh_token:
    "Aucun jeton de rafraîchissement enregistré. Reconnectez le compte Google depuis /admin.",
  not_connected:
    "Aucun compte Google n'est branché. Connectez-le depuis /admin : c'est de lui que partent tous les courriels.",
  google_not_configured:
    "Les variables GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET manquent côté serveur. Sans elles, aucun courriel ne peut partir.",
  default:
    "Reconnectez le compte Google depuis /admin. Si l'erreur revient, l'espace artisan en donne le message complet.",
};

/** Le code d'erreur d'OAuth, seul : « invalid_grant », « invalid_client »… */
function oauthCode(e: unknown): string {
  if (e instanceof GoogleError) {
    const m = /"error"\s*:\s*"([a-z_]+)"/i.exec(e.body);
    return m?.[1] ?? `http_${e.status}`;
  }
  return "unknown";
}

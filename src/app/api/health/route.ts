import { NextResponse } from "next/server";
import { ensureSchema, isDbConfigured } from "@/lib/db";
import { GoogleError, googleConfigured, ownerAccessToken, siteOrigin } from "@/lib/google";
import { getSettings, settingsReadError } from "@/lib/settings";
import { REQUEST_INBOX } from "@/lib/brand";
import { smsConfigured, smsScheduleConfigured } from "@/lib/sms";
import { activeSectors } from "@/lib/travel";
import { requireOwner } from "@/lib/session";

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
 *
 * La page est publique, et le reste : c'est elle qu'on ouvre quand on ne
 * peut plus se connecter. Mais ce qui nomme une personne ou trahit
 * l'intérieur — l'adresse du compte Google branché, la boîte des avis, le
 * texte brut d'une erreur de base — ne s'affiche qu'à l'artisan connecté.
 */
export async function GET() {
  const settings = await getSettings();
  const owner = Boolean(await requireOwner().catch(() => null));

  /* Une base muette renvoie les réglages par défaut, qui se lisent comme un
     compte absent. On distingue donc les deux plutôt que de les confondre. */
  let schema: { ok: boolean; error: string | null } = { ok: true, error: null };
  if (isDbConfigured()) {
    try {
      await ensureSchema();
      schema = { ok: true, error: settingsReadError() };
    } catch (e) {
      schema = { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) };
    }
  }

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

  /* « ok » dit si la base répond : une surveillance externe doit voir la
     panne, et un 200 permanent la lui cachait. Le reste du diagnostic suit
     dans les deux cas. */
  const ok = schema.ok && !schema.error;

  return NextResponse.json({
    ok,
    origin: siteOrigin(),
    env: {
      database: isDbConfigured(),
      google: googleConfigured(),
      encryptionKey: Boolean(process.env.ENCRYPTION_KEY),
      sessionSecret: Boolean(process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY),
      setupCode: Boolean(process.env.ADMIN_SETUP_CODE),
      sms: smsConfigured(),
      smsSchedule: smsScheduleConfigured(),
      cron: Boolean(process.env.CRON_SECRET),
    },
    /* Le texte brut d'une erreur de base peut nommer un hôte ou une table :
       seul l'artisan le lit. Les autres savent qu'il y en a une. */
    schema: owner ? schema : { ok: schema.ok, error: schema.error ? "masquée : connectez-vous à /admin" : null },
    /* Les zones desservies, résumées : de quoi voir d'un coup d'œil qu'une
       grille est bien en place, sans révéler les montants. */
    zones: settings.zonePolicy.zones.map((z) => {
      const sectors = activeSectors(settings.zonePolicy).filter((x) => x.zoneKey === z.key);
      return {
        key: z.key, sectors: sectors.length,
        prefixes: new Set(sectors.flatMap((x) => x.prefixes)).size,
        free: z.shortFeeCents === 0 && z.longFeeCents === 0,
      };
    }),
    /* L'adresse du compte, l'identifiant d'agenda (souvent cette même
       adresse) et la boîte des avis : pour l'artisan connecté seulement. */
    owner: { connected: settings.connected, paused: settings.paused, ...(owner ? { email: settings.ownerEmail } : {}) },
    calendar: { tokenUsable, timezone: settings.timezone, ...(owner ? { id: settings.calendarId } : {}) },
    /* Ce qu'il faut savoir quand un courriel n'arrive pas. */
    email: {
      ...(owner ? { inbox: REQUEST_INBOX } : {}),
      canSend: tokenUsable === true,
      reason: tokenError,
      fix: tokenError ? FIX[tokenError] ?? FIX.default : null,
    },
  }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
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

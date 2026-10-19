import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, userInfo, clearTokenCache } from "@/lib/google";
import { setSession, takeOAuthState } from "@/lib/session";
import { getSettingsStrict, saveConnection } from "@/lib/settings";
import { logEvent } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(req: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/admin/login?error=${encodeURIComponent(reason)}`, req.url));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return fail(req, error);
  if (!code || !state) return fail(req, "missing_code");

  const expected = await takeOAuthState();
  if (!expected || expected !== state) return fail(req, "state_mismatch");

  let tokens, profile;
  try {
    tokens = await exchangeCode(code, req.headers.get("host"));
    profile = await userInfo(tokens.access_token);
  } catch (e) {
    await logEvent("oauth_failed", { error: String((e as Error).message).slice(0, 400) });
    return fail(req, "exchange_failed");
  }

  if (!profile.email) return fail(req, "no_email");

  /* Lecture stricte : une base muette se lirait comme un compte encore
     libre, et le premier venu deviendrait l'artisan. */
  const settings = await getSettingsStrict().catch(() => null);
  if (!settings) return fail(req, "db_unavailable");
  const jar = await cookies();

  // Le compte est déjà revendiqué : seul le propriétaire peut se reconnecter.
  if (settings.ownerEmail && settings.ownerEmail.toLowerCase() !== profile.email.toLowerCase()) {
    return fail(req, "not_owner");
  }

  // Première connexion : un code d'installation peut être exigé.
  if (!settings.ownerEmail && process.env.ADMIN_SETUP_CODE && jar.get("nivex_claim")?.value !== "1") {
    return fail(req, "bad_setup_code");
  }
  jar.set("nivex_claim", "", { path: "/", maxAge: 0 });

  const scopes = (tokens.scope ?? "").split(" ");
  const missing = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/gmail.send"]
    .filter((s) => !scopes.includes(s));

  try {
    await saveConnection({
      email: profile.email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
      refreshToken: tokens.refresh_token ?? null,
    });
  } catch (e) {
    await logEvent("save_connection_failed", { error: String((e as Error).message).slice(0, 400) });
    return fail(req, "db_unavailable");
  }

  clearTokenCache();
  await setSession({ email: profile.email, name: profile.name ?? null, picture: profile.picture ?? null });
  await logEvent("owner_connected", { email: profile.email, missingScopes: missing });

  const dest = missing.length
    ? `/admin?warn=missing_scopes&scopes=${encodeURIComponent(missing.join(","))}`
    : "/admin?connected=1";
  return NextResponse.redirect(new URL(dest, req.url));
}

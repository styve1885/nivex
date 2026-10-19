import { NextRequest, NextResponse } from "next/server";
import { authUrl, googleConfigured } from "@/lib/google";
import { setOAuthState } from "@/lib/session";
import { getSettingsStrict } from "@/lib/settings";
import { safeEqual, token } from "@/lib/crypto";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function start(req: NextRequest, setupCode: string | null) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/admin/login?error=google_not_configured", req.url));
  }

  // Lecture stricte : un compte « libre » lu sur une base muette n'en est pas un.
  const settings = await getSettingsStrict().catch(() => null);
  if (!settings) return NextResponse.redirect(new URL("/admin/login?error=db_unavailable", req.url));
  const required = process.env.ADMIN_SETUP_CODE;

  // Première revendication du compte : on peut exiger un code d'installation.
  if (!settings.ownerEmail && required) {
    if (!setupCode || !safeEqual(setupCode, required)) {
      return NextResponse.redirect(new URL("/admin/login?error=bad_setup_code", req.url));
    }
    (await cookies()).set("nivex_claim", "1", {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 600,
    });
  }

  const state = token(16);
  await setOAuthState(state);
  return NextResponse.redirect(authUrl(state, req.headers.get("host")));
}

export async function GET(req: NextRequest) {
  return start(req, null);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  return start(req, (form?.get("setup") as string) ?? null);
}

import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { safeEqual } from "./crypto";

const COOKIE = "nivex_session";
const STATE_COOKIE = "nivex_oauth_state";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

export type Session = { email: string; name: string | null; picture: string | null };

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) throw new Error("SESSION_SECRET manquante");
  return new TextEncoder().encode(s);
}

export async function sign(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("nivex")
    .setAudience("nivex-admin")
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verify(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "nivex", audience: "nivex-admin" });
    if (typeof payload.email !== "string") return null;
    return {
      email: payload.email,
      name: (payload.name as string) ?? null,
      picture: (payload.picture as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function setSession(session: Session) {
  const jar = await cookies();
  jar.set(COOKIE, await sign(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  return raw ? verify(raw) : null;
}

export async function clearSession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/* — État OAuth (anti-CSRF) — */

export async function setOAuthState(state: string) {
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function takeOAuthState(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(STATE_COOKIE)?.value ?? null;
  if (v) jar.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return v;
}

/**
 * Le compte connecté est-il bien celui de l'artisan ?
 * Premier arrivé, premier servi — mais la toute première connexion peut
 * exiger ADMIN_SETUP_CODE si la variable est définie.
 */
export async function requireOwner(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  /* Lecture stricte, et refus si elle échoue : les valeurs par défaut
     portent un propriétaire absent, qui ouvrirait la porte à toute session. */
  const { getSettingsStrict } = await import("./settings");
  const s = await getSettingsStrict().catch(() => null);
  if (!s) return null;
  if (!s.ownerEmail) return session;                       // pas encore revendiqué
  return s.ownerEmail.toLowerCase() === session.email.toLowerCase() ? session : null;
}

/* — Le lien « ne pas compter » — */

/**
 * La clé du lien personnel qui retire un navigateur du décompte des visites.
 *
 * Elle se déduit du secret de session, et ne se stocke donc nulle part :
 * changer `SESSION_SECRET` change la clé, et les anciens liens cessent
 * d'ouvrir la page. Les navigateurs déjà retirés le restent — leur marqueur
 * vit chez eux.
 */
export function optOutKey(): string | null {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) return null;
  return createHmac("sha256", s).update("nivex:ne-pas-compter").digest("base64url").slice(0, 22);
}

export function isOptOutKey(candidate: unknown): boolean {
  const key = optOutKey();
  return Boolean(key) && typeof candidate === "string" && safeEqual(candidate, key!);
}

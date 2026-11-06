import type { NextRequest } from "next/server";
import { siteOrigin } from "./google";
import { twilioSignatureValid } from "./sms";

export type TwilioWebhook =
  | { ok: true; params: Record<string, string> }
  | { ok: false; status: number; reason: string };

/**
 * Le formulaire d'une requête de Twilio, sa signature vérifiée.
 *
 * Twilio signe l'adresse qu'il a appelée : celle du site, ou l'adresse
 * Vercel, selon le réglage du numéro. On accepte l'une ou l'autre, jamais une
 * requête non signée : sans cette garde, n'importe qui pourrait faire sonner
 * le cellulaire de l'artisan ou lui faire envoyer des alertes. Sans jeton, la
 * route répond 503, et Twilio passe à la méthode de secours du numéro.
 */
export async function readTwilioWebhook(req: NextRequest, path: string): Promise<TwilioWebhook> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return { ok: false, status: 503, reason: "not configured" };
  const form = await req.formData().catch(() => null);
  if (!form) return { ok: false, status: 400, reason: "bad request" };
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });
  const full = `${path}${req.nextUrl.search}`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const urls = [`${siteOrigin()}${full}`, ...(host ? [`https://${host}${full}`] : [])];
  if (!twilioSignatureValid(urls, params, req.headers.get("x-twilio-signature"), token)) {
    return { ok: false, status: 403, reason: "forbidden" };
  }
  return { ok: true, params };
}

/** Une réponse TwiML. */
export function twimlResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/xml; charset=utf-8" } });
}

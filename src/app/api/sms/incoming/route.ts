import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, logEvent, sql } from "@/lib/db";
import { siteOrigin } from "@/lib/google";
import {
  forwardedReply, isCanadianNumber, ownerSmsNumber, stopHint, toE164, TWIML_EMPTY, twilioSignatureValid, twimlForward,
} from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sms/incoming — un client répond à l'un de nos textos.
 *
 * Twilio appelle cette adresse à chaque texto reçu sur le numéro de la maison
 * (réglage « A message comes in » du numéro). On vérifie la signature, on
 * cherche à qui appartient le numéro, et on répond par une instruction TwiML
 * qui fait suivre le message au cellulaire de l'artisan.
 *
 * Rien n'est conservé : ni le texte, ni le numéro. Le journal note seulement
 * qu'une réponse a été transmise.
 */
export async function POST(req: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new NextResponse("not configured", { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return new NextResponse("bad request", { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

  /* Twilio signe l'adresse qu'il a appelée. Selon la façon dont le numéro est
     réglé — domaine principal, adresse Vercel —, ce n'est pas forcément celle
     du site : on accepte l'une ou l'autre, jamais une requête non signée. */
  const path = `/api/sms/incoming${req.nextUrl.search}`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const urls = [`${siteOrigin()}${path}`, ...(host ? [`https://${host}${path}`] : [])];
  if (!twilioSignatureValid(urls, params, req.headers.get("x-twilio-signature"), token)) {
    await logEvent("sms_reply_rejected", { reason: "bad_signature" });
    return new NextResponse("forbidden", { status: 403 });
  }

  const from = toE164(params.From);
  const owner = ownerSmsNumber();
  const twiml = (body: string) => new NextResponse(body, { headers: { "content-type": "text/xml; charset=utf-8" } });

  /* L'artisan qui écrit au numéro de la maison ne doit pas recevoir son propre
     message en retour. */
  if (!owner || !from || from === owner) return twiml(TWIML_EMPTY);

  /* Le nom du client, si on le connaît. Une base muette ne doit pas empêcher
     le message de passer : il part alors avec le numéro seul. */
  let name: string | null = null;
  try {
    await ensureSchema();
    const ten = from.slice(-10);
    const rows = (await sql()`
      SELECT client_name FROM (
        SELECT client_name, client_phone, created_at FROM nivex_subscriptions
        UNION ALL
        SELECT client_name, client_phone, created_at FROM nivex_bookings
      ) t
      WHERE right(regexp_replace(client_phone, '\\D', '', 'g'), 10) = ${ten}
      ORDER BY created_at DESC LIMIT 1`) as { client_name: string }[];
    name = rows[0]?.client_name ?? null;
  } catch { /* le numéro suffit */ }

  /* Un « ARRÊT » ne désabonne pas chez Twilio : on dit au client le mot qui
     le fait. Jamais vers un numéro où l'on n'écrirait pas de toute façon. */
  const body = params.Body ?? "";
  const hint = isCanadianNumber(from) ? stopHint(body) : null;

  await logEvent("sms_reply_forwarded", { known: Boolean(name), stopHint: Boolean(hint) });
  return twiml(twimlForward(owner, forwardedReply({
    from, name, body, media: Number(params.NumMedia ?? 0) || 0, hinted: Boolean(hint),
  }), hint));
}

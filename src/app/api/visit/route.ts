import { NextRequest, NextResponse } from "next/server";
import { recordVisit } from "@/lib/visits";
import { clip } from "@/lib/attribution";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consigne une page vue, sans rien savoir de qui la regarde.
 *
 * La ville vient de l'en-tête que Vercel ajoute en bordure de réseau. Elle
 * est lue ici, recopiée dans la colonne `city`, puis l'en-tête est oublié
 * avec le reste de la requête : l'adresse IP dont elle est déduite n'entre
 * jamais en base et n'est jamais consignée.
 *
 * La réponse est toujours la même, et toujours légère. Le navigateur n'a
 * rien à en faire, et un journal qui refuse une ligne ne doit pas se
 * traduire par une erreur visible sur le site.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: true }, { status: 202 });

  /* L'artisan connecté ne compte jamais, quel que soit l'appareil : son
     témoin de session part avec l'appel, et il suffit. Le marqueur du
     navigateur fait le reste là où il ne s'est jamais connecté. */
  if (await getSession().catch(() => null)) return NextResponse.json({ ok: true }, { status: 202 });

  const path = clip(body.path, 300);
  if (!path || !path.startsWith("/")) return NextResponse.json({ ok: true }, { status: 202 });

  const h = req.headers;
  await recordVisit(
    {
      path,
      utmSource: clip(body.source, 60),
      utmMedium: clip(body.medium, 60),
      utmCampaign: clip(body.campaign, 120),
      ref: clip(body.ref, 60),
      referrer: clip(body.referrer, 400),
      locale: clip(body.locale, 8),
      webdriver: body.webdriver,
      timeZone: clip(body.tz, 60),
    },
    {
      userAgent: h.get("user-agent"),
      /* En-têtes posés par l'hébergeur, jamais par le navigateur. Vercel les
         décode depuis l'adresse réseau ; nous n'en gardons que la ville, la
         région et le pays. */
      city: decodeHeader(h.get("x-vercel-ip-city")),
      region: decodeHeader(h.get("x-vercel-ip-country-region")),
      country: decodeHeader(h.get("x-vercel-ip-country")),
    },
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}

/** Vercel transmet « Saint-Jean-sur-Richelieu » encodé pour l'URL. */
function decodeHeader(v: string | null): string | null {
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return v; }
}

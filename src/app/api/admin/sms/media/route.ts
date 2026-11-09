import { NextRequest, NextResponse } from "next/server";
import { fetchMedia } from "@/lib/conversations";
import { requireOwner } from "@/lib/session";
import { smsConfigured } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sms/media?message=MM…&media=ME… — une photo qu'un client a
 * jointe à son texto, lue chez Twilio pour l'artisan seulement. Rien n'est
 * gardé, ni sur le site ni dans le navigateur (`no-store`).
 */
export async function GET(req: NextRequest) {
  if (!(await requireOwner())) return new NextResponse("unauthorized", { status: 401 });
  if (!smsConfigured()) return new NextResponse("not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  return fetchMedia(q.get("message") ?? "", q.get("media") ?? "");
}

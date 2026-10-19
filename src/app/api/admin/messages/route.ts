import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { requireOwner } from "@/lib/session";
import { deleteMessage, listMessages, markRead } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  /* Une base qui ne répond pas n'est pas une boîte vide : l'onglet doit
     pouvoir dire « lecture impossible » plutôt que « aucun message ». Sans
     base du tout (poste de développement), il n'y a rien à lire. */
  let messages: Awaited<ReturnType<typeof listMessages>>;
  try {
    messages = isDbConfigured() ? await listMessages() : [];
  } catch (e) {
    console.error("[nivex] messages illisibles :", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    messages: messages.map((m) => ({
      id: m.id, locale: m.locale, name: m.name, email: m.email, phone: m.phone,
      subject: m.subject, body: m.body, emailSent: m.emailSent,
      readAt: m.readAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString(),
    })),
  });
}

/** Marquer un message comme lu. */
export async function PATCH(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  await markRead(id);
  return NextResponse.json({ ok: true });
}

/** Supprimer un message, sur demande de son auteur. */
export async function DELETE(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  try {
    const gone = await deleteMessage(id);
    return NextResponse.json({ ok: gone }, { status: gone ? 200 : 404 });
  } catch (e) {
    console.error("[nivex] message non supprimé :", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

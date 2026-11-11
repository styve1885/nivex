import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/session";
import { cancelBooking, findById, listBookings, resendBooking, setBookingReminders, stats } from "@/lib/bookings";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const scope = (new URL(req.url).searchParams.get("scope") ?? "upcoming") as "upcoming" | "past" | "all";
  const [bookings, s] = await Promise.all([listBookings({ scope }), stats()]);
  return NextResponse.json({
    ok: true,
    stats: s,
    bookings: bookings.map((b) => ({
      id: b.id, ref: b.ref, status: b.status, locale: b.locale,
      clientName: b.clientName, clientEmail: b.clientEmail, clientPhone: b.clientPhone,
      address: b.address, city: b.city, postalCode: b.postalCode, notes: b.notes,
      items: b.items, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(),
      durationMinutes: b.durationMinutes, estimateCents: b.estimateCents, currency: b.currency,
      firstHourFree: b.firstHourFree, createdAt: b.createdAt.toISOString(),
      manageToken: b.manageToken,
      emailSent: b.emailSent, inCalendar: Boolean(b.googleEventId),
    })),
  });
}

/**
 * Rattrapage : envoie la confirmation si elle n'est jamais partie, et
 * inscrit le rendez-vous à l'agenda s'il y manque. Sert après une rupture
 * du lien avec Google, quand des réservations sont passées sans que
 * personne ne soit prévenu. Réussi seulement si les deux tiennent.
 */
export async function POST(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const booking = await findById(id).catch(() => null);
  if (!booking) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const result = await resendBooking(booking, req.headers.get("host"));
  const ok = result.emailSent && (result.calendarAdded || booking.status === "cancelled");
  return NextResponse.json({ ok, ...result });
}

/** Annulation par l'artisan. */
export async function DELETE(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const booking = await findById(id).catch(() => null);
  if (!booking) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (booking.status === "cancelled") return NextResponse.json({ ok: true, alreadyCancelled: true });

  try {
    await cancelBooking(booking, "owner");
  } catch (e) {
    /* Une visite d'abonné déjà marquée effectuée ne s'annule pas
       (SubscriptionError « done ») : l'onglet doit pouvoir dire pourquoi,
       plutôt que de recevoir une erreur nue. */
    if ((e as Error)?.name === "SubscriptionError") {
      return NextResponse.json({ ok: false, error: (e as { code?: string }).code ?? "invalid" }, { status: 409 });
    }
    console.error("[nivex] annulation par l'artisan impossible :", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/admin/bookings?id=… { reminders } — les rappels de séance d'une
 * séance à la carte : la veille, par courriel et par texto, et le texto de
 * deux heures avant. Une visite d'abonné se règle sur la fiche de l'abonné.
 */
export async function PATCH(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { reminders?: unknown } | null;
  if (typeof body?.reminders !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const { timezone } = await getSettings();
  const booking = await setBookingReminders(id, body.reminders, timezone);
  if (!booking) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, reminders: booking.reminders });
}

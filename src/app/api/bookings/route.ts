import { NextRequest, NextResponse } from "next/server";
import { BookingInput, BookingError, createBooking } from "@/lib/bookings";
import { ensureSchema, sql } from "@/lib/db";
import { demoSettings, isDemo } from "@/lib/demo";
import { estimateCents, estimateMinutes } from "@/lib/availability";
import { bookingRef, token } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BookingInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Pot de miel : un robot remplit tous les champs, y compris celui qui est caché.
  if (parsed.data.hp) return NextResponse.json({ ok: true, ref: "NVX-000000" }, { status: 200 });

  // Démonstration locale : on renvoie une confirmation sans rien écrire,
  // mais avec les vrais chiffres, sinon l'aperçu ment.
  if (isDemo()) {
    const settings = demoSettings();
    const start = new Date(parsed.data.startsAt);
    const durationMinutes = estimateMinutes(parsed.data.items, settings);
    return NextResponse.json({
      ok: true, demo: true, ref: bookingRef(), manageToken: token(24),
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
      durationMinutes,
      estimateCents: estimateCents(durationMinutes, settings, settings.firstHourFree),
      currency: settings.currency,
      firstHourFree: settings.firstHourFree,
      emailSent: false, calendarAdded: false,
    }, { status: 201 });
  }

  // Garde-fou : pas plus de 3 réservations par courriel et par heure.
  try {
    await ensureSchema();
    const recent = (await sql()`
      SELECT count(*)::int AS n FROM nivex_bookings
      WHERE lower(client_email) = ${parsed.data.email} AND created_at > now() - interval '1 hour'`) as { n: number }[];
    if ((recent[0]?.n ?? 0) >= 3) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  } catch { /* si la base répond mal, createBooking échouera proprement plus bas */ }

  try {
    const booking = await createBooking(parsed.data, req.headers.get("host"));
    return NextResponse.json({
      ok: true,
      ref: booking.ref,
      manageToken: booking.manageToken,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      durationMinutes: booking.durationMinutes,
      estimateCents: booking.estimateCents,
      currency: booking.currency,
      firstHourFree: booking.firstHourFree,
      /* Ce qui a réellement eu lieu : l'écran ne promettra pas un courriel
         qui n'est jamais parti. */
      emailSent: booking.emailSent,
      calendarAdded: Boolean(booking.googleEventId),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) {
      const status = e.code === "slot_taken" || e.code === "invalid_slot" ? 409 : 503;
      return NextResponse.json({ ok: false, error: e.code }, { status });
    }
    console.error("[nivex] booking failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

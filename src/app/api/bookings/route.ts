import { NextRequest, NextResponse } from "next/server";
import { BookingInput, BookingError, bookedUnits, createBooking } from "@/lib/bookings";
import { ensureSchema, logEvent, sql } from "@/lib/db";
import { demoSettings, isDemo } from "@/lib/demo";
import { estimateCents } from "@/lib/availability";
import { sessionLength } from "@/lib/pricing";
import { estimateRange } from "@/lib/items";
import { bookingRef, token } from "@/lib/crypto";
import { SettingsUnavailableError } from "@/lib/settings";
import { phoneKey } from "@/lib/subscriptions";

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

  /* Pot de miel : un robot remplit tous les champs, y compris celui qui est
     caché. Il reçoit le refus « appelez-nous », pas une fausse confirmation :
     une vraie personne dont le navigateur aurait rempli ce champ à son insu
     attendrait sinon une séance qui n'existe nulle part. */
  if (parsed.data.hp) {
    await logEvent("honeypot", { form: "booking" });
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // Démonstration locale : on renvoie une confirmation sans rien écrire,
  // mais avec les vrais chiffres, sinon l'aperçu ment.
  if (isDemo()) {
    const settings = demoSettings();
    const start = new Date(parsed.data.startsAt);
    const durationMinutes = sessionLength(settings);
    const units = bookedUnits(parsed.data.units, parsed.data.locale);
    const cents = estimateCents(durationMinutes, settings, settings.firstHourFree)
      + units.reduce((sum, u) => sum + (u.cents ?? 0) * u.qty, 0);
    return NextResponse.json({
      ok: true, demo: true, ref: bookingRef(), manageToken: token(24),
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
      durationMinutes,
      estimateCents: cents,
      estimateToCents: estimateRange(units, cents).high,
      currency: settings.currency,
      firstHourFree: settings.firstHourFree,
      emailSent: false, calendarAdded: false,
    }, { status: 201 });
  }

  /* Garde-fous : pas plus de 3 réservations par courriel et par heure, pas
     plus de 3 séances à venir pour un même numéro de téléphone — changer
     d'adresse courriel ne suffit donc pas à remplir l'agenda —, et pas plus
     de 12 nouvelles séances par heure pour tout le site, bien au-delà de ce
     que la maison reçoit. Les visites d'un abonnement n'y comptent pas : une
     série en pose jusqu'à vingt-quatre d'un coup, et /api/subscriptions a
     ses propres limites. Aucune adresse IP n'est lue ni gardée. */
  try {
    await ensureSchema();
    const phone = phoneKey(parsed.data.phone);
    const [c] = (await sql()`
      SELECT
        count(*) FILTER (WHERE lower(client_email) = ${parsed.data.email}
                           AND created_at > now() - interval '1 hour')::int AS by_email,
        count(*) FILTER (WHERE ${phone}::text IS NOT NULL
                           AND right(regexp_replace(client_phone, '\\D', '', 'g'), 10) = ${phone}::text
                           AND status = 'confirmed' AND starts_at > now())::int AS by_phone,
        count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS site_wide
      FROM nivex_bookings
      WHERE subscription_id IS NULL`) as { by_email: number; by_phone: number; site_wide: number }[];
    if ((c?.by_email ?? 0) >= 3 || (c?.by_phone ?? 0) >= 3 || (c?.site_wide ?? 0) >= 12) {
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
      /* Le haut de la fourchette, quand une pièce à l'unité a un prix variable. */
      estimateToCents: estimateRange(booking.items, booking.estimateCents).high,
      currency: booking.currency,
      firstHourFree: booking.firstHourFree,
      travelFeeCents: booking.travelFeeCents,
      /* Ce qui a réellement eu lieu : l'écran ne promettra pas un courriel
         qui n'est jamais parti. */
      emailSent: booking.emailSent,
      calendarAdded: Boolean(booking.googleEventId),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) {
      /* Hors zone, c'est l'adresse qui ne convient pas, pas le service qui
         est en panne : 422 et non 503. Le tunnel affiche alors l'invitation
         à appeler. */
      const status =
        e.code === "slot_taken" || e.code === "invalid_slot" ? 409
          : e.code === "out_of_area" || e.code === "unknown_service" ? 422
            : 503;
      return NextResponse.json({ ok: false, error: e.code }, { status });
    }
    /* Réglages illisibles : on ne réserve pas sur des valeurs par défaut. */
    if (e instanceof SettingsUnavailableError) {
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    }
    console.error("[nivex] booking failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

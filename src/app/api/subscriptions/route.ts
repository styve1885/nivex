import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, logEvent, sql } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { bookingRef, token } from "@/lib/crypto";
import { createSubscription, onlineSubscriptionAllowed, SubscriptionError, SubscriptionInput } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/subscriptions — l'abonnement est pris, la série posée. */
export async function POST(req: NextRequest) {
  const parsed = SubscriptionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Pot de miel : un robot remplit tous les champs, y compris celui qui est caché.
  /* Pot de miel : le refus « appelez-nous », jamais une fausse confirmation
     (voir /api/bookings). */
  if (parsed.data.hp) {
    await logEvent("honeypot", { form: "subscription" });
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // Démonstration locale : rien n'est écrit, mais l'écran de fin s'affiche.
  if (isDemo()) {
    return NextResponse.json({ ok: true, demo: true, ref: bookingRef().replace("NVX-", "ABO-"), manageToken: token(24), visits: 0, emailSent: false }, { status: 201 });
  }

  // Garde-fou : pas plus de deux abonnements par courriel et par heure.
  try {
    await ensureSchema();
    const recent = (await sql()`
      SELECT count(*)::int AS n FROM nivex_subscriptions
      WHERE lower(client_email) = ${parsed.data.email} AND created_at > now() - interval '1 hour'`) as { n: number }[];
    if ((recent[0]?.n ?? 0) >= 2) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  } catch { /* createSubscription échouera proprement plus bas */ }

  // Un courriel se change d'un clic : un seul abonnement en cours par
  // téléphone et par adresse, et quelques-uns par jour en tout.
  if (!(await onlineSubscriptionAllowed(parsed.data))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const full = await createSubscription(parsed.data, req.headers.get("host"));
    const kept = full.visits.filter((v) => v.status !== "cancelled");
    return NextResponse.json({
      ok: true,
      ref: full.sub.ref,
      manageToken: full.sub.manageToken,
      firstAt: kept[0]?.startsAt.toISOString() ?? null,
      visits: kept.length,
      emailSent: kept.some((v) => v.emailSent),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof SubscriptionError) {
      const status = e.code === "conflicts" || e.code === "slot_taken" ? 409
        : e.code === "paused" ? 503 : 422;
      return NextResponse.json({
        ok: false, error: e.code,
        conflicts: e.conflicts.map((c) => ({ startsAt: c.startsAt.toISOString(), reason: c.reason })),
        alternatives: e.alternatives.map((d) => d.toISOString()),
      }, { status });
    }
    console.error("[nivex] subscription failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

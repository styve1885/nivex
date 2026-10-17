import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { findById } from "@/lib/bookings";
import { rhythmPhrase, slotPhrase } from "@/lib/email";
import { TERM_SERIES } from "@/lib/brand";
import { visitsToEndOfSeries } from "@/lib/cycles";
import {
  amountOf, cancelVisit, createOwnerSubscription, deleteSubscription, endSubscription, findPlan,
  knownClients, listSubscriptions, markDone, moveVisit, OwnerSubscriptionInput, ownerInstant,
  placeMakeup, previewSeries, renewSeries, resendSubscription, setPaid, SubscriptionError,
  type SubscriptionFull,
} from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Ce que l'onglet Abonnés affiche : tout est déjà calculé, le navigateur ne compte rien. */
function serialise(f: SubscriptionFull, tz: string) {
  const { sub, view, visits } = f;
  const firstKept = visits.find((v) => v.status !== "cancelled");
  const current = view.cycles.find((c) => c.cycle === view.currentCycle) ?? null;
  const currentFirst = current?.visitIds[0] ? visits.find((v) => v.id === current.visitIds[0]) : null;
  return {
    id: sub.id, ref: sub.ref, status: sub.status, manageToken: sub.manageToken, locale: sub.locale,
    planKey: sub.planKey, planName: sub.planName, perCycle: sub.perCycle,
    minutesPerVisit: sub.minutesPerVisit,
    slot: firstKept ? slotPhrase(firstKept.startsAt, tz, "fr") : "",
    rhythm: rhythmPhrase(sub.everyWeeks, "fr"),
    clientName: sub.clientName, clientEmail: sub.clientEmail, clientPhone: sub.clientPhone,
    address: sub.address, city: sub.city, postalCode: sub.postalCode, notes: sub.notes,
    amount: amountOf(sub), feePerVisitCents: sub.feePerVisitCents, travelZone: sub.travelZone, currency: sub.currency,
    currentCycle: view.currentCycle, doneInCurrent: view.doneInCurrent,
    currentPaidAt: current?.paidAt ?? null,
    currentDueAt: currentFirst?.startsAt.toISOString() ?? null,
    nextVisit: view.nextVisit?.startsAt.toISOString() ?? null,
    termEndsAt: view.termEndsAt?.toISOString() ?? null,
    latestSeries: view.latestSeries,
    canRenew: sub.status === "active" && view.latestSeries < TERM_SERIES,
    pendingMakeups: sub.pendingMakeups,
    createdBy: sub.createdBy, createdAt: sub.createdAt.toISOString(), endedAt: sub.endedAt?.toISOString() ?? null,
    hasDone: visits.some((v) => v.doneAt) || sub.startDone > 0 || sub.startCycle > 1,
    cycles: view.cycles.map((c) => ({
      cycle: c.cycle, done: c.done, complete: c.complete, paidAt: c.paidAt, overdue: c.overdue,
      firstAt: c.firstAt?.toISOString() ?? null, lastAt: c.lastAt?.toISOString() ?? null,
    })),
    alerts: view.alerts.map((a) => {
      switch (a.kind) {
        case "overdue": return { kind: a.kind, cycle: a.cycle, at: a.firstAt.toISOString() };
        case "to_confirm": return { kind: a.kind, visitId: a.visitId, at: a.startsAt.toISOString() };
        case "makeup_pending": return { kind: a.kind, count: a.count };
        case "series_ending": return { kind: a.kind, series: a.series, at: a.lastAt.toISOString() };
        case "term_ending": return { kind: a.kind, at: a.endsAt.toISOString() };
      }
    }),
    visits: visits.map((v) => {
      const n = view.numbers.get(v.id);
      return {
        id: v.id, ref: v.ref, status: v.status, startsAt: v.startsAt.toISOString(), endsAt: v.endsAt.toISOString(),
        doneAt: v.doneAt?.toISOString() ?? null, makeup: v.makeup, series: v.seriesNo ?? 1,
        cycle: n?.cycle ?? null, index: n?.index ?? null, inCalendar: Boolean(v.googleEventId),
      };
    }),
  };
}

export type AdminSubscription = ReturnType<typeof serialise>;

export async function GET() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const settings = await getSettings();
  const [subs, clients] = await Promise.all([listSubscriptions(), knownClients().catch(() => [])]);
  return NextResponse.json({
    ok: true,
    timezone: settings.timezone,
    subscriptions: subs.map((s) => serialise(s, settings.timezone)),
    clients,
  });
}

const Id = z.string().uuid();
const When = { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) };

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), input: OwnerSubscriptionInput }),
  z.object({ action: z.literal("create"), input: OwnerSubscriptionInput }),
  z.object({ action: z.literal("done"), visitId: Id, done: z.boolean() }),
  z.object({ action: z.literal("paid"), id: Id, cycle: z.number().int().min(1).max(100), paid: z.boolean() }),
  z.object({ action: z.literal("cancel"), visitId: Id }),
  z.object({ action: z.literal("move"), visitId: Id, ...When }),
  z.object({ action: z.literal("place"), id: Id, ...When }),
  z.object({ action: z.literal("renew"), id: Id, skipConflicts: z.boolean().default(false) }),
  z.object({ action: z.literal("end"), id: Id }),
  z.object({ action: z.literal("delete"), id: Id }),
  z.object({ action: z.literal("resync"), id: Id }),
]);

/** Toutes les actions de l'onglet Abonnés, derrière la session de l'artisan. */
export async function POST(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const a = parsed.data;
  const host = req.headers.get("host");
  const settings = await getSettings();

  try {
    switch (a.action) {
      case "check": {
        const plan = findPlan(a.input.planKey);
        if (!plan) throw new SubscriptionError("unknown_plan");
        const p = await previewSeries({
          planKey: plan.key,
          first: ownerInstant(a.input.date, a.input.time, settings.timezone),
          count: visitsToEndOfSeries(plan.visits, a.input.startCycle, a.input.startDone),
          checkLead: false,
        });
        return NextResponse.json({
          ok: true, free: p.conflicts.length === 0,
          starts: p.starts.map((d) => d.toISOString()),
          conflicts: p.conflicts.map((c) => ({ startsAt: c.startsAt.toISOString(), reason: c.reason })),
          alternatives: p.alternatives.map((d) => d.toISOString()),
        });
      }
      case "create": {
        const full = await createOwnerSubscription(a.input, host);
        return NextResponse.json({ ok: true, id: full.sub.id });
      }
      case "done":
        await markDone(a.visitId, a.done);
        return NextResponse.json({ ok: true });
      case "paid":
        await setPaid(a.id, a.cycle, a.paid);
        return NextResponse.json({ ok: true });
      case "cancel": {
        const v = await findById(a.visitId);
        if (!v?.subscriptionId) throw new SubscriptionError("not_found");
        const { replacement } = await cancelVisit(v, "owner", host);
        return NextResponse.json({ ok: true, replacement: replacement?.startsAt.toISOString() ?? null });
      }
      case "move": {
        const v = await findById(a.visitId);
        if (!v?.subscriptionId) throw new SubscriptionError("not_found");
        await moveVisit(v, ownerInstant(a.date, a.time, settings.timezone), "owner", host);
        return NextResponse.json({ ok: true });
      }
      case "place":
        await placeMakeup(a.id, a.date, a.time, host);
        return NextResponse.json({ ok: true });
      case "renew":
        await renewSeries(a.id, { skipConflicts: a.skipConflicts }, host);
        return NextResponse.json({ ok: true });
      case "end": {
        const r = await endSubscription(a.id, host);
        return NextResponse.json({ ok: true, ...r });
      }
      case "delete":
        await deleteSubscription(a.id);
        return NextResponse.json({ ok: true });
      case "resync": {
        const r = await resendSubscription(a.id, host);
        return NextResponse.json({ ok: r.emailSent && r.calendarAdded, ...r });
      }
    }
  } catch (e) {
    if (e instanceof SubscriptionError) {
      return NextResponse.json({
        ok: false, error: e.code,
        conflicts: e.conflicts.map((c) => ({ startsAt: c.startsAt.toISOString(), reason: c.reason })),
        alternatives: e.alternatives.map((d) => d.toISOString()),
      }, { status: 409 });
    }
    console.error("[nivex] admin subscription action failed:", e);
    return NextResponse.json({ ok: false, error: "server_error", detail: String((e as Error).message).slice(0, 300) }, { status: 500 });
  }
}

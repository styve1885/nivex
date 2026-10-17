"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker } from "./BookingWizard";
import type { Dict } from "@/lib/i18n";

type DaySlots = { date: string; weekday: number; open: boolean; slots: { time: string; iso: string }[] };

/**
 * Annuler ou déplacer une visite d'abonnement, depuis la page du client.
 *
 * Le déplacement reprend l'horaire de la maison pour la durée de la visite ;
 * le serveur revérifie le créneau et le délai de la veille avant d'écrire.
 */
export function VisitActions({ token, visitId, durationMinutes, locale, timezone, t }: {
  token: string; visitId: string; durationMinutes: number;
  locale: "fr" | "en"; timezone: string; t: Dict;
}) {
  const m = t.subManage;
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "cancel" | "move">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sched, setSched] = useState<{ today: string; days: DaySlots[] } | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const when = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: locale === "en",
  }).format(new Date(iso));

  const load = useCallback(async (from?: string) => {
    const p = new URLSearchParams({ duration: String(durationMinutes), days: "14" });
    if (from) p.set("from", from);
    try {
      const res = await fetch(`/api/schedule?${p}`, { cache: "no-store" });
      setSched(await res.json());
    } catch {
      setError(t.booking.errors.generic);
    }
  }, [durationMinutes, t.booking.errors.generic]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitId, ...body }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d.error === "too_late" ? m.errors.tooLate
          : d.error === "slot_taken" || d.error === "invalid_slot" ? m.errors.taken
            : t.booking.errors.generic);
        return;
      }
      /* La carte de la visite change d'état au rechargement, et ce message
         partirait avec elle : il remonte donc en tête de page, par l'adresse. */
      setMode("idle");
      const q = body.action === "cancel"
        ? `remplacement=${encodeURIComponent(d.replacement ?? "aucun")}`
        : `deplacee=${encodeURIComponent(d.startsAt)}`;
      router.replace(`?${q}`, { scroll: false });
      router.refresh();
    } catch {
      setError(t.booking.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const linkCls = "text-[10px] uppercase tracking-[0.16em] text-ink-500 underline decoration-gold-300 underline-offset-4 transition-colors hover:text-ink-800";

  return (
    <div className="mt-3">
      {mode === "idle" && (
        <div className="flex gap-5">
          <button type="button" className={linkCls} onClick={() => { setMode("move"); if (!sched) load(); }}>{m.move}</button>
          <button type="button" className={linkCls} onClick={() => setMode("cancel")}>{m.cancel}</button>
        </div>
      )}

      {mode === "cancel" && (
        <div>
          <p className="text-[0.85rem] text-ink-700">{m.cancelConfirm}</p>
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={busy} onClick={() => send({ action: "cancel" })} className="btn !py-2.5 !px-5 !text-[10px]">
              {busy ? "…" : m.cancel}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="btn btn-ghost !py-2.5 !px-5 !text-[10px]">{m.keep}</button>
          </div>
        </div>
      )}

      {mode === "move" && (
        <div>
          <p className="text-[0.85rem] text-ink-700">{m.moveTitle}</p>
          {sched ? (
            <SlotPicker t={t} days={sched.days} today={sched.today} value={slot} onPick={setSlot}
              onShift={(d) => load(d)} className="mt-4" />
          ) : (
            <p className="mt-4 text-[0.82rem] text-ink-400" role="status">{t.booking.step3.loading}</p>
          )}
          {slot && <p className="mt-5 text-[0.85rem] text-ink-700">{m.moveConfirm.replace("{when}", when(slot))}</p>}
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={busy || !slot} onClick={() => send({ action: "move", startsAt: slot })} className="btn !py-2.5 !px-5 !text-[10px]">
              {busy ? "…" : m.confirmMove}
            </button>
            <button type="button" onClick={() => { setMode("idle"); setSlot(null); }} className="btn btn-ghost !py-2.5 !px-5 !text-[10px]">{m.keep}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[0.82rem] text-[#8E332C]">{error}</p>}
    </div>
  );
}

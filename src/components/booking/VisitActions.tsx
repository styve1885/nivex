"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SlotPicker } from "./BookingWizard";
import { dateKey } from "@/lib/time";
import type { Dict } from "@/lib/i18n";

type DaySlots = { date: string; weekday: number; open: boolean; slots: { time: string; iso: string }[] };

/**
 * Annuler ou déplacer une visite d'abonnement, depuis la page du client.
 *
 * Le sélecteur s'ouvre sur la semaine de la visite, et ses heures viennent
 * du serveur pour cette visite-là : l'horaire de la maison, sans la visite
 * elle-même, jusqu'à deux semaines après elle. Son heure actuelle reste
 * grisée. Le serveur revérifie le créneau, le délai de la veille et le
 * nombre de changements avant d'écrire.
 */
export function VisitActions({ token, visitId, startsAt, locale, timezone, t }: {
  token: string; visitId: string; startsAt: string;
  locale: "fr" | "en"; timezone: string; t: Dict;
}) {
  const m = t.subManage;
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "cancel" | "move">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sched, setSched] = useState<{ today: string; horizonDays?: number; days: DaySlots[] } | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const when = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", hour12: locale === "en",
  }).format(new Date(iso));

  const load = useCallback(async (from?: string) => {
    const p = new URLSearchParams({ visit: visitId, days: "14" });
    if (from) p.set("from", from);
    try {
      const res = await fetch(`/api/subscriptions/${token}/slots?${p}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(t.booking.errors.generic);
        return;
      }
      setSched(d);
    } catch {
      setError(t.booking.errors.generic);
    }
  }, [token, visitId, t.booking.errors.generic]);

  /* Quelques jours avant la visite : on la décale le plus souvent d'un jour
     ou deux. Le serveur ramène à aujourd'hui une date déjà passée. */
  const openMove = () => {
    setMode("move");
    if (!sched) load(dateKey(new Date(Date.parse(startsAt) - 3 * 86_400_000), timezone));
  };

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
            : d.error === "rate_limited" ? m.errors.tooMany
              : t.booking.errors.generic);
        return;
      }
      /* La carte de la visite change d'état au rechargement, et ce message
         partirait avec elle : il remonte donc en tête de page, par l'adresse.
         Le calendrier se relira à la prochaine ouverture : gardé, il
         proposerait la nouvelle heure comme un créneau à choisir. */
      setMode("idle");
      setSlot(null);
      setSched(null);
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
          <button type="button" className={linkCls} onClick={openMove}>{m.move}</button>
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
            <SlotPicker t={t} days={sched.days} today={sched.today} horizonDays={sched.horizonDays}
              value={slot} onPick={setSlot} onShift={(d) => load(d)} exclude={startsAt} className="mt-4" />
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

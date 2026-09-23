"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminBooking, AdminStats } from "./types";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

function when(iso: string, tz: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function duration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} h ${m}` : h ? `${h} h` : `${m} min`;
}

export function BookingsPanel({
  upcoming, past, stats, timezone,
}: {
  upcoming: AdminBooking[]; past: AdminBooking[]; stats: AdminStats; timezone: string;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div>
      <div className="grid gap-px overflow-hidden border border-gold-300/40 bg-gold-300/30 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="À venir" value={String(stats.upcoming)} />
        <Stat label="Ce mois-ci" value={String(stats.thisMonth)} />
        <Stat label="Revenus estimés (mois)" value={money(stats.monthCents, "CAD")} />
        <Stat label="Clients servis" value={String(stats.clients)} />
      </div>

      <div className="mt-10 flex items-center gap-6 border-b border-gold-300/40">
        {(["upcoming", "past"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`relative pb-3 text-[11px] uppercase tracking-[0.18em] transition-colors ${
              tab === k ? "text-ink-800" : "text-ink-400 hover:text-ink-600"
            }`}>
            {k === "upcoming" ? `À venir (${upcoming.length})` : `Historique (${past.length})`}
            {tab === k && <span className="absolute inset-x-0 -bottom-px h-px bg-gold-500" />}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-20 text-center text-[0.9rem] text-ink-400">
          {tab === "upcoming" ? "Aucun rendez-vous à venir pour le moment." : "Aucun rendez-vous passé."}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((b) => <BookingCard key={b.id} b={b} tz={timezone} canCancel={tab === "upcoming"} />)}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-linen-50 px-6 py-7">
      <p className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-light text-ink-800">{value}</p>
    </div>
  );
}

function BookingCard({ b, tz, canCancel }: { b: AdminBooking; tz: string; canCancel: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState<{ ok: boolean; error: string | null } | null>(null);
  const router = useRouter();
  const cancelled = b.status === "cancelled";

  /* Une réservation prise pendant une rupture du lien avec Google existe,
     mais personne n'en a été averti. Elle se rattrape. */
  const silent = !cancelled && (!b.emailSent || !b.inCalendar);

  async function resend() {
    setResending(true);
    setResent(null);
    try {
      const res = await fetch(`/api/admin/bookings?id=${b.id}`, { method: "POST" });
      const d = await res.json();
      setResent({ ok: d.ok === true, error: d.error ?? null });
      if (d.ok) router.refresh();
    } catch {
      setResent({ ok: false, error: "Le site n'a pas répondu. Réessayez." });
    } finally {
      setResending(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await fetch(`/api/admin/bookings?id=${b.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${b.address}, ${b.city}, QC ${b.postalCode}`)}`;

  return (
    <li className={`border border-gold-300/40 bg-linen-50 transition-opacity ${cancelled ? "opacity-50" : ""}`}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-linen-100">
        <div className="min-w-0 flex-1">
          <p className={`text-[0.95rem] text-ink-800 ${cancelled ? "line-through" : ""}`}>
            {b.clientName}
            <span className="ml-2 text-[11px] uppercase tracking-wider text-ink-400">{b.city}</span>
          </p>
          <p className="mt-0.5 text-[0.82rem] text-ink-500">
            {when(b.startsAt, tz)} · {duration(b.durationMinutes)}
          </p>
        </div>
        {silent && (
          <span title="Ni courriel ni agenda" aria-label="Confirmation non envoyée"
            className="flex-none border border-[#B4453C]/50 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[#8E332C]">
            Muet
          </span>
        )}
        <span className="hidden text-[0.85rem] tabular-nums text-ink-600 sm:block">
          {money(b.estimateCents, b.currency)}
        </span>
        <span aria-hidden="true" className={`text-gold-500 transition-transform duration-500 ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      <div className="grid transition-[grid-template-rows] duration-500"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-silk)" }}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-gold-300/40 px-5 py-5 text-[0.85rem]">
            <Line label="Téléphone"><a href={`tel:${b.clientPhone.replace(/\D/g, "")}`} className="text-gold-700 hover:underline">{b.clientPhone}</a></Line>
            <Line label="Courriel"><a href={`mailto:${b.clientEmail}`} className="break-all text-gold-700 hover:underline">{b.clientEmail}</a></Line>
            <Line label="Adresse"><a href={maps} target="_blank" rel="noopener noreferrer" className="text-gold-700 hover:underline">{b.address}, {b.city} {b.postalCode}</a></Line>
            <Line label="Prestations">{b.items.map((i) => `${i.label} × ${i.qty}`).join(" · ")}</Line>
            {b.notes && <Line label="Précisions"><span className="italic">{b.notes}</span></Line>}
            <Line label="Estimation">
              {money(b.estimateCents, b.currency)}
              {b.firstHourFree && <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-600">1re heure offerte</span>}
            </Line>
            <Line label="Référence"><code className="font-mono text-xs tracking-wider">{b.ref}</code></Line>

            {silent && (
              <div className="!mt-5 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-4">
                <p className="text-[0.85rem] leading-relaxed text-[#8E332C]">
                  {!b.emailSent && !b.inCalendar
                    ? "Ce rendez-vous n'a été ni confirmé par courriel, ni inscrit à votre agenda."
                    : !b.emailSent
                      ? "La confirmation par courriel n'est jamais partie."
                      : "Ce rendez-vous n'est pas inscrit à votre agenda."}
                </p>
                <button type="button" onClick={resend} disabled={resending}
                  className="mt-3 border border-[#B4453C]/50 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-[#8E332C] transition-colors hover:bg-[#B4453C]/10 disabled:opacity-40">
                  {resending ? "Envoi en cours…" : "Renvoyer la confirmation"}
                </button>
                {resent?.ok && (
                  <p className="mt-3 text-[0.82rem] text-gold-700">
                    C&apos;est parti. Le client a reçu sa confirmation.
                  </p>
                )}
                {resent && !resent.ok && (
                  <p className="mt-3 text-[0.82rem] leading-relaxed">
                    {resent.error ?? "L'envoi a de nouveau échoué."} Reconnectez Google depuis l&apos;onglet Connexion.
                  </p>
                )}
              </div>
            )}

            {canCancel && !cancelled && (
              <div className="pt-2">
                {confirming ? (
                  <div className="flex items-center gap-3">
                    <button onClick={cancel} disabled={busy}
                      className="border border-[#B4453C]/50 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-[#8E332C] transition-colors hover:bg-[#B4453C]/5 disabled:opacity-40">
                      {busy ? "Annulation…" : "Confirmer l'annulation"}
                    </button>
                    <button onClick={() => setConfirming(false)} className="text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-700">
                      Garder
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(true)}
                    className="text-[10px] uppercase tracking-[0.16em] text-ink-400 underline decoration-gold-300 underline-offset-4 transition-colors hover:text-[#8E332C]">
                    Annuler ce rendez-vous
                  </button>
                )}
                <p className="mt-2 text-[11px] text-ink-400">Le client et l&apos;agenda sont prévenus automatiquement.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <span className="text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</span>
      <span className="text-ink-700">{children}</span>
    </div>
  );
}

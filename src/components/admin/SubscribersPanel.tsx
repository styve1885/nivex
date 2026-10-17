"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminSubscription } from "@/app/api/admin/subscriptions/route";
import { CYCLE_MAX_WEEKS } from "@/lib/brand";

type Client = { name: string; email: string; phone: string; address: string; city: string; postalCode: string };
type Conflict = { startsAt: string; reason: string };
type Plan = { key: string; name: string; visits: number };

const REASONS: Record<string, string> = {
  busy: "déjà réservé", closed: "hors de l'horaire", lead: "trop proche", invalid: "date invalide",
};

const ERRORS: Record<string, string> = {
  conflicts: "Des dates de la série sont prises.",
  slot_taken: "Ce créneau vient d'être pris.",
  invalid_slot: "Ce créneau ne convient pas : hors de l'horaire, ou déjà occupé.",
  out_of_area: "Ce code postal est hors des zones desservies.",
  unknown_plan: "Formule inconnue.",
  invalid: "Le nombre de visites déjà faites doit être inférieur au nombre de visites du cycle.",
  done: "Cette visite est déjà marquée effectuée.",
  has_done: "Un abonnement dont une visite a eu lieu ne se supprime pas : mettez-y fin.",
  term_done: "Les douze mois sont déjà posés.",
  ended: "Cet abonnement a pris fin.",
  not_found: "Introuvable.",
};

const money = (cents: number, currency = "CAD") =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

/**
 * L'onglet Abonnés.
 *
 * Tout ce qu'il affiche est calculé par le serveur — le cycle en cours, le
 * rang de chaque visite, la fin des douze mois. Les boutons ne font que
 * demander ; la liste se relit après chaque geste.
 */
export function SubscribersPanel({ timezone, plans }: { timezone: string; plans: Plan[] }) {
  const [subs, setSubs] = useState<AdminSubscription[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [creating, setCreating] = useState(false);
  const [daily, setDaily] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await (await fetch("/api/admin/subscriptions", { cache: "no-store" })).json();
      setSubs(d.ok ? d.subscriptions : []);
      setClients(d.ok ? d.clients : []);
    } catch {
      setSubs([]);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/subscriptions", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setSubs(d.ok ? d.subscriptions : []); setClients(d.ok ? d.clients : []); })
      .catch(() => setSubs([]));
  }, []);

  async function runDaily() {
    setDaily("…");
    try {
      const d = await (await fetch("/api/cron/daily", { cache: "no-store" })).json();
      setDaily(d.ok
        ? d.skipped ? "Google n'est pas branché : rien n'est parti." : `${d.reminders} rappel(s) et ${d.notices} avis de fin de série envoyés.`
        : "La tâche n'a pas abouti.");
    } catch {
      setDaily("La tâche n'a pas abouti.");
    }
  }

  const when = (iso: string, time = true) => new Intl.DateTimeFormat("fr-CA", {
    timeZone: timezone, weekday: "short", day: "numeric", month: "short",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
  }).format(new Date(iso));

  if (subs === null) return <p className="py-20 text-center text-[0.9rem] text-ink-400">Lecture des abonnements…</p>;

  const active = subs.filter((s) => s.status === "active");
  const alerts = active.flatMap((s) => s.alerts.map((a) => ({ s, a })));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[0.9rem] font-light text-ink-500">
          {active.length === 0 ? "Aucun abonnement en cours." : `${active.length} abonnement${active.length > 1 ? "s" : ""} en cours.`}
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <button type="button" onClick={runDaily}
            className="text-[10px] uppercase tracking-[0.16em] text-ink-400 underline decoration-gold-300 underline-offset-4 hover:text-ink-700">
            Envoyer les rappels du jour
          </button>
          <button type="button" onClick={() => setCreating((v) => !v)} className="btn !py-3 !px-6 !text-[10px]">
            {creating ? "Fermer" : "Nouvel abonnement"}
          </button>
        </div>
      </div>
      {daily && <p role="status" className="mt-3 text-[0.82rem] text-gold-700">{daily}</p>}

      {creating && (
        <NewSubscription plans={plans} clients={clients} when={when}
          onDone={() => { setCreating(false); reload(); }} />
      )}

      {alerts.length > 0 && (
        <div className="mt-8 border border-[#B4453C]/40 bg-[#B4453C]/5 px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8E332C]">À regarder</p>
          <ul className="mt-3 space-y-1.5 text-[0.85rem] leading-relaxed text-[#8E332C]">
            {alerts.map(({ s, a }, i) => (
              <li key={`${s.id}-${i}`}>
                <strong className="font-medium">{s.clientName}</strong> — {alertText(a, when)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-8 space-y-3">
        {subs.map((s) => <SubscriptionCard key={s.id} s={s} when={when} onChange={reload} />)}
      </ul>
    </div>
  );
}

function alertText(a: AdminSubscription["alerts"][number], when: (iso: string, time?: boolean) => string): string {
  switch (a?.kind) {
    case "overdue": return `le cycle ${a.cycle}, commencé le ${when(a.at, false)}, dépasse ${CYCLE_MAX_WEEKS} semaines. À vous de décider de la suite.`;
    case "to_confirm": return `la visite du ${when(a.at)} n'est ni marquée effectuée ni annulée.`;
    case "makeup_pending": return `${a.count} visite${a.count > 1 ? "s" : ""} à replacer en fin de série : aucun créneau libre n'a été trouvé.`;
    case "series_ending": return `la série ${a.series} se termine le ${when(a.at, false)}. La suite est-elle confirmée ?`;
    case "term_ending": return `les douze mois se terminent le ${when(a.at, false)}. Proposez le renouvellement.`;
    default: return "";
  }
}

/* L'heure qu'il est, lue hors du rendu : une fiche se redessine à chaque
   rechargement de la liste, ce qui suffit à la tenir à jour. */
function isOver(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

function startsWithin(iso: string, ms: number): boolean {
  return new Date(iso).getTime() <= Date.now() + ms;
}

async function act(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; conflicts?: Conflict[]; detail?: string; replacement?: string | null }> {
  try {
    const res = await fetch("/api/admin/subscriptions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

function errorText(e?: string, detail?: string): string {
  return (e && ERRORS[e]) || detail || "L'action n'a pas abouti. Réessayez.";
}

/* ============================ Une fiche ============================ */

function SubscriptionCard({ s, when, onChange }: {
  s: AdminSubscription; when: (iso: string, time?: boolean) => string; onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [renewConflicts, setRenewConflicts] = useState<Conflict[] | null>(null);
  const [confirming, setConfirming] = useState<"end" | "delete" | null>(null);
  const [place, setPlace] = useState({ date: "", time: "" });
  const ended = s.status === "ended";

  async function run(key: string, body: Record<string, unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    const d = await act(body);
    setBusy(null);
    if (!d.ok) {
      if (body.action === "renew" && d.error === "conflicts") setRenewConflicts(d.conflicts ?? []);
      setMsg(errorText(d.error, d.detail));
      if (body.action !== "resync") return;
    } else {
      setMsg(ok ?? null);
      setRenewConflicts(null);
      setConfirming(null);
    }
    await onChange();
  }

  const visits = s.visits;
  const future = visits.filter((v) => !isOver(v.endsAt));
  const recentPast = visits.filter((v) => isOver(v.endsAt)).slice(-4);
  const shown = all ? visits : [...recentPast, ...future.slice(0, 8)];
  const payment = s.currentPaidAt
    ? `Reçu le ${when(s.currentPaidAt, false)}`
    : s.currentDueAt ? `À encaisser à la visite du ${when(s.currentDueAt, false)}` : "À encaisser";

  return (
    <li className={`border border-gold-300/40 bg-linen-50 ${ended ? "opacity-60" : ""}`}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-linen-100">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <p className="text-[0.95rem] text-ink-800">
            {s.clientName}
            <span className="ml-2 text-[11px] uppercase tracking-wider text-ink-400">{s.planName}</span>
            {ended && <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">terminé</span>}
          </p>
          <p className="mt-0.5 text-[0.82rem] text-ink-500">{s.slot}, {s.rhythm}</p>
        </div>
        {!ended && (
          <span className="text-[0.82rem] tabular-nums text-ink-600">
            cycle {s.currentCycle} — {s.doneInCurrent}/{s.perCycle} visites faites
          </span>
        )}
        {s.alerts.length > 0 && !ended && (
          <span className="border border-[#B4453C]/50 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[#8E332C]">
            {s.alerts.length} alerte{s.alerts.length > 1 ? "s" : ""}
          </span>
        )}
        <span aria-hidden="true" className={`text-gold-500 transition-transform duration-500 ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-gold-300/40 px-5 py-5 text-[0.85rem]">
          <div className="space-y-2.5">
            <Line label="Prochaine visite">{s.nextVisit ? when(s.nextVisit) : "—"}</Line>
            <Line label="Paiement du cycle">
              <span>{payment} · {money(s.amount.totalCents, s.currency)}</span>
              {s.amount.travelCents > 0 && (
                <span className="block text-[0.76rem] text-ink-400">
                  {money(s.amount.planCents, s.currency)} + {money(s.amount.travelCents, s.currency)} de frais ({money(s.feePerVisitCents, s.currency)} × {s.perCycle}{s.travelZone ? `, ${s.travelZone}` : ""})
                </span>
              )}
              {!ended && (
                <button type="button" disabled={busy === "paid"}
                  onClick={() => run("paid", { action: "paid", id: s.id, cycle: s.currentCycle, paid: !s.currentPaidAt })}
                  className="mt-2 block border border-gold-400/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-gold-700 hover:bg-linen-100 disabled:opacity-40">
                  {s.currentPaidAt ? "Annuler le paiement noté" : `Paiement reçu — cycle ${s.currentCycle}`}
                </button>
              )}
            </Line>
            <Line label="Fin des 12 mois">
              {s.termEndsAt ? when(s.termEndsAt, false) : "—"}
              <span className="ml-2 text-[0.76rem] text-ink-400">série {s.latestSeries} posée</span>
            </Line>
            <Line label="Client">
              <a href={`tel:${s.clientPhone.replace(/\D/g, "")}`} className="text-gold-700 hover:underline">{s.clientPhone}</a>
              {" · "}
              <a href={`mailto:${s.clientEmail}`} className="break-all text-gold-700 hover:underline">{s.clientEmail}</a>
            </Line>
            <Line label="Adresse">{s.address}, {s.city} {s.postalCode}</Line>
            {s.notes && <Line label="Précisions"><span className="italic">{s.notes}</span></Line>}
            <Line label="Référence"><code className="font-mono text-xs tracking-wider">{s.ref}</code></Line>
          </div>

          {s.cycles.length > 0 && (
            <div>
              <p className="mb-2 text-[9px] uppercase tracking-[0.2em] text-gold-600">Cycles</p>
              <ul className="flex flex-wrap gap-1.5">
                {s.cycles.map((c) => (
                  <li key={c.cycle} title={c.paidAt ? `Payé le ${when(c.paidAt, false)}` : "Non payé"}
                    className={`border px-2 py-1 text-[10px] tabular-nums ${
                      c.overdue ? "border-[#B4453C]/60 text-[#8E332C]"
                        : c.done >= s.perCycle ? "border-gold-400 text-gold-700" : "border-gold-300/50 text-ink-500"
                    }`}>
                    {c.cycle} · {c.done}/{s.perCycle}{c.paidAt ? " · payé" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-[0.2em] text-gold-600">Visites</p>
              <button type="button" onClick={() => setAll((v) => !v)}
                className="text-[10px] uppercase tracking-[0.14em] text-ink-400 underline decoration-gold-300 underline-offset-4">
                {all ? "Les prochaines seulement" : `Toutes (${visits.length})`}
              </button>
            </div>
            <ul className="divide-y divide-gold-300/30 border-y border-gold-300/30">
              {shown.map((v) => <VisitRow key={v.id} v={v} perCycle={s.perCycle} when={when} onChange={onChange} />)}
            </ul>
          </div>

          {!ended && s.pendingMakeups > 0 && (
            <div className="border border-gold-300/60 px-4 py-3">
              <p className="text-[0.82rem] text-ink-700">Replacer une visite ({s.pendingMakeups} en attente)</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input type="date" value={place.date} onChange={(e) => setPlace({ ...place, date: e.target.value })} className="field !w-auto !py-1.5" />
                <input type="time" step={1800} value={place.time} onChange={(e) => setPlace({ ...place, time: e.target.value })} className="field !w-auto !py-1.5" />
                <button type="button" disabled={!place.date || !place.time || busy === "place"}
                  onClick={() => run("place", { action: "place", id: s.id, ...place }, "Visite replacée.")}
                  className="border border-gold-400/70 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-gold-700 disabled:opacity-40">
                  Poser
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-3 border-t border-gold-300/40 pt-4">
            {s.canRenew && (
              <button type="button" disabled={busy === "renew"} onClick={() => run("renew", { action: "renew", id: s.id }, `Série ${s.latestSeries + 1} posée.`)}
                className="border border-gold-400/70 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-gold-700 disabled:opacity-40">
                {busy === "renew" ? "…" : `Poser la série ${s.latestSeries + 1}`}
              </button>
            )}
            {!ended && (
              <button type="button" disabled={busy === "resync"} onClick={() => run("resync", { action: "resync", id: s.id }, "Agenda remis à jour, confirmation renvoyée.")}
                className="text-[10px] uppercase tracking-[0.14em] text-ink-500 underline decoration-gold-300 underline-offset-4 disabled:opacity-40">
                {busy === "resync" ? "…" : "Resynchroniser l'agenda et renvoyer la confirmation"}
              </button>
            )}
            {!ended && (confirming === "end" ? (
              <span className="flex items-center gap-3">
                <button type="button" disabled={busy === "end"} onClick={() => run("end", { action: "end", id: s.id }, "Abonnement terminé.")}
                  className="border border-[#B4453C]/50 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8E332C]">
                  Confirmer la fin — les visites à venir seront retirées
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="text-[10px] uppercase tracking-[0.14em] text-ink-400">Garder</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming("end")}
                className="text-[10px] uppercase tracking-[0.14em] text-ink-400 underline decoration-gold-300 underline-offset-4 hover:text-[#8E332C]">
                Mettre fin à l&apos;abonnement
              </button>
            ))}
            {!s.hasDone && (confirming === "delete" ? (
              <span className="flex items-center gap-3">
                <button type="button" disabled={busy === "delete"} onClick={() => run("delete", { action: "delete", id: s.id })}
                  className="border border-[#B4453C]/50 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8E332C]">
                  Supprimer définitivement
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="text-[10px] uppercase tracking-[0.14em] text-ink-400">Garder</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming("delete")}
                className="text-[10px] uppercase tracking-[0.14em] text-ink-400 underline decoration-gold-300 underline-offset-4 hover:text-[#8E332C]">
                Supprimer (essai, erreur de saisie)
              </button>
            ))}
          </div>

          {renewConflicts && renewConflicts.length > 0 && (
            <div className="border-l-2 border-[#B4453C]/60 pl-4">
              <p className="text-[0.82rem] text-ink-700">Ces dates de la série suivante sont prises :</p>
              <ul className="mt-1 text-[0.8rem] text-ink-600">
                {renewConflicts.map((c) => <li key={c.startsAt}>{when(c.startsAt)} — {REASONS[c.reason] ?? c.reason}</li>)}
              </ul>
              <button type="button" onClick={() => run("renew", { action: "renew", id: s.id, skipConflicts: true }, `Série ${s.latestSeries + 1} posée, dates prises sautées.`)}
                className="mt-2 border border-gold-400/70 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-gold-700">
                Poser en sautant ces dates
              </button>
            </div>
          )}

          {msg && <p role="status" className="text-[0.82rem] text-gold-700">{msg}</p>}
        </div>
      )}
    </li>
  );
}

function VisitRow({ v, perCycle, when, onChange }: {
  v: AdminSubscription["visits"][number]; perCycle: number;
  when: (iso: string, time?: boolean) => string; onChange: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "move" | "cancel">("idle");
  const [to, setTo] = useState({ date: "", time: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cancelled = v.status === "cancelled";
  const startedish = startsWithin(v.startsAt, 2 * 3600_000);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const d = await act(body);
    setBusy(false);
    if (!d.ok) { setErr(errorText(d.error, d.detail)); return; }
    setMode("idle");
    await onChange();
  }

  const small = "text-[10px] uppercase tracking-[0.14em] underline decoration-gold-300 underline-offset-4 disabled:opacity-40";

  return (
    <li className={`py-2.5 ${cancelled ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={`min-w-[11rem] tabular-nums text-ink-700 ${cancelled ? "line-through" : ""}`}>{when(v.startsAt)}</span>
        <span className="text-[0.78rem] text-ink-400">
          {cancelled ? "annulée" : v.index ? `${v.index}/${perCycle} · cycle ${v.cycle}` : ""}
          {v.makeup && !cancelled ? " · remplacement" : ""}
          {!cancelled && !v.inCalendar ? " · hors agenda" : ""}
        </span>
        {v.doneAt && <span className="text-[10px] uppercase tracking-[0.14em] text-gold-700">effectuée</span>}
        <span className="ml-auto flex gap-4">
          {!cancelled && !v.doneAt && startedish && (
            <button type="button" disabled={busy} onClick={() => run({ action: "done", visitId: v.id, done: true })}
              className="border border-gold-400/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-gold-700 disabled:opacity-40">
              Visite effectuée
            </button>
          )}
          {v.doneAt && (
            <button type="button" disabled={busy} onClick={() => run({ action: "done", visitId: v.id, done: false })} className={`${small} text-ink-400`}>
              Retirer
            </button>
          )}
          {!cancelled && !v.doneAt && (
            <>
              <button type="button" onClick={() => setMode(mode === "move" ? "idle" : "move")} className={`${small} text-ink-500`}>Déplacer</button>
              <button type="button" onClick={() => setMode(mode === "cancel" ? "idle" : "cancel")} className={`${small} text-ink-500 hover:text-[#8E332C]`}>Annuler</button>
            </>
          )}
        </span>
      </div>
      {mode === "move" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" value={to.date} onChange={(e) => setTo({ ...to, date: e.target.value })} className="field !w-auto !py-1.5" />
          <input type="time" step={1800} value={to.time} onChange={(e) => setTo({ ...to, time: e.target.value })} className="field !w-auto !py-1.5" />
          <button type="button" disabled={busy || !to.date || !to.time} onClick={() => run({ action: "move", visitId: v.id, ...to })}
            className="border border-gold-400/70 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-gold-700 disabled:opacity-40">
            Déplacer
          </button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-[0.8rem] text-ink-600">La visite ne comptera pas ; une visite sera ajoutée en fin de série. Le client est prévenu.</span>
          <button type="button" disabled={busy} onClick={() => run({ action: "cancel", visitId: v.id })}
            className="border border-[#B4453C]/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[#8E332C] disabled:opacity-40">
            Confirmer l&apos;annulation
          </button>
        </div>
      )}
      {err && <p role="alert" className="mt-1.5 text-[0.8rem] text-[#8E332C]">{err}</p>}
    </li>
  );
}

/* ============================ Nouvel abonnement ============================ */

function NewSubscription({ plans, clients, when, onDone }: {
  plans: Plan[]; clients: Client[]; when: (iso: string, time?: boolean) => string; onDone: () => void;
}) {
  const [f, setF] = useState({
    planKey: plans.find((p) => p.key === "executif")?.key ?? plans[0]?.key ?? "",
    name: "", email: "", phone: "", address: "", city: "", postalCode: "", notes: "",
    date: "", time: "", startCycle: 1, startDone: 0, paidCurrent: false,
  });
  const [check, setCheck] = useState<{ free: boolean; starts: string[]; conflicts: Conflict[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const plan = plans.find((p) => p.key === f.planKey);

  const set = (k: keyof typeof f, v: string | number | boolean) => { setF((x) => ({ ...x, [k]: v })); setCheck(null); };

  function pick(email: string) {
    const c = clients.find((x) => x.email === email);
    if (c) setF((x) => ({ ...x, name: c.name, email: c.email, phone: c.phone, address: c.address, city: c.city, postalCode: c.postalCode }));
    setCheck(null);
  }

  const input = { ...f, locale: "fr", notes: f.notes || undefined };

  async function verify() {
    setBusy(true); setErr(null);
    const d = await act({ action: "check", input });
    setBusy(false);
    if (!d.ok) { setErr(errorText(d.error, d.detail)); return; }
    setCheck(d as unknown as { free: boolean; starts: string[]; conflicts: Conflict[] });
  }

  async function create() {
    setBusy(true); setErr(null);
    const d = await act({ action: "create", input });
    setBusy(false);
    if (!d.ok) {
      if (d.error === "conflicts") setCheck({ free: false, starts: [], conflicts: d.conflicts ?? [] });
      setErr(errorText(d.error, d.detail));
      return;
    }
    onDone();
  }

  const ready = f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && f.phone.trim().length >= 7
    && f.address.trim().length >= 4 && f.city.trim().length >= 2 && f.postalCode.trim().length >= 6 && f.date && f.time;

  return (
    <div className="mt-8 border border-gold-400/60 bg-linen-50 px-5 py-6">
      <p className="font-display text-xl text-ink-800">Nouvel abonnement</p>
      <p className="mt-1 text-[0.8rem] font-light text-ink-500">
        Pour un client que vous servez déjà. La date et l&apos;heure sont celles de la prochaine visite, à l&apos;heure de Montréal ; les suivantes en découlent.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Client existant</span>
          <select className="field" defaultValue="" onChange={(e) => pick(e.target.value)}>
            <option value="">— Saisir à la main —</option>
            {clients.map((c) => <option key={c.email} value={c.email}>{c.name} · {c.email}</option>)}
          </select>
        </label>
        <Input label="Nom" value={f.name} onChange={(v) => set("name", v)} />
        <Input label="Courriel" value={f.email} onChange={(v) => set("email", v)} type="email" />
        <Input label="Téléphone" value={f.phone} onChange={(v) => set("phone", v)} />
        <Input label="Ville" value={f.city} onChange={(v) => set("city", v)} />
        <Input label="Adresse" value={f.address} onChange={(v) => set("address", v)} />
        <Input label="Code postal" value={f.postalCode} onChange={(v) => set("postalCode", v.toUpperCase())} />
        <label>
          <span className="label">Formule</span>
          <select className="field" value={f.planKey} onChange={(e) => { set("planKey", e.target.value); set("startDone", 0); }}>
            {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Prochaine visite" value={f.date} onChange={(v) => set("date", v)} type="date" />
          <Input label="Heure" value={f.time} onChange={(v) => set("time", v)} type="time" />
        </div>
        <label>
          <span className="label">Cycle en cours</span>
          <input type="number" min={1} max={12} value={f.startCycle} className="field"
            onChange={(e) => set("startCycle", Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </label>
        <label>
          <span className="label">Visites déjà faites dans ce cycle</span>
          <input type="number" min={0} max={(plan?.visits ?? 1) - 1} value={f.startDone} className="field"
            onChange={(e) => set("startDone", Math.max(0, Math.min((plan?.visits ?? 1) - 1, Number(e.target.value) || 0)))} />
        </label>
        <label className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" checked={f.paidCurrent} onChange={(e) => set("paidCurrent", e.target.checked)}
            className="h-4 w-4 accent-[var(--color-gold-500)]" />
          <span className="text-[0.85rem] text-ink-600">Le cycle en cours est déjà payé</span>
        </label>
        <div className="sm:col-span-2">
          <span className="label">Précisions</span>
          <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className="field resize-none" />
        </div>
      </div>

      {check && check.free && (
        <p className="mt-4 text-[0.85rem] text-gold-700">
          Les {check.starts.length} dates sont libres, du {when(check.starts[0], false)} au {when(check.starts[check.starts.length - 1], false)}.
        </p>
      )}
      {check && !check.free && (
        <div className="mt-4 border-l-2 border-[#B4453C]/60 pl-4">
          <p className="text-[0.85rem] text-ink-700">Ces dates sont prises ou hors de l&apos;horaire :</p>
          <ul className="mt-1 text-[0.8rem] text-ink-600">
            {check.conflicts.map((c) => <li key={c.startsAt}>{when(c.startsAt)} — {REASONS[c.reason] ?? c.reason}</li>)}
          </ul>
        </div>
      )}
      {err && <p role="alert" className="mt-4 text-[0.85rem] text-[#8E332C]">{err}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={!ready || busy} onClick={verify} className="btn btn-ghost !py-3 !px-6 !text-[10px]">
          Vérifier les dates
        </button>
        <button type="button" disabled={!ready || busy || !check?.free} onClick={create} className="btn !py-3 !px-6 !text-[10px]">
          {busy ? "…" : "Créer l'abonnement"}
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="field" />
    </label>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <span className="text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</span>
      <span className="text-ink-700">{children}</span>
    </div>
  );
}

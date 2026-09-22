"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleIcon, CheckIcon } from "../Icons";
import type { Settings } from "@/lib/settings";

type Calendar = { id: string; summary: string; primary?: boolean; accessRole: string; backgroundColor?: string };

export function ConnectionPanel({
  settings, session, env, missingScopes,
}: {
  settings: Settings;
  session: { email: string; name: string | null; picture: string | null };
  env: { database: boolean; google: boolean; origin: string };
  missingScopes: string[];
}) {
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [calendarId, setCalendarId] = useState(settings.calendarId);
  const [savingCal, setSavingCal] = useState(false);
  const [calSaved, setCalSaved] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; to?: string; at?: string; reason?: string; hint?: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!settings.connected) return;
    fetch("/api/admin/calendars")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setCalendars(d.calendars); })
      .catch(() => {});
  }, [settings.connected]);

  async function saveCalendar(id: string) {
    setCalendarId(id);
    setSavingCal(true);
    setCalSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarId: id }),
      });
      if (res.ok) { setCalSaved(true); setTimeout(() => setCalSaved(false), 2600); }
    } finally {
      setSavingCal(false);
    }
  }

  /* Un courriel qui n'arrive pas ne se diagnostique qu'en essayant. */
  async function sendTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      setTest(await res.json());
    } catch {
      setTest({ ok: false, reason: "Le site n'a pas répondu. Réessayez." });
    } finally {
      setTesting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/admin/disconnect", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* — Compte — */}
      <section className="border border-gold-300/40 bg-linen-50 p-7">
        <div className="flex flex-wrap items-center gap-5">
          {session.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.picture} alt="" width={56} height={56} className="h-14 w-14 rounded-full border border-gold-300" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold-300 text-gold-600">
              <GoogleIcon className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl text-ink-800">{session.name ?? session.email}</p>
            <p className="text-[0.85rem] text-ink-500">{session.email}</p>
          </div>
          <span className={`flex items-center gap-2 border px-4 py-2 text-[10px] uppercase tracking-[0.16em] ${
            settings.connected ? "border-gold-400 text-gold-700" : "border-[#B4453C]/50 text-[#8E332C]"
          }`}>
            {settings.connected && <CheckIcon className="h-3 w-3" />}
            {settings.connected ? "Connecté" : "Non connecté"}
          </span>
        </div>

        {missingScopes.length > 0 && (
          <div className="mt-6 border border-[#B4453C]/40 bg-[#B4453C]/5 px-5 py-4 text-[0.84rem] leading-relaxed text-[#8E332C]">
            <p className="font-medium">Autorisations incomplètes</p>
            <p className="mt-1">
              Vous n&apos;avez pas accordé : {missingScopes.map((s) => s.split("/").pop()).join(", ")}.
              Sans elles, {missingScopes.some((s) => s.includes("gmail")) ? "les courriels de confirmation" : "la lecture de l'agenda"} ne fonctionneront pas.
            </p>
            <a href="/api/auth/google" className="mt-3 inline-block underline underline-offset-4">Réautoriser</a>
          </div>
        )}
      </section>

      {/* — Agenda cible — */}
      {settings.connected && (
        <section className="border border-gold-300/40 bg-linen-50 p-7">
          <h3 className="font-display text-xl font-normal text-ink-800">Agenda de travail</h3>
          <p className="mt-1.5 max-w-2xl text-[0.82rem] font-light leading-relaxed text-ink-400">
            NIVEX lit vos occupations dans cet agenda pour ne proposer que du temps réellement libre, et y inscrit
            chaque rendez-vous confirmé. Astuce : bloquez du temps personnel directement dans Google Agenda, il
            disparaîtra du site tout seul.
          </p>

          {calendars === null ? (
            <p className="mt-6 text-[0.85rem] text-ink-400">Lecture de vos agendas…</p>
          ) : (
            <ul className="mt-6 space-y-2">
              {calendars.map((c) => (
                <li key={c.id}>
                  <label className={`flex cursor-pointer items-center gap-3 border px-4 py-3 transition-colors ${
                    calendarId === c.id ? "border-gold-500 bg-linen-100" : "border-gold-300/50 hover:border-gold-400"
                  }`}>
                    <input type="radio" name="calendar" checked={calendarId === c.id}
                      onChange={() => saveCalendar(c.id)} className="accent-[var(--color-gold-500)]" />
                    <span className="h-3 w-3 flex-none rounded-full border border-black/10"
                      style={{ background: c.backgroundColor ?? "var(--color-gold-300)" }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[0.9rem] text-ink-800">{c.summary}</span>
                    {c.primary && <span className="text-[10px] uppercase tracking-wider text-gold-600">Principal</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {savingCal && <p className="mt-3 text-[0.8rem] text-ink-400">Enregistrement…</p>}
          {calSaved && <p className="mt-3 text-[0.8rem] text-gold-700">Agenda mis à jour.</p>}
        </section>
      )}

      {/* — Essai d'envoi — */}
      {settings.connected && (
        <section className="border border-gold-300/40 bg-linen-50 p-7">
          <h3 className="font-display text-xl font-normal text-ink-800">Les courriels partent-ils ?</h3>
          <p className="mt-1.5 max-w-2xl text-[0.82rem] font-light leading-relaxed text-ink-400">
            Envoie un message d&apos;essai vers votre boîte, par le même chemin que les confirmations de
            réservation. S&apos;il n&apos;arrive pas, la raison exacte donnée par Google s&apos;affiche ici.
          </p>

          <button type="button" onClick={sendTest} disabled={testing} className="btn mt-6 !py-3 !px-6 !text-[10px]">
            {testing ? "Envoi en cours…" : "Envoyer un courriel de test"}
          </button>

          {test?.ok && (
            <p className="mt-5 border border-gold-400/60 bg-linen-100 px-5 py-4 text-[0.85rem] leading-relaxed text-ink-700">
              Parti vers <strong>{test.to}</strong>, le {test.at}. S&apos;il n&apos;est pas dans la boîte de réception,
              regardez dans les indésirables — c&apos;est le même envoi que celui des confirmations.
            </p>
          )}

          {test && !test.ok && (
            <div className="mt-5 border border-[#B4453C]/40 bg-[#B4453C]/5 px-5 py-4 text-[0.85rem] leading-relaxed text-[#8E332C]">
              <p className="font-medium">L&apos;envoi a échoué.</p>
              {test.hint && <p className="mt-1">{test.hint}</p>}
              {test.reason && (
                <p className="mt-3 break-words font-mono text-[0.72rem] leading-relaxed opacity-80">{test.reason}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* — Diagnostic — */}
      <section className="border border-gold-300/40 bg-linen-50 p-7">
        <h3 className="font-display text-xl font-normal text-ink-800">État du système</h3>
        <ul className="mt-5 space-y-2.5 text-[0.85rem]">
          <Check ok={env.google} label="Identifiants Google OAuth" fail="Variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquantes" />
          <Check ok={env.database} label="Base de données" fail="Variable DATABASE_URL manquante" />
          <Check ok={settings.connected} label="Compte Google branché" fail="Aucun jeton d'accès enregistré" />
          <Check ok={!settings.paused} label="Réservations ouvertes" fail="Réservations suspendues (onglet Réglages)" />
        </ul>
        <p className="mt-6 border-t border-gold-300/30 pt-5 text-[0.78rem] leading-relaxed text-ink-400">
          Adresse publique du site : <code className="font-mono text-ink-600">{env.origin}</code><br />
          URI de redirection à déclarer chez Google : <code className="font-mono text-ink-600">{env.origin}/api/auth/google/callback</code>
        </p>
      </section>

      {/* — Déconnexion — */}
      <section className="border border-gold-300/40 bg-linen-50 p-7">
        <h3 className="font-display text-xl font-normal text-ink-800">Révoquer l&apos;accès</h3>
        <p className="mt-1.5 max-w-2xl text-[0.82rem] font-light leading-relaxed text-ink-400">
          NIVEX oublie votre jeton et le révoque auprès de Google. Vos rendez-vous déjà inscrits dans l&apos;agenda
          restent en place ; les réservations en ligne s&apos;arrêtent jusqu&apos;à une nouvelle connexion.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {confirmDisconnect ? (
            <>
              <button onClick={disconnect} disabled={disconnecting}
                className="border border-[#B4453C]/50 px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] text-[#8E332C] transition-colors hover:bg-[#B4453C]/5 disabled:opacity-40">
                {disconnecting ? "Révocation…" : "Confirmer la révocation"}
              </button>
              <button onClick={() => setConfirmDisconnect(false)} className="text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-700">
                Annuler
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDisconnect(true)} className="btn btn-ghost !py-3 !px-6 !text-[10px]">
              Déconnecter Google
            </button>
          )}
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-[10px] uppercase tracking-[0.16em] text-ink-400 transition-colors hover:text-ink-700">
              Se déconnecter de cet appareil
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Check({ ok, label, fail }: { ok: boolean; label: string; fail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] ${
        ok ? "bg-gold-500 text-white" : "border border-[#B4453C]/50 text-[#8E332C]"
      }`}>{ok ? "✓" : "!"}</span>
      <span className={ok ? "text-ink-700" : "text-ink-700"}>
        {label}
        {!ok && <span className="mt-0.5 block text-[11px] text-[#8E332C]">{fail}</span>}
      </span>
    </li>
  );
}

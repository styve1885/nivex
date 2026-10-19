"use client";

import { useEffect, useState } from "react";
import { LoadFailure, loadErrorOf, type LoadError } from "./LoadFailure";

type Msg = {
  id: string; locale: string; name: string; email: string | null; phone: string | null;
  subject: string | null; body: string; emailSent: boolean;
  readAt: string | null; createdAt: string;
};

/* L'heure de la maison, explicitement, comme dans les autres onglets : sans
   fuseau, un appareil réglé ailleurs décalait l'heure de réception. */
const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

export function MessagesPanel({ timezone }: { timezone: string }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/messages")
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (r.ok && d?.ok) setMessages(d.messages);
        else setError(loadErrorOf(r.status));
      })
      .catch(() => setError("server"));
  }, []);

  async function open(m: Msg) {
    const next = openId === m.id ? null : m.id;
    setOpenId(next);
    if (next && !m.readAt) {
      setMessages((cur) => cur?.map((x) => (x.id === m.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? cur);
      fetch(`/api/admin/messages?id=${m.id}`, { method: "PATCH" }).catch(() => {});
    }
  }

  /* Sur demande de son auteur : la politique de confidentialité promet
     de supprimer un message avant ses deux ans si on nous le demande. */
  async function remove(m: Msg) {
    if (!window.confirm(`Supprimer définitivement le message de ${m.name} ? Il ne pourra pas être retrouvé.`)) return;
    setDeleteError(null);
    const r = await fetch(`/api/admin/messages?id=${m.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setMessages((cur) => cur?.filter((x) => x.id !== m.id) ?? cur);
      setOpenId(null);
    } else {
      setDeleteError(r?.status === 401 ? "Session expirée : reconnectez-vous, puis recommencez." : "Le message n'a pas pu être supprimé. Réessayez.");
    }
  }

  if (error) return <LoadFailure error={error} className="py-20 text-center" />;

  if (messages === null) {
    return <p className="py-20 text-center text-[0.9rem] text-ink-400">Lecture des messages…</p>;
  }

  if (messages.length === 0) {
    return (
      <p className="py-20 text-center text-[0.9rem] text-ink-400">
        Aucun message pour l&apos;instant. Le formulaire de contact du site arrive ici.
      </p>
    );
  }

  const unread = messages.filter((m) => !m.readAt).length;

  return (
    <div>
      {unread > 0 && (
        <p className="mb-6 text-[11px] uppercase tracking-[0.18em] text-gold-600">
          {unread} message{unread > 1 ? "s" : ""} non lu{unread > 1 ? "s" : ""}
        </p>
      )}

      <ul className="space-y-3">
        {messages.map((m) => {
          const isOpen = openId === m.id;
          return (
            <li key={m.id}
              className={`border bg-linen-50 transition-colors ${m.readAt ? "border-gold-300/40" : "border-gold-500/70"}`}>
              <button onClick={() => open(m)} aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-linen-100">
                {!m.readAt && <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-gold-500" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-[0.95rem] text-ink-800 ${m.readAt ? "" : "font-medium"}`}>
                    {m.name}
                    {m.subject && <span className="ml-2 text-[0.85rem] text-ink-500">— {m.subject}</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[0.82rem] text-ink-400">{m.body}</p>
                </div>
                <span className="hidden flex-none text-[0.78rem] text-ink-400 sm:block">{when(m.createdAt, timezone)}</span>
                <span aria-hidden="true" className={`text-gold-500 transition-transform duration-500 ${isOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>

              <div className="grid transition-[grid-template-rows] duration-500"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-silk)" }}>
                <div className="overflow-hidden">
                  <div className="border-t border-gold-300/40 px-5 py-5">
                    <p className="whitespace-pre-wrap text-[0.9rem] leading-[1.85] text-ink-700">{m.body}</p>

                    <dl className="mt-6 space-y-2 border-t border-gold-300/30 pt-5 text-[0.82rem]">
                      {m.email ? (
                        <Line label="Courriel">
                          <a href={`mailto:${m.email}`} className="break-all text-gold-700 hover:underline">{m.email}</a>
                        </Line>
                      ) : (
                        <Line label="Courriel"><span className="text-ink-400">Non fourni — rappelez par téléphone.</span></Line>
                      )}
                      {m.phone && (
                        <Line label="Téléphone">
                          <a href={`tel:${m.phone.replace(/\D/g, "")}`} className="text-gold-700 hover:underline">{m.phone}</a>
                        </Line>
                      )}
                      <Line label="Reçu le">{when(m.createdAt, timezone)}</Line>
                      {!m.emailSent && (
                        <Line label="Note">
                          <span className="text-[#8E332C]">
                            Ce message n&apos;a pas pu vous être expédié par courriel — il n&apos;existe qu&apos;ici.
                          </span>
                        </Line>
                      )}
                    </dl>

                    <div className="mt-6 flex flex-wrap items-center gap-4">
                      {m.email ? (
                        <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re : " + (m.subject || "votre message"))}`}
                          className="btn !py-3 !px-6 !text-[10px]">
                          Répondre
                        </a>
                      ) : m.phone ? (
                        <a href={`tel:${m.phone.replace(/\D/g, "")}`} className="btn !py-3 !px-6 !text-[10px]">
                          Appeler
                        </a>
                      ) : null}
                      <button onClick={() => remove(m)} className="btn btn-ghost !py-3 !px-6 !text-[10px]">
                        Supprimer
                      </button>
                    </div>
                    {deleteError && <p role="alert" className="mt-3 text-[0.82rem] text-[#8E332C]">{deleteError}</p>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[6rem_1fr] sm:gap-4">
      <dt className="text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</dt>
      <dd className="text-ink-700">{children}</dd>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SMS_SIGNATURE } from "@/lib/brand";
import { ADMIN_TEXT_MAX, readable, smsSegments, toE164 } from "@/lib/phone";
import { LoadFailure, loadErrorOf, type LoadError } from "./LoadFailure";

/*
 * Les textos échangés avec les clients, en haut de l'onglet Messages.
 *
 * Tout se lit chez Twilio, à l'ouverture et sur « Rafraîchir » : le site n'en
 * garde rien. L'artisan choisit un client ou tape un numéro, lit la
 * conversation (ses messages, les textos automatiques, les réponses du
 * client, photos comprises) et écrit ; le texto part du numéro de la maison.
 * Les réponses lui arrivent toujours aussi sur son cellulaire.
 */

type Media = { sid: string; type: string; inline: boolean };
type Text = {
  sid: string; direction: "in" | "out"; body: string; at: string; status: string;
  problem: string | null; numMedia: number; media: Media[];
};
type Summary = {
  number: string; name: string | null; canText: boolean; at: string;
  direction: "in" | "out"; excerpt: string; awaiting: boolean;
};
type Client = { name: string; number: string; canText: boolean };
type Thread = {
  number: string; name: string | null; canText: boolean; messages: Text[]; optedOut: boolean; truncated: boolean;
};
type Inbox =
  | { configured: false }
  | { configured: true; conversations: Summary[] | null; readError: string | null; clients: Client[] };

/* La signature ajoutée à la fin du message : le choix de l'artisan est
   retenu dans ce navigateur. `localStorage` vit hors de React : on le lit
   comme un état extérieur, et un navigateur qui le refuse garde le choix le
   temps de la page. */
const SIGN_KEY = "nivex.sms.sign";
const SIGN_EVENT = "nivex-sms-sign";
let signMemory = true;
function subscribeSign(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(SIGN_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SIGN_EVENT, cb);
  };
}
function readSign(): boolean {
  try {
    const v = localStorage.getItem(SIGN_KEY);
    return v === null ? signMemory : v !== "0";
  } catch {
    return signMemory;
  }
}
function writeSign(on: boolean) {
  signMemory = on;
  try {
    localStorage.setItem(SIGN_KEY, on ? "1" : "0");
  } catch {
    /* navigation privée : le choix tient le temps de la page */
  }
  window.dispatchEvent(new Event(SIGN_EVENT));
}

/** Le texte qui partira : le message, et la signature sur sa propre ligne. */
function outgoingText(draft: string, sign: boolean): string {
  const text = draft.trim();
  return text && sign ? `${text}\n${SMS_SIGNATURE}` : text;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* L'heure de la maison, explicitement, comme dans les autres onglets. */
const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

/** Ce qu'est devenu un texto parti de la maison. */
function statusText(t: Text): string | null {
  if (t.direction === "in") return null;
  switch (t.status) {
    case "delivered": return "remis";
    case "read": return "lu";
    case "sent": return "envoyé";
    case "scheduled": return "programmé";
    case "queued": case "accepted": case "sending": return "en cours d'envoi";
    case "failed": case "undelivered": return `non remis : ${t.problem ?? "raison inconnue"}`;
    default: return null;
  }
}

const mediaUrl = (t: Text, m: Media) =>
  `/api/admin/sms/media?message=${encodeURIComponent(t.sid)}&media=${encodeURIComponent(m.sid)}`;

export function TextsSection({ timezone }: { timezone: string }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [inboxError, setInboxError] = useState<LoadError | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ number: string; name: string | null } | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sign = useSyncExternalStore(subscribeSign, readSign, () => true);
  /* Le numéro ouvert : une réponse qui arrive pour un autre, plus lente, est écartée. */
  const current = useRef<string | null>(null);
  const box = useRef<HTMLOListElement | null>(null);

  function loadInbox() {
    fetch("/api/admin/sms")
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (r.ok && d?.ok) {
          setInbox(d.configured ? d : { configured: false });
          setInboxError(null);
        } else setInboxError(loadErrorOf(r.status));
      })
      .catch(() => setInboxError("server"));
  }

  function loadThread(number: string) {
    fetch(`/api/admin/sms?number=${encodeURIComponent(number)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (current.current !== number) return;
        if (r.ok && d?.ok && d.conversation) {
          setThread(d.conversation);
          setThreadError(null);
        } else if (r.status === 401) {
          setThreadError("Votre session a expiré : reconnectez-vous, puis recommencez.");
        } else {
          setThreadError(d?.reason ?? "La conversation n'a pas pu être lue. Réessayez.");
        }
      })
      .catch(() => {
        if (current.current === number) setThreadError("Le site n'a pas répondu. Réessayez.");
      });
  }

  useEffect(loadInbox, []);

  /* De retour sur la page, on relit : une réponse a pu arriver entre-temps. */
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      if (current.current) loadThread(current.current);
      else loadInbox();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  /* Le fil s'ouvre sur ses derniers messages, au-dessus de la zone d'écriture. */
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  function openThread(number: string, name: string | null) {
    current.current = number;
    setOpen({ number, name });
    setThread(null);
    setThreadError(null);
    setSendError(null);
    setDraft("");
    setQuery("");
    loadThread(number);
  }

  function closeThread() {
    current.current = null;
    setOpen(null);
    setThread(null);
    setThreadError(null);
    loadInbox();
  }

  function refresh() {
    if (current.current) loadThread(current.current);
    else loadInbox();
  }

  const suggestions = useMemo(() => {
    const q = query.trim();
    const clients = inbox?.configured ? inbox.clients : [];
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    const name = fold(q);
    const found: { number: string; name: string | null; canText: boolean }[] = clients
      .filter((c) => (name.length >= 2 && fold(c.name).includes(name))
        || (digits.length >= 3 && c.number.replace(/\D/g, "").includes(digits)))
      .slice(0, 8);
    const typed = toE164(q);
    if (typed && !found.some((c) => c.number === typed)) found.unshift({ number: typed, name: null, canText: true });
    return found;
  }, [query, inbox]);

  const outgoing = outgoingText(draft, sign);
  const cost = smsSegments(outgoing);
  const tooLong = outgoing.length > ADMIN_TEXT_MAX;
  const canSend = Boolean(thread && thread.canText && !thread.optedOut && draft.trim() && !tooLong && !sending);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!open || !canSend) return;
    const number = open.number;
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: number, body: outgoing }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) {
        setDraft("");
        setThread((t) => (t && t.number === number ? { ...t, messages: [...t.messages, d.message] } : t));
        /* L'état « remis » arrive quelques secondes plus tard chez Twilio. */
        window.setTimeout(() => { if (current.current === number) loadThread(number); }, 5000);
      } else if (r.status === 401) {
        setSendError("Votre session a expiré : reconnectez-vous, puis recommencez. Le message n'est pas parti.");
      } else {
        setSendError(d?.reason ?? "Le message n'est pas parti. Réessayez.");
      }
    } catch {
      setSendError("Le site n'a pas répondu : le message n'est sans doute pas parti. Rafraîchissez avant de réessayer.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="textos-titre">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="textos-titre" className="text-[11px] uppercase tracking-[0.18em] text-gold-600">Textos</h2>
        {inbox?.configured && (
          <button type="button" onClick={refresh} className="text-[0.8rem] text-gold-700 underline-offset-4 hover:underline">
            Rafraîchir
          </button>
        )}
      </div>

      {inboxError && !inbox ? (
        <LoadFailure error={inboxError} className="py-10" />
      ) : inbox === null ? (
        <p className="py-10 text-[0.9rem] text-ink-400">Lecture des textos…</p>
      ) : !inbox.configured ? (
        <p className="mt-4 text-[0.88rem] leading-relaxed text-ink-500">
          Les textos ne sont pas réglés : une variable Twilio manque chez Vercel (voir l&apos;onglet Connexion).
        </p>
      ) : open ? (
        <div className="mt-4">
          <button type="button" onClick={closeThread} className="text-[0.82rem] text-gold-700 underline-offset-4 hover:underline">
            ← Toutes les conversations
          </button>
          <div className="mt-4 border-b border-gold-300/50 pb-4">
            <p className="font-display text-[1.5rem] leading-tight text-ink-800">{thread?.name ?? open.name ?? readable(open.number)}</p>
            {(thread?.name ?? open.name) && <p className="mt-1 text-[0.85rem] text-ink-500">{readable(open.number)}</p>}
            <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-400">
              Ses réponses vous arrivent aussi sur votre cellulaire. Pour lui répondre, écrivez ici : une réponse
              tapée sur le cellulaire ne lui parvient pas.
            </p>
          </div>

          {threadError && <p role="alert" className="mt-4 text-[0.85rem] text-[#8E332C]">{threadError}</p>}
          {!thread && !threadError && <p className="py-8 text-[0.9rem] text-ink-400">Lecture de la conversation…</p>}

          {thread && (
            <>
              {thread.truncated && (
                <p className="mt-4 text-[0.78rem] text-ink-400">Seuls les derniers textos sont affichés.</p>
              )}
              {thread.messages.length === 0 ? (
                <p className="py-8 text-[0.9rem] text-ink-400">Aucun texto échangé avec ce numéro pour l&apos;instant.</p>
              ) : (
                <ol ref={box} aria-label="Conversation" className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                  {thread.messages.map((t) => {
                    const mine = t.direction === "out";
                    const state = statusText(t);
                    const failed = t.status === "failed" || t.status === "undelivered";
                    return (
                      <li key={t.sid} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        <div className={`max-w-[85%] px-4 py-3 text-[0.92rem] leading-relaxed ${mine
                          ? "bg-ink-800 text-linen-50"
                          : "border border-gold-300/70 bg-linen-50 text-ink-800"}`}>
                          {t.body && <p className="whitespace-pre-wrap break-words">{t.body}</p>}
                          {t.media.map((m) => (m.inline ? (
                            <a key={m.sid} href={mediaUrl(t, m)} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                              {/* eslint-disable-next-line @next/next/no-img-element -- photo privée, lue chez Twilio à la demande : rien à optimiser ni à garder */}
                              <img src={mediaUrl(t, m)} alt="Photo jointe par le client" loading="lazy" className="h-48 w-auto max-w-full object-contain" />
                            </a>
                          ) : (
                            <a key={m.sid} href={mediaUrl(t, m)} className="mt-2 block underline underline-offset-4">
                              Pièce jointe ({m.type})
                            </a>
                          )))}
                          {!t.body && t.numMedia > 0 && t.media.length === 0 && (
                            <p className="italic">Pièce jointe illisible pour l&apos;instant</p>
                          )}
                        </div>
                        <p className={`mt-1 text-[0.72rem] ${failed ? "text-[#8E332C]" : "text-ink-400"}`}>
                          {when(t.at, timezone)}{state ? ` · ${state}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}

              {thread.optedOut && (
                <p role="note" className="mt-5 text-[0.85rem] leading-relaxed text-ink-700">
                  Ce client a répondu STOP : Twilio refuse de lui écrire tant qu&apos;il n&apos;a pas répondu START au
                  numéro de la maison. Pour le joindre, appelez-le.
                </p>
              )}
              {!thread.canText && (
                <p role="note" className="mt-5 text-[0.85rem] leading-relaxed text-ink-700">
                  Ce numéro n&apos;est pas canadien : on ne lui écrit pas de textos.
                </p>
              )}

              <form onSubmit={send} className="mt-6 border-t border-gold-300/50 pt-5">
                <label htmlFor="texto" className="label">Votre message</label>
                <textarea id="texto" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
                  maxLength={ADMIN_TEXT_MAX} disabled={!thread.canText || thread.optedOut}
                  className="field mt-2 resize-y" />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[0.78rem] text-ink-500">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={sign} onChange={(e) => writeSign(e.target.checked)} className="h-4 w-4 accent-[#866836]" />
                    Signer « {SMS_SIGNATURE} »
                  </label>
                  <span aria-live="polite" className={tooLong ? "text-[#8E332C]" : ""}>
                    {outgoing.length > 0 && <>
                      {outgoing.length} caractère{outgoing.length > 1 ? "s" : ""}
                      {` · ${cost.segments} texto${cost.segments > 1 ? "s" : ""}`}
                    </>}
                  </span>
                </div>
                {cost.unicode && (
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-400">
                    Un signe comme ê, ô ou ç fait compter 70 caractères par texto au lieu de 160.
                  </p>
                )}
                {sendError && <p role="alert" className="mt-3 text-[0.85rem] text-[#8E332C]">{sendError}</p>}
                <button type="submit" disabled={!canSend} className="btn mt-4 !py-3 !px-6 !text-[10px] disabled:opacity-50">
                  {sending ? "Envoi…" : "Envoyer"}
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="texto-qui" className="label">Écrire à</label>
          <input id="texto-qui" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom du client, ou numéro à dix chiffres" autoComplete="off" spellCheck={false}
            className="field mt-2" />
          {suggestions.length > 0 && (
            <ul className="mt-2 divide-y divide-gold-300/40 border border-gold-300/60 bg-linen-50">
              {suggestions.map((c) => (
                <li key={c.number}>
                  <button type="button" onClick={() => openThread(c.number, c.name)}
                    className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left hover:bg-linen-100">
                    <span className="text-[0.92rem] text-ink-800">{c.name ?? `Écrire au ${readable(c.number)}`}</span>
                    {c.name && <span className="flex-none text-[0.8rem] text-ink-400">{readable(c.number)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && suggestions.length === 0 && (
            <p className="mt-2 text-[0.8rem] text-ink-400">Aucun client à ce nom. Tapez un numéro à dix chiffres.</p>
          )}

          <h3 className="mt-10 text-[10px] uppercase tracking-[0.16em] text-ink-400">Conversations des deux derniers mois</h3>
          {inbox.readError && <p role="alert" className="mt-3 text-[0.85rem] text-[#8E332C]">{inbox.readError}</p>}
          {inbox.conversations && inbox.conversations.length === 0 && (
            <p className="mt-3 text-[0.88rem] text-ink-400">Aucun texto échangé avec un client depuis deux mois.</p>
          )}
          {inbox.conversations && inbox.conversations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {inbox.conversations.map((c) => (
                <li key={c.number}>
                  <button type="button" onClick={() => openThread(c.number, c.name)}
                    className={`flex w-full items-center gap-4 border bg-linen-50 px-5 py-4 text-left transition-colors hover:bg-linen-100 ${c.awaiting ? "border-gold-500/70" : "border-gold-300/40"}`}>
                    {c.awaiting && <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-gold-500" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-[0.95rem] text-ink-800 ${c.awaiting ? "font-medium" : ""}`}>
                        {c.name ?? readable(c.number)}
                        {c.awaiting && <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-gold-600">à répondre</span>}
                      </p>
                      <p className="mt-0.5 truncate text-[0.82rem] text-ink-400">
                        {c.direction === "out" ? "Vous : " : ""}{c.excerpt}
                      </p>
                    </div>
                    <span className="hidden flex-none text-[0.78rem] text-ink-400 sm:block">{when(c.at, timezone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

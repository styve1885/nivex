"use client";

import { useState } from "react";
import { Reveal } from "../Reveal";
import { Photo } from "../Photo";
import { CheckIcon, ArrowIcon } from "../Icons";
import { EMAIL_RE, formatPhone } from "../booking/Stepper.helpers";
import type { Dict } from "@/lib/i18n";

type Field = "name" | "email" | "message";

export function Contact({ t, locale, businessEmail }: { t: Dict; locale: "fr" | "en"; businessEmail: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hp, setHp] = useState("");

  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    name: name.trim().length < 2 ? t.contact.errors.required : null,
    email: !EMAIL_RE.test(email.trim()) ? t.contact.errors.email : null,
    message: body.trim().length < 10 ? t.contact.errors.short : null,
  };
  const valid = !errors.name && !errors.email && !errors.message;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, message: true });
    if (!valid || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale, name: name.trim(), email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined, subject: subject.trim() || undefined,
          body: body.trim(), hp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(
          data.error === "rate_limited" ? t.contact.errors.rate
          : data.error === "unavailable" ? t.contact.errors.unavailable
          : t.contact.errors.generic,
        );
        return;
      }
      setSent(true);
    } catch {
      setError(t.contact.errors.generic);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setSent(false); setName(""); setEmail(""); setPhone(""); setSubject(""); setBody("");
    setTouched({}); setError(null);
  }

  return (
    <section id="contact" className="scroll-mt-24 bg-linen-50 py-28 sm:py-36">
      <div className="mx-auto max-w-5xl px-7 sm:px-10">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t.contact.eyebrow}</p>
          <h2 className="mt-5 font-display text-4xl font-light leading-tight text-ink-800 sm:text-5xl">
            {t.contact.title}
          </h2>
          <p className="mx-auto mt-6 text-[0.97rem] font-light leading-[1.95] text-ink-500">{t.contact.lede}</p>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-14">
          {/* ————— Formulaire ————— */}
          <Reveal>
            {sent ? (
              <div className="paper flex min-h-[26rem] flex-col items-center justify-center p-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold-400 text-gold-600">
                  <CheckIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-7 font-display text-2xl font-normal text-ink-800">{t.contact.successTitle}</h3>
                <p className="mx-auto mt-4 max-w-sm text-[0.92rem] font-light leading-[1.9] text-ink-500">
                  {t.contact.successBody}
                </p>
                <button type="button" onClick={reset}
                  className="mt-8 text-[11px] uppercase tracking-[0.18em] text-ink-500 underline decoration-gold-400 underline-offset-4 transition-colors hover:text-ink-900">
                  {t.contact.another}
                </button>
              </div>
            ) : (
              <form onSubmit={send} className="paper p-8 sm:p-10" noValidate>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="c-name" label={t.contact.name} value={name} onChange={setName}
                    autoComplete="name" error={touched.name ? errors.name : null}
                    onBlur={() => setTouched((x) => ({ ...x, name: true }))} />
                  <Field id="c-email" label={t.contact.email} value={email} onChange={setEmail}
                    type="email" autoComplete="email" error={touched.email ? errors.email : null}
                    onBlur={() => setTouched((x) => ({ ...x, email: true }))} />
                  <Field id="c-phone" label={t.contact.phone} value={phone}
                    onChange={(v) => setPhone(formatPhone(v))} type="tel" autoComplete="tel" />
                  <Field id="c-subject" label={t.contact.subject} value={subject} onChange={setSubject}
                    placeholder={t.contact.subjectPlaceholder} />
                </div>

                <div className="mt-5">
                  <label className="label" htmlFor="c-body">{t.contact.message}</label>
                  <textarea id="c-body" rows={6} value={body} maxLength={4000}
                    onChange={(e) => setBody(e.target.value)}
                    onBlur={() => setTouched((x) => ({ ...x, message: true }))}
                    placeholder={t.contact.messagePlaceholder}
                    aria-invalid={touched.message && errors.message ? "true" : undefined}
                    aria-describedby={touched.message && errors.message ? "c-body-err" : undefined}
                    className="field resize-y" />
                  {touched.message && errors.message && (
                    <p id="c-body-err" className="mt-1.5 text-[11px] text-[#8E332C]">{errors.message}</p>
                  )}
                </div>

                {/* pot de miel */}
                <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
                  tabIndex={-1} autoComplete="off" aria-hidden="true"
                  className="absolute h-0 w-0 overflow-hidden opacity-0" />

                {error && (
                  <p role="alert" className="mt-6 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3 text-[0.85rem] leading-relaxed text-[#8E332C]">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={sending} className="btn mt-8 w-full sm:w-auto">
                  {sending ? t.contact.submitting : t.contact.submit}
                  {!sending && <ArrowIcon />}
                </button>
              </form>
            )}
          </Reveal>

          {/* ————— Coordonnées directes ————— */}
          <Reveal delay={120} className="flex flex-col gap-8">
            <Photo
              src="/artisan/nivex-portrait-alt.jpg"
              alt={t.photos.portraitAlt}
              sizes="(min-width: 1024px) 22rem, 88vw"
            />
            <div className="flex flex-1 flex-col justify-center border border-gold-300/40 bg-linen-100 p-9">
              <p className="eyebrow">{t.contact.orCall}</p>

              <dl className="mt-8 space-y-7">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.contact.phoneLabel}</dt>
                  <dd className="mt-1.5">
                    <a href={t.brand.phoneHref}
                      className="font-display text-2xl text-ink-800 transition-colors hover:text-gold-700">
                      {t.brand.phone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.contact.emailLabel}</dt>
                  <dd className="mt-1.5">
                    <a href={`mailto:${businessEmail}`}
                      className="break-all text-[0.95rem] text-ink-700 transition-colors hover:text-gold-700">
                      {businessEmail}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.contact.hoursLabel}</dt>
                  <dd className="mt-1.5 text-[0.95rem] text-ink-700">{t.contact.hoursValue}</dd>
                </div>
              </dl>

              <div className="rule-diamond my-8" aria-hidden="true"><span className="text-[10px]">◆</span></div>

              <p className="text-[0.85rem] font-light leading-[1.9] text-ink-500">{t.brand.region}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Field({ id, label, value, onChange, error, onBlur, type = "text", placeholder, autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  error?: string | null; onBlur?: () => void; type?: string; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className="field" />
      {error && <p id={`${id}-err`} className="mt-1.5 text-[11px] text-[#8E332C]">{error}</p>}
    </div>
  );
}

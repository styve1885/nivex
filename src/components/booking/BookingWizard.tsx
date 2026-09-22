"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ServiceIcon, ArrowIcon, CheckIcon } from "../Icons";
import { FIRST_FREE_MIN_MINUTES } from "@/lib/brand";
import { Stepper } from "./Stepper";
import { EMAIL_RE, POSTAL_RE, formatPhone, isPhoneValid, normalisePostal } from "./Stepper.helpers";
import type { Dict } from "@/lib/i18n";

/* ============================ Types ============================ */

type Service = { key: string; icon: string; label: string; unit: string; minutesPerUnit: number };

export type WizardConfig = {
  locale: "fr" | "en";
  services: Service[];
  hourlyRate: number;
  currency: string;
  minMinutes: number;
  slotStep: number;
  firstHourFree: boolean;
  areaPrefixes: string[];
};

/* Le tunnel ne lit aucun agenda : il transmet un souhait, et c'est l'appel
   de l'artisan qui fixe l'heure. Ces clés sont celles que le serveur
   attend ; les libellés viennent du dictionnaire. */
const DAY_KEYS = ["weekday", "saturday", "sunday", "any"] as const;
const MOMENT_KEYS = ["morning", "afternoon", "evening"] as const;

type DayKey = (typeof DAY_KEYS)[number];
type MomentKey = (typeof MOMENT_KEYS)[number];

/* ============================ Composant ============================ */

export function BookingWizard({ t, config }: { t: Dict; config: WizardConfig }) {
  const [step, setStep] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [day, setDay] = useState<DayKey | "">("");
  const [moment, setMoment] = useState<MomentKey | "">("");
  const [altDay, setAltDay] = useState<DayKey | "">("");
  const [altMoment, setAltMoment] = useState<MomentKey | "">("");
  const [comment, setComment] = useState("");

  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; slot: string } | null>(null);

  const topRef = useRef<HTMLDivElement>(null);

  /* — Estimation locale : miroir du calcul serveur, qui fait foi — */
  const chosen = useMemo(
    () => config.services.map((s) => ({ ...s, qty: qty[s.key] ?? 0 })).filter((s) => s.qty > 0),
    [config.services, qty],
  );

  const duration = useMemo(() => {
    const raw = chosen.reduce((sum, s) => sum + s.minutesPerUnit * s.qty, 0);
    if (raw <= 0) return 0;
    return Math.max(config.minMinutes, Math.ceil(raw / config.slotStep) * config.slotStep);
  }, [chosen, config.minMinutes, config.slotStep]);

  /* L'offre ne joue qu'à partir de deux heures : le serveur applique la même
     règle, et les deux montants doivent concorder. */
  const firstFree = config.firstHourFree && duration >= FIRST_FREE_MIN_MINUTES;

  const estimate = useMemo(() => {
    const billable = firstFree ? Math.max(0, duration - 60) : duration;
    return Math.round((billable / 60) * config.hourlyRate);
  }, [duration, firstFree, config.hourlyRate]);

  const money = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(config.locale === "en" ? "en-CA" : "fr-CA", {
        style: "currency", currency: config.currency,
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100),
    [config.locale, config.currency],
  );

  const durationText = useMemo(() => {
    const h = Math.floor(duration / 60), m = duration % 60;
    if (config.locale === "en") return h && m ? `${h} h ${m} min` : h ? `${h} hour${h > 1 ? "s" : ""}` : `${m} min`;
    return h && m ? `${h} h ${m}` : h ? `${h} heure${h > 1 ? "s" : ""}` : `${m} min`;
  }, [duration, config.locale]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, done]);

  /* — Validation — */
  const inZone = postal.length >= 3 && config.areaPrefixes.includes(postal.replace(/\s/g, "").slice(0, 3).toUpperCase());
  const errors = {
    name: name.trim().length < 2 ? t.booking.errors.required : null,
    // Le courriel est facultatif : c'est le téléphone qui porte la confirmation.
    email: email.trim() && !EMAIL_RE.test(email.trim()) ? t.booking.errors.email : null,
    phone: !isPhoneValid(phone) ? t.booking.errors.phone : null,
    address: address.trim().length < 4 ? t.booking.errors.required : null,
    city: city.trim().length < 2 ? t.booking.errors.required : null,
    postal: !POSTAL_RE.test(postal.trim()) ? t.booking.errors.postal : null,
  };
  const step2Valid = Object.values(errors).every((e) => e === null);

  const canContinue =
    step === 0 ? duration > 0
      : step === 1 ? step2Valid
        : step === 2 ? Boolean(day && moment)
          : consent;

  /* Le deuxième choix est tout ou rien : un jour sans moment ne dit rien. */
  const altComplete = Boolean(altDay && altMoment);
  const slotText = (d: DayKey | "", m: MomentKey | "") =>
    d && m ? `${t.booking.step3.days[d]} · ${t.booking.step3.moments[m]}` : "—";

  /* — Envoi de la demande — */
  async function submit() {
    if (!day || !moment || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: config.locale,
          items: chosen.map((s) => ({ key: s.key, qty: s.qty })),
          name: name.trim(), email: email.trim().toLowerCase() || undefined, phone: phone.trim(),
          address: address.trim(), city: city.trim(), postalCode: postal.trim().toUpperCase(),
          notes: notes.trim() || undefined,
          day, moment,
          altDay: altComplete ? altDay : undefined,
          altMoment: altComplete ? altMoment : undefined,
          comment: comment.trim() || undefined,
          consent: true, hp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error === "unavailable" ? t.booking.errors.unavailable : t.booking.errors.generic);
        return;
      }
      setDone({ ref: data.ref, slot: data.slot ?? slotText(day, moment) });
    } catch {
      setError(t.booking.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  /* ============================ Succès ============================ */

  if (done) {
    return (
      <div ref={topRef} className="mx-auto max-w-2xl px-7 py-16 text-center sm:px-10">
        <div className="paper relative p-10 sm:p-14">
          <span aria-hidden="true" className="absolute inset-3 border border-gold-300/35" />
          <div className="relative">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold-400 text-gold-600">
              <CheckIcon className="h-7 w-7" />
            </span>
            <h1 className="mt-8 font-display text-4xl font-light text-ink-800">{t.booking.success.title}</h1>
            <p className="mx-auto mt-5 max-w-md text-[0.95rem] font-light leading-[1.9] text-ink-500">
              {t.booking.success.body}
            </p>

            <p className="mt-9 text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.booking.success.wanted}</p>
            <p className="mt-2 font-display text-2xl text-ink-800">{done.slot}</p>

            <p className="mt-9 text-[0.85rem] font-light text-ink-500">{t.booking.success.urgent}</p>
            <a href={t.brand.phoneHref} className="btn btn-gold mt-4">{t.brand.phone}</a>

            <div className="mx-auto mt-9 inline-flex items-center gap-3 border border-gold-300/60 px-5 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.booking.success.ref}</span>
              <code className="font-mono text-sm tracking-wider text-ink-800">{done.ref}</code>
            </div>

            <div className="mt-10">
              <Link href={`/${config.locale}`} className="btn btn-ghost w-full sm:w-auto">
                {t.booking.success.home}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============================ Tunnel ============================ */

  return (
    <div ref={topRef} className="mx-auto max-w-3xl px-7 py-16 sm:px-10 sm:py-20">
      <header className="text-center">
        <p className="eyebrow">{t.brand.tagline}</p>
        <h1 className="mt-4 font-display text-4xl font-light text-ink-800 sm:text-5xl">{t.booking.title}</h1>
        <p className="mx-auto mt-5 max-w-lg text-[0.93rem] font-light leading-[1.9] text-ink-500">{t.booking.lede}</p>
      </header>

      <div className="mt-12"><Stepper steps={t.booking.steps} current={step} /></div>

      <div className="paper mt-10 p-7 sm:p-10">
        {/* ————— Étape 1 : prestations ————— */}
        {step === 0 && (
          <section aria-labelledby="s1">
            <h2 id="s1" className="font-display text-2xl font-normal text-ink-800">{t.booking.step1.title}</h2>
            <p className="mt-2 text-[0.88rem] font-light text-ink-500">{t.booking.step1.hint}</p>

            <ul className="mt-8 space-y-px bg-gold-300/30">
              {config.services.map((s) => {
                const n = qty[s.key] ?? 0;
                return (
                  <li key={s.key}
                    className={`flex items-center gap-4 bg-linen-50 p-4 transition-colors duration-300 ${n > 0 ? "bg-linen-100" : ""}`}>
                    <ServiceIcon name={s.icon} className={`h-6 w-6 flex-none transition-colors ${n > 0 ? "text-gold-600" : "text-ink-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.95rem] text-ink-800">{s.label}</p>
                      <p className="text-[11px] text-ink-400">
                        ≈ {s.minutesPerUnit} min / {s.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="−"
                        onClick={() => setQty((q) => ({ ...q, [s.key]: Math.max(0, (q[s.key] ?? 0) - 1) }))}
                        disabled={n === 0}
                        className="flex h-9 w-9 items-center justify-center border border-gold-300/60 text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 disabled:opacity-30">
                        −
                      </button>
                      <input
                        type="number" min={0} max={200} value={n}
                        aria-label={`${s.label} — ${t.booking.step1.qty}`}
                        onChange={(e) => setQty((q) => ({ ...q, [s.key]: Math.max(0, Math.min(200, Number(e.target.value) || 0)) }))}
                        className="h-9 w-12 border-y border-gold-300/60 bg-linen-50 text-center text-sm tabular-nums text-ink-800 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button type="button" aria-label="+"
                        onClick={() => setQty((q) => ({ ...q, [s.key]: Math.min(200, (q[s.key] ?? 0) + 1) }))}
                        className="flex h-9 w-9 items-center justify-center border border-gold-300/60 text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900">
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8">
              <label className="label" htmlFor="notes">{t.booking.step1.notes}</label>
              <textarea id="notes" rows={3} value={notes} maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.booking.step1.notesPlaceholder} className="field resize-none" />
            </div>

            <EstimateBar
              t={t} visible={duration > 0} durationText={durationText}
              money={money(estimate)} firstFree={firstFree}
            />
            {duration === 0 && <p className="mt-6 text-center text-[0.85rem] text-ink-400">{t.booking.step1.empty}</p>}
          </section>
        )}

        {/* ————— Étape 2 : coordonnées ————— */}
        {step === 1 && (
          <section aria-labelledby="s2">
            <h2 id="s2" className="font-display text-2xl font-normal text-ink-800">{t.booking.step2.title}</h2>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Field label={t.booking.step2.name} value={name} onChange={setName} autoComplete="name"
                error={touched.name ? errors.name : null} onBlur={() => setTouched((x) => ({ ...x, name: true }))} />
              <Field label={t.booking.step2.email} value={email} onChange={setEmail} type="email" autoComplete="email"
                error={touched.email ? errors.email : null} onBlur={() => setTouched((x) => ({ ...x, email: true }))} />
              <Field label={t.booking.step2.phone} value={phone} onChange={(v) => setPhone(formatPhone(v))}
                type="tel" autoComplete="tel" placeholder="450 943-1217"
                error={touched.phone ? errors.phone : null} onBlur={() => setTouched((x) => ({ ...x, phone: true }))} />
              <Field label={t.booking.step2.city} value={city} onChange={setCity} autoComplete="address-level2"
                error={touched.city ? errors.city : null} onBlur={() => setTouched((x) => ({ ...x, city: true }))} />
              <div className="sm:col-span-2">
                <Field label={t.booking.step2.address} value={address} onChange={setAddress}
                  autoComplete="street-address" placeholder={t.booking.step2.addressPlaceholder}
                  error={touched.address ? errors.address : null} onBlur={() => setTouched((x) => ({ ...x, address: true }))} />
              </div>
              <Field label={t.booking.step2.postal} value={postal} onChange={(v) => setPostal(normalisePostal(v))}
                autoComplete="postal-code" placeholder={t.booking.step2.postalPlaceholder}
                error={touched.postal ? errors.postal : null} onBlur={() => setTouched((x) => ({ ...x, postal: true }))} />
            </div>

            {POSTAL_RE.test(postal.trim()) && (
              <p className={`mt-5 flex items-start gap-2 text-[0.85rem] leading-relaxed ${inZone ? "text-gold-700" : "text-ink-500"}`}>
                <span aria-hidden="true" className="mt-0.5">{inZone ? "◆" : "○"}</span>
                {inZone ? t.booking.step2.inZone : t.booking.step2.outOfZone}
              </p>
            )}

            {/* pot de miel */}
            <input type="text" name="company" value={hp} onChange={(e) => setHp(e.target.value)}
              tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="absolute h-0 w-0 overflow-hidden opacity-0" />
          </section>
        )}

        {/* ————— Étape 3 : demande de créneau ————— */}
        {step === 2 && (
          <section aria-labelledby="s3">
            <h2 id="s3" className="font-display text-2xl font-normal text-ink-800">{t.booking.step3.title}</h2>
            <p className="mt-2 text-[0.88rem] font-light leading-relaxed text-ink-500">{t.booking.step3.hint}</p>

            <Choice
              legend={t.booking.step3.day}
              options={DAY_KEYS.map((k) => ({ key: k, label: t.booking.step3.days[k] }))}
              value={day}
              onPick={(k) => setDay(k as DayKey)}
              className="mt-9"
            />

            <Choice
              legend={t.booking.step3.moment}
              options={MOMENT_KEYS.map((k) => ({ key: k, label: t.booking.step3.moments[k] }))}
              value={moment}
              onPick={(k) => setMoment(k as MomentKey)}
              className="mt-8"
            />

            <div className="mt-10 border-t border-gold-300/40 pt-8">
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold-600">{t.booking.step3.second}</p>
              <p className="mt-2 text-[0.85rem] font-light leading-relaxed text-ink-400">{t.booking.step3.secondHint}</p>

              <Choice
                legend={t.booking.step3.day}
                options={[
                  ...DAY_KEYS.map((k) => ({ key: k as string, label: t.booking.step3.days[k] })),
                  { key: "", label: t.booking.step3.none },
                ]}
                value={altDay}
                onPick={(k) => { setAltDay(k as DayKey | ""); if (!k) setAltMoment(""); }}
                className="mt-6"
              />

              {altDay && (
                <Choice
                  legend={t.booking.step3.moment}
                  options={MOMENT_KEYS.map((k) => ({ key: k as string, label: t.booking.step3.moments[k] }))}
                  value={altMoment}
                  onPick={(k) => setAltMoment(k as MomentKey)}
                  className="mt-7"
                />
              )}
            </div>

            <div className="mt-10 border-t border-gold-300/40 pt-8">
              <label className="label" htmlFor="comment">{t.booking.step3.comment}</label>
              <textarea id="comment" rows={3} value={comment} maxLength={1000}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t.booking.step3.commentPlaceholder} className="field resize-none" />
            </div>
          </section>
        )}

        {/* ————— Étape 4 : confirmation ————— */}
        {step === 3 && (
          <section aria-labelledby="s4">
            <h2 id="s4" className="font-display text-2xl font-normal text-ink-800">{t.booking.step4.title}</h2>

            <dl className="mt-8 divide-y divide-gold-300/40 border-y border-gold-300/40">
              <Row label={t.booking.step3.wanted} value={slotText(day, moment)}
                hint={altComplete ? `${t.booking.step3.second} — ${slotText(altDay, altMoment)}` : undefined} />
              <Row label={t.booking.step4.where} value={`${address}, ${city} ${postal}`} />
              <Row label={t.booking.step4.what} value={chosen.map((s) => `${s.label} × ${s.qty}`).join(" · ")} />
              <Row label={t.booking.step1.duration} value={durationText} />
              <Row label={t.booking.step4.who} value={[name, phone, email.trim()].filter(Boolean).join(" · ")} />
              {notes.trim() && <Row label={t.booking.step1.notes} value={notes.trim()} />}
              {comment.trim() && <Row label={t.booking.step3.comment} value={comment.trim()} />}
              <Row label={t.booking.step4.total} value={money(estimate)}
                hint={firstFree ? t.booking.step1.firstFreeApplied : undefined} />
            </dl>

            <label className="mt-8 flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 flex-none accent-[var(--color-gold-500)]" />
              <span className="text-[0.85rem] font-light leading-relaxed text-ink-500">{t.booking.step4.consent}</span>
            </label>

            {error && (
              <p role="alert" className="mt-6 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3 text-[0.85rem] text-[#8E332C]">
                {error}
              </p>
            )}
          </section>
        )}

        {/* ————— Navigation ————— */}
        <div className="mt-10 flex items-center justify-between gap-4 border-t border-gold-300/40 pt-7">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`text-[11px] uppercase tracking-[0.18em] text-ink-500 transition-colors hover:text-ink-900 ${step === 0 ? "invisible" : ""}`}>
            ← {t.booking.back}
          </button>

          {step < 3 ? (
            <button type="button" disabled={!canContinue}
              onClick={() => {
                if (step === 1) setTouched({ name: true, email: true, phone: true, address: true, city: true, postal: true });
                if (canContinue) setStep((s) => s + 1);
              }}
              className="btn">
              {t.booking.next}<ArrowIcon />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!consent || submitting} className="btn btn-gold">
              {submitting ? t.booking.step4.submitting : t.booking.step4.submit}
              {!submitting && <ArrowIcon />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ Sous-composants ============================ */

function EstimateBar({ t, visible, durationText, money, firstFree }: {
  t: Dict; visible: boolean; durationText: string; money: string; firstFree: boolean;
}) {
  return (
    <div className={`mt-8 grid transition-all duration-700 ${visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      style={{ transitionTimingFunction: "var(--ease-silk)" }}>
      <div className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border border-gold-400/60 bg-linen-50/70 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.booking.step1.duration}</p>
            <p className="mt-1 font-display text-xl text-ink-800">{durationText}</p>
          </div>
          <span aria-hidden="true" className="hidden h-9 w-px bg-gold-300 sm:block" />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.booking.step1.price}</p>
            <p className="mt-1 font-display text-xl text-ink-800">{money}</p>
            {firstFree && <p className="text-[10px] uppercase tracking-[0.14em] text-gold-600">{t.booking.step1.firstFreeApplied}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Un choix parmi quelques-uns, en boutons plutôt qu'en liste déroulante :
 * tout est visible d'un coup, et la cible reste large au pouce.
 */
function Choice({ legend, options, value, onPick, className = "" }: {
  legend: string;
  options: { key: string; label: string }[];
  value: string;
  onPick: (key: string) => void;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="label">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button key={o.key || "none"} type="button" onClick={() => onPick(o.key)} aria-pressed={active}
              className={`border px-4 py-2.5 text-[0.88rem] transition-all duration-300 ${
                active
                  ? "border-gold-500 bg-ink-800 text-linen-100"
                  : "border-gold-300/60 text-ink-700 hover:border-gold-500 hover:bg-linen-100"
              }`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Field({ label, value, onChange, error, onBlur, type = "text", placeholder, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; error?: string | null;
  onBlur?: () => void; type?: string; placeholder?: string; autoComplete?: string;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
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

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-400">{label}</dt>
      <dd className="text-[0.93rem] leading-relaxed text-ink-800">
        {value}
        {hint && <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em] text-gold-600">{hint}</span>}
      </dd>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ServiceIcon, ArrowIcon, CheckIcon } from "../Icons";
import { Mark } from "../Logo";
import { FIRST_FREE_MIN_MINUTES } from "@/lib/brand";
import { Stepper } from "./Stepper";
import { EMAIL_RE, POSTAL_RE, formatPhone, groupSlots, isPhoneValid, normalisePostal } from "./Stepper.helpers";
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
  timezone: string;
  areaPrefixes: string[];
  bookable: boolean;
  notConnectedReason: string | null;
};

type DaySlots = { date: string; weekday: number; open: boolean; slots: { time: string; iso: string }[] };
type AvailabilityResponse =
  | { available: true; timezone: string; duration: number; today: string; days: DaySlots[]; horizonDays: number }
  | { available: false; reason: string; timezone: string };

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

  const [avail, setAvail] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; manageToken: string; startsAt: string; estimateCents: number; firstHourFree: boolean } | null>(null);

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

  /* — Chargement des disponibilités — */
  const loadAvailability = useCallback(async (from?: string) => {
    if (duration <= 0) return;
    setLoadingSlots(true);
    try {
      const items = chosen.map((s) => `${s.key}:${s.qty}`).join(",");
      const p = new URLSearchParams({ items, days: "14" });
      if (from) p.set("from", from);
      const res = await fetch(`/api/availability?${p}`, { cache: "no-store" });
      const data: AvailabilityResponse = await res.json();
      setAvail(data);
      if (data.available) {
        setRangeStart(data.days[0]?.date ?? null);
        const firstOpen = data.days.find((d) => d.slots.length > 0);
        setSelectedDay((cur) => (cur && data.days.some((d) => d.date === cur && d.slots.length) ? cur : firstOpen?.date ?? null));
      }
    } catch {
      setAvail({ available: false, reason: "network", timezone: config.timezone });
    } finally {
      setLoadingSlots(false);
    }
  }, [chosen, duration, config.timezone]);

  useEffect(() => {
    if (step === 2) loadAvailability(rangeStart ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* Changer le panier change la durée : le créneau déjà retenu ne tient plus. */
  useEffect(() => {
    setSelectedSlot(null);
  }, [duration]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, done]);

  /* — Validation — */
  const inZone = postal.length >= 3 && config.areaPrefixes.includes(postal.replace(/\s/g, "").slice(0, 3).toUpperCase());
  const errors = {
    name: name.trim().length < 2 ? t.booking.errors.required : null,
    email: !EMAIL_RE.test(email.trim()) ? t.booking.errors.email : null,
    phone: !isPhoneValid(phone) ? t.booking.errors.phone : null,
    address: address.trim().length < 4 ? t.booking.errors.required : null,
    city: city.trim().length < 2 ? t.booking.errors.required : null,
    postal: !POSTAL_RE.test(postal.trim()) ? t.booking.errors.postal : null,
  };
  const step2Valid = Object.values(errors).every((e) => e === null);

  const canContinue = step === 0 ? duration > 0 : step === 1 ? step2Valid : step === 2 ? Boolean(selectedSlot) : consent;

  /* — Envoi — */
  async function submit() {
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: config.locale,
          items: chosen.map((s) => ({ key: s.key, qty: s.qty })),
          name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(),
          address: address.trim(), city: city.trim(), postalCode: postal.trim().toUpperCase(),
          notes: notes.trim() || undefined,
          startsAt: selectedSlot, consent: true, hp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === "slot_taken" || data.error === "invalid_slot") {
          setError(t.booking.errors.taken);
          setSelectedSlot(null);
          await loadAvailability(rangeStart ?? undefined);
          setStep(2);
        } else if (data.error === "not_connected" || data.error === "paused") {
          setError(t.booking.errors.notConnected);
        } else {
          setError(t.booking.errors.generic);
        }
        return;
      }
      setDone(data);
    } catch {
      setError(t.booking.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  /* ============================ Succès ============================ */

  if (done) {
    const when = new Intl.DateTimeFormat(config.locale === "en" ? "en-CA" : "fr-CA", {
      timeZone: config.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: config.locale === "en",
    }).format(new Date(done.startsAt));

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

            <p className="mt-9 font-display text-2xl text-ink-800">{when}</p>
            {done.firstHourFree && (
              <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-gold-600">
                {t.booking.step1.firstFreeApplied}
              </p>
            )}
            <p className="mt-2 text-sm text-ink-400">{money(done.estimateCents)}</p>

            <div className="mx-auto mt-9 inline-flex items-center gap-3 border border-gold-300/60 px-5 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{t.booking.success.ref}</span>
              <code className="font-mono text-sm tracking-wider text-ink-800">{done.ref}</code>
            </div>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href={`/${config.locale}/reservation/${done.manageToken}`} className="btn w-full sm:w-auto">
                {t.booking.success.manage}
              </Link>
              <Link href={`/${config.locale}`} className="btn btn-ghost w-full sm:w-auto">
                {t.booking.success.home}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============================ Service indisponible ============================ */

  if (!config.bookable) {
    return (
      <div className="mx-auto max-w-xl px-7 py-24 text-center sm:px-10">
        <Mark className="mx-auto h-14 w-auto" />
        <h1 className="mt-8 font-display text-3xl font-light text-ink-800">{t.booking.title}</h1>
        <p className="mx-auto mt-6 text-[0.95rem] font-light leading-[1.9] text-ink-500">
          {t.booking.errors.notConnected}
        </p>
        <a href={t.brand.phoneHref} className="btn mt-9">{t.brand.phone}</a>
      </div>
    );
  }

  /* ============================ Tunnel ============================ */

  const days = avail?.available ? avail.days : [];
  const activeDay = days.find((d) => d.date === selectedDay);
  const grouped = activeDay ? groupSlots(activeDay.slots) : { morning: [], afternoon: [], evening: [] };

  const dayLabel = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { wd: t.daysShort[wd], d: String(d), m: t.months[m - 1].slice(0, 3) };
  };

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

        {/* ————— Étape 3 : créneau ————— */}
        {step === 2 && (
          <section aria-labelledby="s3">
            <h2 id="s3" className="font-display text-2xl font-normal text-ink-800">{t.booking.step3.title}</h2>
            <p className="mt-2 text-[0.88rem] font-light text-ink-500">{t.booking.step3.hint}</p>

            {loadingSlots && (
              <p className="mt-12 text-center text-[0.9rem] text-ink-400" role="status">{t.booking.step3.loading}</p>
            )}

            {!loadingSlots && avail && !avail.available && (
              <p className="mt-12 text-center text-[0.9rem] text-ink-500">{t.booking.errors.notConnected}</p>
            )}

            {!loadingSlots && avail?.available && (
              <>
                <div className="mt-8 flex items-center gap-2">
                  <button type="button" aria-label="←"
                    onClick={() => { const d = shiftKey(days[0]?.date ?? "", -14); setRangeStart(d); loadAvailability(d); }}
                    disabled={days[0]?.date === avail.today}
                    className="h-9 w-9 flex-none border border-gold-300/60 text-ink-500 transition-colors hover:border-gold-500 disabled:opacity-25">
                    ‹
                  </button>

                  <ul className="flex flex-1 gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                    {days.map((d) => {
                      const has = d.slots.length > 0;
                      const active = d.date === selectedDay;
                      const l = dayLabel(d.date);
                      return (
                        <li key={d.date}>
                          <button type="button" disabled={!has}
                            onClick={() => { setSelectedDay(d.date); setSelectedSlot(null); }}
                            aria-pressed={active}
                            className={`flex h-[4.4rem] w-[3.4rem] flex-col items-center justify-center gap-0.5 border transition-all duration-300 ${
                              active ? "border-gold-500 bg-ink-800 text-linen-100"
                                : has ? "border-gold-300/60 text-ink-700 hover:border-gold-500"
                                      : "border-linen-300 text-ink-400/40"
                            }`}>
                            <span className="text-[9px] uppercase tracking-wider">{l.wd}</span>
                            <span className="font-display text-xl leading-none">{l.d}</span>
                            <span className="text-[9px] uppercase">{l.m}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <button type="button" aria-label="→"
                    onClick={() => { const d = shiftKey(days[0]?.date ?? "", 14); setRangeStart(d); loadAvailability(d); }}
                    className="h-9 w-9 flex-none border border-gold-300/60 text-ink-500 transition-colors hover:border-gold-500">
                    ›
                  </button>
                </div>

                {activeDay && activeDay.slots.length === 0 && (
                  <p className="mt-12 text-center text-[0.9rem] text-ink-400">{t.booking.step3.noSlots}</p>
                )}

                {activeDay && activeDay.slots.length > 0 && (
                  <div className="mt-9 space-y-7">
                    {([["morning", t.booking.step3.morning], ["afternoon", t.booking.step3.afternoon], ["evening", t.booking.step3.evening]] as const)
                      .filter(([k]) => grouped[k].length > 0)
                      .map(([k, label]) => (
                        <div key={k}>
                          <h3 className="text-[10px] uppercase tracking-[0.22em] text-gold-600">{label}</h3>
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {grouped[k].map((s) => (
                              <li key={s.iso}>
                                <button type="button" onClick={() => setSelectedSlot(s.iso)}
                                  aria-pressed={selectedSlot === s.iso}
                                  className={`min-w-[4.6rem] border px-4 py-2.5 text-sm tabular-nums transition-all duration-300 ${
                                    selectedSlot === s.iso
                                      ? "border-gold-500 bg-ink-800 text-linen-100"
                                      : "border-gold-300/60 text-ink-700 hover:border-gold-500 hover:bg-linen-100"
                                  }`}>
                                  {s.time}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}

                <p className="mt-9 border-t border-gold-300/40 pt-5 text-center text-[0.8rem] text-ink-400">
                  {t.booking.step1.duration} : {durationText}
                </p>
              </>
            )}
          </section>
        )}

        {/* ————— Étape 4 : confirmation ————— */}
        {step === 3 && (
          <section aria-labelledby="s4">
            <h2 id="s4" className="font-display text-2xl font-normal text-ink-800">{t.booking.step4.title}</h2>

            <dl className="mt-8 divide-y divide-gold-300/40 border-y border-gold-300/40">
              <Row label={t.booking.step4.when} value={
                selectedSlot
                  ? new Intl.DateTimeFormat(config.locale === "en" ? "en-CA" : "fr-CA", {
                      timeZone: config.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: config.locale === "en",
                    }).format(new Date(selectedSlot))
                  : "—"
              } />
              <Row label={t.booking.step4.where} value={`${address}, ${city} ${postal}`} />
              <Row label={t.booking.step4.what} value={chosen.map((s) => `${s.label} × ${s.qty}`).join(" · ")} />
              <Row label={t.booking.step1.duration} value={durationText} />
              <Row label={t.booking.step4.who} value={`${name} · ${phone} · ${email}`} />
              {notes.trim() && <Row label={t.booking.step1.notes} value={notes.trim()} />}
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

/** Décale une clé « AAAA-MM-JJ » de n jours. */
function shiftKey(key: string, days: number): string {
  if (!key) return key;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);
  if (t.getTime() < todayUTC) return key;
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

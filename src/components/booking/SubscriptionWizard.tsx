"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowIcon, CheckIcon } from "../Icons";
import { HEARD_FROM, type HeardFrom } from "@/lib/attribution";
import type { ZoneStatus } from "@/lib/travel";
import { readAttribution } from "../SiteMeasurement";
import { Stepper } from "./Stepper";
import { Field, Row, SlotPicker } from "./BookingWizard";
import { EMAIL_RE, POSTAL_RE, formatPhone, isPhoneValid, normalisePostal } from "./Stepper.helpers";
import type { Dict } from "@/lib/i18n";
import { slotPhrase } from "@/lib/email";

/* ============================ Types ============================ */

export type PlanOption = {
  key: string;
  name: string;
  detail: string;
  visits: number;
  minutesPerVisit: number;
  everyWeeks: number;
  rhythm: string;
  /** Montant d'un cycle, au taux du jour. Le serveur le recalcule et le fige. */
  cycleCents: number;
  fullCents: number;
};

export type SubscriptionConfig = {
  locale: "fr" | "en";
  plans: PlanOption[];
  currency: string;
  timezone: string;
  /** Réduction des abonnés sur les frais de route, par visite. */
  discountCents: number;
  seriesCycles: number;
  initialPlan: string | null;
};

type TravelAnswer = { status: ZoneStatus; labelFr: string | null; labelEn: string | null; feeCents: number };
type DaySlots = { date: string; weekday: number; open: boolean; slots: { time: string; iso: string }[] };
type Schedule = { today: string; days: DaySlots[] };
type Check = {
  key: string;
  free: boolean;
  starts: string[];
  conflicts: { startsAt: string; reason: "busy" | "closed" | "lead" | "invalid" }[];
  alternatives: string[];
} | { key: string; failed: true };

/* ============================ Composant ============================ */

/**
 * Le parcours d'abonnement.
 *
 * Le client choisit une seule fois : la formule, puis la date et l'heure de
 * la première visite — le jour de la semaine en découle. Avant de confirmer,
 * le serveur vérifie toutes les dates de la série ; en cas de conflit, la
 * page montre les dates en cause et d'autres créneaux qui tiennent.
 *
 * Comme pour une séance, le navigateur ne décide de rien : le montant et les
 * frais affichés sont une estimation, que la création recalcule et fige.
 */
export function SubscriptionWizard({ t, config }: { t: Dict; config: SubscriptionConfig }) {
  const s = t.subscribe;
  const [step, setStep] = useState(0);
  const [planKey, setPlanKey] = useState<string | null>(
    config.plans.some((p) => p.key === config.initialPlan) ? config.initialPlan : null,
  );
  const plan = config.plans.find((p) => p.key === planKey) ?? null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [notes, setNotes] = useState("");
  const [heardFrom, setHeardFrom] = useState<HeardFrom | "">("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [heldTravel, setHeldTravel] = useState<{ key: string; data: TravelAnswer | null } | null>(null);

  const [sched, setSched] = useState<Schedule | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [showDates, setShowDates] = useState(false);

  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; manageToken: string; first: string; emailSent: boolean } | null>(null);

  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, done]);

  const money = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(config.locale === "en" ? "en-CA" : "fr-CA", {
        style: "currency", currency: config.currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100),
    [config.locale, config.currency],
  );

  const durationText = useCallback((min: number) => {
    const h = Math.floor(min / 60), m = min % 60;
    if (config.locale === "en") return h && m ? `${h} h ${m} min` : `${h} hour${h > 1 ? "s" : ""}`;
    return h && m ? `${h} h ${m}` : `${h} heure${h > 1 ? "s" : ""}`;
  }, [config.locale]);

  const when = useCallback((iso: string, withTime = true) =>
    new Intl.DateTimeFormat(config.locale === "en" ? "en-CA" : "fr-CA", {
      timeZone: config.timezone, weekday: "long", day: "numeric", month: "long",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: config.locale === "en" } : { year: "numeric" }),
    }).format(new Date(iso)), [config.locale, config.timezone]);

  /* — La zone, pour la durée d'une visite de la formule — */
  const postalKey = POSTAL_RE.test(postal.trim()) ? postal.trim().toUpperCase() : "";
  const travelKey = postalKey && plan ? `${postalKey}|${plan.minutesPerVisit}` : "";
  const travel = travelKey && heldTravel?.key === travelKey ? heldTravel.data : null;
  const travelLoading = Boolean(travelKey) && heldTravel?.key !== travelKey;

  useEffect(() => {
    if (!travelKey || !plan) return;
    let abandonne = false;
    fetch(`/api/zone?postal=${encodeURIComponent(postalKey)}&minutes=${plan.minutesPerVisit}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!abandonne) setHeldTravel({ key: travelKey, data: d.ok ? d : null }); })
      .catch(() => { if (!abandonne) setHeldTravel({ key: travelKey, data: null }); });
    return () => { abandonne = true; };
  }, [travelKey, postalKey, plan]);

  const zoneFee = travel?.feeCents ?? 0;
  const feePerVisit = Math.max(0, zoneFee - config.discountCents);
  const cycleTravel = plan ? feePerVisit * plan.visits : 0;
  const cycleTotal = plan ? plan.cycleCents + cycleTravel : 0;
  const outOfZone = travel?.status === "out";
  const zoneLabel = travel ? (config.locale === "en" ? travel.labelEn : travel.labelFr) : null;

  const errors = {
    name: name.trim().length < 2 ? t.booking.errors.required : null,
    email: !EMAIL_RE.test(email.trim()) ? t.booking.errors.email : null,
    phone: !isPhoneValid(phone) ? t.booking.errors.phone : null,
    address: address.trim().length < 4 ? t.booking.errors.required : null,
    city: city.trim().length < 2 ? t.booking.errors.required : null,
    postal: !POSTAL_RE.test(postal.trim()) ? t.booking.errors.postal : null,
  };
  const step2Valid = Object.values(errors).every((e) => e === null) && !outOfZone && !travelLoading;

  /* — L'horaire, pour la durée d'une visite — */
  const loadSchedule = useCallback(async (from?: string) => {
    if (!plan) return;
    setLoadingSlots(true);
    try {
      const p = new URLSearchParams({ duration: String(plan.minutesPerVisit), days: "14" });
      if (from) p.set("from", from);
      const res = await fetch(`/api/schedule?${p}`, { cache: "no-store" });
      setSched(await res.json());
    } catch {
      setSched(null);
    } finally {
      setLoadingSlots(false);
    }
  }, [plan]);

  /* — La série entière, vérifiée par le serveur dès qu'une heure est choisie —
     La réponse porte l'étiquette de la demande : une réponse en retard, pour
     une heure qu'on a changée depuis, se reconnaît et se jette. */
  const checkKey = plan && slot ? `${plan.key}|${slot}` : "";
  const held = check && check.key === checkKey ? check : null;
  const checking = Boolean(checkKey) && !held;

  useEffect(() => {
    if (!checkKey || !plan || !slot) return;
    let abandonne = false;
    fetch("/api/subscriptions/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planKey: plan.key, startsAt: slot }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (abandonne) return;
        setCheck(d.ok ? { key: checkKey, free: d.free, starts: d.starts, conflicts: d.conflicts, alternatives: d.alternatives } : { key: checkKey, failed: true });
      })
      .catch(() => { if (!abandonne) setCheck({ key: checkKey, failed: true }); });
    return () => { abandonne = true; };
  }, [checkKey, plan, slot]);

  const seriesFree = Boolean(held && !("failed" in held) && held.free);

  const canContinue =
    step === 0 ? Boolean(plan)
      : step === 1 ? step2Valid
        : step === 2 ? seriesFree
          : consent;

  async function submit() {
    if (!plan || !slot || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: config.locale, planKey: plan.key, startsAt: slot,
          name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(),
          address: address.trim(), city: city.trim(), postalCode: postal.trim().toUpperCase(),
          notes: notes.trim() || undefined,
          consent: true, hp,
          heardFrom: heardFrom || undefined,
          attribution: readAttribution(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === "conflicts" || data.error === "slot_taken") {
          setError(s.errors.conflicts);
          setCheck(null);
          setSlot(null);
          await loadSchedule();
          setStep(2);
        } else if (data.error === "paused") {
          setError(t.booking.errors.paused);
        } else if (data.error === "out_of_area") {
          setError(t.booking.errors.outOfArea);
          setStep(1);
        } else {
          setError(data.error === "rate_limited" ? s.errors.tooMany : t.booking.errors.generic);
        }
        return;
      }
      setDone({ ref: data.ref, manageToken: data.manageToken, first: when(data.firstAt ?? slot), emailSent: data.emailSent === true });
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
            <h1 className="mt-8 font-display text-4xl font-light text-ink-800">{s.success.title}</h1>
            <p className="mx-auto mt-5 max-w-md text-[0.95rem] font-light leading-[1.9] text-ink-500">
              {done.emailSent ? s.success.body : s.success.bodyNoEmail}
            </p>
            <p className="mt-9 text-[10px] uppercase tracking-[0.2em] text-ink-400">{s.success.first}</p>
            <p className="mt-2 font-display text-2xl text-ink-800">{done.first}</p>
            <div className="mx-auto mt-9 inline-flex items-center gap-3 border border-gold-300/60 px-5 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-400">{s.success.ref}</span>
              <code className="font-mono text-sm tracking-wider text-ink-800">{done.ref}</code>
            </div>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href={`/${config.locale}/abonnement/${done.manageToken}`} className="btn w-full sm:w-auto">
                {s.success.manage}
              </Link>
              <Link href={`/${config.locale}`} className="btn btn-ghost w-full sm:w-auto">{t.booking.success.home}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============================ Parcours ============================ */

  const count = plan ? plan.visits * config.seriesCycles : 0;
  const lastStart = held && !("failed" in held) ? held.starts[held.starts.length - 1] : null;

  return (
    <div ref={topRef} className="mx-auto max-w-3xl px-7 py-16 sm:px-10 sm:py-20">
      <header className="text-center">
        <p className="eyebrow">{t.tarifs.plans.title}</p>
        <h1 className="mt-4 font-display text-4xl font-light text-ink-800 sm:text-5xl">{s.title}</h1>
        <p className="mx-auto mt-5 max-w-lg text-[0.93rem] font-light leading-[1.9] text-ink-500">{s.lede}</p>
      </header>

      <div className="mt-12"><Stepper steps={s.steps} current={step} /></div>

      <div className="paper mt-10 p-7 sm:p-10">
        {/* ————— Étape 1 : formule ————— */}
        {step === 0 && (
          <section aria-labelledby="a1">
            <h2 id="a1" className="font-display text-2xl font-normal text-ink-800">{s.plan.title}</h2>
            <p className="mt-2 text-[0.88rem] font-light leading-relaxed text-ink-500">{s.plan.hint}</p>
            <div role="radiogroup" aria-labelledby="a1" className="mt-8 grid gap-3 sm:grid-cols-2">
              {config.plans.map((p) => {
                const on = p.key === planKey;
                return (
                  <button key={p.key} type="button" role="radio" aria-checked={on}
                    onClick={() => { setPlanKey(p.key); setSlot(null); setCheck(null); setSched(null); }}
                    className={`flex flex-col gap-1.5 border p-5 text-left transition-colors duration-300 ${
                      on ? "border-gold-500 bg-linen-100" : "border-gold-300/60 bg-linen-50 hover:border-gold-500"
                    }`}>
                    <span className="font-display text-[1.15rem] text-ink-800">{p.name}</span>
                    <span className="text-[0.8rem] font-light leading-relaxed text-ink-500">{p.detail}</span>
                    <span className="mt-2 font-display text-[1.4rem] tabular-nums text-gold-700">
                      {money(p.cycleCents)}
                      <span className="ml-1.5 font-sans text-[0.72rem] font-light text-ink-400">{s.plan.perCycle}</span>
                    </span>
                    <span className="text-[0.72rem] font-light text-ink-400">
                      {s.plan.visits.replace("{n}", String(p.visits)).replace("{duration}", durationText(p.minutesPerVisit))} · {p.rhythm}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-[0.78rem] font-light text-ink-400">{s.plan.noFirstHour}</p>
          </section>
        )}

        {/* ————— Étape 2 : coordonnées et zone ————— */}
        {step === 1 && plan && (
          <section aria-labelledby="a2">
            <h2 id="a2" className="font-display text-2xl font-normal text-ink-800">{s.address.title}</h2>
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

            {postalKey && travelLoading && (
              <p role="status" className="mt-5 text-[0.85rem] font-light text-ink-400">{t.booking.step2.checking}</p>
            )}
            {!travelLoading && travel && (
              <div className="mt-5">
                {outOfZone ? (
                  <div role="status" className="border-l-2 border-gold-400 bg-linen-50 px-5 py-4 text-[0.85rem] font-light leading-[1.8] text-ink-600">
                    <p>{t.booking.step2.outOfZone}</p>
                    <a href={t.brand.phoneHref}
                      className="mt-3 inline-block text-[0.9rem] text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 hover:text-gold-600">
                      {t.brand.phone}
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2 text-[0.85rem] leading-relaxed text-gold-700">
                    <p className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-0.5">◆</span>
                      {zoneFee <= 0
                        ? t.booking.step2.travelFree
                        : feePerVisit > 0
                          ? s.address.travelReduced.replace("{fee}", money(feePerVisit)).replace("{full}", money(zoneFee))
                          : s.address.travelZero}
                    </p>
                    {cycleTravel > 0 && (
                      <p className="pl-5 font-light text-ink-500">{s.address.cycleTotal.replace("{total}", money(cycleTotal))}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8">
              <label className="label" htmlFor="sub-notes">{t.booking.step1.notes}</label>
              <textarea id="sub-notes" rows={3} value={notes} maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.booking.step1.notesPlaceholder} className="field resize-none" />
            </div>

            <div className="mt-8 border-t border-gold-300/40 pt-7">
              <label className="label" htmlFor="sub-heard">{t.booking.step2.heardFrom}</label>
              <select id="sub-heard" value={heardFrom} className="field"
                onChange={(e) => setHeardFrom(e.target.value as HeardFrom | "")}>
                <option value="">{t.booking.step2.heardFromEmpty}</option>
                {HEARD_FROM.map((k) => <option key={k} value={k}>{t.booking.step2.heardFromOptions[k]}</option>)}
              </select>
            </div>

            <input type="text" name="company" value={hp} onChange={(e) => setHp(e.target.value)}
              tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="absolute h-0 w-0 overflow-hidden opacity-0" />
          </section>
        )}

        {/* ————— Étape 3 : première visite ————— */}
        {step === 2 && plan && (
          <section aria-labelledby="a3">
            <h2 id="a3" className="font-display text-2xl font-normal text-ink-800">{s.slot.title}</h2>
            <p className="mt-2 text-[0.88rem] font-light leading-relaxed text-ink-500">{s.slot.hint.replace("{rhythm}", plan.rhythm)}</p>

            {loadingSlots && <p className="mt-12 text-center text-[0.9rem] text-ink-400" role="status">{t.booking.step3.loading}</p>}

            {!loadingSlots && sched && (
              <SlotPicker t={t} days={sched.days} today={sched.today} value={slot}
                onPick={(iso) => { setSlot(iso); setShowDates(false); setError(null); }}
                onShift={(d) => loadSchedule(d)} className="mt-8" />
            )}

            {checking && (
              <p role="status" className="mt-8 text-center text-[0.85rem] font-light text-ink-400">
                {s.slot.checking.replace("{n}", String(count))}
              </p>
            )}

            {held && "failed" in held && (
              <p role="alert" className="mt-8 text-center text-[0.85rem] text-[#8E332C]">{s.slot.failed}</p>
            )}

            {held && !("failed" in held) && held.free && (
              <div className="mt-8 border border-gold-400/60 bg-linen-50 px-5 py-4">
                <p className="flex items-start gap-2 text-[0.88rem] text-gold-700">
                  <span aria-hidden="true" className="mt-0.5">◆</span>
                  {s.slot.free.replace("{n}", String(held.starts.length))}
                </p>
                <button type="button" onClick={() => setShowDates((v) => !v)} aria-expanded={showDates}
                  className="mt-2 pl-5 text-[10px] uppercase tracking-[0.16em] text-ink-500 underline decoration-gold-300 underline-offset-4 hover:text-ink-800">
                  {showDates ? s.slot.hideDates : s.slot.showDates}
                </button>
                {showDates && (
                  <ol className="mt-3 grid gap-x-6 gap-y-1 pl-5 text-[0.8rem] font-light text-ink-600 sm:grid-cols-2">
                    {held.starts.map((iso) => <li key={iso}>{when(iso, false)}</li>)}
                  </ol>
                )}
              </div>
            )}

            {held && !("failed" in held) && !held.free && (
              <div role="status" className="mt-8 border-l-2 border-[#B4453C]/60 bg-linen-50 px-5 py-4">
                <p className="text-[0.88rem] text-ink-700">{s.slot.conflicts}</p>
                <ul className="mt-3 space-y-1 text-[0.82rem] font-light text-ink-600">
                  {held.conflicts.map((c) => (
                    <li key={c.startsAt}>{when(c.startsAt)} — <span className="text-[#8E332C]">{s.slot.reasons[c.reason]}</span></li>
                  ))}
                </ul>
                {held.alternatives.length > 0 ? (
                  <>
                    <p className="mt-5 text-[0.88rem] text-ink-700">{s.slot.alternatives}</p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {held.alternatives.map((iso) => (
                        <li key={iso}>
                          <button type="button" onClick={() => setSlot(iso)}
                            className="border border-gold-300/60 px-4 py-2.5 text-[0.82rem] text-ink-700 transition-colors hover:border-gold-500 hover:bg-linen-100">
                            {when(iso)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-5 text-[0.85rem] font-light text-ink-600">{s.slot.noAlternative}</p>
                )}
              </div>
            )}

            <p className="mx-auto mt-8 max-w-lg border-l-2 border-gold-400 pl-4 text-[0.84rem] font-light leading-[1.8] text-ink-600">
              {t.booking.step3.setup}
            </p>
            {error && (
              <p role="alert" className="mt-6 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3 text-[0.85rem] text-[#8E332C]">{error}</p>
            )}
          </section>
        )}

        {/* ————— Étape 4 : confirmation ————— */}
        {step === 3 && plan && slot && (
          <section aria-labelledby="a4">
            <h2 id="a4" className="font-display text-2xl font-normal text-ink-800">{s.confirm.title}</h2>
            <dl className="mt-8 divide-y divide-gold-300/40 border-y border-gold-300/40">
              <Row label={s.confirm.plan} value={`${plan.name} — ${s.plan.visits.replace("{n}", String(plan.visits)).replace("{duration}", durationText(plan.minutesPerVisit))}`} />
              <Row label={s.confirm.rhythm} value={`${slotPhrase(new Date(slot), config.timezone, config.locale)}, ${plan.rhythm}`} />
              <Row label={s.confirm.first} value={when(slot)} />
              {lastStart && (
                <Row label={s.confirm.series}
                  value={s.confirm.seriesValue.replace("{n}", String(count)).replace("{last}", when(lastStart, false))} />
              )}
              <Row label={t.booking.step4.where} value={`${address}, ${city} ${postal}`} />
              <Row label={t.booking.step4.who} value={[name, phone, email.trim()].filter(Boolean).join(" · ")} />
              {notes.trim() && <Row label={t.booking.step1.notes} value={notes.trim()} />}
              <Row label={s.confirm.cycle} value={money(plan.cycleCents)} />
              {cycleTravel > 0 && (
                <Row label={zoneLabel ? `${s.confirm.travel} (${zoneLabel})` : s.confirm.travel} value={money(cycleTravel)} />
              )}
              {cycleTravel > 0 && <Row label={s.confirm.total} value={money(cycleTotal)} />}
            </dl>
            <p className="mt-6 text-[0.84rem] font-light leading-[1.8] text-ink-600">{s.confirm.payment}</p>
            <p className="mt-3 text-[0.84rem] font-light leading-[1.8] text-ink-600">{s.confirm.rule}</p>

            <label className="mt-8 flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 flex-none accent-[var(--color-gold-500)]" />
              <span className="text-[0.85rem] font-light leading-relaxed text-ink-500">{s.confirm.consent}</span>
            </label>
            {error && (
              <p role="alert" className="mt-6 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3 text-[0.85rem] text-[#8E332C]">{error}</p>
            )}
          </section>
        )}

        {/* ————— Navigation ————— */}
        <div className="mt-10 flex items-center justify-between gap-4 border-t border-gold-300/40 pt-7">
          <button type="button" onClick={() => setStep((x) => Math.max(0, x - 1))}
            className={`text-[11px] uppercase tracking-[0.18em] text-ink-500 transition-colors hover:text-ink-900 ${step === 0 ? "invisible" : ""}`}>
            ← {t.booking.back}
          </button>
          {step < 3 ? (
            <button type="button" disabled={!canContinue}
              onClick={() => {
                if (step === 1) setTouched({ name: true, email: true, phone: true, address: true, city: true, postal: true });
                if (!canContinue) return;
                if (step === 1 && !sched) loadSchedule();
                setStep((x) => x + 1);
              }}
              className="btn">
              {t.booking.next}<ArrowIcon />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!consent || submitting} className="btn btn-gold">
              {submitting ? s.confirm.submitting : s.confirm.submit}
              {!submitting && <ArrowIcon />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


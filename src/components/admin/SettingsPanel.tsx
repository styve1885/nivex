"use client";

import { useState } from "react";
import { DEFAULT_SERVICES, type Settings, type DayHours, type ServiceItem } from "@/lib/settings";
import type { TravelPolicy } from "@/lib/travel";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function SettingsPanel({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((cur) => ({ ...cur, [key]: value }));
    setSaved(false);
  }

  function setDay(day: number, next: Partial<DayHours>) {
    patch("hours", s.hours.map((h) => (h.day === day ? { ...h, ...next } : h)));
  }

  function setService(key: string, next: Partial<ServiceItem>) {
    patch("services", s.services.map((x) => (x.key === key ? { ...x, ...next } : x)));
  }

  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  async function viderCache() {
    setClearing(true);
    setCleared(null);
    try {
      const res = await fetch("/api/admin/transit-cache", { method: "DELETE" });
      const d = await res.json();
      setCleared(d.ok ? Number(d.cleared ?? 0) : 0);
    } catch {
      setCleared(0);
    } finally {
      setClearing(false);
    }
  }

  function setPolicy(next: Partial<TravelPolicy>) {
    patch("travelPolicy", { ...s.travelPolicy, ...next });
  }

  /* Les trois seuils doivent rester dans l'ordre, sans quoi la règle devient
     incohérente sans que rien ne le signale : un trajet « gratuit » plus long
     que le maximum autorisé, ou une séance longue exigée en deçà du seuil de
     gratuité. On le dit plutôt que de laisser enregistrer une absurdité. */
  const policyIssue = (() => {
    const t = s.travelPolicy;
    if (t.freeUnderMinutes > t.minSessionOverMinutes) {
      return "Le seuil de gratuité dépasse celui de la séance longue : des trajets gratuits exigeraient une séance de trois heures.";
    }
    if (t.minSessionOverMinutes > t.maxMinutes) {
      return "Le seuil de séance longue dépasse le trajet maximum : il ne s'appliquerait jamais.";
    }
    if (t.freeUnderMinutes > t.maxMinutes) {
      return "Le seuil de gratuité dépasse le trajet maximum : plus personne ne paierait de frais.";
    }
    return null;
  })();

  /* Ce qui est enregistré ici sert à deux choses à la fois : calculer la
     durée d'une séance, et annoncer une cadence au client. Un écart avec
     les temps relevés au chronomètre se paie donc deux fois — en promesse
     intenable, et en heures travaillées gratuitement. On le montre. */
  const drift = DEFAULT_SERVICES
    .map((d) => ({ d, cur: s.services.find((x) => x.key === d.key) }))
    .filter(({ d, cur }) => cur && cur.minutesPerUnit !== d.minutesPerUnit)
    .map(({ d, cur }) => ({ key: d.key, fr: cur!.fr, from: cur!.minutesPerUnit, to: d.minutesPerUnit }));

  function adoptRecommended() {
    patch("services", s.services.map((x) => {
      const d = DEFAULT_SERVICES.find((y) => y.key === x.key);
      return d ? { ...x, minutesPerUnit: d.minutesPerUnit } : x;
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hourlyRate: s.hourlyRate, currency: s.currency, minMinutes: s.minMinutes,
          bufferMinutes: s.bufferMinutes, leadHours: s.leadHours, horizonDays: s.horizonDays,
          slotStep: s.slotStep, firstHourFree: s.firstHourFree, paused: s.paused,
          hours: s.hours, services: s.services, serviceArea: s.serviceArea,
          travelPolicy: s.travelPolicy,
          businessName: s.businessName, timezone: s.timezone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error === "invalid_input"
          ? "Certaines valeurs sont invalides — vérifiez les heures d'ouverture."
          : "L'enregistrement a échoué.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch {
      setError("L'enregistrement a échoué. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* — Pause — */}
      <Card title="Réservations en ligne"
        hint="Suspendez les réservations pendant vos vacances. Le site reste en ligne, seul le formulaire est désactivé.">
        <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
          <span className="text-[0.92rem] text-ink-700">
            {s.paused ? "Suspendues — les clients voient votre numéro de téléphone" : "Ouvertes — les clients peuvent réserver"}
          </span>
          <Toggle checked={!s.paused} onChange={(v) => patch("paused", !v)} />
        </label>
      </Card>

      {/* — Horaire — */}
      <Card title="Heures d'ouverture"
        hint="Les créneaux proposés aux clients ne sortent jamais de cette plage. Vos rendez-vous personnels dans Google Agenda bloquent le reste automatiquement.">
        <ul className="divide-y divide-gold-300/30">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const h = s.hours.find((x) => x.day === d)!;
            return (
              <li key={d} className="flex flex-wrap items-center gap-4 py-3.5">
                <Toggle checked={h.enabled} onChange={(v) => setDay(d, { enabled: v })} small />
                <span className={`w-24 text-[0.9rem] ${h.enabled ? "text-ink-800" : "text-ink-400"}`}>{DAYS[d]}</span>
                <div className={`flex items-center gap-2 transition-opacity ${h.enabled ? "" : "pointer-events-none opacity-30"}`}>
                  <input type="time" value={h.open} step={900} onChange={(e) => setDay(d, { open: e.target.value })}
                    className="field !w-auto !py-2 !px-3 text-sm tabular-nums" aria-label={`Ouverture ${DAYS[d]}`} />
                  <span className="text-ink-400">—</span>
                  <input type="time" value={h.close} step={900} onChange={(e) => setDay(d, { close: e.target.value })}
                    className="field !w-auto !py-2 !px-3 text-sm tabular-nums" aria-label={`Fermeture ${DAYS[d]}`} />
                </div>
                {h.enabled && h.open >= h.close && (
                  <span className="text-[11px] text-[#8E332C]">La fermeture doit suivre l&apos;ouverture</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* — Tarifs — */}
      <Card title="Tarification">
        <div className="grid gap-6 sm:grid-cols-2">
          <NumberField label="Taux horaire" suffix={s.currency}
            value={s.hourlyRate / 100} step={1} min={0} max={1000}
            onChange={(v) => patch("hourlyRate", Math.round(v * 100))} />
          <NumberField label="Durée minimale" suffix="minutes"
            value={s.minMinutes} step={15} min={15} max={720}
            onChange={(v) => patch("minMinutes", v)} />
        </div>
        <label className="mt-6 flex cursor-pointer items-center justify-between gap-6 border-t border-gold-300/30 pt-5">
          <span className="text-[0.92rem] text-ink-700">
            Offrir la première heure aux nouveaux clients
            <span className="mt-0.5 block text-[11px] text-ink-400">Appliqué automatiquement à la première réservation d&apos;une adresse courriel.</span>
          </span>
          <Toggle checked={s.firstHourFree} onChange={(v) => patch("firstHourFree", v)} />
        </label>
      </Card>

      {/* — Agenda — */}
      <Card title="Rythme de travail"
        hint="Ces réglages façonnent les créneaux proposés. Le tampon vous laisse le temps de vous déplacer entre deux clients.">
        <div className="grid gap-6 sm:grid-cols-2">
          <NumberField label="Tampon entre deux rendez-vous" suffix="minutes"
            value={s.bufferMinutes} step={15} min={0} max={240} onChange={(v) => patch("bufferMinutes", v)} />
          <NumberField label="Délai de prévenance" suffix="heures"
            value={s.leadHours} step={1} min={0} max={168} onChange={(v) => patch("leadHours", v)} />
          <NumberField label="Réservable jusqu'à" suffix="jours à l'avance"
            value={s.horizonDays} step={1} min={1} max={180} onChange={(v) => patch("horizonDays", v)} />
          <div>
            <label className="label" htmlFor="step">Pas des créneaux</label>
            <select id="step" value={s.slotStep} onChange={(e) => patch("slotStep", Number(e.target.value))} className="field">
              {[15, 20, 30, 60].map((n) => <option key={n} value={n}>{n} minutes</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* — Prestations — */}
      <Card title="Prestations et durées"
        hint="La durée par unité sert à estimer le temps d'une séance, et c'est elle qui donne la cadence annoncée sur le site. Ajustez-la selon votre rythme réel.">
        {drift.length > 0 && (
          <div className="mb-6 border border-gold-400/60 bg-linen-100 px-5 py-4">
            <p className="text-[0.88rem] text-ink-800">
              {drift.length === 1
                ? "Une durée s'écarte des temps relevés au chronomètre."
                : `${drift.length} durées s'écartent des temps relevés au chronomètre.`}
            </p>
            <ul className="mt-3 space-y-1 text-[0.82rem] text-ink-500">
              {drift.map((x) => (
                <li key={x.key} className="tabular-nums">
                  {x.fr} — <span className="text-[#8E332C]">{x.from} min</span> au lieu de {x.to} min
                </li>
              ))}
            </ul>
            <button type="button" onClick={adoptRecommended} className="btn mt-4 !py-2.5 !px-5 !text-[10px]">
              Adopter les temps relevés
            </button>
            <p className="mt-2 text-[11px] text-ink-400">
              Les valeurs sont reportées ci-dessous. Rien n&apos;est enregistré avant que vous ayez cliqué sur Enregistrer.
            </p>
          </div>
        )}
        <ul className="divide-y divide-gold-300/30">
          {s.services.map((x) => (
            <li key={x.key} className="flex flex-wrap items-center gap-4 py-3.5">
              <Toggle checked={x.enabled} onChange={(v) => setService(x.key, { enabled: v })} small />
              <input value={x.fr} onChange={(e) => setService(x.key, { fr: e.target.value })}
                className="field !w-auto min-w-[10rem] flex-1 !py-2 !px-3 text-sm" aria-label={`Nom français — ${x.key}`} />
              <input value={x.en} onChange={(e) => setService(x.key, { en: e.target.value })}
                className="field !w-auto min-w-[10rem] flex-1 !py-2 !px-3 text-sm text-ink-500" aria-label={`Nom anglais — ${x.key}`} />
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={600} value={x.minutesPerUnit}
                  onChange={(e) => setService(x.key, { minutesPerUnit: Math.max(1, Number(e.target.value) || 1) })}
                  className="field !w-20 !py-2 !px-3 text-center text-sm tabular-nums" aria-label={`Minutes par unité — ${x.key}`} />
                <span className="text-[11px] text-ink-400">min / {x.unitFr}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* — Zone desservie — */}
      <Card title="Zone desservie"
        hint="Les trois premiers caractères des codes postaux que vous couvrez. Hors zone, le client peut réserver mais il est prévenu.">
        <textarea rows={3}
          value={s.serviceArea.prefixes.join(", ")}
          onChange={(e) => patch("serviceArea", {
            ...s.serviceArea,
            prefixes: e.target.value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]\d[A-Z]$/.test(x)),
          })}
          className="field resize-none font-mono text-sm uppercase tracking-wider"
          aria-label="Préfixes de codes postaux" />
        <p className="mt-2 text-[11px] text-ink-400">{s.serviceArea.prefixes.length} préfixes reconnus · séparez par des virgules</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="areaFr">Description (français)</label>
            <input id="areaFr" value={s.serviceArea.labelFr}
              onChange={(e) => patch("serviceArea", { ...s.serviceArea, labelFr: e.target.value })} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="areaEn">Description (anglais)</label>
            <input id="areaEn" value={s.serviceArea.labelEn}
              onChange={(e) => patch("serviceArea", { ...s.serviceArea, labelEn: e.target.value })} className="field" />
          </div>
        </div>
      </Card>

      {/* — Déplacement — */}
      <Card title="Déplacement"
        hint="La règle porte sur le temps de trajet réel en transport en commun depuis votre adresse, mesuré pour le jour de la séance. Les frais s'ajoutent au prix et ne sont jamais réduits par la première heure offerte, abonnés compris.">

        <div className="flex items-center justify-between gap-5 border-b border-gold-300/40 pb-5">
          <div>
            <p className="text-[0.92rem] text-ink-800">Mesurer le temps de trajet</p>
            <p className="mt-1 text-[0.8rem] font-light leading-relaxed text-ink-400">
              Désactivé, aucun frais n&apos;est demandé et toute adresse est acceptée.
            </p>
          </div>
          <Toggle checked={s.travelPolicy.enabled}
            onChange={(v) => setPolicy({ enabled: v })} />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Minutes label="Gratuit en deçà de" id="tp-free" value={s.travelPolicy.freeUnderMinutes}
            onChange={(v) => setPolicy({ freeUnderMinutes: v })} />
          <Minutes label="Séance longue exigée au-delà de" id="tp-min" value={s.travelPolicy.minSessionOverMinutes}
            onChange={(v) => setPolicy({ minSessionOverMinutes: v })} />
          <Minutes label="Réservation fermée au-delà de" id="tp-max" value={s.travelPolicy.maxMinutes}
            onChange={(v) => setPolicy({ maxMinutes: v })} />
        </div>

        {policyIssue && (
          <p className="mt-5 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3 text-[0.82rem] leading-relaxed text-[#8E332C]">
            {policyIssue}
          </p>
        )}

        <div className="mt-7 grid gap-5 sm:grid-cols-3">
          <Minutes label="Ce qu'on appelle une séance longue" id="tp-long" value={s.travelPolicy.longSessionMinutes}
            onChange={(v) => setPolicy({ longSessionMinutes: v })} />
          <Fee label={`Séance de moins de ${fmtHours(s.travelPolicy.longSessionMinutes)}`} id="tp-short"
            cents={s.travelPolicy.feeShortCents} onChange={(c) => setPolicy({ feeShortCents: c })} />
          <Fee label={`Séance de ${fmtHours(s.travelPolicy.longSessionMinutes)} ou plus`} id="tp-longfee"
            cents={s.travelPolicy.feeLongCents} onChange={(c) => setPolicy({ feeLongCents: c })} />
        </div>

        <div className="mt-8 border-t border-gold-300/40 pt-6">
          <label className="label" htmlFor="tp-fallback">Liste de secours</label>
          <p className="mb-2 text-[0.8rem] font-light leading-relaxed text-ink-400">
            Quand l&apos;horaire de transport ne répond pas, seules ces adresses sont acceptées, sans frais, et la
            réservation vous est signalée comme « trajet non vérifié ». Gardez-la courte : une adresse qu&apos;on
            sait lointaine ne doit pas passer en aveugle.
          </p>
          <textarea id="tp-fallback" rows={3}
            value={s.travelPolicy.fallbackPrefixes.join(", ")}
            onChange={(e) => setPolicy({
              fallbackPrefixes: e.target.value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]\d[A-Z]$/.test(x)),
            })}
            className="field resize-none font-mono text-sm uppercase tracking-wider" />
          <p className="mt-1.5 text-[11px] text-ink-400">
            {s.travelPolicy.fallbackPrefixes.length} préfixes · séparez par des virgules
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-end gap-5 border-t border-gold-300/40 pt-6">
          <Minutes label="Garder une mesure (jours)" id="tp-cache" value={s.travelPolicy.cacheDays} unit="j"
            onChange={(v) => setPolicy({ cacheDays: v })} />
          <button type="button" onClick={viderCache} disabled={clearing}
            className="btn btn-ghost !py-2.5 !px-5 !text-[10px]">
            {clearing ? "Vidage…" : cleared != null ? `${cleared} mesures effacées` : "Vider les mesures en cache"}
          </button>
        </div>
        <p className="mt-2 text-[0.78rem] font-light leading-relaxed text-ink-400">
          Videz le cache si vous déménagez, ou si un horaire de transport a changé pour de bon.
        </p>
      </Card>

      {/* — Barre d'enregistrement — */}
      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-5 border-t border-gold-300/50 bg-linen-100/95 px-1 py-5 backdrop-blur">
        <p className="text-[0.82rem] text-ink-400">
          {error ? <span className="text-[#8E332C]">{error}</span>
            : saved ? <span className="text-gold-700">Enregistré. Le site est déjà à jour.</span>
            : "Les changements prennent effet immédiatement pour vos clients."}
        </p>
        <button onClick={save} disabled={saving} className="btn !py-3 !px-7 !text-[10px]">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

/* ————— Primitives ————— */

/** Les heures du seuil, écrites comme on les dit. */
function fmtHours(minutes: number): string {
  const h = minutes / 60;
  if (Number.isInteger(h)) return `${h} h`;
  return `${Math.floor(h)} h ${minutes % 60}`;
}

/**
 * Un montant, saisi en dollars et conservé en cents.
 *
 * Toute la maison compte en cents ; l'artisan, lui, pense en dollars. La
 * conversion vit ici, à la frontière, pour qu'aucun montant à virgule ne se
 * promène dans les réglages.
 */
function Fee({ label, id, cents, onChange }: {
  label: string; id: string; cents: number; onChange: (cents: number) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" min={0} max={500} step={1} value={Math.round(cents / 100)}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)) * 100)}
          className="field !w-24 text-center tabular-nums" />
        <span className="text-[11px] text-ink-400">$</span>
      </div>
    </div>
  );
}

/** Un nombre de minutes, borné pour qu'aucun réglage absurde ne s'enregistre. */
function Minutes({ label, id, value, onChange, unit = "min" }: {
  label: string; id: string; value: number; onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" min={1} max={600} step={5} value={value}
          onChange={(e) => onChange(Math.max(1, Math.min(600, Math.round(Number(e.target.value) || 1))))}
          className="field !w-24 text-center tabular-nums" />
        <span className="text-[11px] text-ink-400">{unit}</span>
      </div>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-gold-300/40 bg-linen-50 p-7">
      <h3 className="font-display text-xl font-normal text-ink-800">{title}</h3>
      {hint && <p className="mt-1.5 max-w-2xl text-[0.82rem] font-light leading-relaxed text-ink-400">{hint}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, small }: { checked: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative flex-none rounded-full border transition-colors duration-400 ${
        small ? "h-5 w-9" : "h-6 w-11"
      } ${checked ? "border-gold-500 bg-gold-500" : "border-gold-300 bg-linen-200"}`}>
      <span className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-400 ${
        small ? "h-3.5 w-3.5" : "h-4.5 w-4.5"
      } ${checked ? (small ? "left-[1.15rem]" : "left-[1.4rem]") : "left-[0.15rem]"}`}
        style={{ transitionTimingFunction: "var(--ease-silk)", height: small ? "0.875rem" : "1.125rem", width: small ? "0.875rem" : "1.125rem" }} />
    </button>
  );
}

function NumberField({ label, value, onChange, suffix, step = 1, min, max }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; step?: number; min?: number; max?: number;
}) {
  const id = `n-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-3">
        <input id={id} type="number" value={value} step={step} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="field !w-28 text-center tabular-nums" />
        {suffix && <span className="text-[0.82rem] text-ink-400">{suffix}</span>}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
/* Les prestations du code viennent d'un module sans dépendance : lues depuis
   `settings.ts`, elles emportaient le pilote de la base dans le navigateur. */
import { DEFAULT_SERVICES, type DayHours, type ServiceItem } from "@/lib/services";
import type { Settings } from "@/lib/settings";
import { ServiceIcon } from "../Icons";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/* Les pictogrammes disponibles pour une prestation : ceux que le site sait dessiner. */
const ICON_CHOICES = [
  { key: "shirt", label: "Chemise" },
  { key: "dress", label: "Robe" },
  { key: "suit", label: "Costume" },
  { key: "badge", label: "Pantalon" },
  { key: "linen", label: "Linge de maison" },
  { key: "clock", label: "Ensemble" },
];

/* Les prestations du code reviennent d'elles-mêmes si on les retire de la
   liste (mergeServices) : elles se désactivent plutôt. Celles ajoutées depuis
   cet écran, elles, peuvent se retirer pour de bon. */
const DEFAULT_KEYS = new Set(DEFAULT_SERVICES.map((d) => d.key));

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

  function addService() {
    const key = `p-${Date.now().toString(36)}`;
    patch("services", [...s.services, {
      key, icon: "shirt", fr: "", en: "", minutesPerUnit: 10, unitFr: "pièce", unitEn: "piece", enabled: true,
    }]);
  }

  function removeService(key: string) {
    patch("services", s.services.filter((x) => x.key !== key));
  }

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
    /* Une prestation sans nom ne peut pas s'afficher dans le tunnel. Le nom
       anglais et l'unité anglaise reprennent le français s'ils sont vides. */
    if (s.services.some((x) => !x.fr.trim())) {
      setError("Donnez un nom en français à chaque prestation avant d'enregistrer.");
      return;
    }
    const services = s.services.map((x) => ({
      ...x,
      fr: x.fr.trim(), en: x.en.trim() || x.fr.trim(),
      unitFr: x.unitFr.trim() || "pièce", unitEn: x.unitEn.trim() || x.unitFr.trim() || "piece",
    }));
    setS((cur) => ({ ...cur, services }));
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
          hours: s.hours, services,
          businessName: s.businessName, timezone: s.timezone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error === "invalid_input"
          ? "Certaines valeurs sont invalides — vérifiez les heures d'ouverture et les prestations."
          : data.error === "duplicate_service_key"
            ? "Deux prestations portent la même clé. Retirez la dernière ajoutée et recommencez."
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
            <li key={x.key} className="space-y-2.5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Toggle checked={x.enabled} onChange={(v) => setService(x.key, { enabled: v })} small />
                <ServiceIcon name={x.icon} className="h-5 w-5 flex-none text-gold-600" />
                <input value={x.fr} onChange={(e) => setService(x.key, { fr: e.target.value })} placeholder="Nom (français)"
                  className="field !w-auto min-w-[10rem] flex-1 !py-2 !px-3 text-sm" aria-label={`Nom français — ${x.key}`} />
                <input value={x.en} onChange={(e) => setService(x.key, { en: e.target.value })} placeholder="Nom (anglais)"
                  className="field !w-auto min-w-[10rem] flex-1 !py-2 !px-3 text-sm text-ink-500" aria-label={`Nom anglais — ${x.key}`} />
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:pl-[3.25rem]">
                <input type="number" min={1} max={600} value={x.minutesPerUnit}
                  onChange={(e) => setService(x.key, { minutesPerUnit: Math.max(1, Math.min(600, Number(e.target.value) || 1)) })}
                  className="field !w-20 !py-2 !px-3 text-center text-sm tabular-nums" aria-label={`Minutes par unité — ${x.key}`} />
                <span className="text-[11px] text-ink-400">min par</span>
                <input value={x.unitFr} onChange={(e) => setService(x.key, { unitFr: e.target.value })} placeholder="unité"
                  className="field !w-24 !py-2 !px-3 text-sm" aria-label={`Unité en français — ${x.key}`} />
                <input value={x.unitEn} onChange={(e) => setService(x.key, { unitEn: e.target.value })} placeholder="unit"
                  className="field !w-24 !py-2 !px-3 text-sm text-ink-500" aria-label={`Unité en anglais — ${x.key}`} />
                <select value={x.icon} onChange={(e) => setService(x.key, { icon: e.target.value })}
                  className="field !w-auto !py-2 !px-3 text-sm" aria-label={`Pictogramme — ${x.key}`}>
                  {ICON_CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                {!DEFAULT_KEYS.has(x.key) && (
                  <button type="button" onClick={() => removeService(x.key)}
                    className="text-[10px] uppercase tracking-[0.14em] text-ink-400 underline decoration-gold-300 underline-offset-4 hover:text-[#8E332C]">
                    Retirer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addService}
          className="mt-4 border border-gold-400/70 px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-gold-700 transition-colors hover:bg-linen-100">
          Ajouter une prestation
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          Une prestation ajoutée apparaît dans le formulaire de réservation et dans la cadence de la page Tarifs dès
          l&apos;enregistrement. Celles d&apos;origine ne se retirent pas : désactivez-les avec l&apos;interrupteur.
        </p>
      </Card>

      {/* Les zones, les secteurs et le texte de la zone desservie ont leur
          propre onglet, « Zones et frais ». */}
      <p className="text-[0.82rem] font-light leading-relaxed text-ink-400">
        Les secteurs desservis, les zones et les frais de déplacement se règlent dans l&apos;onglet « Zones et frais ».
      </p>

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

export function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-gold-300/40 bg-linen-50 p-7">
      <h3 className="font-display text-xl font-normal text-ink-800">{title}</h3>
      {hint && <p className="mt-1.5 max-w-2xl text-[0.82rem] font-light leading-relaxed text-ink-400">{hint}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Toggle({ checked, onChange, small }: { checked: boolean; onChange: (v: boolean) => void; small?: boolean }) {
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

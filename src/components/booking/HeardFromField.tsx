"use client";

import { HEARD_FROM, type HeardFrom } from "@/lib/attribution";
import type { Dict } from "@/lib/i18n";

/**
 * « Comment avez-vous connu NIVEX ? » — facultatif, et le seul endroit du
 * site où une visite à la porte peut se faire connaître quand la personne
 * tape l'adresse elle-même. Aucune mesure automatique ne la verra.
 *
 * La recommandation d'un proche ouvre un second champ, facultatif lui aussi,
 * pour le nom de cette personne.
 */
export function HeardFromField({
  t, id, value, onChange, referredBy, onReferredBy,
}: {
  t: Dict;
  id: string;
  value: HeardFrom | "";
  onChange: (v: HeardFrom | "") => void;
  referredBy: string;
  onReferredBy: (v: string) => void;
}) {
  const s = t.booking.step2;
  return (
    <div className="mt-8 border-t border-gold-300/40 pt-7">
      <label className="label" htmlFor={id}>{s.heardFrom}</label>
      <select id={id} value={value} className="field"
        onChange={(e) => onChange(e.target.value as HeardFrom | "")}>
        <option value="">{s.heardFromEmpty}</option>
        {HEARD_FROM.map((k) => <option key={k} value={k}>{s.heardFromOptions[k]}</option>)}
      </select>

      {value === "recommandation" && (
        <div className="mt-5">
          <label className="label" htmlFor={`${id}-who`}>{s.referredBy}</label>
          <input id={`${id}-who`} type="text" value={referredBy} maxLength={80} autoComplete="off"
            onChange={(e) => onReferredBy(e.target.value)} className="field" />
        </div>
      )}
    </div>
  );
}

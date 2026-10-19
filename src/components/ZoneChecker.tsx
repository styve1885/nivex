"use client";

import { useCallback, useState } from "react";
import { normalisePostal, POSTAL_RE } from "./booking/Stepper.helpers";
import type { Dict } from "@/lib/i18n";
import { thresholdText } from "@/lib/travel";

/**
 * Le vérificateur de code postal.
 *
 * Il répond à la seule question que se pose quelqu'un qui découvre le site :
 * est-ce que vous venez chez moi, et combien. Une liste de villes ne
 * répondait pas — on n'y trouve jamais la sienne, et celles qu'on y trouve
 * ne disent rien des frais.
 *
 * On ne connaît pas encore la durée : la réponse annonce donc les deux tarifs
 * de la zone, celui d'une séance courte d'abord, celui d'une longue séance
 * entre parenthèses, avec le seuil propre à la zone. Le tunnel de
 * réservation tranche ensuite selon la durée réelle.
 */

type Reponse = {
  status: "free" | "fee" | "out";
  zoneKey: string | null;
  labelFr: string | null;
  labelEn: string | null;
  feeCents: number;
  shortFeeCents: number;
  longFeeCents: number;
  thresholdMinutes: number;
  currency: string;
};

export function ZoneChecker({ t, locale, className = "" }: {
  // Les seules parties lues : le dictionnaire entier partirait dans la page.
  t: Pick<Dict, "brand" | "zoneCheck">; locale: "fr" | "en"; className?: string;
}) {
  const [postal, setPostal] = useState("");
  const [etat, setEtat] = useState<"vide" | "chargement" | "reponse" | "erreur">("vide");
  const [r, setR] = useState<Reponse | null>(null);

  const valide = POSTAL_RE.test(postal.trim());

  const money = useCallback((cents: number, devise: string) =>
    new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", {
      style: "currency", currency: devise,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100), [locale]);

  async function verifier(e: React.FormEvent) {
    e.preventDefault();
    if (!valide || etat === "chargement") return;
    setEtat("chargement");
    try {
      const res = await fetch(`/api/zone?postal=${encodeURIComponent(postal.trim())}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) { setEtat("erreur"); return; }
      setR(data);
      setEtat("reponse");
    } catch {
      setEtat("erreur");
    }
  }

  const z = t.zoneCheck;

  /* Trois réponses, pas une de plus : desservie sans frais, desservie avec
     les frais de la zone, ou hors zone. Une zone au tarif unique ne
     s'encombre pas d'une parenthèse qui répéterait le même montant. */
  function verdictText(v: Reponse): string {
    if (v.shortFeeCents === 0 && v.longFeeCents === 0) return z.served;
    if (v.shortFeeCents === v.longFeeCents) return z.servedWithFlatFee.replace("{fee}", money(v.shortFeeCents, v.currency));
    return z.servedWithFee
      .replace("{fee}", money(v.shortFeeCents, v.currency))
      .replace("{long}", money(v.longFeeCents, v.currency))
      .replace("{hours}", thresholdText(v.thresholdMinutes, locale));
  }

  return (
    <div className={className}>
      <form onSubmit={verifier} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[9rem] flex-1">
          <label className="label" htmlFor="zc">{z.label}</label>
          <input id="zc" value={postal} inputMode="text" autoComplete="postal-code"
            placeholder={z.placeholder} className="field !mt-0"
            onChange={(e) => { setPostal(normalisePostal(e.target.value)); setEtat("vide"); }} />
        </div>
        <button type="submit" disabled={!valide || etat === "chargement"}
          className="btn !py-3 !px-6 !text-[10px] disabled:opacity-40">
          {etat === "chargement" ? z.checking : z.check}
        </button>
      </form>

      {etat === "erreur" && (
        <p role="status" className="mt-4 text-[0.85rem] font-light leading-relaxed text-ink-500">
          {z.error}{" "}
          <a href={t.brand.phoneHref} className="text-gold-700 underline decoration-gold-400 underline-offset-4">
            {t.brand.phone}
          </a>
        </p>
      )}

      {etat === "reponse" && r && (
        <div role="status" aria-live="polite"
          className="mt-5 border-l-2 border-gold-400 bg-linen-50 px-5 py-4">
          <p className="text-[0.95rem] leading-snug text-ink-800">
            {r.status !== "out" && verdictText(r)}
            {r.status === "out" && (() => {
              /* Le numéro, au milieu de la phrase, se touche pour appeler. */
              const [avant, apres] = z.tooFar.split("{phone}");
              return (
                <>
                  {avant}
                  <a href={t.brand.phoneHref}
                    className="whitespace-nowrap text-gold-700 underline decoration-gold-400 decoration-1 underline-offset-4 transition-colors hover:text-gold-600">
                    {t.brand.phone}
                  </a>
                  {apres}
                </>
              );
            })()}
          </p>
        </div>
      )}
    </div>
  );
}

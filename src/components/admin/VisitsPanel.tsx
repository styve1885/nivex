"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isOptedOut, setOptedOut } from "../SiteMeasurement";
import { VISIT_RETENTION_MONTHS } from "@/lib/attribution";

/**
 * Le journal anonyme des visites.
 *
 * Ce que cet onglet ne pourra jamais montrer, et c'est voulu : qui est passé.
 * Aucune ligne ne porte d'identifiant, donc deux visites du même navigateur
 * s'y lisent comme deux inconnus. La ville est celle que le réseau laisse
 * deviner, à la ville près.
 */

type Visit = {
  id: string; path: string; source: string; referrer: string | null;
  device: string; city: string | null; region: string | null;
  country: string | null; locale: string | null; createdAt: string;
};

type Payload = {
  visits: Visit[];
  sources: { source: string; count: number }[];
  summary: { views: number; cities: number; firstSeen: string | null };
};

/* Le bouton de retrait et l'affichage qui le suit sont deux rendus du même
   marqueur. L'événement les tient d'accord, dans cet onglet comme dans les
   autres — `storage` ne se déclenche que pour les autres onglets. */
const OPT_OUT_EVENT = "nivex:optout";

function subscribeOptOut(onChange: () => void): () => void {
  window.addEventListener(OPT_OUT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPT_OUT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Les périodes proposées. `0` veut dire « tout ce qui reste ». */
const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 0, label: "Tout" },
] as const;

const DEVICES: Record<string, string> = {
  mobile: "Téléphone",
  tablette: "Tablette",
  ordinateur: "Ordinateur",
};

/* L'heure de Montréal, explicitement : le serveur de l'hébergeur vit en UTC,
   et une heure affichée sans fuseau se lit de travers une fois sur deux. */
const when = (iso: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

const VIDE: Payload = { visits: [], sources: [], summary: { views: 0, cities: 0, firstSeen: null } };

export function VisitsPanel() {
  const [days, setDays] = useState<number>(30);
  const [source, setSource] = useState<string>("");

  /* Ce qu'on affiche, avec l'étiquette du filtre qui l'a produit.
   *
   * Garder cette étiquette résout deux choses d'un coup. L'attente se déduit
   * — on attend tant que ce qu'on tient ne répond pas au filtre courant —,
   * sans drapeau à lever et à baisser. Et une réponse en retard, partie sous
   * un filtre qu'on a changé depuis, se reconnaît et se jette : sans cela,
   * cliquer vite sur « 7 jours » puis « Tout » pouvait laisser les sept
   * jours écraser le tout. */
  const [held, setHeld] = useState<{ key: string; data: Payload } | null>(null);

  const key = `${days}|${source}`;
  const loading = held?.key !== key;
  const data = held?.key === key ? held.data : null;

  useEffect(() => {
    let abandoned = false;
    const p = new URLSearchParams();
    if (days > 0) p.set("days", String(days));
    if (source) p.set("source", source);

    fetch(`/api/admin/visits?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => { if (!abandoned) setHeld({ key, data: json.ok ? json : VIDE }); })
      .catch(() => { if (!abandoned) setHeld({ key, data: VIDE }); });

    return () => { abandoned = true; };
  }, [key, days, source]);

  return (
    <div>
      <OptOutCard />

      <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-b border-gold-300/40 pb-6">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-400">Période</p>
            <div className="flex gap-1.5">
              {PERIODS.map((p) => (
                <button key={p.days} onClick={() => setDays(p.days)}
                  aria-pressed={days === p.days}
                  className={`border px-3 py-1.5 text-[11px] transition-colors ${
                    days === p.days
                      ? "border-gold-500 bg-linen-50 text-ink-800"
                      : "border-gold-300/50 text-ink-500 hover:border-gold-400 hover:text-ink-700"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="src" className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-ink-400">
              Source
            </label>
            <select id="src" value={source} onChange={(e) => setSource(e.target.value)}
              className="field !mt-0 !py-1.5 !text-[12px]">
              <option value="">Toutes les sources</option>
              {(data?.sources ?? []).map((s) => (
                <option key={s.source} value={s.source}>{s.source} ({s.count})</option>
              ))}
            </select>
          </div>
        </div>

        {data && (
          <p className="text-[0.82rem] text-ink-500">
            <span className="font-display text-2xl text-ink-800">{data.summary.views}</span>{" "}
            page{data.summary.views === 1 ? "" : "s"} vue{data.summary.views === 1 ? "" : "s"}
            {data.summary.cities > 0 && <> · {data.summary.cities} ville{data.summary.cities === 1 ? "" : "s"}</>}
          </p>
        )}
      </div>

      {loading && <p className="py-16 text-center text-[0.9rem] text-ink-400" role="status">Lecture du journal…</p>}

      {!loading && data && data.visits.length === 0 && (
        <p className="py-16 text-center text-[0.9rem] leading-relaxed text-ink-400">
          Aucune visite consignée sur cette période.
          {source && <> Essayez une autre source, ou une période plus large.</>}
        </p>
      )}

      {!loading && data && data.visits.length > 0 && (
        <>
          <ul className="mt-8 divide-y divide-gold-300/30">
            {data.visits.map((v) => (
              <li key={v.id} className="grid gap-1 py-3 sm:grid-cols-[8.5rem_1fr_auto] sm:items-baseline sm:gap-5">
                <span className="text-[0.78rem] tabular-nums text-ink-400">{when(v.createdAt)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[0.82rem] text-ink-800">{v.path}</span>
                  {v.referrer && (
                    <span className="mt-0.5 block truncate text-[0.72rem] text-ink-400" title={v.referrer}>
                      {v.referrer}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.76rem] text-ink-500 sm:justify-end">
                  <span className="text-gold-700">{v.source}</span>
                  <span className="text-ink-400">{DEVICES[v.device] ?? v.device}</span>
                  <span className="text-ink-400">{v.city ?? "ville inconnue"}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-10 border-t border-gold-300/40 pt-6 text-[0.78rem] font-light leading-[1.9] text-ink-400">
            Ce journal ne contient aucune adresse IP ni aucun identifiant de visiteur : deux visites du même
            navigateur y figurent comme deux inconnus. La ville est déduite du réseau par l&apos;hébergeur, à la
            ville près. Les entrées de plus de {VISIT_RETENTION_MONTHS} mois sont supprimées d&apos;elles-mêmes.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Le retrait du décompte, appareil par appareil.
 *
 * Le marqueur vit dans le navigateur, pas dans un réglage de l'entreprise :
 * l'artisan consulte son site depuis son téléphone et depuis son ordinateur,
 * et ce sont deux appareils à retirer séparément. Le bouton dit donc toujours
 * de quel appareil il parle.
 */
function OptOutCard() {
  /* Le marqueur vit dans `localStorage`, c'est-à-dire hors de React. On le
     lit donc comme ce qu'il est — un état extérieur — plutôt qu'en le
     recopiant dans un état local après le montage. `useSyncExternalStore`
     rend aussi la lecture serveur explicite : elle répond « compté », et
     l'hydratation corrige sans contradiction. Un autre onglet qui change le
     marqueur est entendu par l'événement `storage`. */
  const out = useSyncExternalStore(subscribeOptOut, isOptedOut, () => false);

  function toggle(next: boolean) {
    setOptedOut(next);
    window.dispatchEvent(new Event(OPT_OUT_EVENT));
  }

  return (
    <div className="border border-gold-300/50 bg-linen-50 px-6 py-5">
      <p className="text-[0.92rem] text-ink-800">
        {out ? "Cet appareil n'est pas compté." : "Cet appareil est compté."}
      </p>
      <p className="mt-1.5 text-[0.82rem] font-light leading-relaxed text-ink-500">
        {out
          ? "Vos passages sur le site ne sont plus envoyés, ni au journal ci-dessous, ni à la mesure de fréquentation de l'hébergeur. Le marqueur vit dans ce navigateur : un autre appareil se retire séparément."
          : "Vos propres passages sur le site gonflent la mesure. Retirez cet appareil du décompte pour ne compter que de vrais visiteurs. Les pages de cet espace, elles, ne sont jamais comptées."}
      </p>
      <button onClick={() => toggle(!out)} className="btn btn-ghost mt-5 !py-2.5 !px-5 !text-[10px]">
        {out ? "Compter de nouveau mes visites" : "Ne pas compter mes visites sur cet appareil"}
      </button>
    </div>
  );
}

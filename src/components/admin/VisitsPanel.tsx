"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isOptedOut, subscribeOptOut } from "../SiteMeasurement";
import {
  ROBOT_FR, SOURCE_GROUP_FR, VISIT_RETENTION_MONTHS,
  type RobotReason, type SourceGroup,
} from "@/lib/attribution";

/**
 * Le journal anonyme des visites.
 *
 * Ce que cet onglet ne pourra jamais montrer, et c'est voulu : qui est passé.
 * Aucune ligne ne porte d'identifiant, donc deux visites du même navigateur
 * s'y lisent comme deux inconnus. La ville est celle que le réseau laisse
 * deviner, à la ville près.
 */

type Visit = {
  id: string; path: string; group: SourceGroup; source: string;
  campaign: string | null; referral: string | null; referrer: string | null;
  device: string; city: string | null; region: string | null;
  country: string | null; locale: string | null;
  robot: RobotReason | null; createdAt: string;
};

type BilanRow = { group: SourceGroup; periods: { days: number; visits: number; bookings: number }[] };

type Payload = {
  visits: Visit[];
  groups: { group: SourceGroup; count: number }[];
  summary: { views: number; cities: number; robots: number };
  bilan: BilanRow[];
  optOutUrl: string | null;
};

type Robots = "hide" | "only" | "all";

/** Les périodes proposées. `0` veut dire « tout ce qui reste ». */
const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 0, label: "Tout" },
] as const;

const ROBOTS: { key: Robots; label: string }[] = [
  { key: "hide", label: "Exclus" },
  { key: "only", label: "Seulement" },
  { key: "all", label: "Inclus" },
];

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

const VIDE: Payload = {
  visits: [], groups: [], summary: { views: 0, cities: 0, robots: 0 }, bilan: [], optOutUrl: null,
};

/* Ce qui précise la famille d'une visite : le prénom de la recommandation,
   le domaine d'où elle vient quand il ne se confond pas avec la famille, et
   l'étiquette de campagne. */
function detail(v: Visit): string {
  const where = v.referral ?? (v.source !== "direct" && v.source !== v.group ? v.source : null);
  return [where, v.campaign].filter(Boolean).join(" · ");
}

export function VisitsPanel() {
  const [days, setDays] = useState<number>(30);
  const [group, setGroup] = useState<string>("");
  const [robots, setRobots] = useState<Robots>("hide");

  /* Ce qu'on affiche, avec l'étiquette du filtre qui l'a produit.
   *
   * Garder cette étiquette résout deux choses d'un coup. L'attente se déduit
   * — on attend tant que ce qu'on tient ne répond pas au filtre courant —,
   * sans drapeau à lever et à baisser. Et une réponse en retard, partie sous
   * un filtre qu'on a changé depuis, se reconnaît et se jette : sans cela,
   * cliquer vite sur « 7 jours » puis « Tout » pouvait laisser les sept
   * jours écraser le tout. */
  const [held, setHeld] = useState<{ key: string; data: Payload } | null>(null);

  /* Le bilan et le lien personnel ne dépendent d'aucun filtre : on garde la
     dernière version reçue, pour qu'ils ne clignent pas quand le filtre
     change. */
  const [steady, setSteady] = useState<Pick<Payload, "bilan" | "optOutUrl"> | null>(null);

  const key = `${days}|${group}|${robots}`;
  const loading = held?.key !== key;
  const data = held?.key === key ? held.data : null;

  useEffect(() => {
    let abandoned = false;
    const p = new URLSearchParams();
    if (days > 0) p.set("days", String(days));
    if (group) p.set("group", group);
    if (robots !== "hide") p.set("robots", robots);

    fetch(`/api/admin/visits?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (abandoned) return;
        const d: Payload = json.ok ? json : VIDE;
        setHeld({ key, data: d });
        if (json.ok) setSteady({ bilan: d.bilan, optOutUrl: d.optOutUrl });
      })
      .catch(() => { if (!abandoned) setHeld({ key, data: VIDE }); });

    return () => { abandoned = true; };
  }, [key, days, group, robots]);

  return (
    <div>
      <OwnVisits url={steady?.optOutUrl ?? null} ready={steady !== null} />

      {steady && steady.bilan.length > 0 && <Bilan rows={steady.bilan} />}

      <div className="mt-12 flex flex-wrap items-end justify-between gap-6 border-b border-gold-300/40 pb-6">
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
            <select id="src" value={group} onChange={(e) => setGroup(e.target.value)}
              className="field !mt-0 !py-1.5 !text-[12px]">
              <option value="">Toutes les sources</option>
              {(data?.groups ?? []).map((g) => (
                <option key={g.group} value={g.group}>{SOURCE_GROUP_FR[g.group]} ({g.count})</option>
              ))}
              {/* Le filtre choisi reste dans la liste même quand la période n'en compte plus. */}
              {group && data && !data.groups.some((g) => g.group === group) && (
                <option value={group}>{SOURCE_GROUP_FR[group as SourceGroup]} (0)</option>
              )}
            </select>
          </div>

          <div>
            <label htmlFor="bots" className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-ink-400">
              Robots
            </label>
            <select id="bots" value={robots} onChange={(e) => setRobots(e.target.value as Robots)}
              className="field !mt-0 !py-1.5 !text-[12px]">
              {ROBOTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        </div>

        {data && (
          <p className="text-[0.82rem] text-ink-500">
            <span className="font-display text-2xl text-ink-800">{data.summary.views}</span>{" "}
            page{data.summary.views === 1 ? "" : "s"} vue{data.summary.views === 1 ? "" : "s"}
            {data.summary.cities > 0 && <> · {data.summary.cities} ville{data.summary.cities === 1 ? "" : "s"}</>}
            {robots === "hide" && data.summary.robots > 0 && (
              <span className="block text-[0.74rem] text-ink-400 sm:text-right">
                {data.summary.robots} page{data.summary.robots === 1 ? "" : "s"} de robots écartée{data.summary.robots === 1 ? "" : "s"}
              </span>
            )}
          </p>
        )}
      </div>

      {loading && <p className="py-16 text-center text-[0.9rem] text-ink-400" role="status">Lecture du journal…</p>}

      {!loading && data && data.visits.length === 0 && (
        <p className="py-16 text-center text-[0.9rem] leading-relaxed text-ink-400">
          Aucune visite consignée sur cette période.
          {(group || robots !== "hide") && <> Essayez une autre source, ou une période plus large.</>}
        </p>
      )}

      {!loading && data && data.visits.length > 0 && (
        <ul className="mt-8 divide-y divide-gold-300/30">
          {data.visits.map((v) => {
            const more = detail(v);
            return (
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
                  <span className="text-gold-700">
                    {SOURCE_GROUP_FR[v.group]}
                    {more && <span className="text-ink-400"> · {more}</span>}
                  </span>
                  <span className="text-ink-400">{DEVICES[v.device] ?? v.device}</span>
                  <span className="text-ink-400">{v.city ?? "ville inconnue"}</span>
                  {v.robot && (
                    <span className="border border-gold-300/70 px-1.5 text-[0.68rem] text-ink-500">
                      robot · {ROBOT_FR[v.robot]}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && data && (
        <p className="mt-10 border-t border-gold-300/40 pt-6 text-[0.78rem] font-light leading-[1.9] text-ink-400">
          Ce journal ne contient aucune adresse IP ni aucun identifiant de visiteur : deux visites du même
          navigateur y figurent comme deux inconnus. La ville est déduite du réseau par l&apos;hébergeur, à la
          ville près. Une visite est marquée robot quand le navigateur se déclare robot, aperçu de lien ou
          navigateur sans écran, quand il est piloté par un programme, quand son horloge est celle d&apos;un
          serveur, ou quand elle arrive directement, sur ordinateur, d&apos;une ville américaine de centres de
          données ; ces indices sont lus puis oubliés. Les entrées de plus de {VISIT_RETENTION_MONTHS} mois
          sont supprimées d&apos;elles-mêmes.
        </p>
      )}
    </div>
  );
}

/**
 * Le bilan par source : les visites des humains et les réservations, sur
 * chaque période. C'est la question que le journal sert à trancher — quel
 * moyen de se faire connaître amène des clients.
 */
function Bilan({ rows }: { rows: BilanRow[] }) {
  const totals = rows[0].periods.map((_, i) => ({
    visits: rows.reduce((n, r) => n + r.periods[i].visits, 0),
    bookings: rows.reduce((n, r) => n + r.periods[i].bookings, 0),
  }));
  const heads = ["7 jours", "30 jours", "90 jours", "Depuis le début"];

  const cell = (v: number, b: number) => (
    <>
      <span className="block text-[0.95rem] text-ink-800">{v}</span>
      <span className={`block text-[0.72rem] ${b > 0 ? "text-gold-700" : "text-ink-400"}`}>{b} rés.</span>
    </>
  );

  return (
    <section className="mt-12" aria-labelledby="bilan">
      <h2 id="bilan" className="font-display text-2xl font-light text-ink-800">Bilan par source</h2>
      <p className="mt-1.5 text-[0.8rem] font-light leading-relaxed text-ink-500">
        Dans chaque case, les visites sans les robots, puis les réservations prises en ligne.
      </p>

      <table className="mt-5 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gold-300/50">
            <th scope="col" className="py-2 pr-2 text-[10px] font-normal uppercase tracking-[0.14em] text-ink-400">Source</th>
            {heads.map((h) => (
              <th key={h} scope="col" className="px-1 py-2 text-right align-bottom text-[10px] font-normal uppercase leading-snug tracking-[0.14em] text-ink-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gold-300/30">
          {rows.map((r) => (
            <tr key={r.group}>
              <th scope="row" className="py-2.5 pr-2 text-[0.84rem] font-normal text-ink-700">{SOURCE_GROUP_FR[r.group]}</th>
              {r.periods.map((p) => (
                <td key={p.days} className="px-1 py-2.5 text-right tabular-nums">{cell(p.visits, p.bookings)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gold-400/70">
            <th scope="row" className="py-2.5 pr-2 text-[0.84rem] font-normal text-ink-800">Total</th>
            {totals.map((t, i) => (
              <td key={i} className="px-1 py-2.5 text-right tabular-nums">{cell(t.visits, t.bookings)}</td>
            ))}
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-[0.74rem] font-light leading-relaxed text-ink-400">
        Une réservation compte une séance ponctuelle non annulée, ou un abonnement pris en ligne. Elle se range
        d&apos;abord au lien de recommandation suivi, puis à la réponse « Comment avez-vous connu NIVEX ? », puis
        à ce que le navigateur a relevé. « Depuis le début » remonte, pour les visites, aux {VISIT_RETENTION_MONTHS} derniers mois.
      </p>
    </section>
  );
}

/**
 * Les visites de l'artisan, qui ne se comptent jamais.
 *
 * Deux protections. Le serveur écarte toute visite qui porte la session de
 * l'artisan, sur n'importe quel appareil où il est connecté ; et chaque
 * navigateur où il ouvre cet espace reçoit le marqueur de retrait, que lit
 * aussi la mesure de l'hébergeur. Reste les navigateurs où il ne se connecte
 * jamais — ceux de Facebook et d'Instagram en tête : le lien personnel
 * s'ouvre une fois dans chacun.
 */
function OwnVisits({ url, ready }: { url: string | null; ready: boolean }) {
  /* Le marqueur vit dans `localStorage`, c'est-à-dire hors de React : on le
     lit comme un état extérieur. La lecture serveur répond « retiré », pour
     ne pas afficher d'alerte avant de savoir. */
  const out = useSyncExternalStore(subscribeOptOut, isOptedOut, () => true);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* le lien reste affiché, à sélectionner à la main */
    }
  }

  return (
    <div className="border border-gold-300/50 bg-linen-50 px-6 py-5">
      <p className="text-[0.92rem] text-ink-800">Vos propres visites ne sont pas comptées.</p>
      <p className="mt-1.5 text-[0.82rem] font-light leading-relaxed text-ink-500">
        Tant que vous êtes connecté à cet espace, vos passages sur le site ne sont comptés nulle part, quel que
        soit l&apos;appareil : ni dans ce journal, ni dans la mesure de fréquentation de l&apos;hébergeur. Ce
        navigateur-ci est retiré du décompte pour de bon.
      </p>
      {!out && (
        <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-700">
          Ce navigateur refuse pourtant de garder le marqueur, sans doute parce qu&apos;il est en navigation
          privée : hors de cet espace, il serait compté.
        </p>
      )}

      <p className="mt-5 text-[0.82rem] font-light leading-relaxed text-ink-500">
        Pour un navigateur où vous ne vous connectez pas — Safari ou Chrome sur un autre appareil, le navigateur
        intégré de Facebook ou d&apos;Instagram —, ouvrez-y une fois ce lien personnel. Pour ceux de Facebook et
        d&apos;Instagram, envoyez-le-vous en message, puis touchez-le depuis l&apos;application. Ne le partagez pas.
      </p>
      {ready && (url ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 basis-64 break-all border border-gold-300/50 bg-linen-100 px-3 py-2 font-mono text-[0.74rem] text-ink-700">
            {url}
          </code>
          <button onClick={copy} className="btn btn-ghost !py-2.5 !px-5 !text-[10px]">
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[0.82rem] text-ink-700">Lien indisponible : la variable SESSION_SECRET manque.</p>
      ))}
    </div>
  );
}

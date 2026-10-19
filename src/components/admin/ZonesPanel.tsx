"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  POLICY_LIMITS, PREFIX_RE, googleList, policyProblems, prefixUses, servedText, thresholdText,
  type Sector, type Zone, type ZonePolicy,
} from "@/lib/travel";
import { Card, Toggle } from "./SettingsPanel";
import { LoadFailure, loadErrorOf, type LoadError } from "./LoadFailure";
import { dollarsText, hoursText, parseDollars, parseHours } from "./inputs";
import { useReportUnsaved } from "./unsaved";

/*
 * L'onglet « Zones et frais ».
 *
 * Les secteurs sont ce que le client lit et ce que Google affiche ; les zones,
 * ce qu'il paie. Tout se règle ici et prend effet à l'enregistrement, sans
 * mise en production. Les contrôles affichés pendant la saisie sont ceux que
 * le serveur applique (`policyProblems`) : ce qui s'affiche en rouge ne
 * s'enregistrera pas.
 */

type HistoryEntry = { at: string; summary: string; author: string | null };
type Confirm = { kind: "sector" | "zone"; key: string } | null;
/** Les trois phrases de la zone desservie, passées par la page : le
    dictionnaire entier n'a rien à faire dans le JavaScript de l'espace artisan. */
type ZoneText = { served: string; montreal: string; none: string };

const RED = "text-[#8E332C]";

/* Une fiche d'établissement Google accepte vingt zones desservies au plus. */
const GOOGLE_AREAS = 20;

/* Après un choix dans une confirmation ou un déplacement, le focus va là où
   l'on reprend. Sans cela, il retombait en haut de la page, le bouton pressé
   ayant disparu ou s'étant désactivé sous le doigt. */
const refocus = (id: string) => document.getElementById(id)?.focus();

/** « J4K, j4l  J4M » → les préfixes valides, et ce qui ne l'est pas. */
function parsePrefixes(text: string): { valid: string[]; invalid: string[] } {
  const tokens = text.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  return {
    valid: [...new Set(tokens.filter((x) => PREFIX_RE.test(x)))],
    invalid: [...new Set(tokens.filter((x) => !PREFIX_RE.test(x)))],
  };
}

const prefixTexts = (p: ZonePolicy) => Object.fromEntries(p.sectors.map((s) => [s.key, s.prefixes.join(", ")]));
const dollars = (cents: number) => `${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2).replace(".", ",")} $`;
const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function feeSummary(z: Zone): string {
  if (z.shortFeeCents === 0 && z.longFeeCents === 0) return "sans frais";
  if (z.shortFeeCents === z.longFeeCents) return `${dollars(z.shortFeeCents)} par visite`;
  return `${dollars(z.shortFeeCents)} sous ${thresholdText(z.thresholdMinutes, "fr")}, ${dollars(z.longFeeCents)} à partir de ${thresholdText(z.thresholdMinutes, "fr")}`;
}

export function ZonesPanel({ initial, zoneText, onDirty }: {
  initial: ZonePolicy;
  zoneText: ZoneText;
  /** Prévenu quand des modifications attendent : le tableau de bord garde alors l'onglet en vie. */
  onDirty?: (dirty: boolean) => void;
}) {
  const [policy, setPolicy] = useState<ZonePolicy>(initial);
  const [saved, setSaved] = useState<ZonePolicy>(initial);
  const [texts, setTexts] = useState<Record<string, string>>(() => prefixTexts(initial));
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; lines?: string[] } | null>(null);
  const [copy, setCopy] = useState<{ text: string; done: boolean } | null>(null);
  const [read, setRead] = useState<"pending" | "ok" | LoadError>("pending");
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();

  /* La grille relue à l'ouverture de l'onglet, avec l'historique : la page a
     pu rester ouverte pendant qu'on enregistrait depuis le téléphone.
     Tant qu'elle n'est pas relue, rien ne s'enregistre : la copie reçue au
     chargement de la page peut dater d'avant un enregistrement, et l'écrire
     par-dessus le déferait. Une lecture manquée se dit, au lieu de laisser
     cette copie s'afficher comme « Tout est enregistré ». */
  useEffect(() => {
    let off = false;
    fetch("/api/admin/zones", { cache: "no-store" })
      .then(async (r) => ({ status: r.status, d: await r.json().catch(() => null) }))
      .then(({ status, d }) => {
        if (off) return;
        if (!d?.ok) { setRead(loadErrorOf(status)); return; }
        setPolicy(d.policy); setSaved(d.policy); setTexts(prefixTexts(d.policy)); setHistory(d.history);
        setRead("ok");
      })
      .catch(() => { if (!off) setRead("server"); });
    return () => { off = true; };
  }, [attempt]);

  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);
  useReportUnsaved(dirty, onDirty);
  const uses = useMemo(() => prefixUses(policy), [policy]);
  const problems = useMemo(() => policyProblems(policy), [policy]);
  const invalidTokens = policy.sectors.flatMap((s) => parsePrefixes(texts[s.key] ?? "").invalid);
  const zoneName = (key: string) => policy.zones.find((z) => z.key === key)?.nameFr ?? key;

  function change(next: ZonePolicy) {
    setPolicy(next);
    setMessage(null);
  }

  /* ————— Zones ————— */

  function setZone(key: string, next: Partial<Zone>) {
    change({ ...policy, zones: policy.zones.map((z) => (z.key === key ? { ...z, ...next } : z)) });
  }

  function addZone() {
    /* « Zone D » après A, B et C : la première lettre que personne ne porte.
       Le nom anglais reste vide, et suit donc le nom français, renommage
       compris. */
    const pris = new Set(policy.zones.map((z) => z.nameFr.trim().toUpperCase()));
    const lettre = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !pris.has(`ZONE ${l}`)) ?? "";
    change({
      ...policy,
      zones: [...policy.zones, {
        key: newKey("zone"), nameFr: `Zone ${lettre}`.trim(), nameEn: "",
        shortFeeCents: 0, longFeeCents: 0, thresholdMinutes: 180,
      }],
    });
  }

  function removeZone(key: string) {
    flushSync(() => {
      change({ ...policy, zones: policy.zones.filter((z) => z.key !== key) });
      setConfirm(null);
    });
    refocus("add-zone");
  }

  function keepZone(key: string) {
    flushSync(() => setConfirm(null));
    refocus(`del-zone-${key}`);
  }

  /* ————— Secteurs ————— */

  function setSector(key: string, next: Partial<Sector>) {
    change({ ...policy, sectors: policy.sectors.map((s) => (s.key === key ? { ...s, ...next } : s)) });
  }

  function setPrefixText(key: string, text: string) {
    setTexts((t) => ({ ...t, [key]: text }));
    setSector(key, { prefixes: parsePrefixes(text).valid });
  }

  /* Changer de zone range le secteur en fin de sa nouvelle zone, plutôt que
     de le glisser au milieu d'un ordre qu'on n'a pas choisi. */
  function moveToZone(key: string, zoneKey: string) {
    const s = policy.sectors.find((x) => x.key === key);
    if (!s) return;
    change({ ...policy, sectors: [...policy.sectors.filter((x) => x.key !== key), { ...s, zoneKey }] });
  }

  /** Monter ou descendre d'un rang, à l'intérieur de sa zone. */
  function shift(key: string, dir: -1 | 1) {
    const list = [...policy.sectors];
    const i = list.findIndex((x) => x.key === key);
    if (i < 0) return;
    let j = i + dir;
    while (j >= 0 && j < list.length && list[j].zoneKey !== list[i].zoneKey) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change({ ...policy, sectors: list });
  }

  function addSector(zoneKey: string) {
    const key = newKey("s");
    setTexts((t) => ({ ...t, [key]: "" }));
    change({ ...policy, sectors: [...policy.sectors, { key, nameFr: "", nameEn: "", prefixes: [], zoneKey, enabled: true }] });
  }

  function removeSector(key: string) {
    const zoneKey = policy.sectors.find((s) => s.key === key)?.zoneKey;
    flushSync(() => {
      change({ ...policy, sectors: policy.sectors.filter((s) => s.key !== key) });
      setConfirm(null);
    });
    refocus(`add-sector-${zoneKey}`);
  }

  function keepSector(key: string) {
    flushSync(() => setConfirm(null));
    refocus(`del-sector-${key}`);
  }

  /* ————— Copie pour Google ————— */

  async function copyForGoogle() {
    const text = googleList(policy);
    try {
      await navigator.clipboard.writeText(text);
      setCopy({ text, done: true });
    } catch {
      /* Presse-papiers refusé (navigateur ancien, page non sécurisée) : la
         liste s'affiche, prête à sélectionner à la main. */
      setCopy({ text, done: false });
    }
  }

  /* ————— Enregistrement ————— */

  async function save() {
    if (read !== "ok") return;
    if (invalidTokens.length || problems.length) {
      setMessage({ tone: "error", text: "Corrigez les points signalés en rouge avant d'enregistrer." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/zones", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        /* Un refus dit pourquoi : la session expirée et la panne du serveur ne
           se lisent pas comme une grille fautive. */
        setMessage(res.status === 401
          ? { tone: "error", text: "Votre session a expiré. Reconnectez-vous dans un autre onglet, puis enregistrez de nouveau ici : vos modifications restent dans celui-ci." }
          : data?.problems?.length
            ? { tone: "error", text: "L'enregistrement a été refusé.", lines: data.problems }
            : { tone: "error", text: "Le serveur n'a pas pu enregistrer la grille. Réessayez dans un instant." });
        return;
      }
      setPolicy(data.policy); setSaved(data.policy); setTexts(prefixTexts(data.policy)); setHistory(data.history);
      /* Le tableau de bord relit ses réglages : un onglet rouvert repart de la
         grille enregistrée, pas de celle du chargement de la page. */
      router.refresh();
      setMessage({
        tone: "ok",
        text: data.changes.length
          ? `Enregistré. Le site est déjà à jour (${data.changes.length} changement${data.changes.length > 1 ? "s" : ""}).`
          : "Enregistré. Rien n'avait changé.",
      });
    } catch {
      setMessage({ tone: "error", text: "L'enregistrement a échoué. Vérifiez votre connexion." });
    } finally {
      setSaving(false);
    }
  }

  /* L'historique, regroupé par enregistrement : les lignes d'un même
     enregistrement portent la même heure. */
  const historyGroups = useMemo(() => {
    const out: { at: string; author: string | null; lines: string[] }[] = [];
    for (const h of history ?? []) {
      const last = out[out.length - 1];
      if (last && last.at === h.at) last.lines.push(h.summary);
      else out.push({ at: h.at, author: h.author, lines: [h.summary] });
    }
    for (const g of out) g.lines.reverse();
    return out;
  }, [history]);

  const when = (iso: string) => new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

  const activeCount = policy.sectors.filter((s) => s.enabled && policy.zones.some((z) => z.key === s.zoneKey)).length;

  /* Au-delà de vingt lignes, la fiche Google refuse les dernières : la liste
     et la fiche ne disent plus la même chose, et l'artisan doit le savoir. */
  const copied = copy ? copy.text.split("\n").filter(Boolean) : [];
  const beyond = copied.slice(GOOGLE_AREAS);

  return (
    <div className="space-y-10">
      {read === "session" && (
        <LoadFailure error="session" className="border border-[#B4453C]/40 bg-[#B4453C]/5 px-5 py-4" />
      )}
      {read === "server" && (
        <div role="alert" className="border border-[#B4453C]/40 bg-[#B4453C]/5 px-5 py-4 text-[0.85rem] leading-relaxed text-[#8E332C]">
          <p>
            La grille enregistrée n&apos;a pas pu être relue. Ce qui s&apos;affiche date du chargement de la page,
            et rien ne s&apos;enregistrera tant qu&apos;elle n&apos;aura pas été relue.
          </p>
          <button type="button" onClick={() => { setRead("pending"); setAttempt((n) => n + 1); }}
            className="mt-2 underline underline-offset-4">
            Relire la grille
          </button>
        </div>
      )}

      {/* — Résumé et copie pour Google — */}
      <Card title="Secteurs desservis"
        hint="Un code postal est reconnu à ses trois premiers caractères. Hors de tout secteur actif, la réservation en ligne est impossible et le client est invité à appeler. Les frais s'ajoutent au prix de chaque visite, abonnés compris, et ne sont jamais réduits par la première heure offerte.">
        <p className="text-[0.88rem] leading-relaxed text-ink-600">
          {activeCount} secteur{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}, répartis en {policy.zones.length} zone{policy.zones.length > 1 ? "s" : ""}.
        </p>
        <p className="mt-3 border-l-2 border-gold-400 bg-linen-100 px-4 py-3 text-[0.82rem] font-light leading-relaxed text-ink-500">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-ink-400">Texte affiché sur le site</span>
          {servedText(policy, "fr", zoneText)}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={copyForGoogle} className="btn !py-2.5 !px-5 !text-[10px]">
            Copier la liste pour Google
          </button>
          {copy?.done && (
            <span role="status" className="text-[0.8rem] text-gold-700">
              {copied.length} secteurs copiés, un par ligne{dirty ? " (y compris les changements non enregistrés)" : ""}.
            </span>
          )}
        </div>
        {beyond.length > 0 && (
          <p className={`mt-3 text-[0.8rem] leading-relaxed ${RED}`}>
            Une fiche Google accepte {GOOGLE_AREAS} zones desservies au plus :{" "}
            {beyond.length === 1
              ? `la dernière ligne (${beyond[0]}) ne pourra pas y être ajoutée ; le site, lui, continue de desservir ce secteur.`
              : `les ${beyond.length} dernières lignes (${beyond.join(", ")}) ne pourront pas y être ajoutées ; le site, lui, continue de desservir ces secteurs.`}
          </p>
        )}
        {copy && !copy.done && (
          <div className="mt-4">
            <p className="text-[0.8rem] text-ink-500">Le navigateur a refusé la copie. Sélectionnez la liste et copiez-la à la main :</p>
            <textarea readOnly rows={Math.min(12, copy.text.split("\n").length)} value={copy.text}
              onFocus={(e) => e.currentTarget.select()}
              className="field mt-2 resize-none text-sm" aria-label="Liste des secteurs pour Google" />
          </div>
        )}
      </Card>

      {/* — Zones — */}
      <Card title="Zones et tarifs"
        hint="Chaque zone a ses deux tarifs et son seuil. Le seuil est atteint, non dépassé : une séance de 3 h tout rond paie déjà le tarif réduit si le seuil est de 3 h.">
        <ul className="space-y-5">
          {policy.zones.map((z) => {
            const count = policy.sectors.filter((s) => s.zoneKey === z.key).length;
            return (
              <li key={z.key} className="border border-gold-300/50 bg-linen-100/60 p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`zfr-${z.key}`}>Nom (français)</label>
                    <input id={`zfr-${z.key}`} value={z.nameFr} maxLength={POLICY_LIMITS.nameLength}
                      onChange={(e) => setZone(z.key, { nameFr: e.target.value })} className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`zen-${z.key}`}>Nom (anglais)</label>
                    <input id={`zen-${z.key}`} value={z.nameEn} placeholder={z.nameFr} maxLength={POLICY_LIMITS.nameLength}
                      onChange={(e) => setZone(z.key, { nameEn: e.target.value })} className="field" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Amount id={`zs-${z.key}`} label={`Sous ${thresholdText(z.thresholdMinutes, "fr")}`} unit="$"
                    value={z.shortFeeCents} format={dollarsText} parse={parseDollars}
                    invalid="Montant illisible : tapez par exemple 15 ou 12,50."
                    onChange={(c) => setZone(z.key, { shortFeeCents: c })} />
                  <Amount id={`zl-${z.key}`} label={`${thresholdText(z.thresholdMinutes, "fr")} ou plus`} unit="$"
                    value={z.longFeeCents} format={dollarsText} parse={parseDollars}
                    invalid="Montant illisible : tapez par exemple 15 ou 12,50."
                    onChange={(c) => setZone(z.key, { longFeeCents: c })} />
                  <div className="col-span-2 sm:col-span-1">
                    <Amount id={`zt-${z.key}`} label="Seuil" unit="heures"
                      value={z.thresholdMinutes} format={hoursText} parse={parseHours}
                      invalid="Durée illisible : tapez par exemple 3, 2,5 ou 2 h 30."
                      onChange={(m) => setZone(z.key, { thresholdMinutes: m })} />
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-ink-400">
                  {count} secteur{count > 1 ? "s" : ""} · {feeSummary(z)}
                </p>

                {confirm?.kind === "zone" && confirm.key === z.key ? (
                  <ConfirmBox text={`Supprimer « ${z.nameFr || "cette zone"} » ? Elle disparaît à l'enregistrement.`}
                    onYes={() => removeZone(z.key)} onNo={() => keepZone(z.key)} />
                ) : count === 0 ? (
                  <button type="button" id={`del-zone-${z.key}`} onClick={() => setConfirm({ kind: "zone", key: z.key })}
                    className="mt-3 text-[10px] uppercase tracking-[0.16em] text-ink-400 transition-colors hover:text-[#8E332C]">
                    Supprimer cette zone
                  </button>
                ) : (
                  <p className="mt-3 text-[11px] text-ink-400">Pour supprimer cette zone, déplacez ou supprimez d&apos;abord ses secteurs.</p>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" id="add-zone" onClick={addZone}
          className="mt-5 border border-gold-400/70 px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-gold-700 transition-colors hover:bg-linen-100">
          Créer une zone
        </button>
      </Card>

      {/* — Secteurs, regroupés par zone — */}
      <Card title="Secteurs"
        hint="Les préfixes : trois caractères, lettre, chiffre, lettre (J4K), séparés par des virgules. Un préfixe peut servir à deux secteurs de la même zone, jamais à deux zones.">
        <div className="space-y-10">
          {policy.zones.map((z) => {
            const list = policy.sectors.filter((s) => s.zoneKey === z.key);
            return (
              <section key={z.key} aria-label={z.nameFr}>
                <h4 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gold-300/50 pb-2">
                  <span className="font-display text-lg text-ink-800">{z.nameFr || "Zone sans nom"}</span>
                  <span className="text-[11px] text-ink-400">{feeSummary(z)}</span>
                </h4>
                <ul className="mt-4 space-y-4">
                  {list.map((s, i) => (
                    <SectorRow key={s.key} s={s} zones={policy.zones}
                      text={texts[s.key] ?? s.prefixes.join(", ")}
                      first={i === 0} last={i === list.length - 1}
                      alerts={sectorAlerts(s, uses, policy, zoneName, parsePrefixes(texts[s.key] ?? "").invalid)}
                      confirming={confirm?.kind === "sector" && confirm.key === s.key}
                      onChange={(next) => setSector(s.key, next)}
                      onPrefixes={(t) => setPrefixText(s.key, t)}
                      onZone={(k) => moveToZone(s.key, k)}
                      onShift={(d) => shift(s.key, d)}
                      onAskDelete={() => setConfirm({ kind: "sector", key: s.key })}
                      onDelete={() => removeSector(s.key)}
                      onCancel={() => keepSector(s.key)} />
                  ))}
                </ul>
                {list.length === 0 && <p className="mt-4 text-[0.82rem] text-ink-400">Aucun secteur dans cette zone.</p>}
                <button type="button" id={`add-sector-${z.key}`} onClick={() => addSector(z.key)}
                  className="mt-4 text-[10px] uppercase tracking-[0.16em] text-gold-700 underline decoration-gold-300 underline-offset-4 hover:text-gold-600">
                  Ajouter un secteur en {z.nameFr || "cette zone"}
                </button>
              </section>
            );
          })}
        </div>
      </Card>

      {/* — Historique — */}
      <Card title="Historique des modifications">
        {history === null && (
          <p className="text-[0.85rem] text-ink-400">
            {read === "pending" ? "Chargement…" : "Historique indisponible : la grille n'a pas pu être relue."}
          </p>
        )}
        {history !== null && historyGroups.length === 0 && <p className="text-[0.85rem] text-ink-400">Aucune modification enregistrée.</p>}
        <ol className="space-y-5">
          {historyGroups.map((g) => (
            <li key={g.at} className="border-l-2 border-gold-300 pl-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400">
                {when(g.at)}{g.author === "migration" ? " · mise à jour automatique" : ""}
              </p>
              <ul className="mt-1.5 space-y-1">
                {g.lines.map((l, i) => <li key={i} className="text-[0.85rem] leading-relaxed text-ink-700">{l}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      </Card>

      {/* — Barre d'enregistrement — */}
      <div className="sticky bottom-0 -mx-1 border-t border-gold-300/50 bg-linen-100/95 px-1 py-4 backdrop-blur">
        {(problems.length > 0 || invalidTokens.length > 0) && (
          <ul className={`mb-3 space-y-1 text-[0.8rem] leading-relaxed ${RED}`}>
            {invalidTokens.length > 0 && <li>Préfixe mal formé : {[...new Set(invalidTokens)].join(", ")}. Format attendu : lettre, chiffre, lettre.</li>}
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <div className="flex items-center justify-between gap-5">
          <div className="text-[0.82rem] text-ink-400">
            {message ? (
              <span className={message.tone === "error" ? RED : "text-gold-700"}>
                {message.text}
                {message.lines?.map((l) => <span key={l} className="mt-1 block">{l}</span>)}
              </span>
            ) : read === "pending" ? "Lecture de la grille enregistrée…"
              : read !== "ok" ? <span className={RED}>Enregistrement impossible tant que la grille n&apos;a pas été relue.</span>
              : dirty ? "Modifications non enregistrées." : "Tout est enregistré."}
          </div>
          <button onClick={save} disabled={saving || !dirty || read !== "ok"} className="btn flex-none !py-3 !px-7 !text-[10px] disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ————— Alertes d'un secteur ————— */

type Alert = { tone: "error" | "note"; text: string };

function sectorAlerts(
  s: Sector, uses: ReturnType<typeof prefixUses>, policy: ZonePolicy,
  zoneName: (key: string) => string, invalid: string[],
): Alert[] {
  const out: Alert[] = [];
  if (invalid.length) {
    out.push({ tone: "error", text: `Format invalide : ${invalid.join(", ")}. Attendu : lettre, chiffre, lettre (ex. J4K).` });
  }
  if (!s.nameFr.trim()) out.push({ tone: "error", text: "Donnez un nom en français à ce secteur." });
  if (s.enabled && s.prefixes.length === 0) out.push({ tone: "error", text: "Un secteur actif doit avoir au moins un préfixe." });

  for (const p of s.prefixes) {
    for (const u of (uses.get(p) ?? []).filter((x) => x.sectorKey !== s.key)) {
      const other = policy.sectors.find((x) => x.key === u.sectorKey);
      const nom = u.sectorName || "un secteur sans nom";
      if (u.zoneKey === s.zoneKey) {
        out.push({ tone: "note", text: `${p} sert aussi à ${nom}, dans la même zone.` });
      } else if (s.enabled && other?.enabled) {
        out.push({ tone: "error", text: `${p} est déjà dans ${nom} (${zoneName(u.zoneKey)}). Un préfixe ne peut appartenir qu'à une seule zone : retirez-le de l'un des deux.` });
      } else {
        out.push({ tone: "note", text: `${p} est aussi dans ${nom} (${zoneName(u.zoneKey)}), inactif pour l'instant. Les deux ne pourront pas être actifs en même temps.` });
      }
    }
  }
  return out;
}

/* ————— Une ligne de secteur ————— */

function SectorRow({ s, zones, text, first, last, alerts, confirming, onChange, onPrefixes, onZone, onShift, onAskDelete, onDelete, onCancel }: {
  s: Sector; zones: Zone[]; text: string; first: boolean; last: boolean; alerts: Alert[]; confirming: boolean;
  onChange: (next: Partial<Sector>) => void; onPrefixes: (t: string) => void; onZone: (k: string) => void;
  onShift: (d: -1 | 1) => void; onAskDelete: () => void; onDelete: () => void; onCancel: () => void;
}) {
  const nom = s.nameFr || "ce secteur";
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);

  /* Le bouton pressé se désactive en arrivant en tête ou en fin de zone, et
     la ligne déplacée peut perdre le focus : on le rend au bouton pressé, ou
     à l'autre flèche s'il ne peut plus servir. */
  function move(d: -1 | 1) {
    flushSync(() => onShift(d));
    const pressed = d < 0 ? up.current : down.current;
    const other = d < 0 ? down.current : up.current;
    (pressed && !pressed.disabled ? pressed : other)?.focus();
  }

  return (
    <li className={`border p-4 transition-colors ${s.enabled ? "border-gold-300/50 bg-linen-50" : "border-gold-300/30 bg-linen-100/50"}`}>
      <div className="flex items-center justify-between gap-3">
        {/* L'interrupteur porte le nom du secteur : « Actif », lu vingt fois de
            suite, ne disait pas lequel. Le mot visible reste l'état. */}
        <label className="flex cursor-pointer items-center gap-3">
          <Toggle small checked={s.enabled} onChange={(v) => onChange({ enabled: v })}
            label={`Secteur ${s.nameFr.trim() || "sans nom"} actif`} />
          <span className={`text-[11px] uppercase tracking-[0.14em] ${s.enabled ? "text-gold-700" : "text-ink-400"}`}>
            {s.enabled ? "Actif" : "Inactif"}
          </span>
        </label>
        <div className="flex items-center gap-1">
          <IconButton ref={up} label={`Monter ${nom}`} disabled={first} onClick={() => move(-1)}>↑</IconButton>
          <IconButton ref={down} label={`Descendre ${nom}`} disabled={last} onClick={() => move(1)}>↓</IconButton>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`sfr-${s.key}`}>Nom (français)</label>
          <input id={`sfr-${s.key}`} value={s.nameFr} maxLength={POLICY_LIMITS.nameLength}
            onChange={(e) => onChange({ nameFr: e.target.value })} className="field" />
        </div>
        <div>
          <label className="label" htmlFor={`sen-${s.key}`}>Nom (anglais)</label>
          <input id={`sen-${s.key}`} value={s.nameEn} placeholder={s.nameFr} maxLength={POLICY_LIMITS.nameLength}
            onChange={(e) => onChange({ nameEn: e.target.value })} className="field" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div>
          <label className="label" htmlFor={`sp-${s.key}`}>Préfixes</label>
          <input id={`sp-${s.key}`} value={text} autoCapitalize="characters" spellCheck={false}
            onChange={(e) => onPrefixes(e.target.value.toUpperCase())}
            className="field font-mono text-sm uppercase tracking-wider" />
        </div>
        <div>
          <label className="label" htmlFor={`sz-${s.key}`}>Zone</label>
          <select id={`sz-${s.key}`} value={s.zoneKey} onChange={(e) => onZone(e.target.value)} className="field">
            {zones.map((z) => <option key={z.key} value={z.key}>{z.nameFr || z.key}</option>)}
          </select>
        </div>
      </div>

      {alerts.length > 0 && (
        <ul className="mt-3 space-y-1">
          {alerts.map((a, i) => (
            <li key={i} className={`text-[0.78rem] leading-relaxed ${a.tone === "error" ? RED : "text-ink-400"}`}>{a.text}</li>
          ))}
        </ul>
      )}

      {confirming ? (
        <ConfirmBox text={`Supprimer « ${nom} » ? Le secteur disparaît du site à l'enregistrement.`} onYes={onDelete} onNo={onCancel} />
      ) : (
        <button type="button" id={`del-sector-${s.key}`} onClick={onAskDelete}
          className="mt-3 text-[10px] uppercase tracking-[0.16em] text-ink-400 transition-colors hover:text-[#8E332C]">
          Supprimer
        </button>
      )}
    </li>
  );
}

/* ————— Primitives ————— */

/**
 * Une confirmation dans la page : pas de boîte du navigateur, qui se perd sur un téléphone.
 *
 * Elle remplace le bouton « Supprimer » qui l'a ouverte : le focus y entre
 * donc aussitôt, sur « Annuler », le choix sans conséquence — deux appuis
 * trop rapides sur Entrée ne suppriment rien. Le lecteur d'écran annonce la
 * question avec elle.
 */
function ConfirmBox({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const textId = useId();
  useEffect(() => { cancel.current?.focus(); }, []);
  return (
    <div role="alertdialog" aria-label="Confirmer la suppression" aria-describedby={textId}
      className="mt-3 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3">
      <p id={textId} className={`text-[0.82rem] leading-relaxed ${RED}`}>{text}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={onYes}
          className="border border-[#8E332C] bg-[#8E332C] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-linen-50 transition-opacity hover:opacity-90">
          Oui, supprimer
        </button>
        <button type="button" ref={cancel} onClick={onNo}
          className="border border-gold-400/70 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-ink-600 transition-colors hover:bg-linen-100">
          Annuler
        </button>
      </div>
    </div>
  );
}

function IconButton({ ref, label, disabled, onClick, children }: {
  ref?: React.Ref<HTMLButtonElement>;
  label: string; disabled: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" ref={ref} aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="flex h-9 w-9 items-center justify-center border border-gold-300/60 text-ink-600 transition-colors hover:bg-linen-100 disabled:opacity-30">
      {children}
    </button>
  );
}

/**
 * Un nombre saisi comme on l'écrit : un montant en dollars, gardé en cents,
 * ou un seuil en heures, gardé en minutes.
 *
 * Le texte tapé reste tel quel pendant la saisie, et seule une valeur lisible
 * part dans la grille — les bornes, elles, sont signalées en rouge par
 * `policyProblems`, comme le reste. En quittant le champ, il se remet au
 * propre et montre exactement ce qui sera enregistré.
 */
function Amount({ id, label, unit, value, format, parse, invalid, onChange }: {
  id: string; label: string; unit: string; value: number;
  format: (v: number) => string; parse: (text: string) => number | null;
  invalid: string; onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const bad = draft !== null && parse(draft) === null;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={draft ?? format(value)}
          aria-invalid={bad || undefined} aria-describedby={bad ? `${id}-bad` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = parse(e.target.value);
            if (v !== null) onChange(v);
          }}
          onBlur={() => setDraft(null)}
          className="field !w-24 text-center tabular-nums" />
        <span className="text-[11px] text-ink-400">{unit}</span>
      </div>
      {bad && <p id={`${id}-bad`} className={`mt-1 text-[11px] leading-snug ${RED}`}>{invalid}</p>}
    </div>
  );
}

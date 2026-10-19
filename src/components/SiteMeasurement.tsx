"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import {
  ARRIVAL_KEY, ATTRIBUTION_KEY, EMPTY_ATTRIBUTION, OPT_OUT_KEY,
  clip, heardFromHint, isPrivatePath, refName, type Attribution, type HeardFrom,
} from "@/lib/attribution";

/**
 * Tout ce que le site mesure, réuni en un seul endroit.
 *
 * Trois choses y cohabitent, et la frontière entre elles est celle que la
 * Loi 25 demande de tenir :
 *
 *  1. La provenance du visiteur, retenue dans son navigateur et nulle part
 *     ailleurs. Elle ne part vers le serveur que si cette personne réserve,
 *     et c'est le tunnel de réservation qui l'emporte alors avec le reste du
 *     formulaire. Tant qu'elle n'a rien demandé, nous n'en savons rien.
 *
 *  2. Le journal anonyme des pages vues, envoyé à chaque affichage. Il ne
 *     porte aucun identifiant : deux visites du même navigateur y sont deux
 *     lignes sans lien entre elles.
 *
 *  3. La mesure de fréquentation de l'hébergeur, filtrée par `beforeSend`.
 *
 * Deux exclusions valent pour les trois : les pages privées ne se comptent
 * jamais — l'espace artisan, la page « ne pas compter », et les liens
 * personnels de réservation et d'abonnement, dont l'adresse porte un jeton —,
 * et un appareil porteur du marqueur de retrait n'envoie plus rien du tout.
 * Le marqueur se pose de lui-même quand l'artisan ouvre son espace, ou par
 * le lien personnel de la page « ne pas compter » ; et le serveur écarte de
 * son côté toute visite qui porte la session de l'artisan.
 */

/* Le site n'est pas une application hors ligne : un navigateur en navigation
   privée, un stockage plein ou bloqué par une politique d'entreprise, et
   `localStorage` jette. Aucun de ces cas ne doit casser une page. */
function read(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(store: "local" | "session", key: string, value: string): void {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* tant pis : la mesure est un confort, jamais une condition */
  }
}

/** L'artisan a-t-il demandé que cet appareil ne compte pas ? */
export function isOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  return read("local", OPT_OUT_KEY) === "1";
}

/* Ce qui affiche le marqueur et ce qui le pose sont deux rendus du même
   état. L'événement les tient d'accord dans cet onglet ; `storage` ne se
   déclenche que pour les autres. */
const OPT_OUT_EVENT = "nivex:optout";

export function setOptedOut(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignoré — l'affichage, qui relit le marqueur, le signalera lui-même */
  }
  window.dispatchEvent(new Event(OPT_OUT_EVENT));
}

/** Pour `useSyncExternalStore` : prévient quand le marqueur change. */
export function subscribeOptOut(onChange: () => void): () => void {
  window.addEventListener(OPT_OUT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPT_OUT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* ====================== Provenance ====================== */

/**
 * Lit la provenance retenue, en se méfiant de ce qu'elle contient.
 *
 * Le contenu de `localStorage` est modifiable par qui tient le navigateur :
 * c'est une donnée reçue, pas une donnée sûre. Elle est donc bornée champ
 * par champ avant d'être rendue, et le serveur la bornera encore.
 */
export function readAttribution(): Attribution {
  if (typeof window === "undefined") return EMPTY_ATTRIBUTION;
  const raw = read("local", ATTRIBUTION_KEY);
  if (!raw) return EMPTY_ATTRIBUTION;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const n = Number(o.visits);
    return {
      source: clip(o.source, 60),
      medium: clip(o.medium, 60),
      campaign: clip(o.campaign, 120),
      referrer: clip(o.referrer, 400),
      ref: refName(o.ref),
      landing: clip(o.landing, 300),
      firstSeen: clip(o.firstSeen, 40),
      visits: Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 10_000) : 1,
    };
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}

/** La provenance d'une arrivée : le lien suivi, ou le site d'où l'on vient. */
type Arrival = {
  source: string | null; medium: string | null; campaign: string | null;
  ref: string | null; referrer: string | null;
};

const isDirect = (a: Pick<Arrival, "source" | "ref" | "referrer">) => !a.source && !a.ref && !a.referrer;

/**
 * L'arrivée de la session en cours, retenue à sa première page.
 *
 * Toutes les pages lues ensuite lui sont rapportées. Le second élément dit
 * si la session commence à l'instant. Un référent qui est le site lui-même
 * — un onglet ouvert depuis une de nos pages — ne dit rien d'une arrivée.
 */
function arrival(): [Arrival, boolean] {
  const held = read("session", ARRIVAL_KEY);
  if (held) {
    try {
      const o = JSON.parse(held) as Record<string, unknown>;
      return [{
        source: clip(o.source, 60), medium: clip(o.medium, 60), campaign: clip(o.campaign, 120),
        ref: refName(o.ref), referrer: clip(o.referrer, 400),
      }, false];
    } catch {
      /* une valeur abîmée se remplace comme une absence */
    }
  }

  const p = new URLSearchParams(window.location.search);
  let referrer = clip(document.referrer, 400);
  try {
    if (referrer && new URL(referrer).host === window.location.host) referrer = null;
  } catch {
    referrer = null;
  }
  const a: Arrival = {
    source: clip(p.get("utm_source"), 60),
    medium: clip(p.get("utm_medium"), 60),
    campaign: clip(p.get("utm_campaign"), 120),
    ref: refName(p.get("ref")),
    referrer,
  };
  write("session", ARRIVAL_KEY, JSON.stringify(a));
  return [a, true];
}

/**
 * Retient la toute première visite, puis compte les suivantes.
 *
 * « Première » au sens strict : une campagne ultérieure n'écrase pas la
 * précédente. Ce qu'on cherche à savoir, c'est quelle carte ou quelle
 * publication a amené la personne la première fois. Une seule exception :
 * une première visite directe ne dit rien, et la première provenance connue
 * prend sa place — sans quoi un lien de recommandation reçu après un premier
 * passage ne compterait jamais.
 *
 * Le compteur, lui, avance d'une unité par session et non par page vue :
 * lire trois pages d'affilée est une visite, pas trois.
 */
function rememberOrigin(path: string, a: Arrival, fresh: boolean): void {
  if (!read("local", ATTRIBUTION_KEY)) {
    const first: Attribution = {
      ...a,
      landing: clip(path, 300),
      firstSeen: new Date().toISOString(),
      visits: 1,
    };
    write("local", ATTRIBUTION_KEY, JSON.stringify(first));
    return;
  }

  if (!fresh) return;
  const cur = readAttribution();
  const known = isDirect(cur) && !isDirect(a) ? { ...a, landing: clip(path, 300) } : {};
  write("local", ATTRIBUTION_KEY, JSON.stringify({ ...cur, ...known, visits: cur.visits + 1 }));
}

/**
 * La réponse que l'arrivée laisse deviner à « Comment avez-vous connu
 * NIVEX ? » : un lien de recommandation, ou une carte de porte-à-porte. La
 * provenance retenue d'abord ; l'adresse de la page ensuite, pour qui arrive
 * tout droit sur le formulaire.
 */
export function arrivalHint(): { heardFrom: HeardFrom | ""; referredBy: string } {
  if (typeof window === "undefined") return { heardFrom: "", referredBy: "" };
  const kept = readAttribution();
  const p = new URLSearchParams(window.location.search);
  const here = { source: clip(p.get("utm_source"), 60), ref: refName(p.get("ref")) };
  const from = heardFromHint(kept) ? kept : here;
  return { heardFrom: heardFromHint(from) ?? "", referredBy: from.ref ?? "" };
}

/* ====================== Le composant ====================== */

export function SiteMeasurement() {
  const path = usePathname() ?? "/";

  /* Une page vue, une ligne.
   *
   * En développement, React monte deux fois chaque composant pour débusquer
   * les effets mal rangés, et l'effet partait donc en double. La production
   * ne le fait pas, mais un journal de fréquentation ne doit pas reposer
   * là-dessus : un remontage, un retour en arrière, et le compte serait
   * faux sans que rien ne le signale. La garde retient la dernière page
   * envoyée et s'en tient là. */
  const dernier = useRef<string | null>(null);

  useEffect(() => {
    if (isPrivatePath(path) || isOptedOut()) return;
    if (dernier.current === path) return;
    dernier.current = path;

    const [a, fresh] = arrival();
    rememberOrigin(path, a, fresh);

    /* Le journal part sans qu'on attende la réponse, et `keepalive` lui
       permet d'arriver même si le visiteur quitte la page dans la seconde.
       Un échec ne se remonte pas : personne n'a rien à y faire.

       Le fuseau de l'horloge et le drapeau des navigateurs pilotés servent
       au serveur à reconnaître un robot ; il les lit, puis les oublie. */
    let tz: string | null = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { /* sans fuseau */ }
    fetch("/api/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        path,
        source: a.source, medium: a.medium, campaign: a.campaign, ref: a.ref,
        referrer: a.referrer,
        locale: path.split("/")[1] === "en" ? "en" : "fr",
        webdriver: navigator.webdriver === true,
        tz,
      }),
    }).catch(() => {});
  }, [path]);

  return (
    <Analytics
      beforeSend={(event) => {
        /* Le dernier filet avant l'hébergeur : ni l'espace artisan, ni un
           lien personnel et son jeton, ni un appareil retiré du décompte ne
           doivent lui parvenir. Renvoyer `null` annule l'envoi. */
        try {
          const u = new URL(event.url);
          if (isPrivatePath(u.pathname)) return null;
        } catch {
          /* une URL illisible ne doit pas empêcher la mesure ordinaire */
        }
        if (isOptedOut()) return null;
        return event;
      }}
    />
  );
}

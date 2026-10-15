"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import {
  ATTRIBUTION_KEY, EMPTY_ATTRIBUTION, OPT_OUT_KEY,
  clip, type Attribution,
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
 * Deux exclusions valent pour les trois : les pages de l'espace artisan ne
 * se comptent jamais, et un appareil porteur du marqueur de retrait n'envoie
 * plus rien du tout.
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

export function setOptedOut(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignoré — le bouton le signalera lui-même */
  }
}

/** Les pages de l'espace artisan, qui ne se comptent jamais. */
function isAdmin(path: string): boolean {
  return /^\/admin(\/|$)/.test(path);
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
      landing: clip(o.landing, 300),
      firstSeen: clip(o.firstSeen, 40),
      visits: Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 10_000) : 1,
    };
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}

/**
 * Retient la toute première visite, puis compte les suivantes.
 *
 * « Première » au sens strict : une campagne ultérieure n'écrase pas la
 * précédente. Ce qu'on cherche à savoir, c'est quelle carte ou quelle
 * publication a amené la personne la première fois.
 *
 * Le compteur, lui, avance d'une unité par session et non par page vue :
 * lire trois pages d'affilée est une visite, pas trois.
 */
function rememberOrigin(path: string): void {
  const existing = read("local", ATTRIBUTION_KEY);
  const sameSession = read("session", "nivex.seen") === "1";
  write("session", "nivex.seen", "1");

  if (!existing) {
    const p = new URLSearchParams(window.location.search);
    const first: Attribution = {
      source: clip(p.get("utm_source"), 60),
      medium: clip(p.get("utm_medium"), 60),
      campaign: clip(p.get("utm_campaign"), 120),
      referrer: clip(document.referrer, 400),
      landing: clip(path, 300),
      firstSeen: new Date().toISOString(),
      visits: 1,
    };
    write("local", ATTRIBUTION_KEY, JSON.stringify(first));
    return;
  }

  if (sameSession) return;
  const cur = readAttribution();
  write("local", ATTRIBUTION_KEY, JSON.stringify({ ...cur, visits: cur.visits + 1 }));
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
    if (isAdmin(path) || isOptedOut()) return;
    if (dernier.current === path) return;
    dernier.current = path;

    rememberOrigin(path);

    /* Le journal part sans qu'on attende la réponse, et `keepalive` lui
       permet d'arriver même si le visiteur quitte la page dans la seconde.
       Un échec ne se remonte pas : personne n'a rien à y faire. */
    const p = new URLSearchParams(window.location.search);
    fetch("/api/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        path,
        source: p.get("utm_source"),
        referrer: document.referrer || null,
        locale: path.split("/")[1] === "en" ? "en" : "fr",
      }),
    }).catch(() => {});
  }, [path]);

  return (
    <Analytics
      beforeSend={(event) => {
        /* Le dernier filet avant l'hébergeur : ni l'espace artisan, ni un
           appareil retiré du décompte ne doivent lui parvenir. Renvoyer
           `null` annule l'envoi. */
        try {
          const u = new URL(event.url);
          if (isAdmin(u.pathname)) return null;
        } catch {
          /* une URL illisible ne doit pas empêcher la mesure ordinaire */
        }
        if (isOptedOut()) return null;
        return event;
      }}
    />
  );
}

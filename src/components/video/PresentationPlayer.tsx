"use client";

import { useEffect, useRef } from "react";
import { countVideoPlay } from "../SiteMeasurement";

/**
 * Le lecteur de la présentation : celui du navigateur, avec ses commandes.
 *
 * Rien ne se télécharge avant que le visiteur appuie sur lecture
 * (`preload="none"`), et rien ne se lance tout seul. Sur iPhone, la vidéo se
 * lit dans la page (`playsInline`) plutôt qu'en plein écran d'office.
 *
 * L'image d'aperçu non plus ne pèse pas sur l'arrivée : sur l'accueil, elle
 * ne se demande qu'à l'approche de la section, à la largeur qu'il faut pour
 * ce cadre sur cet écran — un téléphone ne télécharge pas l'image d'un grand
 * écran. Sur la page de présentation, dont elle est le premier écran, elle
 * est écrite dans la page (`poster`).
 *
 * Le premier appui sur lecture compte une lecture dans le journal des visites,
 * une seule fois par page affichée ; reprendre après une pause ne recompte
 * pas.
 */
export function PresentationPlayer({ src, posters, poster, label, fallback, download }: {
  src: string;
  /** L'aperçu en quelques largeurs, « adresse 640w, adresse 1080w, … ». */
  posters: string;
  /** L'aperçu écrit d'emblée dans la page ; sinon, choisi à l'approche. */
  poster?: string;
  label: string;
  fallback: string;
  download: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || poster) return;
    /* L'attribut est posé à la main, hors de React : la prop reste vide, et un
       nouveau rendu ne le retire donc pas. */
    const show = () => {
      if (!el.getAttribute("poster")) el.poster = pickPoster(posters, el.clientWidth * (window.devicePixelRatio || 1));
    };
    if (typeof IntersectionObserver === "undefined") { show(); return; }
    /* 250 px d'avance : assez pour qu'il soit là quand le cadre paraît, assez
       peu pour qu'il ne parte pas avec le premier écran — la vidéo commence
       sous le héros, à quelque 1 300 px du haut. */
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { show(); io.disconnect(); }
    }, { rootMargin: "250px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [posters, poster]);

  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="none"
      poster={poster}
      width={1920}
      height={1080}
      aria-label={label}
      className="block aspect-video h-auto w-full bg-linen-200"
      onPlay={() => {
        if (counted.current) return;
        counted.current = true;
        countVideoPlay();
      }}
    >
      <source src={src} type="video/mp4" />
      <p className="p-6 text-[0.9rem] text-ink-600">
        {fallback} <a href={src} download className="text-gold-700 underline underline-offset-4">{download}</a>
      </p>
    </video>
  );
}

/**
 * La plus petite largeur de la liste qui couvre `need` pixels d'écran, ou la
 * plus grande à défaut. « a 640w, b 1080w, c 1920w » et 1 074 donnent b.
 */
export function pickPoster(srcSet: string, need: number): string {
  const options = srcSet
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .map(([url, w]) => ({ url, w: Number.parseInt(w ?? "", 10) }))
    .filter((o) => o.url && o.w > 0)
    .sort((a, b) => a.w - b.w);
  return (options.find((o) => o.w >= need) ?? options[options.length - 1])?.url ?? "";
}

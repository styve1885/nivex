"use client";

import { useState } from "react";
import Link from "next/link";
import { Mark, Wordmark } from "../Logo";
import { BookingsPanel } from "./BookingsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ConnectionPanel } from "./ConnectionPanel";
import { MessagesPanel } from "./MessagesPanel";
import type { AdminBooking, AdminStats } from "./types";
import type { Settings } from "@/lib/settings";

const TABS = [
  { key: "bookings", label: "Rendez-vous" },
  { key: "messages", label: "Messages" },
  { key: "settings", label: "Réglages" },
  { key: "connection", label: "Connexion" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function Dashboard({
  session, settings, upcoming, past, stats, env, flash,
}: {
  session: { email: string; name: string | null; picture: string | null };
  settings: Settings;
  upcoming: AdminBooking[];
  past: AdminBooking[];
  stats: AdminStats;
  env: { database: boolean; google: boolean; origin: string };
  flash: { connected: boolean; missingScopes: string[] };
}) {
  const [tab, setTab] = useState<Tab>(settings.connected ? "bookings" : "connection");
  const [dismissed, setDismissed] = useState(false);

  const firstName = (session.name ?? session.email).split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10 sm:py-14">
      <header className="flex flex-wrap items-center justify-between gap-6 border-b border-gold-300/40 pb-8">
        <div className="flex items-center gap-4">
          <Mark className="h-10 w-auto" />
          <div>
            <Wordmark as="div" className="text-xl text-ink-800" />
            <p className="text-[9px] uppercase tracking-[0.26em] text-gold-600">Espace artisan</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/fr" className="text-[10px] uppercase tracking-[0.18em] text-ink-400 transition-colors hover:text-gold-600">
            Voir le site
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-[10px] uppercase tracking-[0.18em] text-ink-400 transition-colors hover:text-gold-600">
              Quitter
            </button>
          </form>
        </div>
      </header>

      <div className="mt-10">
        <h1 className="font-display text-3xl font-light text-ink-800 sm:text-4xl">
          {greeting}, {firstName}.
        </h1>
        <p className="mt-2 text-[0.9rem] font-light text-ink-500">
          {settings.connected
            ? upcoming.length > 0
              ? `Vous avez ${upcoming.length} rendez-vous à venir.`
              : "Aucun rendez-vous à venir pour l'instant. Votre site accepte les réservations."
            : "Il reste une étape : brancher votre compte Google pour ouvrir les réservations."}
        </p>
      </div>

      {flash.connected && !dismissed && (
        <div className="mt-8 flex items-start justify-between gap-5 border border-gold-400/60 bg-linen-50 px-6 py-5">
          <div>
            <p className="text-[0.92rem] text-ink-800">Votre compte Google est branché.</p>
            <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-500">
              Les clients voient maintenant vos vraies disponibilités, et chaque réservation atterrit dans votre agenda.
            </p>
          </div>
          <button onClick={() => setDismissed(true)} aria-label="Fermer" className="text-ink-400 hover:text-ink-700">×</button>
        </div>
      )}

      {!settings.connected && (
        <div className="mt-8 border border-gold-400/60 bg-linen-50 px-6 py-5">
          <p className="text-[0.92rem] text-ink-800">Les réservations en ligne sont fermées.</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-500">
            Tant que Google n&apos;est pas branché, le formulaire affiche votre numéro de téléphone au lieu du calendrier.
          </p>
          <a href="/api/auth/google" className="btn mt-5 !py-3 !px-6 !text-[10px]">Brancher Google</a>
        </div>
      )}

      <nav className="mt-10 flex gap-7 border-b border-gold-300/40" aria-label="Sections">
        {TABS.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)}
            className={`relative pb-3 text-[11px] uppercase tracking-[0.18em] transition-colors ${
              tab === x.key ? "text-ink-800" : "text-ink-400 hover:text-ink-600"
            }`}>
            {x.label}
            {tab === x.key && <span className="absolute inset-x-0 -bottom-px h-px bg-gold-500" />}
          </button>
        ))}
      </nav>

      <div className="mt-10">
        {tab === "bookings" && (
          <BookingsPanel upcoming={upcoming} past={past} stats={stats} timezone={settings.timezone} />
        )}
        {tab === "messages" && <MessagesPanel timezone={settings.timezone} />}
        {tab === "settings" && <SettingsPanel initial={settings} />}
        {tab === "connection" && (
          <ConnectionPanel settings={settings} session={session} env={env} missingScopes={flash.missingScopes} />
        )}
      </div>
    </div>
  );
}

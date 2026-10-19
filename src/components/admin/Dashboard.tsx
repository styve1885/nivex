"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mark, Wordmark } from "../Logo";
import { setOptedOut } from "../SiteMeasurement";
import { BookingsPanel } from "./BookingsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ConnectionPanel } from "./ConnectionPanel";
import { MessagesPanel } from "./MessagesPanel";
import { VisitsPanel } from "./VisitsPanel";
import { SubscribersPanel } from "./SubscribersPanel";
import { ZonesPanel } from "./ZonesPanel";
import { PLANS } from "@/lib/pricing";
import type { AdminBooking, AdminStats, GoogleLink } from "./types";
import type { Settings } from "@/lib/settings";

const TABS = [
  { key: "bookings", label: "Rendez-vous" },
  { key: "subscribers", label: "Abonnés" },
  { key: "messages", label: "Messages" },
  { key: "visits", label: "Visites" },
  { key: "settings", label: "Réglages" },
  { key: "zones", label: "Zones et frais" },
  { key: "connection", label: "Connexion" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function Dashboard({
  session, settings, upcoming, past, stats, env, link, flash, greeting, zoneText,
}: {
  session: { email: string; name: string | null; picture: string | null };
  settings: Settings;
  upcoming: AdminBooking[];
  past: AdminBooking[];
  stats: AdminStats;
  env: { database: boolean; google: boolean; sms: boolean; origin: string };
  link: GoogleLink;
  flash: { connected: boolean; missingScopes: string[] };
  /** « Bonjour », « Bon après-midi » ou « Bonsoir », décidé par le serveur à l'heure de la maison. */
  greeting: string;
  zoneText: { served: string; montreal: string; none: string };
}) {
  /* Le lien est rompu quand le compte est bien enregistré mais que Google
     refuse le jeton : c'est le cas silencieux, celui qu'il faut montrer
     en premier. */
  const broken = settings.connected && !link.usable;
  const [tab, setTab] = useState<Tab>(broken ? "connection" : settings.connected ? "bookings" : "connection");
  const [dismissed, setDismissed] = useState(false);

  /* Les deux onglets qui portent un brouillon ne s'effacent pas quand on en
     sort. Réglages, une fois ouvert, reste en vie : rouvert depuis les
     réglages du chargement de la page, il renvoyait ceux-ci au prochain
     enregistrement, pause levée et ancien tarif compris. Zones et frais reste
     en vie tant qu'il a des modifications en cours ; propre, il se referme,
     et se relit à la prochaine ouverture. */
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [zonesDirty, setZonesDirty] = useState(false);
  const unsaved = settingsDirty || zonesDirty;

  function open(next: Tab) {
    setTab(next);
    if (next === "settings") setSettingsOpened(true);
  }

  /* Un navigateur où l'artisan ouvre son espace est le sien : ses passages
     sur le site ne se comptent plus, ni au journal, ni chez l'hébergeur. */
  useEffect(() => { setOptedOut(true); }, []);

  /* Fermer l'onglet, recharger la page ou se déconnecter avec des
     modifications en attente : le navigateur demande d'abord. */
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const unsent = [...upcoming, ...past].filter((b) => b.status !== "cancelled" && !b.emailSent);
  const firstName = (session.name ?? session.email).split(" ")[0];

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
          {/* Une navigation dans l'application : le navigateur ne prévient pas
              lui-même, il faut donc demander ici avant de perdre un brouillon. */}
          <Link href="/fr"
            onNavigate={(e) => {
              if (unsaved && !window.confirm("Des modifications ne sont pas enregistrées. Quitter l'espace artisan sans les enregistrer ?")) {
                e.preventDefault();
              }
            }}
            className="text-[10px] uppercase tracking-[0.18em] text-ink-400 transition-colors hover:text-gold-600">
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
            ? upcoming.some((b) => b.status !== "cancelled")
              ? `Vous avez ${upcoming.filter((b) => b.status !== "cancelled").length} rendez-vous à venir.`
              : settings.paused
                ? "Aucun rendez-vous à venir. Les réservations en ligne sont suspendues (onglet Réglages)."
                : "Aucun rendez-vous à venir pour l'instant. Votre site accepte les réservations."
            : "Il reste une étape : brancher votre compte Google, pour que les courriels partent et que chaque rendez-vous s'inscrive à votre agenda."}
        </p>
      </div>

      {broken && (
        <div className="mt-8 border border-[#B4453C]/50 bg-[#B4453C]/5 px-6 py-5">
          <p className="text-[0.92rem] font-medium text-[#8E332C]">Le lien avec Google est rompu.</p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-[#8E332C]">
            Les réservations continuent d&apos;être enregistrées, mais plus aucun courriel ne part et plus rien
            ne s&apos;inscrit à votre agenda. {REASONS[link.reason ?? ""] ?? REASONS.default}
          </p>
          {/* Une navigation pleine page, pas un Link : le détour OAuth doit
              quitter l'application pour revenir avec un jeton. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/google" className="btn mt-5 !py-3 !px-6 !text-[10px]">Reconnecter Google</a>
          {unsent.length > 0 && (
            <p className="mt-4 text-[0.82rem] leading-relaxed text-[#8E332C]">
              {unsent.length === 1
                ? "Un rendez-vous est resté sans confirmation."
                : `${unsent.length} rendez-vous sont restés sans confirmation.`}{" "}
              Une fois reconnecté, l&apos;onglet Rendez-vous vous propose de les renvoyer.
            </p>
          )}
        </div>
      )}

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

      {/* Seule la pause ferme les réservations : sans Google, elles restent
          ouvertes, et c'est ce qu'il faut savoir. */}
      {!settings.connected && (
        <div className="mt-8 border border-gold-400/60 bg-linen-50 px-6 py-5">
          <p className="text-[0.92rem] text-ink-800">Google n&apos;est pas branché.</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-500">
            Les réservations en ligne restent ouvertes, mais aucun courriel ne part et rien ne s&apos;inscrit à votre
            agenda. Pour fermer la prise de rendez-vous, utilisez la pause dans l&apos;onglet Réglages.
          </p>
          <a href="/api/auth/google" className="btn mt-5 !py-3 !px-6 !text-[10px]">Brancher Google</a>
        </div>
      )}

      {/* Sept onglets ne tiennent plus sur la largeur d'un téléphone. Sans
          défilement, « Connexion » sortait de l'écran sans aucun moyen d'y
          revenir — l'onglet qui sert précisément quand plus rien ne marche.
          La barre défile donc latéralement, et rien ne se perd. */}
      <nav className="mt-10 flex gap-7 overflow-x-auto border-b border-gold-300/40 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Sections">
        {TABS.map((x) => {
          const pending = (x.key === "settings" && settingsDirty) || (x.key === "zones" && zonesDirty);
          return (
            <button key={x.key} onClick={() => open(x.key)} aria-pressed={tab === x.key}
              className={`relative flex-none whitespace-nowrap pb-3 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                tab === x.key ? "text-ink-800" : "text-ink-400 hover:text-ink-600"
              }`}>
              {x.label}
              {pending && (
                <>
                  <span aria-hidden="true" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold-500 align-middle" />
                  <span className="sr-only"> (modifications non enregistrées)</span>
                </>
              )}
              {tab === x.key && <span className="absolute inset-x-0 -bottom-px h-px bg-gold-500" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-10">
        {tab === "bookings" && (
          <BookingsPanel upcoming={upcoming} past={past} stats={stats} timezone={settings.timezone} />
        )}
        {tab === "subscribers" && (
          <SubscribersPanel timezone={settings.timezone}
            plans={PLANS.map((p) => ({ key: p.key, name: p.fr.name, visits: p.visits }))} />
        )}
        {tab === "messages" && <MessagesPanel timezone={settings.timezone} />}
        {tab === "visits" && <VisitsPanel />}
        {(tab === "settings" || settingsOpened) && (
          <div hidden={tab !== "settings"}>
            <SettingsPanel initial={settings} onDirty={setSettingsDirty} />
          </div>
        )}
        {(tab === "zones" || zonesDirty) && (
          <div hidden={tab !== "zones"}>
            <ZonesPanel initial={settings.zonePolicy} zoneText={zoneText} onDirty={setZonesDirty} />
          </div>
        )}
        {tab === "connection" && (
          <ConnectionPanel settings={settings} session={session} env={env} link={link} missingScopes={flash.missingScopes} />
        )}
      </div>
    </div>
  );
}

/* Le mot de Google, traduit en geste à faire. */
const REASONS: Record<string, string> = {
  invalid_grant:
    "Google a révoqué l'autorisation. C'est ce qui arrive quand l'application OAuth est restée en mode « Test » dans la console Google : les jetons y expirent au bout de sept jours. Publiez l'application « En production », puis reconnectez le compte ci-dessous.",
  unauthorized_client:
    "L'identifiant client n'a plus le droit de rafraîchir ce jeton. Vérifiez les variables GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET, puis reconnectez le compte.",
  invalid_client:
    "L'identifiant ou le secret client ne correspond plus à ceux déclarés chez Google. Corrigez les variables, puis reconnectez le compte.",
  default:
    "Reconnectez le compte pour rétablir les envois. L'onglet Connexion propose un courriel de test qui donne le message exact de Google.",
};

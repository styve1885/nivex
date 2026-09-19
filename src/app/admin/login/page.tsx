import { redirect } from "next/navigation";
import { Mark, Wordmark } from "@/components/Logo";
import { GoogleIcon } from "@/components/Icons";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/session";
import { googleConfigured } from "@/lib/google";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  google_not_configured: "Google n'est pas encore configuré sur ce site. Les variables GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont manquantes.",
  bad_setup_code: "Code d'installation incorrect.",
  state_mismatch: "La session d'authentification a expiré. Réessayez.",
  exchange_failed: "Google a refusé la connexion. Vérifiez que l'URI de redirection est bien déclarée dans la console Google Cloud.",
  missing_code: "Réponse incomplète de Google. Réessayez.",
  not_owner: "Ce compte Google n'est pas celui de l'artisan enregistré sur ce site.",
  no_email: "Impossible de lire l'adresse courriel du compte Google.",
  db_unavailable: "La base de données n'est pas joignable. Vérifiez la variable DATABASE_URL.",
  access_denied: "Vous avez refusé l'autorisation. Sans elle, les réservations en ligne ne peuvent pas fonctionner.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSession();
  const settings = await getSettings();

  if (session && (!settings.ownerEmail || settings.ownerEmail.toLowerCase() === session.email.toLowerCase())) {
    redirect("/admin");
  }

  const needsSetupCode = !settings.ownerEmail && Boolean(process.env.ADMIN_SETUP_CODE);
  const ready = googleConfigured() && isDbConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Mark className="mx-auto h-14 w-auto" />
          <Wordmark as="div" className="mt-5 text-2xl text-ink-800" />
          <p className="mt-2 text-[10px] uppercase tracking-[0.28em] text-gold-600">Espace artisan</p>
        </div>

        <div className="paper mt-10 p-9">
          <h1 className="font-display text-2xl font-normal text-ink-800">
            {settings.ownerEmail ? "Bon retour." : "Branchez votre compte Google."}
          </h1>
          <p className="mt-3 text-[0.88rem] font-light leading-[1.85] text-ink-500">
            {settings.ownerEmail
              ? `Connectez-vous avec ${settings.ownerEmail} pour retrouver votre tableau de bord.`
              : "Une seule étape : autorisez NIVEX à lire vos disponibilités dans Google Agenda et à envoyer les confirmations depuis votre Gmail. Vos identifiants ne transitent jamais par ce site."}
          </p>

          {error && (
            <p role="alert" className="mt-6 border border-[#B4453C]/40 bg-[#B4453C]/5 px-4 py-3 text-[0.82rem] leading-relaxed text-[#8E332C]">
              {MESSAGES[error] ?? `Erreur : ${error}`}
            </p>
          )}

          {!ready && (
            <div className="mt-6 border border-gold-400/60 bg-linen-50 px-4 py-4 text-[0.8rem] leading-relaxed text-ink-500">
              <p className="mb-2 font-medium text-ink-700">Configuration incomplète</p>
              <ul className="space-y-1">
                {!googleConfigured() && <li>· Identifiants Google OAuth manquants</li>}
                {!isDbConfigured() && <li>· Base de données non branchée (DATABASE_URL)</li>}
              </ul>
            </div>
          )}

          <form action="/api/auth/google" method="POST" className="mt-8">
            {needsSetupCode && (
              <div className="mb-6">
                <label className="label" htmlFor="setup">Code d&apos;installation</label>
                <input id="setup" name="setup" type="password" required autoComplete="off"
                  className="field" placeholder="••••••••" />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                  Demandé une seule fois, pour la toute première connexion.
                </p>
              </div>
            )}
            <button type="submit" disabled={!ready}
              className="flex w-full items-center justify-center gap-3 border border-gold-400/70 bg-linen-50 px-6 py-4 text-[0.9rem] text-ink-700 transition-all duration-500 hover:border-gold-500 hover:bg-linen-100 disabled:opacity-40"
              style={{ transitionTimingFunction: "var(--ease-silk)" }}>
              <GoogleIcon />Continuer avec Google
            </button>
          </form>

          <ul className="mt-8 space-y-2.5 border-t border-gold-300/40 pt-6 text-[0.78rem] leading-relaxed text-ink-400">
            <li className="flex gap-2"><span className="text-gold-500">◆</span> Lecture de vos disponibilités (Google Agenda)</li>
            <li className="flex gap-2"><span className="text-gold-500">◆</span> Création des rendez-vous confirmés</li>
            <li className="flex gap-2"><span className="text-gold-500">◆</span> Envoi des confirmations depuis votre Gmail</li>
            <li className="flex gap-2"><span className="text-gold-500">◆</span> Révocable à tout moment, en un clic</li>
          </ul>
        </div>

        <p className="mt-8 text-center text-[11px] text-ink-400">
          <a href="/fr" className="transition-colors hover:text-gold-600">← Retour au site</a>
        </p>
      </div>
    </div>
  );
}

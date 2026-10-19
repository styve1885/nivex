import { redirect } from "next/navigation";
import { getSession, requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { listBookings, stats } from "@/lib/bookings";
import { isDbConfigured } from "@/lib/db";
import { GoogleError, googleConfigured, ownerAccessToken, siteOrigin } from "@/lib/google";
import { heardFromText } from "@/lib/attribution";
import { Dashboard } from "@/components/admin/Dashboard";
import { smsConfigured } from "@/lib/sms";
import { getDict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; warn?: string; scopes?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const owner = await requireOwner();
  if (!owner) redirect("/admin/login?error=not_owner");

  const settings = await getSettings();

  /* « Branché » ne veut pas dire « fonctionne » : un jeton révoqué laisse
     le réglage intact pendant que plus rien ne part. On essaie donc, et
     c'est le résultat de l'essai que le tableau de bord affiche. */
  const link = await probeGoogle(settings.connected);

  const [upcoming, past, counts] = await Promise.all([
    listBookings({ scope: "upcoming" }).catch(() => []),
    listBookings({ scope: "past", limit: 60 }).catch(() => []),
    stats().catch(() => ({ upcoming: 0, thisMonth: 0, cancelled: 0, total: 0, monthCents: 0, clients: 0 })),
  ]);

  const serialise = (list: Awaited<ReturnType<typeof listBookings>>) =>
    list.map((b) => ({
      id: b.id, ref: b.ref, status: b.status, clientName: b.clientName,
      clientEmail: b.clientEmail, clientPhone: b.clientPhone,
      address: b.address, city: b.city, postalCode: b.postalCode, notes: b.notes,
      items: b.items, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(),
      durationMinutes: b.durationMinutes, estimateCents: b.estimateCents,
      currency: b.currency, firstHourFree: b.firstHourFree, createdAt: b.createdAt.toISOString(),
      travelFeeCents: b.travelFeeCents, travelZone: b.travelZone,
      emailSent: b.emailSent, inCalendar: Boolean(b.googleEventId),
      subscription: Boolean(b.subscriptionId), done: Boolean(b.doneAt),
      origin: {
        heardFrom: b.origin.heardFrom,
        heardFromLabel: heardFromText(b.origin),
        referral: b.origin.referral,
        source: b.origin.source,
        campaign: b.origin.campaign,
        referrer: b.origin.referrer,
        landing: b.origin.landing,
        firstSeenAt: b.origin.firstSeenAt?.toISOString() ?? null,
        visits: b.origin.visits,
      },
    }));

  return (
    <Dashboard
      session={owner}
      settings={settings}
      upcoming={serialise(upcoming)}
      past={serialise(past)}
      stats={counts}
      env={{
        database: isDbConfigured(),
        google: googleConfigured(),
        sms: smsConfigured(),
        origin: siteOrigin(),
      }}
      link={link}
      flash={{
        connected: sp.connected === "1",
        missingScopes: sp.warn === "missing_scopes" ? (sp.scopes ?? "").split(",").filter(Boolean) : [],
      }}
      greeting={greetingAt(new Date(), settings.timezone)}
      zoneText={getDict("fr").zoneText}
    />
  );
}

/** Le lien avec Google tient-il encore ? On le sait en s'en servant. */
async function probeGoogle(connected: boolean): Promise<{ usable: boolean; reason: string | null }> {
  if (!connected || !googleConfigured()) return { usable: false, reason: null };
  try {
    return { usable: Boolean(await ownerAccessToken()), reason: null };
  } catch (e) {
    const code = e instanceof GoogleError ? /"error"\s*:\s*"([a-z_]+)"/i.exec(e.body)?.[1] ?? null : null;
    return { usable: false, reason: code ?? "unknown" };
  }
}

/**
 * Le mot d'accueil, à l'heure de la maison.
 *
 * Décidé ici, une seule fois : calculé dans le navigateur, il suivait
 * l'horloge de l'appareil pendant que le serveur, en UTC, en rendait un
 * autre, et React jetait la page reçue pour la refaire. Un fuseau illisible
 * retombe sur celui de Montréal plutôt que de faire tomber la page.
 */
function greetingAt(now: Date, timeZone: string): string {
  const hourIn = (tz: string) => Number(new Intl.DateTimeFormat("fr-CA", { hour: "numeric", hourCycle: "h23", timeZone: tz })
    .formatToParts(now).find((p) => p.type === "hour")?.value);
  let hour: number;
  try { hour = hourIn(timeZone || "America/Toronto"); } catch { hour = hourIn("America/Toronto"); }
  return hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
}

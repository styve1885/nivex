import { redirect } from "next/navigation";
import { getSession, requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { listBookings, stats } from "@/lib/bookings";
import { isDbConfigured } from "@/lib/db";
import { GoogleError, googleConfigured, ownerAccessToken, siteOrigin } from "@/lib/google";
import { Dashboard } from "@/components/admin/Dashboard";

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
      emailSent: b.emailSent, inCalendar: Boolean(b.googleEventId),
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
        origin: siteOrigin(),
      }}
      link={link}
      flash={{
        connected: sp.connected === "1",
        missingScopes: sp.warn === "missing_scopes" ? (sp.scopes ?? "").split(",").filter(Boolean) : [],
      }}
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

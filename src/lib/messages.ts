import { z } from "zod";
import { ensureSchema, sql, logEvent, isDbConfigured } from "./db";
import { getSettings } from "./settings";
import { ownerAccessToken, sendGmail, siteOrigin } from "./google";
import { contactNotification, contactAcknowledgement } from "./email";
import { contactEmail, REQUEST_INBOX } from "./brand";

export const ContactInput = z.object({
  locale: z.enum(["fr", "en"]).default("fr"),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  body: z.string().trim().min(10).max(4000),
  /* Pot de miel. Le schéma l'accepte rempli : c'est la route qui feint alors
     le succès. Refusé ici, il rendait une erreur 400 qui nommait le champ, et
     le robot apprenait lequel laisser vide. */
  hp: z.string().max(2000).optional(),
});

/**
 * Au-delà de tant de messages reçus en vingt-quatre heures, plus d'accusé
 * de réception. Les messages, eux, s'enregistrent et parviennent toujours à
 * l'artisan : seul l'envoi vers une adresse que personne n'a vérifiée
 * s'arrête, le temps qu'une rafale de robots passe.
 */
const ACK_DAILY_CAP = 30;

export type ContactInputType = z.infer<typeof ContactInput>;

export type Message = {
  id: string; locale: "fr" | "en"; name: string; email: string | null;
  phone: string | null; subject: string | null; body: string;
  emailSent: boolean; readAt: Date | null; createdAt: Date;
};

type Row = Record<string, unknown>;

function hydrate(r: Row): Message {
  return {
    id: r.id as string,
    locale: (r.locale as "fr" | "en") ?? "fr",
    name: r.name as string,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    subject: (r.subject as string) ?? null,
    body: r.body as string,
    emailSent: r.email_sent === true,
    readAt: r.read_at ? new Date(r.read_at as string) : null,
    createdAt: new Date(r.created_at as string),
  };
}

export class ContactError extends Error {
  constructor(public code: "rate_limited" | "unavailable") { super(code); this.name = "ContactError"; }
}

/**
 * Enregistre le message, puis tente de le transmettre.
 * L'écriture en base passe d'abord : un courriel qui échoue ne doit
 * jamais faire disparaître ce que quelqu'un a pris la peine d'écrire.
 *
 * `sent` dit que l'artisan a reçu l'avis ; `acked`, que la personne a reçu
 * son accusé de réception — la page ne le lui annonce que dans ce cas.
 */
export async function submitContact(
  input: ContactInputType,
): Promise<{ stored: boolean; sent: boolean; acked: boolean }> {
  const settings = await getSettings();
  let stored = false;
  let id: string | null = null;
  /* L'accusé ne part que si la base a compté les messages du jour et gardé
     celui-ci : sans cela, rien ne borne les envois. */
  let ackAllowed = false;

  if (isDbConfigured()) {
    try {
      await ensureSchema();

      const recent = (await sql()`
        SELECT count(*) FILTER (
                 WHERE lower(email) = ${input.email} AND created_at > now() - interval '10 minutes'
               )::int AS mine,
               count(*)::int AS day
        FROM nivex_messages
        WHERE created_at > now() - interval '24 hours'`) as { mine: number; day: number }[];
      if ((recent[0]?.mine ?? 0) >= 3) throw new ContactError("rate_limited");

      const rows = (await sql()`
        INSERT INTO nivex_messages (locale, name, email, phone, subject, body)
        VALUES (${input.locale}, ${input.name}, ${input.email},
                ${input.phone || null}, ${input.subject || null}, ${input.body})
        RETURNING id`) as Row[];
      id = rows[0]?.id as string;
      stored = true;
      ackAllowed = (recent[0]?.day ?? 0) < ACK_DAILY_CAP;
    } catch (e) {
      if (e instanceof ContactError) throw e;
      await logEvent("contact_store_failed", { error: String((e as Error).message).slice(0, 300) });
    }
  }

  let sent = false;
  let acked = false;
  const at = await ownerAccessToken().catch(() => null);

  if (at) {
    const origin = siteOrigin();
    const owner = contactNotification({ ...input, siteUrl: origin });
    // Un texte fixe : rien de ce que la personne a tapé n'y entre.
    const ack = contactAcknowledgement({ locale: input.locale, siteUrl: origin, businessEmail: contactEmail() });
    const fromName = settings.businessName || "NIVEX";

    const [toOwner, toSender] = await Promise.allSettled([
      // L'avis va à la boîte de la maison, comme tous les avis internes.
      sendGmail(at, {
        to: REQUEST_INBOX, subject: owner.subject, html: owner.html, text: owner.text,
        fromName, replyTo: input.email,
      }),
      // Accusé de réception : la personne sait que son message est parti.
      // Sans nom affiché : ce qu'elle a tapé n'a rien à faire dans l'en-tête.
      ackAllowed
        ? sendGmail(at, {
            to: input.email, subject: ack.subject, html: ack.html, text: ack.text,
            fromName, replyTo: contactEmail(),
          })
        : Promise.resolve(null),
    ]);

    sent = toOwner.status === "fulfilled";
    acked = ackAllowed && toSender.status === "fulfilled";
    if (sent && id) {
      await sql()`UPDATE nivex_messages SET email_sent = true WHERE id = ${id}`.catch(() => {});
    }
    if (stored && !ackAllowed) await logEvent("contact_ack_capped", { cap: ACK_DAILY_CAP });
  }

  // Ni base ni courriel : on ne peut rien promettre à la personne.
  if (!stored && !sent) throw new ContactError("unavailable");

  await logEvent("contact_received", { email: input.email, stored, sent, acked });
  return { stored, sent, acked };
}

export async function listMessages(limit = 100): Promise<Message[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT * FROM nivex_messages ORDER BY created_at DESC LIMIT ${Math.min(limit, 300)}`) as Row[];
  return rows.map(hydrate);
}

export async function markRead(id: string): Promise<void> {
  await ensureSchema();
  await sql()`UPDATE nivex_messages SET read_at = now() WHERE id = ${id} AND read_at IS NULL`;
}

export async function unreadCount(): Promise<number> {
  try {
    await ensureSchema();
    const rows = (await sql()`SELECT count(*)::int AS n FROM nivex_messages WHERE read_at IS NULL`) as { n: number }[];
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

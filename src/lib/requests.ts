import { z } from "zod";
import { ensureSchema, sql, logEvent, isDbConfigured } from "./db";
import { bookingRef } from "./crypto";
import { getSettings } from "./settings";
import { estimateCents, estimateMinutes } from "./availability";
import { ownerAccessToken, sendGmail, siteOrigin } from "./google";
import { slotRequestNotification, slotRequestAcknowledgement, type SlotRequestEmailData } from "./email";
import { FIRST_FREE_MIN_MINUTES, PHONE, REQUEST_INBOX } from "./brand";

/**
 * Demandes de créneau.
 *
 * Le site ne réserve rien tout seul : il transmet un souhait, et c'est
 * l'appel de l'artisan qui fixe le rendez-vous. Aucun agenda n'est lu,
 * aucune plage n'est bloquée — ce module n'a donc besoin ni de Google ni
 * d'une base branchée pour rendre service, et fait au mieux avec ce qui
 * est disponible.
 */

const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export const DAY_KEYS = ["weekday", "saturday", "sunday", "any"] as const;
export const MOMENT_KEYS = ["morning", "afternoon", "evening"] as const;

export type DayKey = (typeof DAY_KEYS)[number];
export type MomentKey = (typeof MOMENT_KEYS)[number];

export const SlotRequestInput = z.object({
  locale: z.enum(["fr", "en"]).default("fr"),
  items: z.array(z.object({ key: z.string().min(1).max(40), qty: z.number().int().min(1).max(200) })).min(1).max(20),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().min(4).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(POSTAL).max(10),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  day: z.enum(DAY_KEYS),
  moment: z.enum(MOMENT_KEYS),
  altDay: z.enum(DAY_KEYS).optional().or(z.literal("")),
  altMoment: z.enum(MOMENT_KEYS).optional().or(z.literal("")),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
  consent: z.literal(true),
  hp: z.string().max(0).optional(),          // pot de miel anti-robot
});

export type SlotRequestInputType = z.infer<typeof SlotRequestInput>;

export class SlotRequestError extends Error {
  constructor(public code: "rate_limited" | "unavailable" | "unknown_service") {
    super(code);
    this.name = "SlotRequestError";
  }
}

/* ============================ Mise en mots ============================ */

const LABELS = {
  fr: {
    day: { weekday: "Soir de semaine", saturday: "Samedi", sunday: "Dimanche", any: "Indifférent" },
    moment: { morning: "Matin", afternoon: "Après-midi", evening: "Soirée" },
  },
  en: {
    day: { weekday: "Weekday evening", saturday: "Saturday", sunday: "Sunday", any: "No preference" },
    moment: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" },
  },
} as const;

/** « Samedi · Après-midi ». L'artisan lit toujours le français. */
export function slotLabel(day: DayKey, moment: MomentKey, locale: "fr" | "en" = "fr"): string {
  const l = LABELS[locale];
  return `${l.day[day]} · ${l.moment[moment]}`;
}

/* ============================ Envoi ============================ */

/**
 * Enregistre la demande, puis tente de la transmettre.
 *
 * L'ordre compte : une demande écrite en base survit à une panne de Gmail,
 * et l'artisan la retrouve dans son espace. L'inverse n'est pas vrai.
 */
export async function submitSlotRequest(
  input: SlotRequestInputType,
): Promise<{ ref: string; stored: boolean; sent: boolean }> {
  const settings = await getSettings();

  const known = new Set(settings.services.filter((s) => s.enabled).map((s) => s.key));
  const items = input.items.filter((i) => known.has(i.key));
  if (items.length === 0) throw new SlotRequestError("unknown_service");

  const durationMinutes = estimateMinutes(items, settings);
  if (durationMinutes <= 0) throw new SlotRequestError("unknown_service");

  const firstHourFree = settings.firstHourFree && durationMinutes >= FIRST_FREE_MIN_MINUTES;
  const cents = estimateCents(durationMinutes, settings, firstHourFree);

  const labelled = items.map((i) => {
    const svc = settings.services.find((s) => s.key === i.key)!;
    return { label: input.locale === "en" ? svc.en : svc.fr, qty: i.qty };
  });

  const ref = bookingRef();
  const email = input.email?.trim() || null;
  const first = slotLabel(input.day, input.moment);
  const second = input.altDay && input.altMoment ? slotLabel(input.altDay, input.altMoment) : null;

  const data: SlotRequestEmailData = {
    ref,
    locale: input.locale,
    clientName: input.name,
    clientEmail: email,
    clientPhone: input.phone,
    address: input.address,
    city: input.city,
    postalCode: input.postalCode.toUpperCase(),
    items: labelled,
    durationMinutes,
    estimateCents: cents,
    currency: settings.currency,
    firstHourFree,
    first,
    second,
    comment: input.comment || null,
    notes: input.notes || null,
    siteUrl: siteOrigin(),
    businessPhone: PHONE,
    businessEmail: settings.ownerEmail || REQUEST_INBOX,
  };

  /* — La trace, d'abord — */
  let stored = false;
  let id: string | null = null;

  if (isDbConfigured()) {
    try {
      await ensureSchema();

      const recent = (await sql()`
        SELECT count(*)::int AS n FROM nivex_messages
        WHERE phone = ${input.phone} AND created_at > now() - interval '10 minutes'`) as { n: number }[];
      if ((recent[0]?.n ?? 0) >= 3) throw new SlotRequestError("rate_limited");

      const rows = (await sql()`
        INSERT INTO nivex_messages (locale, name, email, phone, subject, body)
        VALUES (${input.locale}, ${input.name}, ${email}, ${input.phone},
                ${`Demande de créneau — ${first}`}, ${digest(data)})
        RETURNING id`) as Record<string, unknown>[];
      id = rows[0]?.id as string;
      stored = true;
    } catch (e) {
      if (e instanceof SlotRequestError) throw e;
      await logEvent("slot_request_store_failed", { error: String((e as Error).message).slice(0, 300) });
    }
  }

  /* — Puis le courriel — */
  let sent = false;
  const at = await ownerAccessToken().catch(() => null);

  if (at) {
    const owner = slotRequestNotification(data);
    const fromName = settings.businessName || "NIVEX";

    const sends: Promise<unknown>[] = [
      sendGmail(at, {
        to: REQUEST_INBOX, subject: owner.subject, html: owner.html, text: owner.text,
        fromName, replyTo: email ?? undefined,
      }),
    ];

    // Accusé de réception, seulement s'il y a une adresse où l'envoyer.
    if (email) {
      const ack = slotRequestAcknowledgement(data);
      sends.push(sendGmail(at, {
        to: email, toName: input.name, subject: ack.subject, html: ack.html, text: ack.text,
        fromName, replyTo: REQUEST_INBOX,
      }));
    }

    const [toOwner] = await Promise.allSettled(sends);
    sent = toOwner.status === "fulfilled";
    if (!sent) {
      await logEvent("slot_request_email_failed", {
        ref, error: String((toOwner as PromiseRejectedResult).reason).slice(0, 400),
      });
    }
    if (sent && id) {
      await sql()`UPDATE nivex_messages SET email_sent = true WHERE id = ${id}`.catch(() => {});
    }
  }

  // Ni trace ni courriel : la demande n'existe nulle part, on ne ment pas.
  if (!stored && !sent) throw new SlotRequestError("unavailable");

  await logEvent("slot_request_received", { ref, stored, sent, day: input.day, moment: input.moment });
  return { ref, stored, sent };
}

/** La demande, en texte brut — ce que l'artisan lit dans son espace. */
function digest(d: SlotRequestEmailData): string {
  return [
    `Souhait : ${d.first}`,
    d.second ? `Deuxième choix : ${d.second}` : "",
    `Téléphone : ${d.clientPhone}`,
    `Courriel : ${d.clientEmail ?? "non fourni"}`,
    `Adresse : ${d.address}, ${d.city} ${d.postalCode}`,
    `Prestations : ${d.items.map((i) => `${i.label} × ${i.qty}`).join(" · ")}`,
    `Durée estimée : ${d.durationMinutes} min`,
    `Estimation : ${(d.estimateCents / 100).toFixed(2)} ${d.currency}${d.firstHourFree ? " (1re heure offerte)" : ""}`,
    d.notes ? `Précisions : ${d.notes}` : "",
    d.comment ? `Commentaire : ${d.comment}` : "",
    `Référence : ${d.ref}`,
  ].filter(Boolean).join("\n");
}

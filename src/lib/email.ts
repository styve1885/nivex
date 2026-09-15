import { formatDateTime, minutesToText, formatMoney } from "./time";
import { CANCEL_WINDOW_HOURS } from "./brand";

/**
 * Gabarits de courriel. HTML en tableaux et styles en ligne : c'est laid
 * à écrire, mais c'est le seul dialecte que tous les clients de messagerie
 * comprennent (Outlook compris).
 */

const GOLD = "#B08D4F";
const INK = "#1F1B16";
const LINEN = "#FBF8F2";
const MUTED = "#6B6459";

export type BookingEmailData = {
  ref: string;
  locale: "fr" | "en";
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  city: string;
  postalCode: string;
  notes?: string | null;
  items: { label: string; qty: number }[];
  startsAt: Date;
  durationMinutes: number;
  estimateCents: number;
  currency: string;
  firstHourFree: boolean;
  timezone: string;
  manageUrl: string;
  siteUrl: string;
  businessPhone: string;
  businessEmail: string;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function shell(inner: string, preheader: string, contact = "styve1885@gmail.com"): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>NIVEX</title></head>
<body style="margin:0;padding:0;background:${LINEN};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FEFDFB;border:1px solid #E8D9B5;">
  <tr><td style="padding:38px 40px 26px;text-align:center;border-bottom:1px solid #F0E6D2;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;letter-spacing:0.22em;color:${GOLD};font-weight:400;">NIVEX</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${MUTED};margin-top:10px;">Repassage à domicile de prestige</div>
  </td></tr>
  ${inner}
  <tr><td style="padding:26px 40px 34px;border-top:1px solid #F0E6D2;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.8;">
    NIVEX · Longueuil &amp; Rive-Sud<br>
    <a href="tel:+14509431217" style="color:${GOLD};text-decoration:none;">+1 450 943 1217</a> &nbsp;·&nbsp;
    <a href="mailto:${esc(contact)}" style="color:${GOLD};text-decoration:none;">${esc(contact)}</a>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #F4EDE0;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};width:38%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:11px 0;border-bottom:1px solid #F4EDE0;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:${INK};line-height:1.6;">${value}</td>
  </tr>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr><td style="background:${INK};">
      <a href="${esc(href)}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${LINEN};text-decoration:none;">${esc(label)}</a>
    </td></tr></table>`;
}

const T = {
  fr: {
    subject: (ref: string) => `Votre séance NIVEX est confirmée · ${ref}`,
    hi: (n: string) => `Bonjour ${n},`,
    intro: "Votre séance de repassage à domicile est confirmée. Votre artisan a été prévenu et l'invitation a été ajoutée à votre agenda.",
    when: "Rendez-vous", where: "Adresse", what: "Prestations", duration: "Durée estimée",
    estimate: "Estimation", ref: "Référence", notes: "Vos précisions", phone: "Téléphone",
    free: "Première heure offerte — déjà déduite",
    manage: "Gérer ma réservation",
    before: "Avant notre arrivée",
    beforeList: [
      "Rassemblez les pièces à traiter (panier, lit, dossier de chaise : tout convient).",
      "Prévoyez une prise électrique et environ deux mètres carrés de dégagement.",
      "Mettez de côté les pièces fragiles : nous vous consulterons avant d'y toucher.",
    ],
    footNote: "L'estimation est indicative. Le montant final vous sera confirmé sur place, avant de commencer.",
    cancelNote: `Vous pouvez annuler ou déplacer librement jusqu'à ${CANCEL_WINDOW_HOURS} h avant le rendez-vous.`,
    // Annulation
    cancelSubject: (ref: string) => `Séance NIVEX annulée · ${ref}`,
    cancelIntro: "Votre séance a bien été annulée. Aucun montant ne vous sera facturé.",
    cancelCta: "Prendre un nouveau rendez-vous",
    cancelBye: "Au plaisir de vous revoir.",
    // Artisan
    ownerSubject: (n: string, ref: string) => `Nouvelle réservation — ${n} · ${ref}`,
    ownerIntro: "Une nouvelle séance vient d'être réservée sur le site.",
    ownerCancelSubject: (n: string, ref: string) => `Annulation — ${n} · ${ref}`,
    ownerCancelIntro: "Un client vient d'annuler sa séance. Le créneau est de nouveau libre.",
    client: "Client", email: "Courriel", clientNotes: "Précisions du client",
  },
  en: {
    subject: (ref: string) => `Your NIVEX session is confirmed · ${ref}`,
    hi: (n: string) => `Hello ${n},`,
    intro: "Your in-home ironing session is confirmed. Your craftsman has been notified and the invitation has been added to your calendar.",
    when: "Appointment", where: "Address", what: "Services", duration: "Estimated duration",
    estimate: "Estimate", ref: "Reference", notes: "Your notes", phone: "Phone",
    free: "First hour free — already deducted",
    manage: "Manage my booking",
    before: "Before we arrive",
    beforeList: [
      "Gather the pieces to be handled (a basket, a bed, the back of a chair: anything works).",
      "Have a power outlet and roughly two square metres of clear space available.",
      "Set aside anything fragile — we'll check with you before touching it.",
    ],
    footNote: "The estimate is indicative. The final amount will be confirmed on site, before we begin.",
    cancelNote: `You may cancel or reschedule freely up to ${CANCEL_WINDOW_HOURS} h before the appointment.`,
    cancelSubject: (ref: string) => `NIVEX session cancelled · ${ref}`,
    cancelIntro: "Your session has been cancelled. Nothing will be charged.",
    cancelCta: "Book a new appointment",
    cancelBye: "We hope to see you again.",
    ownerSubject: (n: string, ref: string) => `New booking — ${n} · ${ref}`,
    ownerIntro: "A new session has just been booked on the website.",
    ownerCancelSubject: (n: string, ref: string) => `Cancellation — ${n} · ${ref}`,
    ownerCancelIntro: "A client just cancelled. The slot is open again.",
    client: "Client", email: "Email", clientNotes: "Client notes",
  },
} as const;

function itemsHtml(items: { label: string; qty: number }[]): string {
  return items.map((i) => `${esc(i.label)} <span style="color:${MUTED};">× ${i.qty}</span>`).join("<br>");
}

function itemsText(items: { label: string; qty: number }[]): string {
  return items.map((i) => `  · ${i.label} × ${i.qty}`).join("\n");
}

export function clientConfirmation(d: BookingEmailData) {
  const t = T[d.locale];
  const when = formatDateTime(d.startsAt, d.timezone, d.locale);
  const dur = minutesToText(d.durationMinutes, d.locale);
  const money = formatMoney(d.estimateCents, d.currency, d.locale);

  const inner = `
  <tr><td style="padding:36px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 14px;font-size:16px;">${esc(t.hi(d.clientName.split(" ")[0]))}</p>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(t.intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.when, `<strong style="font-size:16px;">${esc(when)}</strong>`)}
      ${row(t.where, esc(`${d.address}, ${d.city} ${d.postalCode}`))}
      ${row(t.what, itemsHtml(d.items))}
      ${row(t.duration, esc(dur))}
      ${row(t.estimate, `<strong>${esc(money)}</strong>${d.firstHourFree ? `<br><span style="font-size:12px;color:${GOLD};">${esc(t.free)}</span>` : ""}`)}
      ${d.notes ? row(t.notes, esc(d.notes)) : ""}
      ${row(t.ref, `<code style="font-family:monospace;letter-spacing:0.06em;">${esc(d.ref)}</code>`)}
    </table>
  </td></tr>
  <tr><td style="padding:30px 40px;text-align:center;">${button(d.manageUrl, t.manage)}
    <p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};">${esc(t.cancelNote)}</p>
  </td></tr>
  <tr><td style="padding:0 40px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};border:1px solid #F0E6D2;">
      <tr><td style="padding:22px 24px;font-family:Helvetica,Arial,sans-serif;">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};margin-bottom:12px;">${esc(t.before)}</div>
        <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.85;color:${MUTED};">
          ${t.beforeList.map((x) => `<li>${esc(x)}</li>`).join("")}
        </ul>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${MUTED};text-align:center;">${esc(t.footNote)}</p>
  </td></tr>`;

  const text = [
    t.hi(d.clientName.split(" ")[0]), "", t.intro, "",
    `${t.when}: ${when}`,
    `${t.where}: ${d.address}, ${d.city} ${d.postalCode}`,
    `${t.what}:`, itemsText(d.items),
    `${t.duration}: ${dur}`,
    `${t.estimate}: ${money}${d.firstHourFree ? ` (${t.free})` : ""}`,
    d.notes ? `${t.notes}: ${d.notes}` : "",
    `${t.ref}: ${d.ref}`, "",
    `${t.manage}: ${d.manageUrl}`, "",
    t.cancelNote, "", t.footNote, "",
    `NIVEX · ${d.businessPhone} · ${d.businessEmail}`,
  ].filter(Boolean).join("\n");

  return { subject: t.subject(d.ref), html: shell(inner, `${when} — ${d.ref}`, d.businessEmail), text };
}

export function clientCancellation(d: BookingEmailData) {
  const t = T[d.locale];
  const when = formatDateTime(d.startsAt, d.timezone, d.locale);
  const inner = `
  <tr><td style="padding:36px 40px 30px;font-family:Helvetica,Arial,sans-serif;color:${INK};text-align:center;">
    <p style="margin:0 0 14px;font-size:16px;">${esc(t.hi(d.clientName.split(" ")[0]))}</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(t.cancelIntro)}</p>
    <p style="margin:0 0 28px;font-size:15px;color:${MUTED};text-decoration:line-through;">${esc(when)}</p>
    ${button(`${d.siteUrl}/${d.locale}/reserver`, t.cancelCta)}
    <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">${esc(t.cancelBye)}</p>
  </td></tr>`;
  const text = [t.hi(d.clientName.split(" ")[0]), "", t.cancelIntro, "", when, "", `${t.cancelCta}: ${d.siteUrl}/${d.locale}/reserver`].join("\n");
  return { subject: t.cancelSubject(d.ref), html: shell(inner, t.cancelIntro, d.businessEmail), text };
}

/** Fiche de mission pour l'artisan — dense, actionnable. */
export function ownerNotification(d: BookingEmailData, cancelled = false) {
  const t = T.fr; // l'artisan lit en français
  const when = formatDateTime(d.startsAt, d.timezone, "fr");
  const dur = minutesToText(d.durationMinutes, "fr");
  const money = formatMoney(d.estimateCents, d.currency, "fr");
  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${d.address}, ${d.city}, QC ${d.postalCode}`)}`;

  const inner = `
  <tr><td style="padding:34px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:${MUTED};">${esc(cancelled ? t.ownerCancelIntro : t.ownerIntro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.when, `<strong style="font-size:16px;${cancelled ? "text-decoration:line-through;" : ""}">${esc(when)}</strong>`)}
      ${row(t.client, `<strong>${esc(d.clientName)}</strong>`)}
      ${row(t.phone, `<a href="tel:${esc(d.clientPhone.replace(/[^\d+]/g, ""))}" style="color:${GOLD};text-decoration:none;">${esc(d.clientPhone)}</a>`)}
      ${row(t.email, `<a href="mailto:${esc(d.clientEmail)}" style="color:${GOLD};text-decoration:none;">${esc(d.clientEmail)}</a>`)}
      ${row(t.where, `<a href="${esc(maps)}" style="color:${GOLD};text-decoration:none;">${esc(`${d.address}, ${d.city} ${d.postalCode}`)}</a>`)}
      ${row(t.what, itemsHtml(d.items))}
      ${row(t.duration, esc(dur))}
      ${row(t.estimate, `<strong>${esc(money)}</strong>${d.firstHourFree ? `<br><span style="font-size:12px;color:${GOLD};">${esc(t.free)}</span>` : ""}`)}
      ${d.notes ? row(t.clientNotes, esc(d.notes)) : ""}
      ${row(t.ref, `<code style="font-family:monospace;">${esc(d.ref)}</code>`)}
    </table>
  </td></tr>
  <tr><td style="padding:26px 40px 34px;text-align:center;">${button(`${d.siteUrl}/admin`, "Ouvrir le tableau de bord")}</td></tr>`;

  const text = [
    cancelled ? t.ownerCancelIntro : t.ownerIntro, "",
    `${t.when}: ${when}`, `${t.client}: ${d.clientName}`,
    `${t.phone}: ${d.clientPhone}`, `${t.email}: ${d.clientEmail}`,
    `${t.where}: ${d.address}, ${d.city} ${d.postalCode}`, `${t.what}:`, itemsText(d.items),
    `${t.duration}: ${dur}`, `${t.estimate}: ${money}`,
    d.notes ? `${t.clientNotes}: ${d.notes}` : "", `${t.ref}: ${d.ref}`, "", `${d.siteUrl}/admin`,
  ].filter(Boolean).join("\n");

  return {
    subject: cancelled ? t.ownerCancelSubject(d.clientName, d.ref) : t.ownerSubject(d.clientName, d.ref),
    html: shell(inner, `${when} — ${d.clientName}`, d.businessEmail),
    text,
  };
}

/* ============================================================
   Formulaire de contact
   ============================================================ */

export type ContactEmailData = {
  locale: "fr" | "en";
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  body: string;
  siteUrl: string;
  businessEmail?: string;
};

/** Ce que reçoit l'artisan : le message, et de quoi répondre en un clic. */
export function contactNotification(d: ContactEmailData) {
  const t = T.fr;
  const subject = d.subject?.trim();
  const inner = `
  <tr><td style="padding:34px 40px 10px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:${MUTED};">
      Nouveau message envoyé depuis le formulaire de contact du site.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.client, `<strong>${esc(d.name)}</strong>`)}
      ${row(t.email, `<a href="mailto:${esc(d.email)}" style="color:${GOLD};text-decoration:none;">${esc(d.email)}</a>`)}
      ${d.phone ? row(t.phone, `<a href="tel:${esc(d.phone.replace(/[^\d+]/g, ""))}" style="color:${GOLD};text-decoration:none;">${esc(d.phone)}</a>`) : ""}
      ${subject ? row("Objet", esc(subject)) : ""}
    </table>
    <div style="margin-top:26px;padding:22px 24px;background:${LINEN};border:1px solid #F0E6D2;">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};margin-bottom:12px;">Message</div>
      <div style="font-size:15px;line-height:1.85;color:${INK};white-space:pre-wrap;">${esc(d.body)}</div>
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:${MUTED};">
      Répondez directement à ce courriel : votre réponse partira vers ${esc(d.email)}.
    </p>
  </td></tr>
  <tr><td style="padding:24px 40px 34px;text-align:center;">${button(`mailto:${d.email}`, "Répondre")}</td></tr>`;

  const text = [
    "Nouveau message depuis le formulaire de contact.", "",
    `${t.client} : ${d.name}`,
    `${t.email} : ${d.email}`,
    d.phone ? `${t.phone} : ${d.phone}` : "",
    subject ? `Objet : ${subject}` : "",
    "", "Message :", d.body, "",
    `Répondez directement à ce courriel (${d.email}).`,
  ].filter(Boolean).join("\n");

  return {
    subject: subject ? `Message du site — ${d.name} · ${subject}` : `Message du site — ${d.name}`,
    html: shell(inner, `${d.name} — ${d.body.slice(0, 60)}`, d.businessEmail),
    text,
  };
}

const ACK = {
  fr: {
    subject: "Nous avons bien reçu votre message · NIVEX",
    hi: (n: string) => `Bonjour ${n},`,
    intro: "Merci de nous avoir écrit. Votre message est arrivé et nous vous répondons en général dans la journée.",
    yours: "Votre message",
    urgent: "C'est urgent ?",
    urgentBody: "Appelez-nous, nous décrochons.",
    cta: "Réserver une séance",
    signoff: "À très bientôt,",
    team: "NIVEX",
  },
  en: {
    subject: "We received your message · NIVEX",
    hi: (n: string) => `Hello ${n},`,
    intro: "Thank you for writing. Your message arrived, and we usually reply the same day.",
    yours: "Your message",
    urgent: "In a hurry?",
    urgentBody: "Call us — we pick up.",
    cta: "Book a session",
    signoff: "Talk soon,",
    team: "NIVEX",
  },
} as const;

/** Accusé de réception envoyé à la personne : elle sait que c'est parti. */
export function contactAcknowledgement(d: ContactEmailData) {
  const a = ACK[d.locale];
  const inner = `
  <tr><td style="padding:36px 40px 10px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 14px;font-size:16px;">${esc(a.hi(d.name.split(" ")[0]))}</p>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(a.intro)}</p>
    <div style="padding:22px 24px;background:${LINEN};border:1px solid #F0E6D2;">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};margin-bottom:12px;">${esc(a.yours)}</div>
      <div style="font-size:14px;line-height:1.85;color:${MUTED};white-space:pre-wrap;">${esc(d.body)}</div>
    </div>
    <p style="margin:24px 0 4px;font-size:13px;color:${MUTED};">
      <strong style="color:${INK};">${esc(a.urgent)}</strong> ${esc(a.urgentBody)}
      <a href="tel:+14509431217" style="color:${GOLD};text-decoration:none;">+1 450 943 1217</a>
    </p>
  </td></tr>
  <tr><td style="padding:22px 40px 34px;text-align:center;">
    ${button(`${d.siteUrl}/${d.locale}/reserver`, a.cta)}
    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">
      ${esc(a.signoff)}<br><span style="font-family:Georgia,serif;letter-spacing:0.12em;color:${GOLD};">${esc(a.team)}</span>
    </p>
  </td></tr>`;

  const text = [
    a.hi(d.name.split(" ")[0]), "", a.intro, "",
    `${a.yours} :`, d.body, "",
    `${a.urgent} ${a.urgentBody} +1 450 943 1217`, "",
    `${a.cta} : ${d.siteUrl}/${d.locale}/reserver`, "",
    a.signoff, a.team,
  ].join("\n");

  return { subject: a.subject, html: shell(inner, a.intro, d.businessEmail), text };
}

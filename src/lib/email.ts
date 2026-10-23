import { formatDateTime, minutesToText, formatMoney } from "./time";
import { CANCEL_WINDOW_HOURS, CONTACT_EMAIL, INSTALL_MINUTES, PHONE, PHONE_HREF } from "./brand";
import { ironingMinutes } from "./pricing";
import { estimateRange, itemText, moneyRange, type ItemLike } from "./items";

/**
 * Gabarits de courriel. HTML en tableaux et styles en ligne : c'est laid
 * à écrire, mais c'est le seul dialecte que tous les clients de messagerie
 * comprennent (Outlook compris).
 */

/* Les ors de la charte (`@theme`) : gold-600 pour tout ce qui se lit — il
   tient 4,5:1 sur le lin —, gold-500 pour les filets et le grand logotype. */
const GOLD = "#866836";
const GOLD_RULE = "#A7864B";
const INK = "#1F1B16";

/* La devise sous le logotype, celle du dictionnaire (`brand.tagline`) — un
   test veille à ce qu'elles restent les mêmes. Recopiée plutôt qu'importée :
   le tunnel d'abonnement charge ce module dans le navigateur, et les deux
   dictionnaires entiers n'ont rien à y faire. */
const TAGLINE = { fr: "Repassage à domicile de prestige", en: "Prestige in-home ironing" } as const;
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
  /* La séance et ses pièces à l'unité (prix compris), ou l'ancien panier. */
  items: ItemLike[];
  startsAt: Date;
  durationMinutes: number;
  /* Minutes d'arrivée anticipée : absentes ou nulles aujourd'hui, l'artisan
     arrivant au début ; quinze pour un rendez-vous de l'ancien déroulement. */
  setupMinutes?: number;
  estimateCents: number;
  currency: string;
  firstHourFree: boolean;
  /* Frais de route, hors estimation. Zéro quand l'adresse n'en demande pas. */
  travelFeeCents?: number;
  travelZone?: string | null;
  timezone: string;
  manageUrl: string;
  siteUrl: string;
  businessPhone: string;
  businessEmail: string;
  /* L'invitation à l'agenda est-elle réellement partie ? Faux, la
     confirmation n'en parle pas. Absent, elle en parle comme avant. */
  invited?: boolean;
  /* D'où vient ce client. Absent pour les rendez-vous pris avant la mesure,
     et absent aussi du courriel du client : cela ne regarde que l'artisan. */
  origin?: {
    heardFromLabel: string | null;
    source: string | null;
    campaign: string | null;
    firstSeenAt: Date | null;
    visits: number | null;
  } | null;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * L'enveloppe commune. Le client la lit dans sa langue — l'en-tête comme le
 * pied de page ; l'artisan, en français, d'où la valeur par défaut. Le pied
 * ne nomme aucun secteur : la zone desservie s'écrit depuis l'onglet « Zones
 * et frais », pas dans un gabarit.
 */
function shell(inner: string, preheader: string, contact = CONTACT_EMAIL, locale: "fr" | "en" = "fr"): string {
  return `<!doctype html>
<html lang="${locale === "en" ? "en-CA" : "fr-CA"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>NIVEX</title></head>
<body style="margin:0;padding:0;background:${LINEN};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FEFDFB;border:1px solid #E8D9B5;">
  <tr><td style="padding:38px 40px 26px;text-align:center;border-bottom:1px solid #F0E6D2;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;letter-spacing:0.22em;color:${GOLD_RULE};font-weight:400;">NIVEX</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${MUTED};margin-top:10px;">${esc(TAGLINE[locale])}</div>
  </td></tr>
  ${inner}
  <tr><td style="padding:26px 40px 34px;border-top:1px solid #F0E6D2;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.8;">
    NIVEX<br>
    <a href="${esc(PHONE_HREF)}" style="color:${GOLD};text-decoration:none;">${esc(PHONE)}</a> &nbsp;·&nbsp;
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
    introNoInvite: "Votre séance de repassage à domicile est confirmée. Votre artisan a été prévenu.",
    when: "Rendez-vous", where: "Adresse", what: "Prestations", duration: "Durée estimée",
    estimate: "Estimation", ref: "Référence", notes: "Vos précisions", phone: "Téléphone",
    free: "Première heure offerte — déjà déduite",
    travel: "Frais de déplacement", total: "Total estimé",
    travelNote: "Les frais de déplacement s'ajoutent au prix de la séance.",
    travelNoteOffer: "L'offre « première heure offerte » ne les couvre pas.",
    manage: "Gérer ma réservation",
    setup: (duration: string, ironing: string) => `Votre artisan arrive à l'heure du début. Votre séance de ${duration} inclut l'installation et le rangement de notre matériel, ${INSTALL_MINUTES} minutes chacun : ${ironing} de repassage.`,
    early: (m: number) => `Votre repasseur arrive ${m} minutes avant le début de votre séance pour s'installer, sans frais : vos heures réservées sont entièrement consacrées au repassage.`,
    before: "Avant notre arrivée",
    beforeList: [
      "Rassemblez les pièces à traiter (panier, lit, dossier de chaise : tout convient).",
      "Prévoyez votre planche à repasser, une prise électrique et environ deux mètres carrés de dégagement.",
      "Mettez de côté les pièces fragiles : nous vous consulterons avant d'y toucher.",
    ],
    footNote: "L'estimation est indicative. Le montant final vous sera confirmé sur place, avant de commencer.",
    cancelNote: `Vous pouvez annuler en ligne jusqu'à ${CANCEL_WINDOW_HOURS} h avant le rendez-vous. Pour le déplacer, appelez-nous au ${PHONE}.`,
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
    heardFrom: "Nous a connus par", originSource: "Provenance",
    firstVisit: "Première visite", visitCount: "Visites avant de réserver",
  },
  en: {
    subject: (ref: string) => `Your NIVEX session is confirmed · ${ref}`,
    hi: (n: string) => `Hello ${n},`,
    intro: "Your in-home ironing session is confirmed. Your craftsman has been notified and the invitation has been added to your calendar.",
    introNoInvite: "Your in-home ironing session is confirmed. Your craftsman has been notified.",
    when: "Appointment", where: "Address", what: "Services", duration: "Estimated duration",
    estimate: "Estimate", ref: "Reference", notes: "Your notes", phone: "Phone",
    free: "First hour free — already deducted",
    travel: "Travel fee", total: "Estimated total",
    travelNote: "The travel fee is added to the price of the session.",
    travelNoteOffer: "The first-hour-free offer does not cover it.",
    manage: "Manage my booking",
    setup: (duration: string, ironing: string) => `Your presser arrives at the start time. Your session of ${duration} includes setting up and packing away our equipment, ${INSTALL_MINUTES} minutes each: ${ironing} of ironing.`,
    early: (m: number) => `Your presser arrives ${m} minutes before your session begins to set up, at no charge: the hours you booked are given entirely to ironing.`,
    before: "Before we arrive",
    beforeList: [
      "Gather the pieces to be handled (a basket, a bed, the back of a chair: anything works).",
      "Have your ironing board, a power outlet and roughly two square metres of clear space available.",
      "Set aside anything fragile — we'll check with you before touching it.",
    ],
    footNote: "The estimate is indicative. The final amount will be confirmed on site, before we begin.",
    cancelNote: `You may cancel online up to ${CANCEL_WINDOW_HOURS} h before the appointment. To move it, call us at ${PHONE}.`,
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

function itemsHtml(d: BookingEmailData): string {
  const money = (c: number) => formatMoney(c, d.currency, d.locale);
  return d.items.map((i) => esc(itemText(i, money))).join("<br>");
}

function itemsText(d: BookingEmailData): string {
  const money = (c: number) => formatMoney(c, d.currency, d.locale);
  return d.items.map((i) => `  · ${itemText(i, money)}`).join("\n");
}

/** L'estimation, en fourchette quand une pièce à l'unité a un prix variable ; `plus` : les frais de route. */
function estimateText(d: BookingEmailData, plus = 0): string {
  const { low, high } = estimateRange(d.items, d.estimateCents);
  return moneyRange(low + plus, high + plus, (c) => formatMoney(c, d.currency, d.locale));
}

/**
 * La ligne des frais de route, et le total qu'elle rend nécessaire.
 *
 * Rien ne s'affiche quand il n'y a pas de frais : un « 0 $ » sur la
 * confirmation d'un client de Longueuil n'apprend rien et inquiète. Dès
 * qu'il y en a, en revanche, l'estimation seule devient trompeuse — c'est
 * donc le total qui ferme le tableau, et une note dit pourquoi l'offre ne
 * s'applique pas à eux.
 */
/* Typé sur les deux seules clés utilisées, et non sur un dictionnaire
   entier : la confirmation du client se rend en anglais, où les libellés
   propres à la fiche de l'artisan n'existent pas. */
type TravelLabels = { travel: string; total: string };

function travelRowsHtml(d: BookingEmailData, t: TravelLabels): string {
  const fee = d.travelFeeCents ?? 0;
  if (fee <= 0) return "";
  const label = d.travelZone ? `${t.travel} (${d.travelZone})` : t.travel;
  return (
    row(label, esc(formatMoney(fee, d.currency, d.locale))) +
    row(t.total, `<strong>${esc(estimateText(d, fee))}</strong>`)
  );
}

function travelRowsText(d: BookingEmailData, t: TravelLabels): string[] {
  const fee = d.travelFeeCents ?? 0;
  if (fee <= 0) return [];
  const label = d.travelZone ? `${t.travel} (${d.travelZone})` : t.travel;
  return [
    `${label}: ${formatMoney(fee, d.currency, d.locale)}`,
    `${t.total}: ${estimateText(d, fee)}`,
  ];
}

export function clientConfirmation(d: BookingEmailData) {
  const t = T[d.locale];
  const when = formatDateTime(d.startsAt, d.timezone, d.locale);
  const dur = minutesToText(d.durationMinutes, d.locale);
  const money = estimateText(d);
  const intro = d.invited === false ? t.introNoInvite : t.intro;

  const inner = `
  <tr><td style="padding:36px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 14px;font-size:16px;">${esc(t.hi(d.clientName.split(" ")[0]))}</p>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.when, `<strong style="font-size:16px;">${esc(when)}</strong>`)}
      ${row(t.where, esc(`${d.address}, ${d.city} ${d.postalCode}`))}
      ${row(t.what, itemsHtml(d))}
      ${row(t.duration, esc(dur))}
      ${row(t.estimate, `<strong>${esc(money)}</strong>${d.firstHourFree ? `<br><span style="font-size:12px;color:${GOLD};">${esc(t.free)}</span>` : ""}`)}
      ${travelRowsHtml(d, t)}
      ${d.notes ? row(t.notes, esc(d.notes)) : ""}
      ${row(t.ref, `<code style="font-family:monospace;letter-spacing:0.06em;">${esc(d.ref)}</code>`)}
    </table>
  </td></tr>
  ${(d.travelFeeCents ?? 0) > 0 ? `<tr><td style="padding:20px 40px 0;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.75;color:${MUTED};">${esc(t.travelNote)}${d.firstHourFree ? ` ${esc(t.travelNoteOffer)}` : ""}</p>
  </td></tr>` : ""}
  <tr><td style="padding:24px 40px 0;">
    <p style="margin:0;padding-left:14px;border-left:2px solid ${GOLD_RULE};font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.8;color:${MUTED};">${esc(setupLine(d))}</p>
  </td></tr>
  <tr><td style="padding:28px 40px 30px;text-align:center;">${button(d.manageUrl, t.manage)}
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
    t.hi(d.clientName.split(" ")[0]), "", intro, "",
    `${t.when}: ${when}`,
    `${t.where}: ${d.address}, ${d.city} ${d.postalCode}`,
    `${t.what}:`, itemsText(d),
    `${t.duration}: ${dur}`,
    `${t.estimate}: ${money}${d.firstHourFree ? ` (${t.free})` : ""}`,
    ...travelRowsText(d, t),
    d.notes ? `${t.notes}: ${d.notes}` : "",
    `${t.ref}: ${d.ref}`, "",
    setupLine(d), "",
    `${t.manage}: ${d.manageUrl}`, "",
    t.cancelNote, "", t.footNote, "",
    `NIVEX · ${d.businessPhone} · ${d.businessEmail}`,
  ].filter(Boolean).join("\n");

  return { subject: t.subject(d.ref), html: shell(inner, `${when} — ${d.ref}`, d.businessEmail, d.locale), text };
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
  return { subject: t.cancelSubject(d.ref), html: shell(inner, t.cancelIntro, d.businessEmail, d.locale), text };
}

/** Fiche de mission pour l'artisan — dense, actionnable. */
/**
 * D'où vient ce client, en bas de la fiche de mission.
 *
 * Ce bloc est à part, et visuellement en retrait : c'est un renseignement
 * commercial, pas une consigne de séance. Il ne figure que dans le courriel
 * de l'artisan — le client n'a pas à relire par quel chemin il est arrivé.
 * Rien ne s'affiche quand il n'y a rien à dire : un rendez-vous pris avant la
 * mesure ne doit pas se lire comme une provenance vide.
 */
function originRows(d: BookingEmailData): [string, string][] {
  const t = T.fr;
  const o = d.origin;
  if (!o) return [];

  const rows: [string, string][] = [];
  if (o.heardFromLabel) rows.push([t.heardFrom, o.heardFromLabel]);

  const source = [o.source, o.campaign].filter(Boolean).join(" · ");
  if (source) rows.push([t.originSource, source]);

  if (o.firstSeenAt) {
    rows.push([t.firstVisit, formatDateTime(o.firstSeenAt, d.timezone, "fr")]);
  }
  if (o.visits && o.visits > 0) {
    rows.push([t.visitCount, String(o.visits)]);
  }
  return rows;
}

function originHtml(d: BookingEmailData): string {
  const rows = originRows(d);
  if (rows.length === 0) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin-top:26px;border-top:1px solid #F0E6D2;padding-top:4px;">
      <tr><td style="padding:16px 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:10px;
                     letter-spacing:0.2em;text-transform:uppercase;color:${MUTED};">Provenance</td></tr>
      ${rows.map(([k, v]) => row(k, esc(v))).join("")}
    </table>`;
}

function originText(d: BookingEmailData): string[] {
  const rows = originRows(d);
  if (rows.length === 0) return [];
  return ["", "Provenance :", ...rows.map(([k, v]) => `${k}: ${v}`)];
}

export function ownerNotification(d: BookingEmailData, cancelled = false) {
  const t = T.fr; // l'artisan lit en français
  /* Les montants aussi, même quand le client a réservé en anglais : sinon
     la fiche mêlait « 100 $ » et « $15 ». */
  const fr = { ...d, locale: "fr" as const };
  const when = formatDateTime(d.startsAt, d.timezone, "fr");
  const dur = minutesToText(d.durationMinutes, "fr");
  const money = estimateText(fr);
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
      ${row(t.what, itemsHtml(d))}
      ${row(t.duration, esc(dur))}
      ${row(t.estimate, `<strong>${esc(money)}</strong>${d.firstHourFree ? `<br><span style="font-size:12px;color:${GOLD};">${esc(t.free)}</span>` : ""}`)}
      ${travelRowsHtml(fr, t)}
      ${d.notes ? row(t.clientNotes, esc(d.notes)) : ""}
      ${row(t.ref, `<code style="font-family:monospace;">${esc(d.ref)}</code>`)}
    </table>
    ${originHtml(d)}
  </td></tr>
  <tr><td style="padding:26px 40px 34px;text-align:center;">${button(`${d.siteUrl}/admin`, "Ouvrir le tableau de bord")}</td></tr>`;

  const text = [
    cancelled ? t.ownerCancelIntro : t.ownerIntro, "",
    `${t.when}: ${when}`, `${t.client}: ${d.clientName}`,
    `${t.phone}: ${d.clientPhone}`, `${t.email}: ${d.clientEmail}`,
    `${t.where}: ${d.address}, ${d.city} ${d.postalCode}`, `${t.what}:`, itemsText(d),
    `${t.duration}: ${dur}`, `${t.estimate}: ${money}`,
    ...travelRowsText(fr, t),
    d.notes ? `${t.clientNotes}: ${d.notes}` : "", `${t.ref}: ${d.ref}`,
    ...originText(d), "", `${d.siteUrl}/admin`,
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
    hi: "Bonjour,",
    intro: "Merci de nous avoir écrit. Votre message est arrivé et nous vous répondons en général dans la journée.",
    urgent: "C'est urgent ?",
    urgentBody: "Appelez-nous, nous décrochons.",
    cta: "Réserver une séance",
    signoff: "À très bientôt,",
    team: "NIVEX",
    notYou: "Vous n'avez pas écrit à NIVEX ? Ignorez simplement ce courriel.",
  },
  en: {
    subject: "We received your message · NIVEX",
    hi: "Hello,",
    intro: "Thank you for writing. Your message arrived, and we usually reply the same day.",
    urgent: "In a hurry?",
    urgentBody: "Call us — we pick up.",
    cta: "Book a session",
    signoff: "Talk soon,",
    team: "NIVEX",
    notYou: "Didn't write to NIVEX? Simply ignore this email.",
  },
} as const;

/**
 * Accusé de réception envoyé à la personne : elle sait que c'est parti.
 *
 * Un texte fixe, sans rien de ce qu'elle a tapé — ni son nom, ni son
 * message. L'adresse, elle, n'est vérifiée par personne : un accusé qui
 * recopierait le message enverrait depuis le Gmail de la maison, sous le nom
 * NIVEX, le texte de n'importe qui à l'adresse de n'importe qui. D'où le
 * type, qui ne laisse entrer aucun champ du formulaire.
 */
export function contactAcknowledgement(d: { locale: "fr" | "en"; siteUrl: string; businessEmail?: string }) {
  const a = ACK[d.locale];
  const inner = `
  <tr><td style="padding:36px 40px 10px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 14px;font-size:16px;">${esc(a.hi)}</p>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(a.intro)}</p>
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">
      <strong style="color:${INK};">${esc(a.urgent)}</strong> ${esc(a.urgentBody)}
      <a href="${esc(PHONE_HREF)}" style="color:${GOLD};text-decoration:none;">${esc(PHONE)}</a>
    </p>
  </td></tr>
  <tr><td style="padding:22px 40px 34px;text-align:center;">
    ${button(`${d.siteUrl}/${d.locale}/reserver`, a.cta)}
    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">
      ${esc(a.signoff)}<br><span style="font-family:Georgia,serif;letter-spacing:0.12em;color:${GOLD};">${esc(a.team)}</span>
    </p>
    <p style="margin:22px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:${MUTED};">${esc(a.notYou)}</p>
  </td></tr>`;

  const text = [
    a.hi, "", a.intro, "",
    `${a.urgent} ${a.urgentBody} ${PHONE}`, "",
    `${a.cta}${d.locale === "en" ? ":" : "\u00a0:"} ${d.siteUrl}/${d.locale}/reserver`, "",
    a.signoff, a.team, "", a.notYou,
  ].join("\n");

  return { subject: a.subject, html: shell(inner, a.intro, d.businessEmail, d.locale), text };
}

/* ============================================================
   Remerciement après la séance
   ============================================================ */

const REVIEW = {
  fr: {
    subject: "Merci pour votre confiance · NIVEX",
    hi: (n: string) => `Bonjour ${n},`,
    thanks: "Merci d'avoir confié votre repassage à NIVEX.",
    ask: "Votre avis sur Google, quel qu'il soit, aide d'autres foyers à nous trouver et nous dit ce qu'il faut garder ou améliorer. Il prend une minute.",
    cta: "Laisser un avis",
    reply: "Une remarque à nous faire directement ? Répondez à ce courriel : il arrive chez votre artisan.",
    signoff: "Au plaisir de vous revoir,",
    once: "Ce courriel ne vous est envoyé qu'une fois. Pour ne plus en recevoir de ce genre, répondez simplement à ce message.",
  },
  en: {
    subject: "Thank you for your trust · NIVEX",
    hi: (n: string) => `Hello ${n},`,
    thanks: "Thank you for trusting NIVEX with your ironing.",
    ask: "Your review on Google, whatever it says, helps other households find us and tells us what to keep and what to improve. It takes a minute.",
    cta: "Leave a review",
    reply: "Something you would rather tell us directly? Reply to this email: it goes straight to your presser.",
    signoff: "Hoping to see you again,",
    once: "This email is sent only once. To receive no more emails of this kind, simply reply to this message.",
  },
} as const;

/**
 * Le remerciement, le lendemain de la première séance d'un client.
 *
 * Il invite à laisser un avis, quel qu'il soit : Google interdit de ne
 * solliciter que les clients satisfaits, et l'invitation ne promet rien en
 * échange. Une seule fois par client ; la tâche quotidienne en tient le
 * compte. Le lien vient de Réglages, jamais d'un texte.
 */
export function reviewRequest(d: {
  locale: "fr" | "en"; clientName: string; reviewUrl: string; businessEmail?: string;
}) {
  const r = REVIEW[d.locale];
  const inner = `
  <tr><td style="padding:36px 40px 10px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 14px;font-size:16px;">${esc(r.hi(d.clientName))}</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(r.thanks)}</p>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(r.ask)}</p>
  </td></tr>
  <tr><td style="padding:22px 40px 34px;text-align:center;">
    ${button(d.reviewUrl, r.cta)}
    <p style="margin:24px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:${MUTED};">${esc(r.reply)}</p>
    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">
      ${esc(r.signoff)}<br><span style="font-family:Georgia,serif;letter-spacing:0.12em;color:${GOLD};">NIVEX</span>
    </p>
    <p style="margin:22px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:${MUTED};">${esc(r.once)}</p>
  </td></tr>`;

  const text = [
    r.hi(d.clientName), "", r.thanks, "", r.ask, "",
    `${r.cta}${d.locale === "en" ? ":" : "\u00a0:"} ${d.reviewUrl}`, "",
    r.reply, "", r.signoff, "NIVEX", "", r.once,
  ].join("\n");

  return { subject: r.subject, html: shell(inner, r.thanks, d.businessEmail, d.locale), text };
}

/* ============================================================
   Abonnements
   ============================================================ */

export type SubscriptionEmailData = {
  ref: string;
  locale: "fr" | "en";
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  city: string;
  postalCode: string;
  notes?: string | null;
  /** Nom de la formule, dans la langue du client. */
  planName: string;
  perCycle: number;
  everyWeeks: number;
  minutesPerVisit: number;
  /** Minutes d'arrivée anticipée de l'abonné : 15 pour l'ancien déroulement, 0 sinon. */
  setupMinutes?: number;
  /** Les visites posées, dans l'ordre : la première dit le jour et l'heure. */
  visits: Date[];
  planCents: number;
  travelCents: number;
  totalCents: number;
  feePerVisitCents: number;
  travelZone: string | null;
  currency: string;
  timezone: string;
  manageUrl: string;
  siteUrl: string;
  businessPhone: string;
  businessEmail: string;
};

/** Une visite précise, pour un rappel ou un changement. */
export type VisitEmailData = SubscriptionEmailData & {
  startsAt: Date;
  cycle: number;
  index: number;
  /** Le cycle reste à régler et se paie à cette visite. */
  paymentDue: boolean;
};

export type VisitChange =
  | { kind: "cancelled"; replacement: Date | null }
  | { kind: "moved"; from: Date };

/** La phrase sur l'arrivée d'une séance : à l'heure du début, ou un quart d'heure avant dans l'ancien déroulement. */
function setupLine(d: BookingEmailData): string {
  const t = T[d.locale];
  return (d.setupMinutes ?? 0) > 0
    ? t.early(d.setupMinutes!)
    : t.setup(minutesToText(d.durationMinutes, d.locale), minutesToText(ironingMinutes(d.durationMinutes), d.locale));
}

/** La même, pour les visites d'un abonné. */
function arrivalLine(d: SubscriptionEmailData): string {
  return S[d.locale].arrival(d.setupMinutes ?? 0, minutesToText(d.minutesPerVisit, d.locale),
    minutesToText(ironingMinutes(d.minutesPerVisit), d.locale));
}

const S = {
  fr: {
    rhythm: (w: number) => w === 1 ? "chaque semaine" : w === 2 ? "aux deux semaines" : `toutes les ${w === 4 ? "quatre" : w} semaines`,
    slot: (wd: string, hm: string) => `le ${wd}, à ${hm}`,
    subject: (plan: string, ref: string) => `Votre abonnement ${plan} est confirmé · ${ref}`,
    intro: "Votre abonnement est en place. Vos visites sont réservées dans notre agenda : personne d'autre ne peut prendre ces créneaux.",
    plan: "Formule", rhythmLabel: "Rythme", first: "Première visite", series: "Visites réservées",
    seriesValue: (n: number, last: string) => n === 1 ? `Une visite, le ${last}` : `${n} visites, jusqu'au ${last}`,
    duration: "Durée d'une visite", where: "Adresse", ref: "Référence",
    cycle: "Par cycle", cycleTravel: "Frais de déplacement du cycle", cycleTotal: "Total d'un cycle",
    cycleNote: (n: number) => n === 1
      ? "Un cycle correspond à une visite effectuée. Il se règle à cette visite, sur place : comptant, virement Interac ou carte."
      : `Un cycle correspond à ${n} visites effectuées. Il se règle à la première visite du cycle, sur place : comptant, virement Interac ou carte. Une visite annulée ne compte pas : le cycle se prolonge jusqu'à la suivante.`,
    travelNote: (fee: string) => `Les frais de déplacement de votre zone sont réduits pour les abonnés : ${fee} par visite.`,
    arrival: (m: number, duration: string, ironing: string) => m > 0
      ? `Votre repasseur arrive ${m} minutes avant le début de chaque visite pour s'installer, sans frais.`
      : `Votre artisan arrive à l'heure du début. Chaque visite de ${duration} inclut l'installation et le rangement de notre matériel, ${INSTALL_MINUTES} minutes chacun : ${ironing} de repassage.`,
    rule: "Chaque visite s'annule ou se déplace sans frais jusqu'à 23 h 59 la veille, depuis le lien ci-dessous. Une visite annulée est ajoutée en fin de série. Passé ce délai, appelez-nous.",
    manage: "Gérer mes visites",
    upcoming: "Vos prochaines visites",
    // Rappel
    reminderSubject: (when: string) => `Rappel : votre visite NIVEX ${when}`,
    reminderIntro: "Un mot pour vous rappeler votre visite de demain.",
    reminderToday: "Un mot pour vous rappeler votre visite d'aujourd'hui.",
    visit: "Visite", visitValue: (i: number, n: number, c: number) => `${i}/${n} du cycle ${c}`,
    when: "Rendez-vous",
    payment: "Paiement du cycle",
    paymentNote: (c: number, total: string) => `Cette visite ouvre le cycle ${c} : son montant de ${total} se règle sur place, comptant, par virement Interac ou par carte.`,
    stillTime: "Un empêchement ? Vous pouvez encore annuler ou déplacer cette visite jusqu'à 23 h 59 ce soir.",
    tooLateNote: "Pour tout changement, appelez-nous.",
    // Changements
    cancelledSubject: (when: string) => `Visite annulée · ${when}`,
    cancelledIntro: "Votre visite a bien été annulée. Elle ne compte pas dans votre cycle.",
    replaced: (when: string) => `Elle est remplacée en fin de série, le ${when}.`,
    notReplaced: "Nous vous appellerons pour la replacer en fin de série.",
    movedSubject: (when: string) => `Visite déplacée · ${when}`,
    movedIntro: "Votre visite a bien été déplacée. Le reste de votre série ne change pas.",
    from: "Ancienne date", to: "Nouvelle date",
    endedSubject: "Votre abonnement NIVEX prend fin",
    endedIntro: "Votre abonnement prend fin. Les visites suivantes sont retirées de notre agenda :",
    endedBye: "Merci de votre confiance. Au plaisir de vous revoir.",
  },
  en: {
    rhythm: (w: number) => w === 1 ? "every week" : w === 2 ? "every other week" : `every ${w === 4 ? "four" : w} weeks`,
    slot: (wd: string, hm: string) => `${wd}s at ${hm}`,
    subject: (plan: string, ref: string) => `Your ${plan} subscription is confirmed · ${ref}`,
    intro: "Your subscription is in place. Your visits are reserved in our calendar: nobody else can take these slots.",
    plan: "Plan", rhythmLabel: "Rhythm", first: "First visit", series: "Visits reserved",
    seriesValue: (n: number, last: string) => n === 1 ? `One visit, on ${last}` : `${n} visits, until ${last}`,
    duration: "Length of a visit", where: "Address", ref: "Reference",
    cycle: "Per cycle", cycleTravel: "Travel fees for the cycle", cycleTotal: "Total per cycle",
    cycleNote: (n: number) => n === 1
      ? "A cycle is one completed visit. It is paid at that visit, on site: cash, Interac e-Transfer or card."
      : `A cycle is ${n} completed visits. It is paid at the first visit of the cycle, on site: cash, Interac e-Transfer or card. A cancelled visit does not count: the cycle simply runs on to the next one.`,
    travelNote: (fee: string) => `The travel fee for your area is reduced for subscribers: ${fee} per visit.`,
    arrival: (m: number, duration: string, ironing: string) => m > 0
      ? `Your presser arrives ${m} minutes before each visit begins to set up, at no charge.`
      : `Your presser arrives at the start time. Each visit of ${duration} includes setting up and packing away our equipment, ${INSTALL_MINUTES} minutes each: ${ironing} of ironing.`,
    rule: "Each visit can be cancelled or moved at no charge until 11:59 p.m. the day before, from the link below. A cancelled visit is added at the end of the series. After that, please call us.",
    manage: "Manage my visits",
    upcoming: "Your next visits",
    reminderSubject: (when: string) => `Reminder: your NIVEX visit ${when}`,
    reminderIntro: "A short note to remind you of tomorrow's visit.",
    reminderToday: "A short note to remind you of today's visit.",
    visit: "Visit", visitValue: (i: number, n: number, c: number) => `${i}/${n} of cycle ${c}`,
    when: "Appointment",
    payment: "Payment for the cycle",
    paymentNote: (c: number, total: string) => `This visit opens cycle ${c}: its amount of ${total} is paid on site, by cash, Interac e-Transfer or card.`,
    stillTime: "Something came up? You can still cancel or move this visit until 11:59 p.m. tonight.",
    tooLateNote: "For any change, please call us.",
    cancelledSubject: (when: string) => `Visit cancelled · ${when}`,
    cancelledIntro: "Your visit has been cancelled. It does not count towards your cycle.",
    /* « 2:00 p.m. » porte déjà son point. */
    replaced: (when: string) => `It is replaced at the end of the series, on ${when.endsWith(".") ? when : `${when}.`}`,
    notReplaced: "We will call you to place it at the end of the series.",
    movedSubject: (when: string) => `Visit moved · ${when}`,
    movedIntro: "Your visit has been moved. The rest of your series stays as it is.",
    from: "Previous date", to: "New date",
    endedSubject: "Your NIVEX subscription is ending",
    endedIntro: "Your subscription is ending. The following visits have been removed from our calendar:",
    endedBye: "Thank you for your trust. We hope to see you again.",
  },
} as const;

function weekdayName(d: Date, tz: string, locale: "fr" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", { timeZone: tz, weekday: "long" }).format(d);
}

function timeOf(d: Date, tz: string, locale: "fr" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: locale === "en",
  }).format(d);
}

function dayOf(d: Date, tz: string, locale: "fr" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long",
  }).format(d);
}

/** « le vendredi, à 10 h 00 » — le créneau fixe d'une série. */
export function slotPhrase(first: Date, tz: string, locale: "fr" | "en"): string {
  return S[locale].slot(weekdayName(first, tz, locale), timeOf(first, tz, locale));
}

export function rhythmPhrase(everyWeeks: number, locale: "fr" | "en"): string {
  return S[locale].rhythm(everyWeeks);
}

function cycleRowsHtml(d: SubscriptionEmailData): string {
  const t = S[d.locale];
  const m = (c: number) => esc(formatMoney(c, d.currency, d.locale));
  if (d.travelCents <= 0) return row(t.cycle, `<strong>${m(d.planCents)}</strong>`);
  return row(t.cycle, m(d.planCents))
    + row(d.travelZone ? `${t.cycleTravel} (${d.travelZone})` : t.cycleTravel, m(d.travelCents))
    + row(t.cycleTotal, `<strong>${m(d.totalCents)}</strong>`);
}

function cycleRowsText(d: SubscriptionEmailData): string[] {
  const t = S[d.locale];
  const m = (c: number) => formatMoney(c, d.currency, d.locale);
  if (d.travelCents <= 0) return [`${t.cycle}: ${m(d.planCents)}`];
  return [`${t.cycle}: ${m(d.planCents)}`, `${t.cycleTravel}: ${m(d.travelCents)}`, `${t.cycleTotal}: ${m(d.totalCents)}`];
}

function note(text: string): string {
  return `<tr><td style="padding:20px 40px 0;">
    <p style="margin:0;padding-left:14px;border-left:2px solid ${GOLD_RULE};font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.8;color:${MUTED};">${esc(text)}</p>
  </td></tr>`;
}

function opening(name: string, intro: string, locale: "fr" | "en"): string {
  return `<p style="margin:0 0 14px;font-size:16px;">${esc(T[locale].hi(name.split(" ")[0]))}</p>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.75;color:${MUTED};">${esc(intro)}</p>`;
}

/** La confirmation d'un abonnement, envoyée une seule fois pour toute la série. */
export function subscriptionConfirmation(d: SubscriptionEmailData) {
  const t = S[d.locale];
  const first = d.visits[0];
  const last = d.visits[d.visits.length - 1];
  const slot = slotPhrase(first, d.timezone, d.locale);
  const firstText = formatDateTime(first, d.timezone, d.locale);
  const seriesText = t.seriesValue(d.visits.length, dayOf(last, d.timezone, d.locale));
  const next = d.visits.slice(0, 6).map((v) => dayOf(v, d.timezone, d.locale));
  const fee = formatMoney(d.feePerVisitCents, d.currency, d.locale);

  const inner = `
  <tr><td style="padding:36px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    ${opening(d.clientName, t.intro, d.locale)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.plan, `<strong>${esc(d.planName)}</strong>`)}
      ${row(t.rhythmLabel, esc(`${slot}, ${t.rhythm(d.everyWeeks)}`))}
      ${row(t.first, `<strong style="font-size:16px;">${esc(firstText)}</strong>`)}
      ${row(t.series, esc(seriesText))}
      ${row(t.duration, esc(minutesToText(d.minutesPerVisit, d.locale)))}
      ${row(t.where, esc(`${d.address}, ${d.city} ${d.postalCode}`))}
      ${cycleRowsHtml(d)}
      ${row(t.ref, `<code style="font-family:monospace;letter-spacing:0.06em;">${esc(d.ref)}</code>`)}
    </table>
  </td></tr>
  ${note(t.cycleNote(d.perCycle))}
  ${d.feePerVisitCents > 0 ? note(t.travelNote(fee)) : ""}
  ${note(arrivalLine(d))}
  <tr><td style="padding:24px 40px 0;font-family:Helvetica,Arial,sans-serif;">
    <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">${esc(t.upcoming)}</div>
    <p style="margin:0;font-size:14px;line-height:1.9;color:${MUTED};">${next.map(esc).join("<br>")}</p>
  </td></tr>
  <tr><td style="padding:28px 40px 34px;text-align:center;">${button(d.manageUrl, t.manage)}
    <p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${MUTED};">${esc(t.rule)}</p>
  </td></tr>`;

  const text = [
    T[d.locale].hi(d.clientName.split(" ")[0]), "", t.intro, "",
    `${t.plan}: ${d.planName}`,
    `${t.rhythmLabel}: ${slot}, ${t.rhythm(d.everyWeeks)}`,
    `${t.first}: ${firstText}`,
    `${t.series}: ${seriesText}`,
    `${t.duration}: ${minutesToText(d.minutesPerVisit, d.locale)}`,
    `${t.where}: ${d.address}, ${d.city} ${d.postalCode}`,
    ...cycleRowsText(d),
    `${t.ref}: ${d.ref}`, "",
    t.cycleNote(d.perCycle),
    d.feePerVisitCents > 0 ? t.travelNote(fee) : "",
    arrivalLine(d), "",
    `${t.upcoming}:`, ...next.map((x) => `  · ${x}`), "",
    `${t.manage}: ${d.manageUrl}`, "", t.rule, "",
    `NIVEX · ${d.businessPhone} · ${d.businessEmail}`,
  ].filter((x) => x !== null).join("\n");

  return { subject: t.subject(d.planName, d.ref), html: shell(inner, `${slot} — ${d.ref}`, d.businessEmail, d.locale), text };
}

/** La fiche de l'artisan pour un nouvel abonnement. */
export function subscriptionOwnerNotification(d: SubscriptionEmailData, byOwner = false) {
  const first = d.visits[0];
  const last = d.visits[d.visits.length - 1];
  const fr = { ...d, locale: "fr" as const };
  const slot = slotPhrase(first, d.timezone, "fr");
  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${d.address}, ${d.city}, QC ${d.postalCode}`)}`;
  const intro = byOwner
    ? "L'abonnement que vous venez d'entrer est en place, et ses visites sont dans votre agenda."
    : "Un nouvel abonnement vient d'être pris sur le site. Ses visites sont dans votre agenda.";

  const inner = `
  <tr><td style="padding:34px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:${MUTED};">${esc(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Client", `<strong>${esc(d.clientName)}</strong>`)}
      ${row("Téléphone", `<a href="tel:${esc(d.clientPhone.replace(/[^\d+]/g, ""))}" style="color:${GOLD};text-decoration:none;">${esc(d.clientPhone)}</a>`)}
      ${row("Courriel", `<a href="mailto:${esc(d.clientEmail)}" style="color:${GOLD};text-decoration:none;">${esc(d.clientEmail)}</a>`)}
      ${row("Adresse", `<a href="${esc(maps)}" style="color:${GOLD};text-decoration:none;">${esc(`${d.address}, ${d.city} ${d.postalCode}`)}</a>`)}
      ${row("Formule", `<strong>${esc(d.planName)}</strong>`)}
      ${row("Rythme", esc(`${slot}, ${S.fr.rhythm(d.everyWeeks)}`))}
      ${row("Première visite", esc(formatDateTime(first, d.timezone, "fr")))}
      ${row("Série", esc(S.fr.seriesValue(d.visits.length, dayOf(last, d.timezone, "fr"))))}
      ${cycleRowsHtml(fr)}
      ${d.notes ? row("Précisions du client", esc(d.notes)) : ""}
      ${row("Référence", `<code style="font-family:monospace;">${esc(d.ref)}</code>`)}
    </table>
  </td></tr>
  <tr><td style="padding:26px 40px 34px;text-align:center;">${button(`${d.siteUrl}/admin`, "Ouvrir le tableau de bord")}</td></tr>`;

  const text = [
    intro, "",
    `Client : ${d.clientName}`, `Téléphone : ${d.clientPhone}`, `Courriel : ${d.clientEmail}`,
    `Adresse : ${d.address}, ${d.city} ${d.postalCode}`,
    `Formule : ${d.planName}`, `Rythme : ${slot}, ${S.fr.rhythm(d.everyWeeks)}`,
    `Première visite : ${formatDateTime(first, d.timezone, "fr")}`,
    `Série : ${S.fr.seriesValue(d.visits.length, dayOf(last, d.timezone, "fr"))}`,
    ...cycleRowsText(fr),
    d.notes ? `Précisions du client : ${d.notes}` : "",
    `Référence : ${d.ref}`, "", `${d.siteUrl}/admin`,
  ].filter(Boolean).join("\n");

  return {
    subject: `${byOwner ? "Abonnement entré" : "Nouvel abonnement"} — ${d.clientName} · ${d.planName}`,
    html: shell(inner, `${d.clientName} — ${d.planName}`, d.businessEmail),
    text,
  };
}

/**
 * Le rappel de la veille.
 *
 * Celui de la première visite d'un cycle dit ce qui se paie, et combien : le
 * client ne doit pas l'apprendre à la porte.
 */
export function visitReminder(d: VisitEmailData, today = false) {
  const t = S[d.locale];
  const when = formatDateTime(d.startsAt, d.timezone, d.locale);
  const total = formatMoney(d.totalCents, d.currency, d.locale);
  const shortWhen = today ? (d.locale === "en" ? "today" : "aujourd'hui") : (d.locale === "en" ? "tomorrow" : "demain");

  const inner = `
  <tr><td style="padding:36px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    ${opening(d.clientName, today ? t.reminderToday : t.reminderIntro, d.locale)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.when, `<strong style="font-size:16px;">${esc(when)}</strong>`)}
      ${row(t.plan, esc(d.planName))}
      ${row(t.visit, esc(t.visitValue(d.index, d.perCycle, d.cycle)))}
      ${row(t.duration, esc(minutesToText(d.minutesPerVisit, d.locale)))}
      ${row(t.where, esc(`${d.address}, ${d.city} ${d.postalCode}`))}
      ${d.paymentDue ? cycleRowsHtml(d) : ""}
    </table>
  </td></tr>
  ${d.paymentDue ? note(t.paymentNote(d.cycle, total)) : ""}
  ${note(arrivalLine(d))}
  <tr><td style="padding:28px 40px 34px;text-align:center;">${button(d.manageUrl, t.manage)}
    <p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${MUTED};">${esc(today ? t.tooLateNote : t.stillTime)}</p>
  </td></tr>`;

  const text = [
    T[d.locale].hi(d.clientName.split(" ")[0]), "", today ? t.reminderToday : t.reminderIntro, "",
    `${t.when}: ${when}`, `${t.plan}: ${d.planName}`,
    `${t.visit}: ${t.visitValue(d.index, d.perCycle, d.cycle)}`,
    `${t.where}: ${d.address}, ${d.city} ${d.postalCode}`,
    ...(d.paymentDue ? ["", ...cycleRowsText(d), t.paymentNote(d.cycle, total)] : []),
    "", arrivalLine(d), "", `${t.manage}: ${d.manageUrl}`, today ? t.tooLateNote : t.stillTime, "",
    `NIVEX · ${d.businessPhone} · ${d.businessEmail}`,
  ].join("\n");

  return { subject: t.reminderSubject(shortWhen), html: shell(inner, when, d.businessEmail, d.locale), text };
}

/** Ce que reçoit le client quand une visite est annulée ou déplacée. */
export function visitChanged(d: VisitEmailData, change: VisitChange) {
  const t = S[d.locale];
  const when = formatDateTime(d.startsAt, d.timezone, d.locale);
  let rows: string;
  let lines: string[];
  let intro: string;
  let subject: string;
  if (change.kind === "cancelled") {
    const repl = change.replacement ? formatDateTime(change.replacement, d.timezone, d.locale) : null;
    intro = `${t.cancelledIntro} ${repl ? t.replaced(repl) : t.notReplaced}`;
    subject = t.cancelledSubject(dayOf(d.startsAt, d.timezone, d.locale));
    rows = row(t.when, `<span style="text-decoration:line-through;">${esc(when)}</span>`)
      + (repl ? row(t.to, `<strong>${esc(repl)}</strong>`) : "");
    lines = [`${t.when}: ${when}`, ...(repl ? [`${t.to}: ${repl}`] : [])];
  } else {
    const from = formatDateTime(change.from, d.timezone, d.locale);
    intro = t.movedIntro;
    subject = t.movedSubject(dayOf(d.startsAt, d.timezone, d.locale));
    rows = row(t.from, `<span style="text-decoration:line-through;">${esc(from)}</span>`) + row(t.to, `<strong>${esc(when)}</strong>`);
    lines = [`${t.from}: ${from}`, `${t.to}: ${when}`];
  }

  const inner = `
  <tr><td style="padding:36px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    ${opening(d.clientName, intro, d.locale)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(t.plan, esc(d.planName))}
      ${rows}
    </table>
  </td></tr>
  <tr><td style="padding:28px 40px 34px;text-align:center;">${button(d.manageUrl, t.manage)}</td></tr>`;

  const text = [
    T[d.locale].hi(d.clientName.split(" ")[0]), "", intro, "",
    `${t.plan}: ${d.planName}`, ...lines, "", `${t.manage}: ${d.manageUrl}`, "",
    `NIVEX · ${d.businessPhone} · ${d.businessEmail}`,
  ].join("\n");

  return { subject, html: shell(inner, intro, d.businessEmail, d.locale), text };
}

/** L'artisan est prévenu de ce que le client a changé lui-même. */
export function ownerVisitChanged(d: VisitEmailData, change: VisitChange) {
  const when = formatDateTime(d.startsAt, d.timezone, "fr");
  const lines = change.kind === "cancelled"
    ? [
        `${d.clientName} a annulé sa visite du ${when} (visite ${d.index}/${d.perCycle} du cycle ${d.cycle}).`,
        change.replacement
          ? `Une visite de remplacement est posée en fin de série : ${formatDateTime(change.replacement, d.timezone, "fr")}.`
          : "Aucun créneau libre n'a été trouvé en fin de série : la visite est à replacer depuis l'onglet Abonnés.",
      ]
    : [
        `${d.clientName} a déplacé une visite.`,
        `Ancienne date : ${formatDateTime(change.from, d.timezone, "fr")}`,
        `Nouvelle date : ${when}`,
      ];

  const inner = `
  <tr><td style="padding:34px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    ${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${MUTED};">${esc(l)}</p>`).join("")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Formule", esc(d.planName))}
      ${row("Téléphone", esc(d.clientPhone))}
      ${row("Adresse", esc(`${d.address}, ${d.city} ${d.postalCode}`))}
    </table>
  </td></tr>
  <tr><td style="padding:26px 40px 34px;text-align:center;">${button(`${d.siteUrl}/admin`, "Ouvrir le tableau de bord")}</td></tr>`;

  return {
    subject: `${change.kind === "cancelled" ? "Visite annulée" : "Visite déplacée"} — ${d.clientName} · ${d.planName}`,
    html: shell(inner, lines[0], d.businessEmail),
    text: [...lines, "", `Formule : ${d.planName}`, `Téléphone : ${d.clientPhone}`, "", `${d.siteUrl}/admin`].join("\n"),
  };
}

/** La fin d'un abonnement, et les visites qu'elle retire. */
export function subscriptionEnded(d: SubscriptionEmailData, removed: Date[]) {
  const t = S[d.locale];
  const list = removed.map((v) => formatDateTime(v, d.timezone, d.locale));
  const inner = `
  <tr><td style="padding:36px 40px 30px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    ${opening(d.clientName, t.endedIntro, d.locale)}
    <p style="margin:0 0 24px;font-size:14px;line-height:1.9;color:${MUTED};text-decoration:line-through;">${list.map(esc).join("<br>")}</p>
    <p style="margin:0;font-size:14px;color:${MUTED};">${esc(t.endedBye)}</p>
  </td></tr>`;
  const text = [T[d.locale].hi(d.clientName.split(" ")[0]), "", t.endedIntro, ...list.map((x) => `  · ${x}`), "", t.endedBye].join("\n");
  return { subject: t.endedSubject, html: shell(inner, t.endedIntro, d.businessEmail, d.locale), text };
}

/**
 * Le courriel de l'artisan, une semaine avant la dernière visite d'une série.
 *
 * Après la première série : faut-il poser la seconde, au même tarif, ou
 * quelque chose change-t-il ? Après la seconde : les douze mois se terminent,
 * c'est le moment de proposer le renouvellement.
 */
export function seriesNotice(d: SubscriptionEmailData, o: { series: number; lastAt: Date; termEnds: boolean }) {
  const last = formatDateTime(o.lastAt, d.timezone, "fr");
  const lines = o.termEnds
    ? [
        `Les douze mois de l'abonnement de ${d.clientName} se terminent : sa dernière visite a lieu le ${last}.`,
        "C'est le moment de lui proposer le renouvellement. Le tarif garanti s'arrête avec cette visite.",
      ]
    : [
        `La série ${o.series} de l'abonnement de ${d.clientName} se termine : sa dernière visite a lieu le ${last}.`,
        "La réservation est-elle confirmée pour la série suivante, au même tarif, ou y a-t-il un changement ? Confirmez avec le client, puis posez la série depuis l'onglet Abonnés.",
      ];
  const inner = `
  <tr><td style="padding:34px 40px 8px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    ${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${MUTED};">${esc(l)}</p>`).join("")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row("Formule", esc(d.planName))}
      ${row("Rythme", esc(`${slotPhrase(d.visits[0] ?? o.lastAt, d.timezone, "fr")}, ${S.fr.rhythm(d.everyWeeks)}`))}
      ${row("Téléphone", `<a href="tel:${esc(d.clientPhone.replace(/[^\d+]/g, ""))}" style="color:${GOLD};text-decoration:none;">${esc(d.clientPhone)}</a>`)}
      ${row("Courriel", esc(d.clientEmail))}
      ${row("Référence", `<code style="font-family:monospace;">${esc(d.ref)}</code>`)}
    </table>
  </td></tr>
  <tr><td style="padding:26px 40px 34px;text-align:center;">${button(`${d.siteUrl}/admin`, "Ouvrir l'onglet Abonnés")}</td></tr>`;
  return {
    subject: o.termEnds
      ? `Fin des douze mois — ${d.clientName} · ${d.planName}`
      : `Fin de la série ${o.series} — ${d.clientName} · ${d.planName}`,
    html: shell(inner, lines[0], d.businessEmail),
    text: [...lines, "", `Formule : ${d.planName}`, `Téléphone : ${d.clientPhone}`, `Courriel : ${d.clientEmail}`, "", `${d.siteUrl}/admin`].join("\n"),
  };
}

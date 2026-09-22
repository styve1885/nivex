/**
 * Tests de la demande de créneau.
 * Exécution : npx tsx tests/requests.test.mjs
 *
 * Ce que l'on vérifie ici, c'est le contrat du courriel : sa destination,
 * et le fait qu'aucune des informations saisies ne se perde en route. Ce
 * que l'on ne peut pas vérifier ici, c'est la remise par Gmail — elle
 * demande le compte Google branché, qui n'existe qu'en production.
 */
import assert from "node:assert/strict";

const { slotLabel, SlotRequestInput } = await import("../src/lib/requests.ts");
const { slotRequestNotification, slotRequestAcknowledgement } = await import("../src/lib/email.ts");
const { REQUEST_INBOX, PHONE } = await import("../src/lib/brand.ts");
const { slotIsFree } = await import("../src/lib/availability.ts");
const { FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { fromWall } = await import("../src/lib/time.ts");

const TZ = "America/Toronto";
const schedule = { ...FALLBACK_SETTINGS, timezone: TZ };

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log("\nDemande de créneau\n");

/* ————— La destination ————— */

test("les demandes partent vers la boîte annoncée", () => {
  assert.equal(REQUEST_INBOX, "nivexrepassage@gmail.com");
});

/* ————— La saisie ————— */

const base = {
  locale: "fr",
  items: [{ key: "shirt", qty: 6 }],
  name: "Claire Beaulieu",
  phone: "450 943-1217",
  address: "88 rue Saint-Charles Ouest, app. 3",
  city: "Longueuil",
  postalCode: "J4H 1C6",
  startsAt: "2026-10-03T18:00:00.000Z",
  consent: true,
};

test("le courriel est facultatif", () => {
  assert.equal(SlotRequestInput.safeParse(base).success, true);
  assert.equal(SlotRequestInput.safeParse({ ...base, email: "" }).success, true);
  assert.equal(SlotRequestInput.safeParse({ ...base, email: "claire@example.com" }).success, true);
  assert.equal(SlotRequestInput.safeParse({ ...base, email: "pas-une-adresse" }).success, false);
});

test("le téléphone et l'adresse, eux, sont exigés", () => {
  assert.equal(SlotRequestInput.safeParse({ ...base, phone: "" }).success, false);
  assert.equal(SlotRequestInput.safeParse({ ...base, address: "" }).success, false);
  assert.equal(SlotRequestInput.safeParse({ ...base, postalCode: "ABC" }).success, false);
});

test("l'heure demandée doit être une vraie heure", () => {
  assert.equal(SlotRequestInput.safeParse({ ...base, startsAt: "samedi après-midi" }).success, false);
  assert.equal(SlotRequestInput.safeParse({ ...base, startsAt: "2026-10-03" }).success, false);
  assert.equal(SlotRequestInput.safeParse({ ...base, startsAt: "" }).success, false);
});

test("le deuxième choix est facultatif", () => {
  assert.equal(SlotRequestInput.safeParse({ ...base, altStartsAt: "2026-10-05T23:00:00.000Z" }).success, true);
  assert.equal(SlotRequestInput.safeParse({ ...base, altStartsAt: "" }).success, true);
  assert.equal(SlotRequestInput.safeParse({ ...base, altStartsAt: "un soir" }).success, false);
});

test("le créneau se dit en jour et en heure, dans la langue de la personne", () => {
  const iso = "2026-10-03T18:00:00.000Z";   // samedi 3 octobre, 14 h à Montréal
  assert.equal(slotLabel(iso, TZ, "fr"), "samedi 3 octobre 2026 à 14 h 00");
  assert.match(slotLabel(iso, TZ, "en"), /^Saturday, October 3, 2026 at 02:00 [ap]\.?m\.?$/i);
  assert.match(slotLabel(iso, TZ), /samedi 3 octobre/);
});

/* ————— L'heure doit tomber dans l'horaire de la maison ————— */

test("une heure hors de l'horaire est refusée, une heure dedans acceptée", () => {
  const far = (days, hour) => {
    const d = new Date(Date.now() + days * 86400_000);
    return fromWall({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour, minute: 0 }, TZ);
  };
  // L'horaire de démonstration ouvre du lundi au samedi, 7 h – 22 h.
  const open = { ...schedule, hours: schedule.hours.map((h) => ({ ...h, enabled: h.day !== 0 })) };
  const monday = (() => {
    let i = 2;
    while (new Date(Date.now() + i * 86400_000).getUTCDay() !== 1) i++;
    return i;
  })();
  assert.equal(slotIsFree(far(monday, 9).toISOString(), 120, [], open), true, "9 h un lundi : dans l'horaire");
  assert.equal(slotIsFree(far(monday, 5).toISOString(), 120, [], open), false, "5 h : avant l'ouverture");
  assert.equal(slotIsFree(far(monday, 21).toISOString(), 120, [], open), false, "21 h + 2 h : dépasse la fermeture");
});

test("une heure trop proche est refusée, le délai de prévenance tient", () => {
  assert.equal(slotIsFree(new Date(Date.now() + 3600_000).toISOString(), 120, [], schedule), false);
});

/* ————— Le courriel de l'artisan ————— */

const data = {
  ref: "NVX-ABC123",
  locale: "fr",
  clientName: "Claire Beaulieu",
  clientEmail: null,
  clientPhone: "450 943-1217",
  address: "88 rue Saint-Charles Ouest, app. 3",
  city: "Longueuil",
  postalCode: "J4H 1C6",
  items: [{ label: "Chemises", qty: 6 }, { label: "Costumes & vestes", qty: 1 }],
  durationMinutes: 120,
  estimateCents: 5000,
  currency: "CAD",
  firstHourFree: true,
  first: "samedi 3 octobre 2026 à 14 h 00",
  second: "mercredi 7 octobre 2026 à 19 h 00",
  comment: "Sonnette en panne, appelez en arrivant.",
  notes: "Une chemise en lin, fragile.",
  siteUrl: "https://nivexrepassage.ca",
  businessPhone: PHONE,
  businessEmail: "styve1884@gmail.com",
};

test("rien de ce que la personne a saisi ne se perd", () => {
  const mail = slotRequestNotification(data);
  for (const bit of [
    "samedi 3 octobre 2026 à 14 h 00", "mercredi 7 octobre 2026 à 19 h 00", "Claire Beaulieu", "450 943-1217",
    "88 rue Saint-Charles Ouest, app. 3", "Longueuil", "J4H 1C6", "Chemises", "Costumes & vestes",
    "Sonnette en panne", "Une chemise en lin", "NVX-ABC123",
  ]) {
    assert.ok(mail.text.includes(bit), `texte : « ${bit} » manquant`);
    assert.ok(mail.html.includes(bit.replace(/&/g, "&amp;")), `html : « ${bit} » manquant`);
  }
});

test("l'objet dit de quoi il s'agit et quand", () => {
  const mail = slotRequestNotification(data);
  assert.match(mail.subject, /^Demande de créneau — Claire Beaulieu · samedi 3 octobre 2026 à 14 h 00$/);
});

test("le courriel dit franchement que rien n'est réservé", () => {
  const mail = slotRequestNotification(data);
  assert.match(mail.text, /Rien n'est réservé/);
  assert.ok(!/confirmé/i.test(mail.subject));
});

test("l'absence de courriel est dite, pas masquée", () => {
  const mail = slotRequestNotification(data);
  assert.match(mail.text, /Courriel : non fourni/);
  const withMail = slotRequestNotification({ ...data, clientEmail: "claire@example.com" });
  assert.match(withMail.text, /Courriel : claire@example\.com/);
});

/* ————— L'accusé de réception ————— */

test("l'accusé ne promet aucune réservation", () => {
  const ack = slotRequestAcknowledgement({ ...data, clientEmail: "claire@example.com" });
  assert.match(ack.text, /Rien n'est encore réservé/);
  assert.match(ack.text, new RegExp(PHONE.replace(/\+/g, "\\+")));
  assert.ok(!/agenda|invitation|lien personnel/i.test(ack.text));
});

test("l'accusé parle anglais quand la personne parle anglais", () => {
  const ack = slotRequestAcknowledgement({ ...data, locale: "en", clientEmail: "claire@example.com" });
  assert.match(ack.text, /Nothing is booked yet/);
  assert.ok(!/calendar invitation|personal link/i.test(ack.text));
});

console.log(`\n${n} vérifications passées.\n`);

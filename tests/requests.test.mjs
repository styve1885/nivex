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

const { slotLabel, SlotRequestInput, DAY_KEYS, MOMENT_KEYS } = await import("../src/lib/requests.ts");
const { slotRequestNotification, slotRequestAcknowledgement } = await import("../src/lib/email.ts");
const { REQUEST_INBOX, PHONE } = await import("../src/lib/brand.ts");

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
  day: "saturday",
  moment: "afternoon",
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

test("le créneau souhaité fait partie des choix offerts", () => {
  assert.equal(SlotRequestInput.safeParse({ ...base, day: "mardi" }).success, false);
  assert.equal(SlotRequestInput.safeParse({ ...base, moment: "nuit" }).success, false);
  for (const d of DAY_KEYS) for (const m of MOMENT_KEYS) {
    assert.equal(SlotRequestInput.safeParse({ ...base, day: d, moment: m }).success, true);
  }
});

test("le deuxième choix est facultatif", () => {
  assert.equal(SlotRequestInput.safeParse({ ...base, altDay: "weekday", altMoment: "evening" }).success, true);
  assert.equal(SlotRequestInput.safeParse({ ...base, altDay: "", altMoment: "" }).success, true);
});

test("le créneau se dit dans la langue de la personne", () => {
  assert.equal(slotLabel("saturday", "afternoon", "fr"), "Samedi · Après-midi");
  assert.equal(slotLabel("saturday", "afternoon", "en"), "Saturday · Afternoon");
  assert.equal(slotLabel("weekday", "evening"), "Soir de semaine · Soirée");
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
  first: "Samedi · Après-midi",
  second: "Soir de semaine · Soirée",
  comment: "Sonnette en panne, appelez en arrivant.",
  notes: "Une chemise en lin, fragile.",
  siteUrl: "https://nivexrepassage.ca",
  businessPhone: PHONE,
  businessEmail: "styve1884@gmail.com",
};

test("rien de ce que la personne a saisi ne se perd", () => {
  const mail = slotRequestNotification(data);
  for (const bit of [
    "Samedi · Après-midi", "Soir de semaine · Soirée", "Claire Beaulieu", "450 943-1217",
    "88 rue Saint-Charles Ouest, app. 3", "Longueuil", "J4H 1C6", "Chemises", "Costumes & vestes",
    "Sonnette en panne", "Une chemise en lin", "NVX-ABC123",
  ]) {
    assert.ok(mail.text.includes(bit), `texte : « ${bit} » manquant`);
    assert.ok(mail.html.includes(bit.replace(/&/g, "&amp;")), `html : « ${bit} » manquant`);
  }
});

test("l'objet dit de quoi il s'agit et quand", () => {
  const mail = slotRequestNotification(data);
  assert.match(mail.subject, /^Demande de créneau — Claire Beaulieu · Samedi · Après-midi$/);
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

/**
 * Tests de la réservation : ce que le client et l'artisan reçoivent, et
 * ce que l'horaire autorise.
 * Exécution : npx tsx tests/booking.test.mjs
 *
 * Ce qui n'est pas vérifiable ici : la remise effective par Gmail et
 * l'écriture dans l'agenda, qui demandent le compte Google branché. Pour
 * celles-là, l'espace artisan propose un envoi d'essai.
 */
import assert from "node:assert/strict";

const { clientConfirmation, ownerNotification } = await import("../src/lib/email.ts");
const { slotIsFree } = await import("../src/lib/availability.ts");
const { FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { fromWall } = await import("../src/lib/time.ts");
const { REQUEST_INBOX, PHONE } = await import("../src/lib/brand.ts");

const TZ = "America/Toronto";
const settings = { ...FALLBACK_SETTINGS, timezone: TZ };

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

/* Intl sépare « 50 $ » et « 14 h 00 » par des espaces insécables fines.
   On compare sur un texte normalisé, sinon on teste le caractère d'espace
   plutôt que le contenu. */
const flat = (x) => x.replace(/[\u00A0\u202F\u2009]/g, " ");

console.log("\nRéservation\n");

const d = {
  ref: "NVX-ABC123",
  locale: "fr",
  clientName: "Claire Beaulieu",
  clientEmail: "claire@example.com",
  clientPhone: "450 943-1217",
  address: "88 rue Saint-Charles Ouest, app. 3",
  city: "Longueuil",
  postalCode: "J4H 1C6",
  notes: "Une chemise en lin, fragile.",
  items: [{ label: "Chemises", qty: 6 }, { label: "Costumes & vestes", qty: 1 }],
  startsAt: new Date("2026-10-03T18:00:00.000Z"),   // samedi 3 octobre, 14 h
  durationMinutes: 120,
  estimateCents: 5000,
  currency: "CAD",
  firstHourFree: true,
  timezone: TZ,
  manageUrl: "https://nivexrepassage.ca/fr/reservation/abc",
  siteUrl: "https://nivexrepassage.ca",
  businessPhone: PHONE,
  businessEmail: "styve1884@gmail.com",
};

/* ————— La destination ————— */

test("la fiche de mission part vers la boîte de la maison", () => {
  assert.equal(REQUEST_INBOX, "nivexrepassage@gmail.com");
});

/* ————— Le courriel du client ————— */

test("le client reçoit l'heure, l'adresse, le montant et sa référence", () => {
  const m = clientConfirmation(d);
  for (const bit of ["samedi 3 octobre 2026", "14 h 00", "88 rue Saint-Charles Ouest", "Longueuil",
                     "Chemises", "2 heures", "50 $", "NVX-ABC123"]) {
    assert.ok(flat(m.text).includes(bit), `texte : « ${bit} » manquant`);
  }
  assert.match(m.subject, /confirmée/);
});

test("le client reçoit son lien de gestion et le délai d'annulation", () => {
  const m = clientConfirmation(d);
  assert.ok(m.text.includes(d.manageUrl), "lien de gestion manquant");
  assert.ok(m.html.includes(d.manageUrl), "lien de gestion absent du html");
  assert.match(flat(m.text), /2 h avant le rendez-vous/);
});

test("la première heure offerte est annoncée quand elle s'applique", () => {
  assert.match(clientConfirmation(d).text, /Première heure offerte/);
  assert.ok(!/Première heure offerte/.test(clientConfirmation({ ...d, firstHourFree: false }).text));
});

test("le client anglophone est servi en anglais", () => {
  const m = clientConfirmation({ ...d, locale: "en" });
  assert.match(m.subject, /confirmed/);
  assert.match(m.text, /Saturday, October 3, 2026/);
});

/* ————— Le courriel de l'artisan ————— */

test("l'artisan reçoit de quoi se déplacer et de quoi appeler", () => {
  const m = ownerNotification(d);
  for (const bit of ["Claire Beaulieu", "450 943-1217", "claire@example.com",
                     "88 rue Saint-Charles Ouest", "samedi 3 octobre 2026", "NVX-ABC123"]) {
    assert.ok(flat(m.text).includes(bit), `texte : « ${bit} » manquant`);
  }
  assert.ok(m.html.includes("maps.google.com"), "lien vers la carte manquant");
});

test("l'artisan lit toujours en français, même pour un client anglophone", () => {
  const m = ownerNotification({ ...d, locale: "en" });
  assert.match(m.subject, /^Nouvelle réservation/);
});

test("une annulation se distingue d'une réservation", () => {
  assert.match(ownerNotification(d, true).subject, /^Annulation/);
});

/* ————— L'horaire ————— */

const at = (days, hour) => {
  const x = new Date(Date.now() + days * 86400_000);
  return fromWall({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate(), hour, minute: 0 }, TZ)
    .toISOString();
};
const nextWeekday = (wd) => { let i = 2; while (new Date(Date.now() + i * 86400_000).getUTCDay() !== wd) i++; return i; };

test("une heure dans l'horaire, libre, est réservable", () => {
  assert.equal(slotIsFree(at(nextWeekday(1), 9), 120, [], settings), true);
});

test("un jour fermé est refusé", () => {
  const closed = { ...settings, hours: settings.hours.map((h) => ({ ...h, enabled: h.day !== 0 })) };
  assert.equal(slotIsFree(at(nextWeekday(0), 10), 120, [], closed), false);
});

test("une séance qui déborde la fermeture est refusée", () => {
  assert.equal(slotIsFree(at(nextWeekday(1), 21), 120, [], settings), false);
});

test("le délai de prévenance est tenu", () => {
  assert.equal(slotIsFree(new Date(Date.now() + 3600_000).toISOString(), 120, [], settings), false);
});

test("une occupation de l'agenda ferme le créneau, tampon compris", () => {
  const lundi = nextWeekday(1);
  const neuf = new Date(at(lundi, 9)).getTime();
  // Occupation de 11 h à 12 h : le tampon de trente minutes la fait mordre
  // sur une séance de 9 h à 11 h, qui tombe donc.
  const busy = [{ start: neuf + 120 * 60_000, end: neuf + 180 * 60_000 }];
  assert.equal(slotIsFree(new Date(neuf).toISOString(), 120, busy, settings), false);
  // À 7 h, l'ouverture, la séance finit à 9 h : deux heures de marge, elle tient.
  assert.equal(slotIsFree(at(lundi, 7), 120, busy, settings), true);
});

console.log(`\n${n} vérifications passées.\n`);

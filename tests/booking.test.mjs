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
const { REQUEST_INBOX, PHONE, SETUP_MINUTES } = await import("../src/lib/brand.ts");
const { occupiedBlock } = await import("../src/lib/bookings.ts");
const { perHour } = await import("../src/lib/pricing.ts");

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

/* ————— Installation et rangement ————— */

test("le bloc occupé déborde la séance d'un quart d'heure de chaque côté", () => {
  const b = { startsAt: new Date("2026-10-05T17:00:00.000Z"), endsAt: new Date("2026-10-05T19:00:00.000Z") };
  const block = occupiedBlock(b);
  assert.equal(block.start.toISOString(), "2026-10-05T16:45:00.000Z", "arrivée 15 min avant");
  assert.equal(block.end.toISOString(), "2026-10-05T19:15:00.000Z", "départ 15 min après");
  assert.equal(SETUP_MINUTES, 15);
});

test("une séance de 13 h à 15 h occupe bien 12 h 45 à 15 h 15", () => {
  // 13 h à Montréal en octobre = 17 h UTC.
  const b = { startsAt: new Date("2026-10-05T17:00:00.000Z"), endsAt: new Date("2026-10-05T19:00:00.000Z") };
  const fmt = (d) => new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const block = occupiedBlock(b);
  assert.equal(flat(fmt(b.startsAt)), "13 h 00");
  assert.equal(flat(fmt(block.start)), "12 h 45");
  assert.equal(flat(fmt(block.end)), "15 h 15");
});

test("deux séances collées ne peuvent pas coexister", () => {
  const premiere = { start: Date.parse("2026-10-05T17:00:00.000Z"), end: Date.parse("2026-10-05T19:00:00.000Z") };
  const suivante = occupiedBlock({
    startsAt: new Date("2026-10-05T19:00:00.000Z"),
    endsAt: new Date("2026-10-05T21:00:00.000Z"),
  });
  const bloque = occupiedBlock({ startsAt: new Date(premiere.start), endsAt: new Date(premiere.end) });
  // 15 h 15 de rangement contre 14 h 45 d'installation : les deux se croisent.
  assert.ok(suivante.start.getTime() < bloque.end.getTime(), "les deux blocs se chevauchent bien");
});

/* ————— Les temps chronométrés ————— */

test("la cadence annoncée découle des minutes du moteur", () => {
  const attendu = { shirt: 7, delicate: 4, suit: 3, trousers: 6, linen: 8, uniform: 5 };
  for (const svc of FALLBACK_SETTINGS.services) {
    assert.equal(perHour(svc.minutesPerUnit), attendu[svc.key], `${svc.key} : cadence horaire`);
  }
});

test("les forfaits tiennent dans leur durée, au nouveau rythme", () => {
  const min = Object.fromEntries(FALLBACK_SETTINGS.services.map((s) => [s.key, s.minutesPerUnit]));
  // Les exemples affichés sur la grille, recalculés.
  const exemples = [
    { nom: "Exécutif & Découverte", minutes: 120, panier: { shirt: 8, trousers: 4, suit: 1 }, plage: [10, 15] },
    { nom: "Famille & Scolaire",    minutes: 180, panier: { shirt: 10, trousers: 6, uniform: 4 }, plage: [15, 22] },
    { nom: "Garde-robe Prestige",   minutes: 240, panier: { shirt: 12, trousers: 8, suit: 3, linen: 2 }, plage: [20, 30] },
  ];
  for (const e of exemples) {
    const duree = Object.entries(e.panier).reduce((t, [k, q]) => t + min[k] * q, 0);
    const pieces = Object.values(e.panier).reduce((t, q) => t + q, 0);
    assert.ok(duree <= e.minutes, `${e.nom} : ${duree} min pour ${e.minutes} annoncées`);
    assert.ok(pieces >= e.plage[0] && pieces <= e.plage[1],
      `${e.nom} : ${pieces} pièces hors de la fourchette ${e.plage.join("–")}`);
  }
});

test("le courriel de confirmation annonce l'arrivée anticipée", () => {
  const m = clientConfirmation(d);
  assert.match(flat(m.text), /15 minutes avant le début de votre séance/);
  assert.match(m.html, /15 minutes avant/);
  assert.match(flat(clientConfirmation({ ...d, locale: "en" }).text), /15 minutes before your session begins/);
});

console.log(`\n${n} vérifications passées.\n`);

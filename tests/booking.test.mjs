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

const { clientConfirmation, clientCancellation, ownerNotification, contactAcknowledgement, reviewRequest } = await import("../src/lib/email.ts");
const { displayName, sendGmail } = await import("../src/lib/google.ts");
const { getDict } = await import("../src/lib/i18n/index.ts");
const { slotIsFree } = await import("../src/lib/availability.ts");
const { FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { fromWall } = await import("../src/lib/time.ts");
const { REQUEST_INBOX, PHONE, INSTALL_MINUTES, PACKUP_MINUTES, EARLY_ARRIVAL_MINUTES } = await import("../src/lib/brand.ts");
const { occupiedBlock, calendarEvent, bookedUnits, sessionLabel } = await import("../src/lib/bookings.ts");
const {
  bookableOffers, capacityPieces, ironingMinutes, planPieces, sessionPhases, BLOCKS, BUNDLES, ADDONS, PLANS,
  PUBLISHED, UNIT_PRICES, sessionLength, sessionPriceCents,
} = await import("../src/lib/pricing.ts");
const { estimateRange, itemText, moneyRange } = await import("../src/lib/items.ts");
const { setupSentence } = await import("../src/lib/capacity.ts");
const { faqFill } = await import("../src/components/home/faq-fill.ts");
const { fr } = await import("../src/lib/i18n/fr.ts");
const { retiredFr, retiredEn } = await import("../src/lib/i18n/retired.ts");

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

const { formatDateTime } = await import("../src/lib/time.ts");

test("une heure du matin s'écrit sans zéro de tête, en français comme en anglais", () => {
  // 7 h à Montréal le 20 octobre = 11 h UTC.
  const sept = new Date("2026-10-20T11:00:00.000Z");
  assert.equal(flat(formatDateTime(sept, TZ, "fr")), "mardi 20 octobre 2026 à 7 h 00");
  assert.equal(flat(formatDateTime(sept, TZ, "en")), "Tuesday, October 20, 2026 at 7:00 a.m.");
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

/* ————— Le tunnel ————— */

const { pastHorizon, rejectedContactFields } = await import("../src/components/booking/Stepper.helpers.ts");

test("la flèche des quinzaines s'arrête à l'horizon de la réservation en ligne", () => {
  // Horizon de 45 jours depuis le 19 octobre : dernier début possible le 3 décembre.
  assert.equal(pastHorizon("2026-11-16", "2026-10-19", 45), false, "la quinzaine suivante commence le 30 novembre");
  assert.equal(pastHorizon("2026-11-30", "2026-10-19", 45), true, "la suivante commencerait le 14 décembre");
  assert.equal(pastHorizon("", "2026-10-19", 45), false, "sans horaire, rien à arrêter");
});

test("un refus du serveur sur les coordonnées renvoie aux champs en cause", () => {
  assert.deepEqual(
    rejectedContactFields({ email: ["Invalid email address"], notes: ["Too long"], postalCode: ["Invalid"] }),
    ["email", "postal"],
  );
  assert.deepEqual(rejectedContactFields({ items: ["Required"] }), [], "rien à corriger à l'étape Adresse");
  assert.deepEqual(rejectedContactFields({ toString: ["x"] }), [], "les noms hérités ne comptent pas");
  assert.deepEqual(rejectedContactFields(null), []);
});

/* ————— Installation et rangement ————— */

test("aujourd'hui, le bloc occupé est la séance elle-même : l'installation et le rangement y sont compris", () => {
  const b = { startsAt: new Date("2026-10-05T17:00:00.000Z"), endsAt: new Date("2026-10-05T19:00:00.000Z"), setupMinutes: 0 };
  const block = occupiedBlock(b);
  assert.equal(block.start.toISOString(), "2026-10-05T17:00:00.000Z", "arrivée à l'heure du début");
  assert.equal(block.end.toISOString(), "2026-10-05T19:00:00.000Z", "départ à l'heure de la fin");
  assert.equal(INSTALL_MINUTES, 5);
  assert.equal(PACKUP_MINUTES, 5);
});

test("l'ancien déroulement garde son quart d'heure : 13 h à 15 h occupe 12 h 45 à 15 h 15", () => {
  // 13 h à Montréal en octobre = 17 h UTC.
  const b = { startsAt: new Date("2026-10-05T17:00:00.000Z"), endsAt: new Date("2026-10-05T19:00:00.000Z"), setupMinutes: EARLY_ARRIVAL_MINUTES };
  const fmt = (d) => new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const block = occupiedBlock(b);
  assert.equal(EARLY_ARRIVAL_MINUTES, 15);
  assert.equal(flat(fmt(b.startsAt)), "13 h 00");
  assert.equal(flat(fmt(block.start)), "12 h 45");
  assert.equal(flat(fmt(block.end)), "15 h 15");
});

test("deux séances collées : permises aujourd'hui, refusées dans l'ancien déroulement", () => {
  const at = (iso, m) => occupiedBlock({ startsAt: new Date(iso), endsAt: new Date(Date.parse(iso) + 2 * 3600_000), setupMinutes: m });
  const neuve = [at("2026-10-05T17:00:00.000Z", 0), at("2026-10-05T19:00:00.000Z", 0)];
  assert.ok(neuve[1].start.getTime() >= neuve[0].end.getTime(), "13 h–15 h puis 15 h–17 h se touchent sans se croiser");
  const ancienne = [at("2026-10-05T17:00:00.000Z", 15), at("2026-10-05T19:00:00.000Z", 15)];
  assert.ok(ancienne[1].start.getTime() < ancienne[0].end.getTime(), "15 h 15 de rangement contre 14 h 45 d'installation");
});

test("les trois temps d'une séance de 12 h à 14 h : installation, repassage, rangement", () => {
  const fmt = (d) => flat(new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d));
  const start = new Date("2026-10-05T16:00:00.000Z"), end = new Date("2026-10-05T18:00:00.000Z"); // 12 h – 14 h
  const p = sessionPhases(start, end, 0);
  assert.deepEqual([p.install, p.ironing, p.packup].map((x) => `${fmt(x.start)} – ${fmt(x.end)}`),
    ["12 h 00 – 12 h 05", "12 h 05 – 13 h 55", "13 h 55 – 14 h 00"]);
  assert.equal(p.ironingMinutes, 110);
  const old = sessionPhases(start, end, 15);
  assert.deepEqual([old.install, old.ironing, old.packup].map((x) => `${fmt(x.start)} – ${fmt(x.end)}`),
    ["11 h 45 – 12 h 00", "12 h 00 – 14 h 00", "14 h 00 – 14 h 15"]);
  assert.equal(old.ironingMinutes, 120);
});

/* ————— La capacité, un seul chiffre ————— */

test("jusqu'à 18 pièces en 2 h, 27 en 3 h ; 1 h 50 et 2 h 50 de repassage", () => {
  assert.equal(capacityPieces(120), 18);
  assert.equal(capacityPieces(180), 27);
  assert.equal(capacityPieces(240), 36);
  assert.equal(ironingMinutes(120), 110);
  assert.equal(ironingMinutes(180), 170);
});

test("le volume d'un cycle d'abonnement découle de la même capacité", () => {
  const vol = Object.fromEntries(PLANS.map((p) => [p.key, planPieces(p)]));
  assert.deepEqual(vol, { essentiel: 27, confort: 36, executif: 72, "grande-famille": 108 });
});

test("aucune offre n'écrit de quantité : le volume ne vient que de la capacité", () => {
  for (const o of [...BLOCKS, ...BUNDLES, ...ADDONS]) {
    for (const t of [o.fr, o.en]) assert.doesNotMatch(t.detail, /\d/, `${o.key} : « ${t.detail} »`);
  }
  for (const p of PLANS) {
    for (const t of [p.fr, p.en]) assert.doesNotMatch(t.detail, /pièces|pieces|trentaine|thirty/i, `${p.key} : « ${t.detail} »`);
  }
});

test("la grille ne propose aucune séance plus courte que la durée minimale", () => {
  const cles = (offres) => offres.map((o) => o.key);
  assert.deepEqual(cles(bookableOffers(BLOCKS, settings)), ["decouverte", "famille", "prestige"]);
  assert.deepEqual(cles(bookableOffers(BLOCKS, { ...settings, minMinutes: 180 })), ["famille", "prestige"]);
  assert.ok(bookableOffers(BUNDLES, { ...settings, minMinutes: 180 }).every((o) => o.minutes >= 180));
  assert.equal(bookableOffers(BUNDLES, settings).length, BUNDLES.length, "au minimum de deux heures, tout reste");
});

test("la foire aux questions : sept questions, dans l'ordre demandé, deux ou trois phrases chacune", () => {
  const en = getDict("en");
  assert.deepEqual(fr.faq.items.map((x) => flat(x.q)), [
    "Est-ce que vous ramassez les vêtements ?",
    "Faut-il fournir la planche et le fer ?",
    "Combien de vêtements repassez-vous en une séance ?",
    "Dois-je être présent pendant la séance ?",
    "Quelles zones desservez-vous ?",
    "Comment se fait le paiement ?",
    "Puis-je annuler ou déplacer mon rendez-vous ?",
  ]);
  assert.equal(en.faq.items.length, 7, "l'anglais suit le français");
  /* Les trois retirées restent, pour pouvoir les remettre — hors du
     dictionnaire, qui part en entier vers les composants clients. */
  assert.deepEqual(retiredFr.faq.map((x) => flat(x.q)),
    ["Combien de temps prévoir ?", "L'installation est-elle comprise dans la séance ?", "Et les pièces fragiles ?"]);
  assert.equal(retiredEn.faq.length, 3);
  /* Deux ou trois phrases, une fois remplies : la zone desservie en compte deux. */
  for (const t of [fr, en]) {
    for (const item of t.faq.items) {
      const a = faqFill(item.a, t, settings, t === fr ? "fr" : "en");
      const phrases = a.split(/(?<=[.?])\s+(?=[A-ZÀ-Ü«“])/).length;
      assert.ok(phrases <= 3, `${item.q} : ${phrases} phrases`);
    }
  }
});

test("la foire aux questions dit la capacité, et Tarifs le temps d'installation", () => {
  const capacite = fr.faq.items.find((x) => x.a.includes("{capacity}"));
  assert.equal(flat(capacite.q), "Combien de vêtements repassez-vous en une séance ?");
  assert.equal(faqFill(capacite.a, fr, settings, "fr"),
    "Jusqu'à 18 pièces en 2 h, et jusqu'à 27 en 3 h, selon la taille, le type et la matière des vêtements.");
  assert.ok(!fr.faq.items.some((x) => x.a.includes("{setup}")), "la question de l'installation est retirée");
  assert.equal(setupSentence(fr, settings, "fr"),
    "Chaque séance inclut l'installation et le rangement de notre matériel, 5 minutes chacun. Une séance de 2 h comprend donc 1 h 50 de repassage.");
  // La durée minimale réglée déplace les deux phrases ensemble.
  assert.match(faqFill(capacite.a, fr, { ...settings, minMinutes: 180 }, "fr"), /^Jusqu'à 27 pièces en 3 h, et jusqu'à 36 en 4 h,/);
  const en = getDict("en");
  assert.equal(faqFill(en.faq.items.find((x) => x.a.includes("{capacity}")).a, en, settings, "en"),
    "Up to 18 pieces in 2 hours, and up to 27 in 3 hours, depending on the size, type and fabric of the garments.");
  for (const item of fr.faq.items) assert.doesNotMatch(item.a, /\{cadence\}|par heure/, "plus aucune cadence par heure");
});

test("le courriel de confirmation dit l'arrivée à l'heure, et le temps de repassage", () => {
  const m = clientConfirmation(d);
  assert.ok(flat(m.text).includes("Votre artisan arrive à l'heure du début. Votre séance de 2 heures inclut l'installation et le rangement de notre matériel, 5 minutes chacun : 1 h 50 de repassage."));
  assert.doesNotMatch(m.text + m.html, /15 minutes avant/);
  assert.match(flat(clientConfirmation({ ...d, locale: "en" }).text), /arrives at the start time\. Your session of 2 hours includes setting up/);
  /* Un rendez-vous de l'ancien déroulement garde sa phrase. */
  assert.match(flat(clientConfirmation({ ...d, setupMinutes: 15 }).text), /15 minutes avant le début de votre séance/);
});

test("le courriel ne promet l'invitation que si elle est partie", () => {
  assert.match(clientConfirmation(d).text, /invitation a été ajoutée/);
  assert.match(clientConfirmation({ ...d, invited: true }).text, /invitation a été ajoutée/);
  assert.ok(!/invitation/i.test(clientConfirmation({ ...d, invited: false }).text));
  assert.ok(!/invitation/i.test(clientConfirmation({ ...d, locale: "en", invited: false }).text));
});

/* ————— La séance d'essai et les pièces à l'unité ————— */

test("la séance d'essai dure la durée minimale réglée, jamais moins de deux heures", () => {
  assert.equal(sessionLength(settings), 120);
  assert.equal(sessionPriceCents(settings), 11000, "110 $ à 55 $ l'heure");
  assert.equal(sessionLength({ minMinutes: 180 }), 180);
  assert.equal(sessionPriceCents({ minMinutes: 180, hourlyRate: 5500 }), 16500);
  assert.equal(sessionLength({ minMinutes: 60 }), 120, "jamais de séance d'une heure");
  assert.equal(sessionLabel(120, "fr"), "Séance de 2 heures");
  assert.equal(sessionLabel(120, "en"), "Session of 2 hours");
});

test("les pièces à l'unité se relisent contre la grille : prix figé, clé inconnue écartée", () => {
  const u = bookedUnits([
    { key: "parure-grand-lit", qty: 1 }, { key: "nappe", qty: 2 }, { key: "inconnue", qty: 3 },
    { key: "parure-grand-lit", qty: 2 }, { key: "serviette", qty: 49 }, { key: "serviette", qty: 5 },
  ], "fr");
  assert.deepEqual(u, [
    { key: "unit:parure-grand-lit", label: "Parure Queen ou King complète", qty: 3, cents: 2800 },
    { key: "unit:nappe", label: "Nappe de réception", qty: 2, cents: 1200, toCents: 1800 },
    { key: "unit:serviette", label: "Serviette de table", qty: 50, cents: 300 },
  ]);
  assert.equal(bookedUnits([{ key: "robe-gala", qty: 1 }], "en")[0].label, "Gala, ceremony or wedding dress");
  assert.deepEqual(bookedUnits([], "fr"), []);
  /* Chaque pièce de la page Tarifs a sa clé, et aucune ne se répète. */
  const keys = UNIT_PRICES.map((x) => x.key);
  assert.equal(new Set(keys).size, 14);
});

test("une ligne de réservation s'écrit avec son prix, en fourchette s'il varie", () => {
  const money = (c) => flat(new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100));
  assert.equal(itemText({ key: "session", label: "Séance de 2 heures", qty: 1 }, money), "Séance de 2 heures");
  assert.equal(itemText({ key: "unit:nappe", label: "Nappe de réception", qty: 2, cents: 1200, toCents: 1800 }, money),
    "Nappe de réception × 2 · 24 $ – 36 $");
  assert.equal(itemText({ key: "unit:drap", label: "Drap plat ou drap-housse", qty: 3, cents: 800 }, money),
    "Drap plat ou drap-housse × 3 · 24 $");
  /* Un rendez-vous d'avant garde l'écriture de l'ancien panier. */
  assert.equal(itemText({ key: "shirt", label: "Chemises", qty: 6 }, money), "Chemises × 6");
  assert.equal(itemText({ label: "Chemises", qty: 6 }, money), "Chemises × 6");
  const items = [{ key: "session", label: "S", qty: 1 }, { key: "unit:nappe", label: "N", qty: 2, cents: 1200, toCents: 1800 }];
  assert.deepEqual(estimateRange(items, 5500 + 2400), { low: 7900, high: 9100 });
  assert.deepEqual(estimateRange([{ label: "Chemises", qty: 6 }], 5000), { low: 5000, high: 5000 });
  assert.equal(moneyRange(7900, 9100, money), "79 $ – 91 $");
  assert.equal(moneyRange(7900, 7900, money), "79 $");
});

test("la confirmation d'une séance d'essai liste ses pièces, et l'estimation en fourchette", () => {
  const essai = {
    ...d, estimateCents: 5500 + 2400, firstHourFree: true, travelFeeCents: 1500, travelZone: "Zone B",
    items: [
      { key: "session", label: "Séance de 2 heures", qty: 1 },
      { key: "unit:nappe", label: "Nappe de réception", qty: 2, cents: 1200, toCents: 1800 },
    ],
  };
  const m = clientConfirmation(essai);
  for (const bit of ["Séance de 2 heures", "Nappe de réception × 2 · 24 $ – 36 $", "Estimation: 79 $ – 91 $", "Total estimé: 94 $ – 106 $"]) {
    assert.ok(flat(m.text).includes(bit), `« ${bit} » manquant`);
  }
  assert.ok(flat(m.html).includes("Nappe de réception × 2 · 24 $ – 36 $"));
  const o = ownerNotification(essai);
  assert.ok(flat(o.text).includes("Estimation: 79 $ – 91 $"));
  /* Sans pièce au prix variable, un seul montant. */
  assert.ok(flat(clientConfirmation({ ...essai, items: essai.items.slice(0, 1), estimateCents: 5500 }).text).includes("Estimation: 55 $"));
});

test("les formules retirées ne se publient plus, mais restent définies", () => {
  assert.deepEqual(Object.values(PUBLISHED), [false, false, false, false, false]);
  assert.equal(BLOCKS.length + BUNDLES.length + ADDONS.length, 12, "les douze offres sont gardées");
  assert.ok(retiredFr.tarifs.blocks && retiredFr.tarifs.bundles && retiredFr.tarifs.addons && retiredFr.tarifs.versus,
    "leurs textes aussi");
});

test("aucun texte retiré ne dort dans les dictionnaires, qui partent vers le navigateur", () => {
  /* Un dictionnaire est sérialisé dans la page pour les composants clients :
     ce qui y dort se lirait dans la source, et un assistant le trouverait. */
  const en = getDict("en");
  for (const t of [fr, en]) {
    const tout = JSON.stringify(t);
    for (const mot of ["velours", "Corduroy", "T-shirt en coton", "Cotton t-shirt", "Veste doublée", "Lined jacket",
      "Séance semaine", "Week session", "Grand Foyer", "Douce Nuit",
      "Prolongation", "ne s'improvise pas", "isn't improvised", "Composer ma séance", "Put my session together",
      "Combien de temps prévoir", "How much time should I plan"]) {
      assert.ok(!tout.includes(mot), `« ${mot} » est encore dans le dictionnaire`);
    }
  }
  assert.deepEqual(Object.keys(retiredEn), Object.keys(retiredFr), "l'anglais des textes retirés suit le français");
  /* L'avant/après ne montre plus que la chemise et le pantalon de complet. */
  assert.deepEqual(fr.beforeAfter.items.map((x) => x.key), ["chemise", "pantalon"]);
  assert.deepEqual(en.beforeAfter.items.map((x) => x.key), ["chemise", "pantalon"]);
  assert.deepEqual(retiredFr.beforeAfter.map((x) => x.key), ["velours", "t-shirt", "veste"]);
});

/* ————— L'invitation d'agenda ————— */

const booking = {
  ...d, manageToken: "tok123", endsAt: new Date("2026-10-03T20:00:00.000Z"), setupMinutes: 0,
  items: [{ key: "shirt", label: "Chemises", qty: 6 }],
  travelFeeCents: 1500, travelZone: "Zone B",
  origin: { heardFrom: "facebook", referral: "julie", source: "facebook" },
};
const origin = "https://nivexrepassage.ca";

test("l'invitation commence à l'heure d'arrivée, le début de la séance, et le dit", () => {
  const ev = calendarEvent(booking, origin, TZ);
  assert.equal(ev.start, "2026-10-03T18:00:00.000Z", "14 h, l'heure de la confirmation et de l'arrivée");
  assert.equal(ev.end, "2026-10-03T20:00:00.000Z");
  assert.match(flat(ev.description), /installation et rangement compris/);
  assert.match(flat(ev.description), /Votre artisan arrive à l'heure du début\. L'installation et le rangement de son matériel, 5 minutes chacun, font partie de la séance : 1 h 50 de repassage\./);
  assert.match(flat(calendarEvent({ ...booking, setupMinutes: 15 }, origin, TZ).description), /15 minutes avant le début de votre séance/);
});

test("l'invitation ne montre ni la provenance ni l'espace artisan", () => {
  for (const ev of [calendarEvent(booking, origin, TZ), calendarEvent({ ...booking, locale: "en" }, origin, TZ)]) {
    assert.ok(!/connus|heard|facebook|julie/i.test(ev.description), "provenance");
    assert.ok(!ev.description.includes("/admin"), "lien vers l'espace artisan");
  }
});

test("l'invitation se lit dans la langue du client, l'artisan y garde ses repères", () => {
  const fr = calendarEvent(booking, origin, TZ);
  assert.match(fr.summary, /Repassage à domicile · Claire Beaulieu/);
  for (const bit of ["Séance : samedi 3 octobre 2026", "450 943-1217", "Chemises × 6",
                     "Frais de déplacement (Zone B) : 15 $", "Total estimé : 65 $", "Référence : NVX-ABC123",
                     `${origin}/fr/reservation/tok123`]) {
    assert.ok(flat(fr.description).includes(bit), `fr : « ${bit} » manquant`);
  }
  const en = calendarEvent({ ...booking, locale: "en" }, origin, TZ);
  assert.match(en.summary, /In-home ironing · Claire Beaulieu/);
  for (const bit of ["Session: Saturday, October 3, 2026", "Your presser arrives at the start time",
                     "Travel fee (Zone B): $15", "Reference: NVX-ABC123", `${origin}/en/reservation/tok123`]) {
    assert.ok(flat(en.description).includes(bit), `en : « ${bit} » manquant`);
  }
  assert.ok(!/[!]/.test(fr.description + en.description + fr.summary + en.summary), "aucun point d'exclamation");
});

/* ————— L'enveloppe des courriels ————— */

test("le client anglophone lit l'en-tête et le pied en anglais, et la page dit sa langue", () => {
  for (const m of [clientConfirmation({ ...d, locale: "en" }), clientCancellation({ ...d, locale: "en" })]) {
    assert.match(m.html, /<html lang="en-CA">/);
    assert.ok(m.html.includes(getDict("en").brand.tagline), "devise anglaise absente");
    assert.ok(!m.html.includes(getDict("fr").brand.tagline), "en-tête resté en français");
  }
  assert.match(clientConfirmation(d).html, /<html lang="fr-CA">/);
  assert.ok(clientConfirmation(d).html.includes(getDict("fr").brand.tagline), "devise française absente");
  /* L'artisan lit en français, même pour un client anglophone. */
  assert.match(ownerNotification({ ...d, locale: "en" }).html, /<html lang="fr-CA">/);
});

test("le pied de page tire le téléphone de la marque, et ne nomme aucun secteur à la main", () => {
  const html = clientConfirmation(d).html;
  assert.ok(html.includes(`href="tel:${PHONE.replace(/\s/g, "")}"`), "lien tel absent");
  assert.ok(!/Rive-Sud/.test(html), "phrase de zone écrite à la main");
});

test("les ors des courriels sont ceux de la charte, jamais l'or inventé", () => {
  for (const m of [clientConfirmation(d), ownerNotification(d), contactAcknowledgement({ locale: "fr", siteUrl: d.siteUrl })]) {
    assert.ok(!/#B08D4F/i.test(m.html), "or hors charte");
    assert.match(m.html, /#866836/);   // gold-600, pour le texte
  }
});

/* ————— L'accusé de réception du formulaire de contact ————— */

test("l'accusé de réception est un texte fixe : ni le nom ni le message de l'expéditeur", () => {
  const typed = { name: "Gagnant-ReclamezVotrePrix", body: "Votre colis est bloque. Payez ici : http://evil.example/pay" };
  for (const locale of ["fr", "en"]) {
    /* Même si l'appelant lui passait le formulaire entier, rien n'en sort. */
    const a = contactAcknowledgement({ locale, siteUrl: d.siteUrl, businessEmail: "contact@nivexrepassage.ca", ...typed });
    for (const part of [a.subject, a.html, a.text]) {
      assert.ok(!part.includes("evil.example"), `${locale} : message recopié`);
      assert.ok(!part.includes("Gagnant"), `${locale} : nom recopié`);
    }
    assert.ok(!/!/.test(a.subject + a.text), `${locale} : point d'exclamation`);
    assert.ok(a.text.includes(PHONE), `${locale} : téléphone de la marque`);
  }
});

/* ————— L'en-tête To: ————— */

test("le nom d'un destinataire ne peut ni ajouter d'adresse ni casser l'en-tête", () => {
  assert.equal(displayName("Tremblay, Jean"), '"Tremblay, Jean"');
  assert.equal(displayName('Jean "JT" Tremblay'), '"Jean \\"JT\\" Tremblay"');
  assert.equal(displayName("Ann <a@x.org>, Bob"), '"Ann <a@x.org>, Bob"');
  assert.match(displayName("Côté, Jean"), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  assert.match(displayName("Jean\r\nBcc: x@y.org"), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
});

{
  /* L'en-tête tel que Gmail le reçoit : une seule boîte, celle du client. */
  const real = globalThis.fetch;
  let raw = "";
  globalThis.fetch = async (_url, init) => {
    raw = Buffer.from(JSON.parse(init.body).raw, "base64url").toString("utf8");
    return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
  };
  try {
    await sendGmail("jeton", {
      to: "client@example.com", toName: "Ann <victim1@example.org>, Bob <victim2@example.org>, Cy",
      subject: "Essai", html: "<p>x</p>", text: "x", fromName: "NIVEX",
    });
  } finally {
    globalThis.fetch = real;
  }
  test("un nom piégé reste un nom : l'en-tête To: ne porte qu'une adresse", () => {
    const line = raw.split("\r\n").find((l) => l.startsWith("To: "));
    assert.equal(line, 'To: "Ann <victim1@example.org>, Bob <victim2@example.org>, Cy" <client@example.com>');
    /* Hors des guillemets, il ne reste qu'une adresse. */
    assert.equal(line.replace(/"(?:[^"\\]|\\.)*"/g, "").match(/@/g).length, 1);
  });
  test("une ligne vide sépare les en-têtes du corps, avant la première frontière", () => {
    const [head, rest] = raw.split("\r\n\r\n");
    assert.match(head, /^From: /);
    assert.match(head, /Content-Type: multipart\/alternative; boundary="nivex_[a-z0-9]+"$/);
    assert.match(rest, /^--nivex_[a-z0-9]+\r\nContent-Type: text\/plain/);
  });
}

/* ————— Le remerciement après la séance ————— */

test("le remerciement invite à un avis, quel qu'il soit, dans la langue du client", () => {
  const url = "https://g.page/r/CExemple123/review";
  const fr = reviewRequest({ locale: "fr", clientName: "Claire <b>Dubois</b>", reviewUrl: url });
  const en = reviewRequest({ locale: "en", clientName: "Claire Dubois", reviewUrl: url });
  for (const m of [fr, en]) {
    assert.ok(m.html.includes(`href="${url}"`), "le bouton mène au lien de la fiche");
    assert.ok(m.text.includes(url), "le texte brut porte le lien");
    assert.doesNotMatch(m.subject + m.text, /!/, "aucun point d'exclamation");
    assert.doesNotMatch(m.html + m.text, /[{}]/, "aucune accolade oubliée");
  }
  /* Le nom tapé par le client n'entre jamais tel quel dans le HTML. */
  assert.ok(!fr.html.includes("<b>Dubois</b>") && fr.html.includes("&lt;b&gt;Dubois&lt;/b&gt;"));
  /* Une invitation neutre : Google interdit de ne solliciter que les clients contents. */
  assert.match(fr.text, /quel qu'il soit/);
  assert.match(en.text, /whatever it says/);
  assert.match(fr.html, /lang="fr-CA"/);
  assert.match(en.html, /lang="en-CA"/);
  assert.match(fr.text, /qu'une fois/);
});

console.log(`\n${n} vérifications passées.\n`);

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

const {
  clientConfirmation, clientCancellation, ownerNotification, contactAcknowledgement, reviewRequest, sessionReminder,
} = await import("../src/lib/email.ts");
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
const { readFileSync } = await import("node:fs");

const TZ = "America/Toronto";
const settings = { ...FALLBACK_SETTINGS, timezone: TZ };

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

/* Intl sépare « 50 $ » et « 14 h 00 » par des espaces insécables fines.
   On compare sur un texte normalisé, sinon on teste le caractère d'espace
   plutôt que le contenu. */
const flat = (x) => x.replace(/[\u00A0\u202F\u2009]/g, " ");

/* Ce que le client ne lit plus nulle part depuis le 25 novembre 2026 : ce que
   contient une séance (l'installation, le rangement, le temps de repassage). */
const SETUP_TALK = /installation et (le )?rangement|installation, rangement|s'installe et range|rangement compris|minutes chacun|1\s?h\s?50|de repassage\.|setting up and packing|packing away|minutes each|of ironing\./i;

console.log("\nRéservation\n");

const d = {
  ref: "NVX-ABC123",
  locale: "fr",
  clientName: "Claire Beaulieu",
  clientEmail: "claire@example.com",
  clientPhone: "514 555-0142",
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
  businessEmail: "contact@nivexrepassage.ca",
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
  for (const bit of ["Claire Beaulieu", "514 555-0142", "claire@example.com",
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
  assert.deepEqual(vol, { "essentiel-2h": 18, essentiel: 27, confort: 36, executif: 72, "grande-famille": 108 });
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
    "Venez-vous dans mon quartier ?",
    "Comment se fait le paiement ?",
    "Puis-je annuler ou déplacer mon rendez-vous ?",
  ]);
  assert.equal(en.faq.items.length, 7, "l'anglais suit le français");
  /* Les trois retirées restent, pour pouvoir les remettre — hors du
     dictionnaire, qui part en entier vers les composants clients. */
  assert.deepEqual(retiredFr.faq.map((x) => flat(x.q)),
    ["Combien de temps prévoir ?", "L'installation est-elle comprise dans la séance ?", "Et les pièces fragiles ?"]);
  assert.equal(retiredEn.faq.length, 3);
  /* La question sur les zones, remplacée le 13 novembre 2026, et ses deux
     fins de phrase, retirées du dictionnaire avec elle. */
  assert.equal(flat(retiredFr.zoneQuestion.q), "Quelles zones desservez-vous ?");
  assert.equal(retiredEn.zoneQuestion.q, "Which areas do you serve?");
  for (const t of [fr, en]) assert.ok(!("check" in t.zoneText) && !("checkMontrealFree" in t.zoneText));
  /* Deux ou trois phrases, une fois remplies : la zone desservie en compte deux. */
  for (const t of [fr, en]) {
    for (const item of t.faq.items) {
      const a = faqFill(item.a, t, settings, t === fr ? "fr" : "en");
      const phrases = a.split(/(?<=[.?])\s+(?=[A-ZÀ-Ü«“])/).length;
      assert.ok(phrases <= 3, `${item.q} : ${phrases} phrases`);
    }
  }
});

test("la foire aux questions dit la capacité ; plus rien ne dit ce que contient une séance", () => {
  const capacite = fr.faq.items.find((x) => x.a.includes("{capacity}"));
  assert.equal(flat(capacite.q), "Combien de vêtements repassez-vous en une séance ?");
  assert.equal(faqFill(capacite.a, fr, settings, "fr"),
    "Jusqu'à 18 pièces en 2 h, et jusqu'à 27 en 3 h, selon la taille, le type et la matière des vêtements.");
  assert.ok(!fr.faq.items.some((x) => x.a.includes("{setup}")), "la question de l'installation est retirée");
  /* Décision de l'artisan, 25 novembre 2026 : ni « 1 h 50 de repassage », ni
     « 5 minutes d'installation », ni « installation comprise », nulle part
     dans les dictionnaires. La phrase dort avec les textes retirés, et se
     remplit encore, pour pouvoir la remettre. */
  for (const dict of [fr, getDict("en")]) {
    assert.doesNotMatch(JSON.stringify(dict), SETUP_TALK, "le dictionnaire ne dit plus ce que contient une séance");
  }
  assert.equal(setupSentence(settings, "fr"),
    "Chaque séance inclut l'installation et le rangement de notre matériel, 5 minutes chacun. Une séance de 2 h comprend donc 1 h 50 de repassage.");
  // La durée minimale réglée déplace les deux phrases ensemble.
  assert.match(faqFill(capacite.a, fr, { ...settings, minMinutes: 180 }, "fr"), /^Jusqu'à 27 pièces en 3 h, et jusqu'à 36 en 4 h,/);
  const en = getDict("en");
  assert.equal(faqFill(en.faq.items.find((x) => x.a.includes("{capacity}")).a, en, settings, "en"),
    "Up to 18 pieces in 2 hours, and up to 27 in 3 hours, depending on the size, type and fabric of the garments.");
  for (const item of fr.faq.items) assert.doesNotMatch(item.a, /\{cadence\}|par heure/, "plus aucune cadence par heure");
});

test("la confirmation et le rappel disent l'arrivée à l'heure, et rien de ce que contient la séance", () => {
  const m = clientConfirmation(d);
  assert.ok(flat(m.text).includes("Votre artisan arrive à l'heure du début."));
  assert.doesNotMatch(m.text + m.html, /15 minutes avant/);
  const en = clientConfirmation({ ...d, locale: "en" });
  assert.match(flat(en.text), /Your presser arrives at the start time\./);
  for (const x of [m, en, sessionReminder(d), sessionReminder({ ...d, locale: "en" })]) {
    assert.doesNotMatch(flat(x.subject + x.text + x.html), SETUP_TALK, "ni installation, ni rangement, ni 1 h 50");
  }
  /* Un rendez-vous de l'ancien déroulement garde sa phrase. */
  assert.match(flat(clientConfirmation({ ...d, setupMinutes: 15 }).text), /15 minutes avant le début de votre séance/);
});

test("le courriel ne promet l'invitation que si elle est partie", () => {
  assert.match(clientConfirmation(d).text, /invitation a été ajoutée/);
  assert.match(clientConfirmation({ ...d, invited: true }).text, /invitation a été ajoutée/);
  assert.ok(!/invitation/i.test(clientConfirmation({ ...d, invited: false }).text));
  assert.ok(!/invitation/i.test(clientConfirmation({ ...d, locale: "en", invited: false }).text));
});

/* ————— Le rappel de la veille d'une séance ————— */

test("le rappel de la veille d'une séance dit le jour, l'heure, l'adresse, le montant et la référence", () => {
  const m = sessionReminder(d);
  assert.equal(m.subject, "Rappel : votre séance NIVEX demain");
  for (const bit of ["Un mot pour vous rappeler votre séance de demain.", "samedi 3 octobre 2026", "14 h 00",
                     "88 rue Saint-Charles Ouest", "Longueuil", "Chemises", "2 heures", "50 $", "NVX-ABC123",
                     "Première heure offerte"]) {
    assert.ok(flat(m.text).includes(bit), `texte : « ${bit} » manquant`);
  }
  assert.ok(m.html.includes("NVX-ABC123") && m.html.includes("88 rue Saint-Charles Ouest"));
  assert.ok(!flat(sessionReminder({ ...d, firstHourFree: false }).text).includes("Première heure offerte"));
});

test("le rappel dit ce qu'il faut prévoir, l'arrivée, et comment annuler", () => {
  const m = sessionReminder(d);
  const text = flat(m.text);
  assert.ok(text.includes("Prévoyez votre planche à repasser, une prise électrique et environ deux mètres carrés"));
  assert.ok(text.includes("Votre artisan arrive à l'heure du début."));
  assert.ok(text.includes(d.manageUrl) && m.html.includes(d.manageUrl), "lien de gestion");
  assert.match(text, /annuler en ligne jusqu'à 2 h avant le rendez-vous\. Pour le déplacer, appelez-nous/);
  /* L'ancien déroulement garde son arrivée un quart d'heure avant. */
  assert.match(flat(sessionReminder({ ...d, setupMinutes: 15 }).text), /15 minutes avant le début de votre séance/);
});

test("le rappel montre les frais de déplacement et le total quand il y en a", () => {
  const avec = flat(sessionReminder({ ...d, travelFeeCents: 1500, travelZone: "Zone B" }).text);
  assert.match(avec, /Frais de déplacement \(Zone B\): 15 \$/);
  assert.match(avec, /Total estimé: 65 \$/);
  assert.doesNotMatch(flat(sessionReminder(d).text), /Frais de déplacement|Total estimé/);
});

test("le rappel du jour même, et le rappel en anglais", () => {
  const jour = sessionReminder(d, true);
  assert.equal(jour.subject, "Rappel : votre séance NIVEX aujourd'hui");
  assert.ok(jour.text.includes("Un mot pour vous rappeler votre séance d'aujourd'hui."));
  const en = sessionReminder({ ...d, locale: "en" });
  assert.equal(en.subject, "Reminder: your NIVEX session tomorrow");
  assert.match(en.text, /A short note to remind you of tomorrow's session\./);
  assert.match(en.text, /Saturday, October 3, 2026/);
  assert.match(flat(en.text), /You may cancel online up to 2 h before the appointment/);
  assert.equal(sessionReminder({ ...d, locale: "en" }, true).subject, "Reminder: your NIVEX session today");
  for (const m of [sessionReminder(d), jour, en]) {
    assert.doesNotMatch(m.subject + m.text, /!|\{|undefined|null/, "ni point d'exclamation ni trou");
  }
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
  assert.match(flat(ev.description), /Séance : samedi 3 octobre 2026 à 14 h 00 — 2 heures\.\n/);
  assert.match(flat(ev.description), /\nVotre artisan arrive à l'heure du début\.\n/);
  const en = calendarEvent({ ...booking, locale: "en" }, origin, TZ);
  assert.doesNotMatch(flat(ev.description + en.description), SETUP_TALK, "l'invitation ne dit plus ce que contient la séance");
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
  for (const bit of ["Séance : samedi 3 octobre 2026", "514 555-0142", "Chemises × 6",
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

test("les deux tunnels disent l'heure d'arrivée, et plus le temps de repassage", () => {
  /* Depuis le 25 novembre 2026, ni « dont 1 h 50 de repassage » sous la
     durée, ni l'installation et le rangement sous les créneaux. */
  for (const f of ["BookingWizard", "SubscriptionWizard"]) {
    const src = readFileSync(new URL(`../src/components/booking/${f}.tsx`, import.meta.url), "utf8");
    assert.ok(src.includes("{t.booking.step3.arrival}"), `${f} affiche l'heure d'arrivée`);
    assert.doesNotMatch(src, /INSTALL_MINUTES|PACKUP_MINUTES|step1\.ironing|step3\.setup|ironingText/, `${f} ne calcule plus de temps de repassage`);
  }
  assert.equal(fr.booking.step3.arrival, "Votre artisan arrive à l'heure du début.");
  assert.equal(getDict("en").booking.step3.arrival, "Your presser arrives at the start time.");
  assert.ok(!("ironing" in fr.booking.step1) && !("ironing" in getDict("en").booking.step1));
});

const { trialReminder } = await import("../src/lib/reminder-trial.ts");

test("l'essai du rappel de la veille : les vrais modèles, pour une séance fictive de demain", () => {
  /* Samedi 14 novembre 2026, 15 h à Montréal : demain dimanche, ouvert dès 7 h. */
  const tz = "America/Toronto";
  const now = fromWall({ year: 2026, month: 11, day: 14, hour: 15, minute: 0 }, tz);
  const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day, enabled: true, open: day === 0 || day === 5 ? "07:00" : "18:00", close: "22:00",
  }));
  const s = { ...FALLBACK_SETTINGS, hours };
  const t = trialReminder(s, "https://www.nivexrepassage.ca", now);
  assert.equal(t.startsAt.toISOString(), fromWall({ year: 2026, month: 11, day: 15, hour: 7, minute: 0 }, tz).toISOString());
  /* Le texto est celui de la tâche du matin, mot pour mot. */
  assert.equal(t.sms, "NIVEX - Rappel : demain dimanche 15 novembre, j'arrive à 7 h. Pensez à préparer votre planche à repasser. À demain. Styve");
  /* Le courriel aussi : même gabarit, adressé à l'artisan, à une adresse d'exemple. */
  assert.equal(t.email.subject, "Rappel : votre séance NIVEX demain");
  const text = t.email.text.replace(/[\u00a0\u202f]/g, " ");
  assert.match(text, /^Bonjour Styve,/);
  assert.match(text, /Un mot pour vous rappeler votre séance de demain\./);
  assert.match(text, /dimanche 15 novembre 2026/);
  assert.match(text, /123, rue de l'Exemple, Longueuil J4K 1A1/);
  assert.match(text, new RegExp(sessionLabel(sessionLength(s), "fr")));
  assert.match(text, /Avant notre arrivée/);
  assert.match(text, /Gérer ma réservation: https:\/\/www\.nivexrepassage\.ca\/fr\n/);
  assert.doesNotMatch(t.email.subject + t.email.text + t.sms, /!/, "aucun point d'exclamation");
  /* Demain fermé : 18 h, pour que le rappel dise toujours « demain ». */
  const closed = hours.map((h) => (h.day === 0 ? { ...h, enabled: false } : h));
  assert.match(trialReminder({ ...s, hours: closed }, "https://www.nivexrepassage.ca", now).sms, /demain dimanche 15 novembre, j'arrive à 18 h\./);
  /* Envoyé à l'artisan seul : la boîte de la maison et son cellulaire, jamais une adresse lue ailleurs. */
  const src = readFileSync(new URL("../src/lib/reminder-trial.ts", import.meta.url), "utf8");
  assert.match(src, /to: REQUEST_INBOX, toName: SMS_SIGNATURE/);
  assert.match(src, /const cell = ownerSmsNumber\(\)/);
  assert.equal((src.match(/sendGmail\(/g) ?? []).length, 1);
  assert.equal((src.match(/sendSms\(/g) ?? []).length, 1);
});

test("un seul rappel promis, la veille ; plus aucun texte ne parle du texto de deux heures avant", () => {
  const en = getDict("en");
  /* La phrase de l'artisan, mot pour mot, dans les deux langues. */
  assert.equal(fr.booking.success.reminder, "Vous recevrez un rappel la veille de votre séance.");
  assert.equal(en.booking.success.reminder, "You will receive a reminder the day before your session.");
  /* L'écran « C'est confirmé » du tunnel l'affiche. */
  const wizard = readFileSync(new URL("../src/components/booking/BookingWizard.tsx", import.meta.url), "utf8");
  assert.match(wizard, /\{t\.booking\.success\.reminder\}/);
  /* Les conditions la reprennent ; la note commune aux deux tunnels ne promet
     plus de rappel, puisqu'un abonné n'en reçoit pas par défaut. */
  const all = (d) => JSON.stringify([d.legal.terms, d.legal.privacy, d.booking, d.subscribe ?? null, d.subManage ?? null, d.faq ?? null]);
  assert.ok(all(fr).includes("Vous recevrez un rappel la veille de votre séance."));
  assert.ok(all(en).includes("You will receive a reminder the day before your session."));
  assert.doesNotMatch(fr.booking.legal.data, /rappel/);
  assert.doesNotMatch(en.booking.legal.data, /reminder/);
  for (const [d, re] of [[fr, /deux heures avant|mot de deux heures|serai chez vous/i], [en, /two hours before|two-hour|will be at your door/i]]) {
    assert.doesNotMatch(JSON.stringify(d), re);
  }
});

const { BookingInput: Input } = await import("../src/lib/bookings.ts");
const { isBoardAnswer, boardNeedsContact } = await import("../src/lib/board.ts");

test("la planche à repasser : la question du tunnel, mot pour mot, en français et en anglais (14 novembre 2026)", () => {
  const en = getDict("en");
  const bf = fr.booking.step2.board, be = en.booking.step2.board;
  assert.equal(flat(bf.question), "Avez-vous une planche à repasser en bon état ?");
  assert.deepEqual(bf.options, { yes: "Oui", no: "Non", unsure: "Je ne suis pas sûr" });
  assert.equal(bf.help, "J'apporte le fer professionnel et tout le matériel. Vous fournissez seulement une planche stable, avec sa housse.");
  assert.equal(bf.contact, "Merci de nous l'indiquer. Styve vous contactera avant votre séance pour trouver une solution.");
  assert.equal(be.question, "Do you have an ironing board in good condition?");
  assert.deepEqual(be.options, { yes: "Yes", no: "No", unsure: "Not sure" });
  assert.equal(be.help, "I bring a professional iron and all the equipment. You only provide a sturdy ironing board with its cover.");
  assert.equal(be.contact, "Thank you for letting us know. Styve will contact you before your session to find a solution.");
  for (const t of [bf, be]) assert.doesNotMatch(Object.values(t).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))).join(" "), /!/);
  /* Obligatoire au tunnel : l'étape des coordonnées ne passe pas sans réponse,
     et la réponse part avec la réservation. */
  const wizard = readFileSync(new URL("../src/components/booking/BookingWizard.tsx", import.meta.url), "utf8");
  assert.match(wizard, /board: board \? null : t\.booking\.step2\.board\.required/);
  assert.match(wizard, /board: board \|\| undefined/);
  assert.match(wizard, /<BoardQuestion t=\{t\}/);
  assert.match(wizard, /boardNeedsContact\(value \|\| null\) && \(/, "le mot de Styve pour Non et Pas sûr");
});

test("la planche à repasser : le serveur garde la réponse, et ne refuse jamais une séance pour elle", () => {
  const base = {
    locale: "fr", units: [], name: "Claire Beaulieu", email: "claire@example.com", phone: "514 555-0142",
    address: "88 rue Saint-Charles Ouest", city: "Longueuil", postalCode: "J4H 1C6",
    startsAt: "2026-12-03T23:00:00.000Z", consent: true,
  };
  for (const board of ["yes", "no", "unsure"]) {
    const r = Input.safeParse({ ...base, board });
    assert.ok(r.success && isBoardAnswer(r.data.board), board);
  }
  /* Une page restée ouverte pendant une mise en ligne, ou une valeur abîmée :
     la séance passe, la réponse se note comme non renseignée. */
  for (const board of [undefined, "peut-être", 3, null]) {
    const r = Input.safeParse({ ...base, board });
    assert.ok(r.success, String(board));
    assert.equal(isBoardAnswer(r.data.board), false);
  }
  assert.equal(boardNeedsContact("yes"), false);
  assert.equal(boardNeedsContact("no"), true);
  assert.equal(boardNeedsContact("unsure"), true);
  assert.equal(boardNeedsContact(null), false);
  const src = readFileSync(new URL("../src/lib/bookings.ts", import.meta.url), "utf8");
  assert.match(src, /\$\{isBoardAnswer\(input\.board\) \? input\.board : null\}/, "la réponse s'écrit à la création");
});

test("la planche à repasser : « À contacter » dans l'avis de l'artisan, la ligne de l'artisan chez le client", () => {
  const sample = { ...d, items: [{ key: "session", label: "Séance de 2 heures", qty: 1 }] };
  /* L'avis de l'artisan, par courriel. */
  const yes = ownerNotification({ ...sample, ironingBoard: "yes" });
  assert.match(flat(yes.text), /Planche à repasser: Oui\n/);
  assert.doesNotMatch(yes.text + yes.subject, /À contacter/);
  for (const [board, label] of [["no", "Non"], ["unsure", "Je ne suis pas sûr"]]) {
    const m = ownerNotification({ ...sample, ironingBoard: board });
    assert.match(flat(m.text), new RegExp(`Planche à repasser: ${label} · À contacter`));
    assert.ok(m.html.includes(`${label} · À contacter`), "en évidence dans la fiche");
    assert.match(m.subject, / · À contacter$/, "jusque dans l'objet");
    assert.doesNotMatch(ownerNotification({ ...sample, ironingBoard: board }, true).subject, /À contacter/, "pas sur une annulation");
  }
  const none = ownerNotification(sample);
  assert.doesNotMatch(none.text + none.html, /Planche à repasser/, "rien pour une séance prise avant la question");
  /* Le client : la confirmation et le rappel de la veille portent la ligne. */
  for (const m of [clientConfirmation(sample), sessionReminder(sample)]) {
    assert.ok(m.text.includes("Pensez à préparer votre planche à repasser."), m.subject);
    assert.ok(m.html.includes("Pensez à préparer votre planche à repasser."), m.subject);
  }
  for (const m of [clientConfirmation({ ...sample, locale: "en" }), sessionReminder({ ...sample, locale: "en" })]) {
    assert.ok(m.text.includes("Please have your ironing board ready."), m.subject);
  }
  /* La réponse ne paraît jamais chez le client. */
  for (const m of [clientConfirmation({ ...sample, ironingBoard: "no" }), sessionReminder({ ...sample, ironingBoard: "no" })]) {
    assert.doesNotMatch(m.text + m.html, /À contacter|Planche à repasser/);
  }
});

console.log(`\n${n} vérifications passées.\n`);

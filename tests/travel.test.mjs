/**
 * Tests du déplacement : les règles de trajet, et ce qui se passe quand la
 * mesure échoue.
 * Exécution : npx tsx tests/travel.test.mjs
 *
 * Ce qui n'est pas vérifiable ici : la réponse de Google. Ce qui l'est, et
 * qui compte : que la règle soit juste pour chaque nombre de minutes, qu'une
 * panne de mesure ne ferme pas la boutique, et qu'elle n'ouvre pas non plus
 * la porte à n'importe quelle adresse.
 */
import assert from "node:assert/strict";

const { evaluateTravel, bookable, sessionTooShort, travelTerms, inFallback,
        DEFAULT_TRAVEL_POLICY } = await import("../src/lib/travel.ts");
const { readTravelPolicy, FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { weekdayIn } = await import("../src/lib/transit.ts");
const { estimateCents } = await import("../src/lib/availability.ts");
const { ownerNotification, clientConfirmation } = await import("../src/lib/email.ts");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const flat = (x) => x.replace(/[   ]/g, " ");

const P = DEFAULT_TRAVEL_POLICY;
const DANS = "J4K 1A1";     // dans la liste de secours
const HORS = "G1A 1A1";     // hors liste de secours

console.log("\nLes quatre bandes de trajet");

test("moins de 60 min : aucun frais", () => {
  for (const m of [0, 15, 45, 59]) {
    const v = evaluateTravel(m, 120, DANS, P);
    assert.equal(v.status, "free", `${m} min devrait être gratuit`);
    assert.equal(v.feeCents, 0);
    assert.equal(v.requiredSessionMinutes, 0);
  }
});

test("60 à 75 min : frais, et la séance courte reste permise", () => {
  for (const m of [60, 70, 75]) {
    const court = evaluateTravel(m, 120, DANS, P);
    assert.equal(court.status, "fee", `${m} min devrait coûter`);
    assert.equal(court.feeCents, 2500, `${m} min, séance de 2 h → 25 $`);
    assert.equal(court.requiredSessionMinutes, 0, `${m} min n'impose pas 3 h`);
    assert.equal(bookable(court, 120), true);

    const long = evaluateTravel(m, 180, DANS, P);
    assert.equal(long.feeCents, 1500, `${m} min, séance de 3 h → 15 $`);
  }
});

test("au-delà de 75 min : la séance doit durer 3 h", () => {
  for (const m of [76, 90, 105]) {
    const v = evaluateTravel(m, 120, DANS, P);
    assert.equal(v.requiredSessionMinutes, 180, `${m} min devrait imposer 3 h`);
    assert.equal(sessionTooShort(v, 120), true, "2 h est trop court");
    assert.equal(bookable(v, 120), false, "et donc non réservable");
    assert.equal(bookable(v, 180), true, "3 h passe");
  }
});

test("plus de 105 min : réservation en ligne fermée", () => {
  for (const m of [106, 150, 400]) {
    const v = evaluateTravel(m, 240, DANS, P);
    assert.equal(v.status, "too-far", `${m} min devrait être hors ligne`);
    assert.equal(bookable(v, 240), false);
    assert.equal(v.feeCents, 0, "on ne facture pas ce qu'on refuse");
  }
});

test("les bornes tombent du bon côté", () => {
  assert.equal(evaluateTravel(59, 120, DANS, P).status, "free");
  assert.equal(evaluateTravel(60, 120, DANS, P).status, "fee", "60 n'est plus « moins de 60 »");
  assert.equal(evaluateTravel(75, 120, DANS, P).requiredSessionMinutes, 0, "75 n'est pas « au-delà de 75 »");
  assert.equal(evaluateTravel(76, 120, DANS, P).requiredSessionMinutes, 180);
  assert.equal(evaluateTravel(105, 240, DANS, P).status, "fee", "105 n'est pas « plus de 105 »");
  assert.equal(evaluateTravel(106, 240, DANS, P).status, "too-far");
});

console.log("\nLe tarif annoncé est celui qu'on paiera vraiment");

test("une adresse qui impose 3 h annonce le tarif long, pas le court", () => {
  /* Le piège : à 90 min de trajet, une séance de 2 h est impossible. Annoncer
     25 $ — le tarif des séances courtes — serait une promesse intenable,
     puisque le client devra de toute façon réserver trois heures. */
  const v = evaluateTravel(90, 120, DANS, P);
  assert.equal(v.feeCents, 1500, "le tarif doit déjà être celui des 3 h");
  assert.equal(v.requiredSessionMinutes, 180);
});

console.log("\nLa première heure offerte n'a aucune prise");

test("elle escompte la séance, jamais la route", () => {
  const s = { ...FALLBACK_SETTINGS };
  const avec = estimateCents(180, s, true);
  const sans = estimateCents(180, s, false);
  assert.equal(sans, 15000);
  assert.equal(avec, 10000);

  const frais = evaluateTravel(90, 180, DANS, P).feeCents;
  assert.equal(frais, 1500, "la route ne se raccourcit pas");
  assert.equal(avec + frais, 11500, "le total additionne, il ne compense pas");
});

console.log("\nQuand la mesure échoue");

test("une adresse de la liste de secours passe, sans frais, non vérifiée", () => {
  const v = evaluateTravel(null, 120, DANS, P);
  assert.equal(v.status, "free");
  assert.equal(v.verified, false, "il faut que l'artisan le sache");
  assert.equal(v.feeCents, 0, "on ne facture pas une route qu'on n'a pas mesurée");
  assert.equal(bookable(v, 120), true);
});

test("une adresse hors liste est refusée : on n'engage rien à l'aveugle", () => {
  const v = evaluateTravel(null, 120, HORS, P);
  assert.equal(v.status, "blocked");
  assert.equal(bookable(v, 120), false);
});

test("la liste de secours est volontairement plus courte que la zone annoncée", () => {
  assert.equal(inFallback("J4K 1A1", P), true, "Longueuil");
  assert.equal(inFallback("H3E 1A1", P), true, "Île-des-Sœurs");
  assert.equal(inFallback("H2Y 1C6", P), true, "Vieux-Montréal");
  assert.equal(inFallback("J3A 1P1", P), false, "Saint-Jean est trop loin pour passer en aveugle");
  assert.equal(inFallback("G1A 1A1", P), false, "Québec");
});

console.log("\nCe que les réglages peuvent faire");

test("politique désactivée : plus de frais, plus de refus", () => {
  const off = { ...P, enabled: false };
  assert.equal(evaluateTravel(300, 120, HORS, off).status, "free");
  assert.equal(evaluateTravel(300, 120, HORS, off).feeCents, 0);
  assert.equal(bookable(evaluateTravel(null, 120, HORS, off), 120), true);
});

test("des seuils réglés autrement sont respectés", () => {
  const custom = { ...P, freeUnderMinutes: 30, minSessionOverMinutes: 40, maxMinutes: 50, feeShortCents: 4000 };
  assert.equal(evaluateTravel(25, 120, DANS, custom).status, "free");
  assert.equal(evaluateTravel(35, 120, DANS, custom).feeCents, 4000);
  assert.equal(evaluateTravel(45, 120, DANS, custom).requiredSessionMinutes, 180);
  assert.equal(evaluateTravel(55, 120, DANS, custom).status, "too-far");
});

console.log("\nMigration depuis l'ancien système");

test("jamais réglé : les préfixes enregistrés deviennent la liste de secours", () => {
  /* La bascule qui compte : une base qui connaissait une zone par codes
     postaux doit s'en servir comme filet, et non d'une liste écrite dans le
     code qui ne lui ressemblerait pas. */
  const p = readTravelPolicy(null, { prefixes: ["J4K", "J4W"], labelFr: "", labelEn: "" });
  assert.deepEqual(p.fallbackPrefixes, ["J4K", "J4W"]);
  assert.equal(p.freeUnderMinutes, 60, "les seuils viennent du code");
});

test("sans zone enregistrée, le filet par défaut s'applique", () => {
  const p = readTravelPolicy(null, null);
  assert.deepEqual(p.fallbackPrefixes, P.fallbackPrefixes);
});

test("une politique enregistrée fait foi, champ par champ", () => {
  const p = readTravelPolicy({ freeUnderMinutes: 45, maxMinutes: 90 }, null);
  assert.equal(p.freeUnderMinutes, 45, "ce qui est réglé l'emporte");
  assert.equal(p.maxMinutes, 90);
  assert.equal(p.feeShortCents, 2500, "ce qui manque prend la valeur par défaut");
  assert.equal(p.cacheDays, 30);
});

test("une politique abîmée ne fait pas tomber la lecture", () => {
  for (const sale of ["n'importe quoi", 42, [], { freeUnderMinutes: "beaucoup" }]) {
    const p = readTravelPolicy(sale, null);
    assert.equal(typeof p.freeUnderMinutes, "number", `${JSON.stringify(sale)} devrait retomber sur un nombre`);
    assert.ok(p.freeUnderMinutes >= 0);
  }
});

console.log("\nLe jour de la semaine, à Montréal et non en UTC");

test("un dimanche soir à Montréal reste un dimanche", () => {
  /* Le serveur vit en UTC : dimanche 20 h à Montréal y est déjà lundi. Lire
     le jour sans fuseau ferait mesurer l'horaire d'un lundi — exactement
     l'erreur que la règle « le dimanche, il y a moins de bus » veut éviter. */
  const d = new Date("2026-11-02T01:00:00Z");   // dimanche 1er nov., 20 h à Montréal
  assert.equal(d.getUTCDay(), 1, "en UTC c'est un lundi");
  assert.equal(weekdayIn(d, "America/Toronto"), 0, "à Montréal c'est un dimanche");
});

console.log("\nLa phrase des conditions");

test("elle se construit depuis les réglages", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const ligne = travelTerms(P, "fr", money);
  assert.match(flat(ligne), /Frais de déplacement selon la distance : 25 \$ par visite de moins de 3 heures, 15 \$ par visite de 3 heures ou plus, pour les adresses situées à plus d'une heure de trajet\./);
});

test("elle suit un changement de tarif, sans toucher au code", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const ligne = travelTerms({ ...P, feeShortCents: 3000, feeLongCents: 2000 }, "fr", money);
  assert.match(flat(ligne), /: 30 \$ par visite de moins de 3 heures, 20 \$/);
});

test("et elle existe en anglais", () => {
  const money = (c) => `$${Math.round(c / 100)}`;
  const line = travelTerms(P, "en", money);
  assert.match(flat(line), /Travel fee by distance: \$25 per visit shorter than 3 hours, \$15 per visit of 3 hours or more, for addresses more than one hour of travel away\./);
});

test("politique désactivée : aucune condition ne s'annonce", () => {
  assert.equal(travelTerms({ ...P, enabled: false }, "fr", String), null);
});

console.log("\nDans les courriels");

const base = {
  ref: "NVX-123456", locale: "fr", clientName: "Claire Dubois",
  clientEmail: "claire@example.com", clientPhone: "450 555-0199",
  address: "12 rue Principale", city: "Saint-Jean-sur-Richelieu", postalCode: "J3A 1P1",
  notes: null, items: [{ label: "Chemises", qty: 12 }],
  startsAt: new Date("2026-11-04T18:00:00Z"), durationMinutes: 180,
  estimateCents: 10000, currency: "CAD", firstHourFree: true,
  timezone: "America/Toronto", manageUrl: "https://x/fr/reservation/t",
  siteUrl: "https://nivexrepassage.ca", businessPhone: "+1 450 943 1217",
  businessEmail: "nivexrepassage@gmail.com",
};
const avec = { ...base, travelFeeCents: 1500, travelMinutes: 92, travelVerified: true };

test("le client voit le trajet, la ligne et le total", () => {
  const mail = clientConfirmation(avec);
  const txt = flat(mail.text);
  assert.match(txt, /Frais de déplacement \(92 min de trajet\): 15 \$/);
  assert.match(txt, /Total estimé: 115 \$/);
  assert.match(flat(mail.html), /ne les couvre pas/, "la note doit expliquer l'exclusion");
});

test("l'artisan voit la même chose", () => {
  const mail = ownerNotification(avec);
  assert.match(flat(mail.text), /Frais de déplacement \(92 min de trajet\): 15 \$/);
  assert.match(flat(mail.text), /Total estimé: 115 \$/);
});

test("sans frais, aucune ligne ni total ne s'affichent", () => {
  for (const mail of [clientConfirmation(base), ownerNotification(base)]) {
    assert.doesNotMatch(flat(mail.text), /Frais de déplacement/);
    assert.doesNotMatch(flat(mail.text), /Total estimé/);
  }
});

test("le courriel anglais se lit en anglais", () => {
  const mail = clientConfirmation({ ...avec, locale: "en" });
  assert.match(flat(mail.text), /Travel fee \(92 min of travel\): \$15/);
  assert.match(flat(mail.text), /Estimated total: \$115/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

/**
 * Tests des frais de déplacement.
 * Exécution : npx tsx tests/travel.test.mjs
 *
 * Deux règles portent tout le reste, et ce sont elles qu'on vérifie ici :
 * les frais suivent la durée réservée — pas le temps facturé —, et l'offre
 * « première heure offerte » n'a aucune prise sur eux.
 */
import assert from "node:assert/strict";

const { travelFeeFor, travelTerms, DEFAULT_TRAVEL_ZONES } = await import("../src/lib/travel.ts");
const { readTravelZones } = await import("../src/lib/settings.ts");
const { FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { estimateCents } = await import("../src/lib/availability.ts");
const { ownerNotification, clientConfirmation } = await import("../src/lib/email.ts");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const flat = (x) => x.replace(/[   ]/g, " ");
const Z = DEFAULT_TRAVEL_ZONES;

console.log("\nLes deux tarifs, de part et d'autre du seuil");

test("moins de 3 heures : 25 $", () => {
  for (const m of [120, 150, 179]) {
    assert.equal(travelFeeFor("J3A 1P1", m, Z).cents, 2500, `${m} min devrait coûter 25 $`);
  }
});

test("3 heures ou plus : 15 $", () => {
  for (const m of [180, 210, 240, 480]) {
    assert.equal(travelFeeFor("J3A 1P1", m, Z).cents, 1500, `${m} min devrait coûter 15 $`);
  }
});

test("le seuil est inclusif : 180 min bascule déjà au tarif long", () => {
  assert.equal(travelFeeFor("J3A 1P1", 179, Z).cents, 2500);
  assert.equal(travelFeeFor("J3A 1P1", 180, Z).cents, 1500);
});

console.log("\nQuelles adresses");

test("les cinq codes de Saint-Jean sont concernés", () => {
  for (const p of ["J2W 2X2", "J2X 1R1", "J2Y 1A1", "J3A 1P1", "J3B 4J4"]) {
    assert.ok(travelFeeFor(p, 120, Z), `${p} devrait payer des frais`);
    assert.equal(travelFeeFor(p, 120, Z).labelFr, "Saint-Jean-sur-Richelieu");
  }
});

test("le reste de la zone desservie ne paie rien", () => {
  for (const p of ["J4K 1A1", "J4W 2B2", "H3E 1A1", "H4G 1A1", "H3Y 2P6", "H2V 1S2", "H2Y 1C6", "J3V 1A1"]) {
    assert.equal(travelFeeFor(p, 120, Z), null, `${p} ne devrait pas payer de frais`);
  }
});

test("l'espacement et la casse n'y changent rien", () => {
  for (const p of ["j3a1p1", "J3A 1P1", "j3a-1p1", " J3A1P1 "]) {
    assert.equal(travelFeeFor(p, 120, Z).cents, 2500, `${p} devrait être reconnu`);
  }
});

test("un code postal incomplet ne déclenche rien", () => {
  assert.equal(travelFeeFor("J3", 120, Z), null);
  assert.equal(travelFeeFor("", 120, Z), null);
});

console.log("\nCe que les réglages peuvent faire");

test("une zone désactivée ne facture plus", () => {
  const off = [{ ...Z[0], enabled: false }];
  assert.equal(travelFeeFor("J3A 1P1", 120, off), null);
});

test("aucune zone du tout : aucun frais", () => {
  assert.equal(travelFeeFor("J3A 1P1", 120, []), null);
  assert.equal(travelFeeFor("J3A 1P1", 120, null), null);
});

test("des montants à zéro ne produisent pas une ligne à 0 $", () => {
  const gratuit = [{ ...Z[0], shortFeeCents: 0, longFeeCents: 0 }];
  assert.equal(travelFeeFor("J3A 1P1", 120, gratuit), null, "rien ne doit s'afficher");
});

test("un seuil et des montants réglés autrement sont respectés", () => {
  const custom = [{ ...Z[0], thresholdMinutes: 240, shortFeeCents: 4000, longFeeCents: 1000 }];
  assert.equal(travelFeeFor("J3A 1P1", 180, custom).cents, 4000, "180 min est sous un seuil de 4 h");
  assert.equal(travelFeeFor("J3A 1P1", 240, custom).cents, 1000);
});

console.log("\nUne zone supprimée doit le rester");

test("colonne jamais réglée (null) : on sème les valeurs par défaut", () => {
  assert.deepEqual(readTravelZones(null), DEFAULT_TRAVEL_ZONES);
  assert.deepEqual(readTravelZones(undefined), DEFAULT_TRAVEL_ZONES);
});

test("colonne vidée exprès ([]) : on la respecte", () => {
  /* La règle qui distingue ces zones des prestations. Réinjecter une zone
     supprimée ferait facturer des frais que l'artisan a retirés, et il
     n'aurait aucun moyen de s'en débarrasser. */
  assert.deepEqual(readTravelZones([]), [], "aucune zone ne doit revenir");
  assert.equal(travelFeeFor("J3A 1P1", 120, readTravelZones([])), null);
});

test("des zones enregistrées font foi, sans ajout du code", () => {
  const sienne = [{ ...Z[0], key: "autre", prefixes: ["J5R"], labelFr: "La Prairie",
                    labelEn: "La Prairie", shortFeeCents: 1000, longFeeCents: 500 }];
  const lu = readTravelZones(sienne);
  assert.equal(lu.length, 1, "Saint-Jean ne doit pas se rajouter tout seul");
  assert.equal(travelFeeFor("J3A 1P1", 120, lu), null, "Saint-Jean a été retiré");
  assert.equal(travelFeeFor("J5R 1A1", 120, lu).cents, 1000);
});

console.log("\nLa première heure offerte n'a aucune prise");

test("elle escompte la séance, jamais la route", () => {
  const s = { ...FALLBACK_SETTINGS };
  /* Trois heures, dont une offerte : la séance tombe de 150 $ à 100 $, mais
     la visite reste une visite de trois heures — donc tarif long, 15 $. */
  const avec = estimateCents(180, s, true);
  const sans = estimateCents(180, s, false);
  assert.equal(sans, 15000);
  assert.equal(avec, 10000, "une heure offerte sur trois");

  const frais = travelFeeFor("J3A 1P1", 180, Z).cents;
  assert.equal(frais, 1500, "la route ne se raccourcit pas");
  assert.equal(avec + frais, 11500, "le total additionne, il ne compense pas");
});

test("une heure offerte ne fait pas repasser sous le seuil", () => {
  /* Le piège : facturer 2 h sur une séance de 3 h ferait croire à une visite
     courte, donc 25 $ au lieu de 15 $. Les frais suivent la durée réservée. */
  const frais = travelFeeFor("J3A 1P1", 180, Z).cents;
  assert.equal(frais, 1500, "180 min réservées, quoi qu'il soit facturé");
  assert.notEqual(frais, 2500);
});

console.log("\nLa phrase des conditions");

test("elle se construit depuis les montants réglés", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const [ligne] = travelTerms(Z, "fr", money);
  assert.match(flat(ligne), /Saint-Jean-sur-Richelieu : frais de déplacement de 25 \$ par visite de moins de 3 heures, 15 \$ par visite de 3 heures ou plus\./);
});

test("elle suit un changement de tarif, sans toucher au code", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const [ligne] = travelTerms([{ ...Z[0], shortFeeCents: 3000, longFeeCents: 2000 }], "fr", money);
  assert.match(flat(ligne), /de 30 \$ par visite de moins de 3 heures, 20 \$/);
});

test("et elle existe en anglais", () => {
  const money = (c) => `$${Math.round(c / 100)}`;
  const [line] = travelTerms(Z, "en", money);
  assert.match(flat(line), /Saint-Jean-sur-Richelieu: a \$25 travel fee per visit shorter than 3 hours, \$15 per visit of 3 hours or more\./);
});

test("une zone désactivée ne s'annonce pas", () => {
  assert.deepEqual(travelTerms([{ ...Z[0], enabled: false }], "fr", (c) => String(c)), []);
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
const avecFrais = { ...base, travelFeeCents: 1500, travelZone: "Saint-Jean-sur-Richelieu" };

test("le client voit la ligne, le total, et pourquoi l'offre ne s'y applique pas", () => {
  const mail = clientConfirmation(avecFrais);
  const txt = flat(mail.text), htm = flat(mail.html);
  assert.match(txt, /Frais de déplacement \(Saint-Jean-sur-Richelieu\): 15 \$/);
  assert.match(txt, /Total estimé: 115 \$/);
  assert.match(htm, /Frais de déplacement/);
  assert.match(htm, /Total estimé/);
  assert.match(htm, /ne les couvre pas/, "la note doit expliquer l'exclusion");
});

test("l'artisan voit la même ligne et le même total", () => {
  const mail = ownerNotification(avecFrais);
  assert.match(flat(mail.text), /Frais de déplacement \(Saint-Jean-sur-Richelieu\): 15 \$/);
  assert.match(flat(mail.text), /Total estimé: 115 \$/);
  assert.match(flat(mail.html), /Total estimé/);
});

test("sans frais, aucune ligne et aucun total ne s'affichent", () => {
  for (const mail of [clientConfirmation(base), ownerNotification(base)]) {
    assert.doesNotMatch(flat(mail.text), /Frais de déplacement/, "un 0 $ n'apprend rien");
    assert.doesNotMatch(flat(mail.text), /Total estimé/, "sans frais, l'estimation suffit");
    assert.doesNotMatch(flat(mail.html), /Frais de déplacement/);
  }
});

test("le total du courriel anglais se lit en anglais", () => {
  const mail = clientConfirmation({ ...avecFrais, locale: "en" });
  assert.match(flat(mail.text), /Travel fee \(Saint-Jean-sur-Richelieu\): \$15/);
  assert.match(flat(mail.text), /Estimated total: \$115/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

/**
 * Tests des zones desservies et des frais de déplacement.
 * Exécution : npx tsx tests/travel.test.mjs
 *
 * Ce qui compte ici : que chaque code postal tombe dans la bonne zone, que
 * le seuil des trois heures soit inclusif, et que l'offre « première heure
 * offerte » n'ait aucune prise sur la route.
 */
import assert from "node:assert/strict";

const { evaluateZone, zoneFor, bookable, feeTable, longSessionText, postalHead,
        DEFAULT_ZONE_POLICY } = await import("../src/lib/travel.ts");
const { readZonePolicy, FALLBACK_SETTINGS, DEFAULT_AREA, mergeArea } = await import("../src/lib/settings.ts");
const { estimateCents } = await import("../src/lib/availability.ts");
const { ownerNotification, clientConfirmation } = await import("../src/lib/email.ts");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const flat = (x) => x.replace(/[   ]/g, " ");

const P = DEFAULT_ZONE_POLICY;
const COURT = 120;   // 2 h
const LONG = 180;    // 3 h pile

console.log("\nZone A — déplacement compris");

test("les onze municipalités de la Rive-Sud ne paient rien", () => {
  for (const [code, lieu] of [
    ["J4G 1A1", "Longueuil"], ["J4H 1A1", "Longueuil"], ["J4J 1A1", "Longueuil"],
    ["J4K 1A1", "Longueuil"], ["J4L 1A1", "Longueuil"], ["J4M 1A1", "Longueuil"], ["J4N 1A1", "Longueuil"],
    ["J3Y 1A1", "Saint-Hubert"], ["J4T 1A1", "Saint-Hubert"],
    ["J4V 1A1", "Greenfield Park"],
    ["J4P 1A1", "Saint-Lambert"], ["J4R 1A1", "Saint-Lambert"], ["J4S 1A1", "Saint-Lambert"],
    ["J4W 1A1", "Brossard"], ["J4X 1A1", "Brossard"], ["J4Y 1A1", "Brossard"], ["J4Z 1A1", "Brossard"],
    ["J4B 1A1", "Boucherville"], ["J3V 1A1", "Saint-Bruno"],
    ["J3E 1A1", "Sainte-Julie"], ["J3L 1A1", "Chambly"], ["J3X 1A1", "Varennes"], ["J5R 1A1", "La Prairie"],
  ]) {
    const v = evaluateZone(code, COURT, P);
    assert.equal(v.status, "free", `${code} (${lieu}) devrait être sans frais`);
    assert.equal(v.feeCents, 0);
    assert.equal(v.zoneKey, "a");
  }
});

test("la gratuité ne dépend pas de la durée", () => {
  assert.equal(evaluateZone("J4K 1A1", COURT, P).feeCents, 0);
  assert.equal(evaluateZone("J4K 1A1", LONG, P).feeCents, 0);
  assert.equal(evaluateZone("J4K 1A1", 480, P).feeCents, 0);
});

console.log("\nZone B — quartiers de Montréal, 15 $ et 10 $");

test("les sept préfixes sont reconnus", () => {
  for (const [code, lieu] of [
    ["H3E 1A1", "Île-des-Sœurs"], ["H4G 1A1", "Verdun"], ["H4H 1A1", "Verdun"],
    ["H2Y 1C6", "Vieux-Montréal"], ["H3Y 2P6", "Westmount"], ["H3Z 1V8", "Westmount"],
    ["H2V 1S2", "Outremont"],
  ]) {
    assert.equal(evaluateZone(code, COURT, P).zoneKey, "b", `${code} (${lieu}) devrait être en zone B`);
  }
});

test("15 $ sous trois heures, 10 $ à partir de trois heures", () => {
  assert.equal(evaluateZone("H3E 1A1", COURT, P).feeCents, 1500);
  assert.equal(evaluateZone("H3E 1A1", LONG, P).feeCents, 1000);
  assert.equal(evaluateZone("H3E 1A1", 240, P).feeCents, 1000);
});

console.log("\nZone C — Saint-Jean-sur-Richelieu, 25 $ et 20 $");

test("les cinq préfixes de la ville sont reconnus", () => {
  for (const code of ["J2W 2X2", "J2X 1R1", "J2Y 1A1", "J3A 1P1", "J3B 4J4"]) {
    assert.equal(evaluateZone(code, COURT, P).zoneKey, "c", `${code} devrait être en zone C`);
  }
});

test("25 $ sous trois heures, 20 $ à partir de trois heures", () => {
  assert.equal(evaluateZone("J3A 1P1", COURT, P).feeCents, 2500);
  assert.equal(evaluateZone("J3A 1P1", LONG, P).feeCents, 2000);
});

console.log("\nLe seuil est atteint, non dépassé");

test("trois heures tout rond paient déjà le tarif réduit", () => {
  /* La lecture qui favorise le client, et celle qu'on a annoncée.
     179 minutes paient encore le tarif plein ; 180 paient le réduit. */
  assert.equal(evaluateZone("H3E 1A1", 179, P).feeCents, 1500, "179 min : tarif plein");
  assert.equal(evaluateZone("H3E 1A1", 180, P).feeCents, 1000, "180 min : tarif réduit");
  assert.equal(evaluateZone("J3A 1P1", 179, P).feeCents, 2500);
  assert.equal(evaluateZone("J3A 1P1", 180, P).feeCents, 2000);
});

console.log("\nHors zone");

test("le reste du Québec ne peut pas réserver en ligne", () => {
  for (const code of ["G1A 1A1", "H1A 1A1", "J0J 1R0", "H3T 1A1", "H2Z 1A1", "K1A 0A6", "J8X 1A1"]) {
    const v = evaluateZone(code, COURT, P);
    assert.equal(v.status, "out", `${code} devrait être hors zone`);
    assert.equal(bookable(v), false);
    assert.equal(v.feeCents, 0, "on ne facture pas ce qu'on refuse");
  }
});

test("un code postal incomplet est hors zone, jamais deviné", () => {
  assert.equal(evaluateZone("J4", COURT, P).status, "out");
  assert.equal(evaluateZone("", COURT, P).status, "out");
  assert.equal(zoneFor("J4", P), null);
});

test("l'espacement et la casse n'y changent rien", () => {
  for (const code of ["h3e1a1", "H3E 1A1", "h3e-1a1", " H3E1A1 "]) {
    assert.equal(evaluateZone(code, COURT, P).zoneKey, "b", `${code} devrait être reconnu`);
    assert.equal(postalHead(code), "H3E");
  }
});

console.log("\nAucun préfixe ne figure dans deux zones");

test("les trois zones sont disjointes", () => {
  const vu = new Map();
  for (const z of P.zones) {
    for (const px of z.prefixes) {
      assert.equal(vu.has(px), false, `${px} figure dans ${vu.get(px)} et ${z.key}`);
      vu.set(px, z.key);
    }
  }
  assert.equal(vu.size, 23 + 7 + 5, "23 + 7 + 5 préfixes au total");
});

console.log("\nLa première heure offerte n'a aucune prise");

test("elle escompte la séance, jamais la route", () => {
  const s = { ...FALLBACK_SETTINGS };
  const avec = estimateCents(180, s, true);
  const sans = estimateCents(180, s, false);
  assert.equal(sans, 15000);
  assert.equal(avec, 10000, "une heure offerte sur trois");

  const frais = evaluateZone("J3A 1P1", 180, P).feeCents;
  assert.equal(frais, 2000, "la route ne se raccourcit pas");
  assert.equal(avec + frais, 12000, "le total additionne, il ne compense pas");
});

test("une heure offerte ne fait pas repasser sous le seuil", () => {
  /* Le piège : facturer 2 h sur une séance de 3 h ferait croire à une visite
     courte, donc 25 $ au lieu de 20 $. Les frais suivent la durée réservée. */
  assert.equal(evaluateZone("J3A 1P1", 180, P).feeCents, 2000);
});

console.log("\nCe que les réglages peuvent faire");

test("une zone désactivée cesse d'être desservie", () => {
  const off = { ...P, zones: P.zones.map((z) => (z.key === "c" ? { ...z, enabled: false } : z)) };
  assert.equal(evaluateZone("J3A 1P1", COURT, off).status, "out");
  assert.equal(evaluateZone("J4K 1A1", COURT, off).status, "free", "les autres ne bougent pas");
});

test("des montants réglés autrement sont respectés", () => {
  const custom = { ...P, zones: P.zones.map((z) => (z.key === "b" ? { ...z, shortFeeCents: 3000, longFeeCents: 2500 } : z)) };
  assert.equal(evaluateZone("H3E 1A1", COURT, custom).feeCents, 3000);
  assert.equal(evaluateZone("H3E 1A1", LONG, custom).feeCents, 2500);
});

test("un seuil réglé autrement déplace la bascule", () => {
  const custom = { ...P, longSessionMinutes: 240 };
  assert.equal(evaluateZone("H3E 1A1", 180, custom).feeCents, 1500, "3 h est désormais court");
  assert.equal(evaluateZone("H3E 1A1", 240, custom).feeCents, 1000);
});

console.log("\nLecture de ce qui est enregistré");

test("jamais réglé : la grille par défaut s'applique", () => {
  for (const vide of [null, undefined, [], "n'importe quoi", 42, {}, { zones: [] }]) {
    assert.deepEqual(readZonePolicy(vide), P, `${JSON.stringify(vide)} devrait retomber sur le défaut`);
  }
});

test("une grille enregistrée fait foi", () => {
  const lu = readZonePolicy({
    longSessionMinutes: 240,
    zones: [{ key: "x", labelFr: "Chez moi", labelEn: "Home", prefixes: ["J4K"], shortFeeCents: 500, longFeeCents: 100, enabled: true }],
  });
  assert.equal(lu.zones.length, 1, "aucune zone du code ne se rajoute");
  assert.equal(lu.longSessionMinutes, 240);
  assert.equal(evaluateZone("H3E 1A1", COURT, lu).status, "out", "la zone B a été retirée");
  assert.equal(evaluateZone("J4K 1A1", COURT, lu).feeCents, 500);
});

test("une zone sans préfixe valable est écartée, pas devinée", () => {
  const lu = readZonePolicy({
    zones: [
      { key: "bon", prefixes: ["J4K"], shortFeeCents: 100, longFeeCents: 50, enabled: true },
      { key: "vide", prefixes: [], shortFeeCents: 999, longFeeCents: 999, enabled: true },
      { key: "sale", prefixes: ["pas un code"], shortFeeCents: 999, longFeeCents: 999, enabled: true },
    ],
  });
  assert.equal(lu.zones.length, 1);
  assert.equal(lu.zones[0].key, "bon");
});

test("des montants négatifs ou absurdes retombent à zéro", () => {
  const lu = readZonePolicy({
    zones: [{ key: "x", prefixes: ["J4K"], shortFeeCents: -500, longFeeCents: "beaucoup", enabled: true }],
  });
  assert.equal(lu.zones[0].shortFeeCents, 0);
  assert.equal(lu.zones[0].longFeeCents, 0);
});

console.log("\nLe texte affiché");

test("le libellé de zone nomme les cinq quartiers", () => {
  for (const lieu of ["Île-des-Sœurs", "Verdun", "Vieux-Montréal", "Westmount", "Outremont", "Saint-Jean-sur-Richelieu"]) {
    assert.ok(DEFAULT_AREA.labelFr.includes(lieu), `${lieu} devrait être nommé`);
  }
  assert.match(DEFAULT_AREA.labelEn, /Nuns' Island/);
});

test("un libellé laissé au défaut d'hier suit le code", () => {
  const ancien = "Nous nous déplaçons à Longueuil, sur la Rive-Sud et dans plusieurs quartiers de Montréal. Entrez votre code postal pour vérifier que votre adresse est desservie et connaître les éventuels frais de déplacement.";
  assert.equal(mergeArea({ prefixes: ["J4K"], labelFr: ancien, labelEn: "x" }).labelFr, DEFAULT_AREA.labelFr);
});

test("le tableau des frais ne montre que les zones payantes", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const rows = feeTable(P, "fr", money);
  assert.equal(rows.length, 2, "la zone A n'y figure pas");
  assert.deepEqual(rows[0], { zone: "Quartiers de Montréal", short: "15 $", long: "10 $" });
  assert.deepEqual(rows[1], { zone: "Saint-Jean-sur-Richelieu", short: "25 $", long: "20 $" });
});

test("il suit un changement de tarif, sans toucher au code", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const custom = { ...P, zones: P.zones.map((z) => (z.key === "c" ? { ...z, shortFeeCents: 3000 } : z)) };
  assert.equal(feeTable(custom, "fr", money)[1].short, "30 $");
});

test("et il existe en anglais", () => {
  const money = (c) => `$${Math.round(c / 100)}`;
  assert.equal(feeTable(P, "en", money)[0].zone, "Montreal neighbourhoods");
  assert.equal(longSessionText(P, "en"), "3 hours");
  assert.equal(longSessionText(P, "fr"), "3 heures");
});

console.log("\nDans les courriels");

const base = {
  ref: "NVX-123456", locale: "fr", clientName: "Claire Dubois",
  clientEmail: "claire@example.com", clientPhone: "450 555-0199",
  address: "12 rue Principale", city: "Montréal", postalCode: "H3E 1A1",
  notes: null, items: [{ label: "Chemises", qty: 12 }],
  startsAt: new Date("2026-11-04T18:00:00Z"), durationMinutes: 180,
  estimateCents: 10000, currency: "CAD", firstHourFree: true,
  timezone: "America/Toronto", manageUrl: "https://x/fr/reservation/t",
  siteUrl: "https://nivexrepassage.ca", businessPhone: "+1 450 943 1217",
  businessEmail: "nivexrepassage@gmail.com",
};
const avec = { ...base, travelFeeCents: 1000, travelZone: "Quartiers de Montréal" };

test("le client voit la zone, la ligne et le total", () => {
  const mail = clientConfirmation(avec);
  const txt = flat(mail.text);
  assert.match(txt, /Frais de déplacement \(Quartiers de Montréal\): 10 \$/);
  assert.match(txt, /Total estimé: 110 \$/);
  assert.match(flat(mail.html), /ne les couvre pas/, "la note doit expliquer l'exclusion");
});

test("l'artisan voit la même chose", () => {
  const mail = ownerNotification(avec);
  assert.match(flat(mail.text), /Frais de déplacement \(Quartiers de Montréal\): 10 \$/);
  assert.match(flat(mail.text), /Total estimé: 110 \$/);
});

test("sans frais, aucune ligne ni total ne s'affichent", () => {
  for (const mail of [clientConfirmation(base), ownerNotification(base)]) {
    assert.doesNotMatch(flat(mail.text), /Frais de déplacement/, "un 0 $ n'apprend rien");
    assert.doesNotMatch(flat(mail.text), /Total estimé/);
  }
});

test("le courriel anglais se lit en anglais", () => {
  const mail = clientConfirmation({ ...avec, locale: "en", travelZone: "Montreal neighbourhoods" });
  assert.match(flat(mail.text), /Travel fee \(Montreal neighbourhoods\): \$10/);
  assert.match(flat(mail.text), /Estimated total: \$110/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

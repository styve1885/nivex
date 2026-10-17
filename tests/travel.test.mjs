/**
 * Tests des secteurs, des zones et des frais de déplacement.
 * Exécution : npx tsx tests/travel.test.mjs
 *
 * Ce qui compte ici : que chaque code postal tombe dans le bon secteur et la
 * bonne zone, que le seuil soit inclusif et propre à chaque zone, qu'un
 * préfixe ne puisse jamais appartenir à deux zones, que l'ancienne grille ne
 * revienne pas par la lecture, et que l'offre « première heure offerte »
 * n'ait aucune prise sur la route.
 */
import assert from "node:assert/strict";

const {
  evaluateZone, zoneFor, bookable, feeTable, postalHead, servedText, googleList, sectorNames,
  activePrefixes, thresholdText, policyProblems, describeChanges, orderedSectors, joinList,
  DEFAULT_ZONE_POLICY,
} = await import("../src/lib/travel.ts");
const { readZonePolicy, FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { estimateCents } = await import("../src/lib/availability.ts");
const { ownerNotification, clientConfirmation } = await import("../src/lib/email.ts");
const { fr } = await import("../src/lib/i18n/fr.ts");
const { en } = await import("../src/lib/i18n/en.ts");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const flat = (x) => x.replace(/[\u00a0\u202f\u2009]/g, " ");
const clone = (x) => JSON.parse(JSON.stringify(x));

const P = DEFAULT_ZONE_POLICY;
const COURT = 120;   // 2 h
const LONG = 180;    // 3 h pile

console.log("\nLes vingt secteurs du profil Google");

test("vingt secteurs, dans l'ordre de la fiche, répartis en A, B et C", () => {
  assert.deepEqual(sectorNames(P, "fr"), [
    "Longueuil", "Saint-Hubert", "Greenfield Park", "Saint-Lambert", "Brossard", "Boucherville",
    "Saint-Bruno-de-Montarville", "Sainte-Julie", "Varennes",
    "L'Île-des-Sœurs", "Verdun", "Vieux-Montréal", "Westmount", "Outremont",
    "Centre-ville de Montréal", "Le Plateau-Mont-Royal", "Chambly", "Candiac", "La Prairie",
    "Saint-Jean-sur-Richelieu",
  ]);
  const parZone = (k) => P.sectors.filter((s) => s.zoneKey === k).length;
  assert.equal(parZone("a"), 9);
  assert.equal(parZone("b"), 10);
  assert.equal(parZone("c"), 1);
});

test("chaque préfixe tombe dans sa zone", () => {
  const attendu = {
    a: ["J4G", "J4H", "J4J", "J4K", "J4L", "J4M", "J4N", "J3Y", "J3Z", "J4T", "J4V", "J4P", "J4R", "J4S",
        "J4W", "J4X", "J4Y", "J4Z", "J4B", "J3V", "J3E", "J3X"],
    b: ["H3E", "H4G", "H4H", "H2Y", "H3Y", "H3Z", "H2V", "H3A", "H3B", "H3G", "H3H",
        "H3C", "H2Z", "H2L", "H2X", "H2J", "H2T", "H2W", "H2H", "J3L", "J5R"],
    c: ["J2W", "J2X", "J2Y", "J3A", "J3B"],
  };
  for (const [zone, codes] of Object.entries(attendu)) {
    for (const code of codes) assert.equal(evaluateZone(`${code} 1A1`, COURT, P).zoneKey, zone, `${code} devrait être en zone ${zone.toUpperCase()}`);
  }
  assert.equal(activePrefixes(P).length, 22 + 21 + 5, "aucun préfixe en trop, aucun oublié");
});

test("la grille par défaut ne pose aucun problème, et aucun préfixe dans deux zones", () => {
  assert.deepEqual(policyProblems(P), []);
});

test("J3L — Chambly, et Carignan avec elle — paie les frais de la zone B", () => {
  assert.equal(evaluateZone("J3L 1A1", COURT, P).zoneKey, "b");
  assert.equal(evaluateZone("J3L 1A1", COURT, P).feeCents, 1500);
  assert.equal(evaluateZone("J3L 1A1", LONG, P).feeCents, 1000);
});

test("J5R, partagé par Candiac et La Prairie, paie les frais de la zone B", () => {
  assert.equal(evaluateZone("J5R 1A1", COURT, P).zoneKey, "b");
  assert.equal(evaluateZone("J5R 1A1", COURT, P).feeCents, 1500);
  assert.equal(evaluateZone("J5R 1A1", LONG, P).feeCents, 1000);
  const deux = P.sectors.filter((s) => s.prefixes.includes("J5R")).map((s) => s.nameFr);
  assert.deepEqual(deux, ["Candiac", "La Prairie"]);
});

console.log("\nLes six codes de la vérification, en 2 h et en 3 h");

const VERIF = [
  ["J4J 1A1", "a", 0, 0],
  ["J5R 1A1", "b", 1500, 1000],
  ["H3E 1A1", "b", 1500, 1000],
  ["H3B 1A1", "b", 1500, 1000],
  ["J2W 1A1", "c", 2500, 2000],
];

test("frais de la zone selon la durée réservée", () => {
  for (const [code, zone, court, long] of VERIF) {
    const a = evaluateZone(code, COURT, P);
    const b = evaluateZone(code, LONG, P);
    assert.equal(a.zoneKey, zone, code);
    assert.equal(a.feeCents, court, `${code} en 2 h`);
    assert.equal(b.feeCents, long, `${code} en 3 h`);
    assert.equal(a.status, court > 0 ? "fee" : "free");
    assert.equal(a.shortFeeCents, court, "le verdict porte les deux tarifs");
    assert.equal(a.longFeeCents, long);
    assert.equal(a.thresholdMinutes, 180);
  }
});

test("H1A est hors zone, en 2 h comme en 3 h", () => {
  for (const d of [COURT, LONG]) {
    const v = evaluateZone("H1A 1A1", d, P);
    assert.equal(v.status, "out");
    assert.equal(bookable(v), false);
    assert.equal(v.feeCents, 0, "on ne facture pas ce qu'on refuse");
  }
});

console.log("\nLe seuil est atteint, non dépassé, et propre à chaque zone");

test("trois heures tout rond paient déjà le tarif réduit", () => {
  assert.equal(evaluateZone("H3E 1A1", 179, P).feeCents, 1500, "179 min : tarif plein");
  assert.equal(evaluateZone("H3E 1A1", 180, P).feeCents, 1000, "180 min : tarif réduit");
  assert.equal(evaluateZone("J2W 1A1", 179, P).feeCents, 2500);
  assert.equal(evaluateZone("J2W 1A1", 180, P).feeCents, 2000);
});

test("un seuil changé sur une zone ne touche pas les autres", () => {
  const p = clone(P);
  p.zones.find((z) => z.key === "c").thresholdMinutes = 240;
  assert.equal(evaluateZone("J2W 1A1", 180, p).feeCents, 2500, "3 h est court en zone C");
  assert.equal(evaluateZone("J2W 1A1", 240, p).feeCents, 2000);
  assert.equal(evaluateZone("H3E 1A1", 180, p).feeCents, 1000, "la zone B garde 3 h");
});

console.log("\nHors zone");

test("le reste du Québec ne peut pas réserver en ligne", () => {
  for (const code of ["G1A 1A1", "H1A 1A1", "J0J 1R0", "H3T 1A1", "K1A 0A6", "J8X 1A1", "J3M 1A1"]) {
    assert.equal(evaluateZone(code, COURT, P).status, "out", `${code} devrait être hors zone`);
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

console.log("\nLa première heure offerte n'a aucune prise");

test("elle escompte la séance, jamais la route", () => {
  const s = { ...FALLBACK_SETTINGS };
  const avec = estimateCents(180, s, true);
  const sans = estimateCents(180, s, false);
  assert.equal(sans, 15000);
  assert.equal(avec, 10000, "une heure offerte sur trois");
  const frais = evaluateZone("J2W 1A1", 180, P).feeCents;
  assert.equal(frais, 2000, "la route ne se raccourcit pas");
  assert.equal(avec + frais, 12000, "le total additionne, il ne compense pas");
});

console.log("\nCe que l'onglet « Zones et frais » peut faire");

test("un secteur désactivé cesse d'être desservi, les autres non", () => {
  const p = clone(P);
  p.sectors.find((s) => s.key === "saint-jean").enabled = false;
  assert.equal(evaluateZone("J2W 1A1", COURT, p).status, "out");
  assert.equal(evaluateZone("J4K 1A1", COURT, p).status, "free");
  assert.ok(!sectorNames(p, "fr").includes("Saint-Jean-sur-Richelieu"), "il disparaît du texte public");
});

test("désactiver La Prairie laisse J5R desservi par Candiac", () => {
  const p = clone(P);
  p.sectors.find((s) => s.key === "la-prairie").enabled = false;
  assert.equal(evaluateZone("J5R 1A1", COURT, p).zoneKey, "b");
});

test("un secteur qui change de zone change de tarif", () => {
  const p = clone(P);
  p.sectors.find((s) => s.key === "verdun").zoneKey = "c";
  assert.equal(evaluateZone("H4G 1A1", COURT, p).feeCents, 2500);
  assert.equal(evaluateZone("H3E 1A1", COURT, p).feeCents, 1500, "les voisins ne bougent pas");
});

test("une zone créée prend ses propres tarifs", () => {
  const p = clone(P);
  p.zones.push({ key: "d", nameFr: "Zone D", nameEn: "Zone D", shortFeeCents: 3500, longFeeCents: 3000, thresholdMinutes: 180 });
  p.sectors.push({ key: "laval", nameFr: "Laval", nameEn: "Laval", prefixes: ["H7A"], zoneKey: "d", enabled: true });
  assert.deepEqual(policyProblems(p), []);
  assert.equal(evaluateZone("H7A 1A1", COURT, p).feeCents, 3500);
  assert.equal(evaluateZone("H7A 1A1", LONG, p).feeCents, 3000);
});

test("un préfixe dans deux zones est refusé, en nommant les deux secteurs", () => {
  const p = clone(P);
  p.sectors.push({ key: "carignan", nameFr: "Carignan", nameEn: "Carignan", prefixes: ["J3L"], zoneKey: "a", enabled: true });
  const pb = policyProblems(p);
  assert.equal(pb.length, 1);
  assert.match(pb[0], /J3L est dans deux zones à la fois : Chambly \(Zone B\) et Carignan \(Zone A\)/);
});

test("le même conflit est toléré tant que l'un des deux secteurs est inactif", () => {
  const p = clone(P);
  p.sectors.push({ key: "carignan", nameFr: "Carignan", nameEn: "Carignan", prefixes: ["J3L"], zoneKey: "a", enabled: false });
  assert.deepEqual(policyProblems(p), []);
  assert.equal(evaluateZone("J3L 1A1", COURT, p).zoneKey, "b");
});

test("Carignan peut s'ajouter en zone B, à côté de Chambly", () => {
  const p = clone(P);
  p.sectors.push({ key: "carignan", nameFr: "Carignan", nameEn: "Carignan", prefixes: ["J3L"], zoneKey: "b", enabled: true });
  assert.deepEqual(policyProblems(p), [], "même préfixe, même zone : permis");
});

test("préfixe mal formé, secteur sans nom, zone disparue : refusés", () => {
  const p = clone(P);
  p.sectors[0].prefixes = ["J4K", "J4"];
  p.sectors[1].nameFr = " ";
  p.sectors[2].zoneKey = "z";
  const pb = policyProblems(p).join("\n");
  assert.match(pb, /préfixe invalide \(J4\)/);
  assert.match(pb, /nom en français/);
  assert.match(pb, /zone qui n'existe plus/);
});

test("plus aucun secteur actif : refusé, sinon plus personne ne réserve", () => {
  const p = clone(P);
  for (const s of p.sectors) s.enabled = false;
  assert.match(policyProblems(p).join("\n"), /Au moins un secteur doit rester actif/);
});

test("l'ordre suit les zones, puis le tableau", () => {
  const p = clone(P);
  const sj = p.sectors.pop();
  p.sectors.unshift(sj);                 // Saint-Jean en tête du tableau…
  assert.equal(orderedSectors(p).at(-1).key, "saint-jean", "…mais toujours après les zones A et B");
});

console.log("\nLecture de ce qui est enregistré");

test("jamais réglé, ou l'ancienne grille : les vingt secteurs s'appliquent", () => {
  const ancienne = {
    longSessionMinutes: 180,
    zones: [{ key: "a", labelFr: "Longueuil et la Rive-Sud", labelEn: "x", prefixes: ["J4K"], shortFeeCents: 0, longFeeCents: 0, enabled: true }],
  };
  for (const vide of [null, undefined, [], "n'importe quoi", 42, {}, { zones: [] }, ancienne, { ...ancienne, version: 1 }]) {
    assert.deepEqual(readZonePolicy(vide), P, `${JSON.stringify(vide)} devrait retomber sur la grille par défaut`);
  }
});

test("une grille enregistrée à la forme 2 fait foi", () => {
  const lu = readZonePolicy({
    version: 2,
    zones: [{ key: "x", nameFr: "Chez moi", nameEn: "Home", shortFeeCents: 500, longFeeCents: 100, thresholdMinutes: 240 }],
    sectors: [{ key: "k", nameFr: "Longueuil", nameEn: "", prefixes: ["j4k", "pas un code"], zoneKey: "x", enabled: true }],
  });
  assert.equal(lu.zones.length, 1, "aucune zone du code ne se rajoute");
  assert.deepEqual(lu.sectors[0].prefixes, ["J4K"], "les préfixes mal formés tombent");
  assert.equal(evaluateZone("H3E 1A1", COURT, lu).status, "out");
  assert.equal(evaluateZone("J4K 1A1", 200, lu).feeCents, 500, "le seuil de 4 h est respecté");
});

test("un secteur rattaché à une zone disparue est écarté", () => {
  const lu = readZonePolicy({
    version: 2,
    zones: [{ key: "a", nameFr: "Zone A", shortFeeCents: 0, longFeeCents: 0, thresholdMinutes: 180 }],
    sectors: [
      { key: "ok", nameFr: "Longueuil", prefixes: ["J4K"], zoneKey: "a", enabled: true },
      { key: "orphelin", nameFr: "Ailleurs", prefixes: ["H1A"], zoneKey: "q", enabled: true },
    ],
  });
  assert.deepEqual(lu.sectors.map((s) => s.key), ["ok"]);
});

test("des montants ou un seuil absurdes retombent sur des valeurs sûres", () => {
  const lu = readZonePolicy({
    version: 2,
    zones: [{ key: "x", nameFr: "X", shortFeeCents: -500, longFeeCents: "beaucoup", thresholdMinutes: 5 }],
    sectors: [{ key: "k", nameFr: "K", prefixes: ["J4K"], zoneKey: "x", enabled: true }],
  });
  assert.equal(lu.zones[0].shortFeeCents, 0);
  assert.equal(lu.zones[0].longFeeCents, 0);
  assert.equal(lu.zones[0].thresholdMinutes, 180);
});

console.log("\nLe texte public, la liste pour Google, le tableau des frais");

test("la phrase de la zone nomme les secteurs actifs, en français et en anglais", () => {
  const f = servedText(P, "fr", fr.zoneText);
  assert.ok(f.startsWith("Secteurs desservis : Longueuil, Saint-Hubert,"));
  assert.ok(f.endsWith("Le Plateau-Mont-Royal, Chambly, Candiac, La Prairie et Saint-Jean-sur-Richelieu."));
  const e = servedText(P, "en", en.zoneText);
  assert.match(e, /^Areas served: Longueuil, /);
  assert.match(e, /Nuns' Island/);
  assert.match(e, /Downtown Montreal/);
  assert.ok(e.endsWith("Plateau-Mont-Royal, Chambly, Candiac, La Prairie and Saint-Jean-sur-Richelieu."));
});

test("aucun point d'exclamation dans les textes générés", () => {
  for (const t of [servedText(P, "fr", fr.zoneText), servedText(P, "en", en.zoneText), fr.zoneText.none, en.zoneText.none,
                   fr.zoneCheck.served, fr.zoneCheck.servedWithFee, fr.zoneCheck.tooFar,
                   en.zoneCheck.served, en.zoneCheck.servedWithFee, en.zoneCheck.tooFar]) {
    assert.doesNotMatch(t, /!/);
  }
});

test("la liste pour Google : un secteur actif par ligne, dans l'ordre", () => {
  const l = googleList(P).split("\n");
  assert.equal(l.length, 20);
  assert.equal(l[0], "Longueuil");
  assert.equal(l[16], "Chambly");
  assert.equal(l[17], "Candiac");
  assert.equal(l[18], "La Prairie");
  assert.equal(l[19], "Saint-Jean-sur-Richelieu");
  const p = clone(P);
  p.sectors.find((s) => s.key === "candiac").enabled = false;
  assert.equal(googleList(p).split("\n").length, 19, "un secteur inactif n'y figure pas");
});

test("le tableau des frais montre chaque zone, ses secteurs et ses deux tarifs", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const rows = feeTable(P, "fr", money);
  assert.deepEqual(rows.map((r) => r.zone), ["Zone A", "Zone B", "Zone C"]);
  assert.equal(rows[0].free, true);
  assert.equal(rows[0].sectors.length, 9);
  assert.deepEqual(rows[1].sectors.slice(-3), ["Chambly", "Candiac", "La Prairie"]);
  assert.deepEqual({ short: rows[1].short, long: rows[1].long, threshold: rows[1].threshold }, { short: "15 $", long: "10 $", threshold: "3 h" });
  assert.deepEqual(rows[2].sectors, ["Saint-Jean-sur-Richelieu"]);
  assert.equal(feeTable(P, "en", money)[1].threshold, "3 hours");
  assert.ok(feeTable(P, "en", money)[1].sectors.includes("Old Montreal"));
});

test("le seuil s'écrit comme on le dit", () => {
  assert.equal(thresholdText(180, "fr"), "3 h");
  assert.equal(thresholdText(150, "fr"), "2 h 30");
  assert.equal(thresholdText(180, "en"), "3 hours");
  assert.equal(joinList(["A", "B", "C"], "fr"), "A, B et C");
  assert.equal(joinList(["A", "B"], "en"), "A and B");
});

console.log("\nL'historique");

test("chaque changement s'écrit en une ligne lisible", () => {
  const p = clone(P);
  p.zones.find((z) => z.key === "b").shortFeeCents = 2000;
  p.zones.find((z) => z.key === "c").thresholdMinutes = 240;
  p.sectors.find((s) => s.key === "verdun").zoneKey = "c";
  p.sectors.find((s) => s.key === "chambly").prefixes.push("J3M");
  p.sectors.find((s) => s.key === "outremont").enabled = false;
  p.sectors = p.sectors.filter((s) => s.key !== "candiac");
  p.sectors.push({ key: "laval", nameFr: "Laval", nameEn: "Laval", prefixes: ["H7A"], zoneKey: "c", enabled: true });
  const l = describeChanges(P, p);
  assert.ok(l.includes("Zone « Zone B » : frais sous le seuil 15 $ → 20 $."));
  assert.ok(l.includes("Zone « Zone C » : seuil 3 h → 4 h."));
  assert.ok(l.includes("Secteur « Verdun » : Zone B → Zone C."));
  assert.ok(l.includes("Secteur « Chambly » : J3M ajouté."));
  assert.ok(l.includes("Secteur « Outremont » désactivé."));
  assert.ok(l.includes("Secteur « Candiac » supprimé."));
  assert.ok(l.includes("Secteur « Laval » ajouté en Zone C (H7A)."));
  assert.ok(!l.includes("Ordre des secteurs modifié."), "un ajout ou un changement de zone n'est pas un réordonnancement");
});

test("monter un secteur se note comme un changement d'ordre, et rien d'autre", () => {
  const p = clone(P);
  [p.sectors[0], p.sectors[1]] = [p.sectors[1], p.sectors[0]];
  assert.deepEqual(describeChanges(P, p), ["Ordre des secteurs modifié."]);
});

test("rien de changé, rien de noté", () => {
  assert.deepEqual(describeChanges(P, clone(P)), []);
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
const avec = { ...base, travelFeeCents: 1000, travelZone: "Zone B" };

test("le client voit la zone, la ligne et le total", () => {
  const mail = clientConfirmation(avec);
  const txt = flat(mail.text);
  assert.match(txt, /Frais de déplacement \(Zone B\): 10 \$/);
  assert.match(txt, /Total estimé: 110 \$/);
  assert.match(flat(mail.html), /ne les couvre pas/, "la note doit expliquer l'exclusion");
});

test("l'artisan voit la même chose", () => {
  const mail = ownerNotification(avec);
  assert.match(flat(mail.text), /Frais de déplacement \(Zone B\): 10 \$/);
  assert.match(flat(mail.text), /Total estimé: 110 \$/);
});

test("sans frais, aucune ligne ni total ne s'affichent", () => {
  for (const mail of [clientConfirmation(base), ownerNotification(base)]) {
    assert.doesNotMatch(flat(mail.text), /Frais de déplacement/, "un 0 $ n'apprend rien");
    assert.doesNotMatch(flat(mail.text), /Total estimé/);
  }
});

test("le courriel anglais se lit en anglais", () => {
  const mail = clientConfirmation({ ...avec, locale: "en" });
  assert.match(flat(mail.text), /Travel fee \(Zone B\): \$10/);
  assert.match(flat(mail.text), /Estimated total: \$110/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

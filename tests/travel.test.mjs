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
  isMontrealSector, montrealNames, montrealFees, sectorsByRegion, servedRegions,
  DEFAULT_ZONE_POLICY,
} = await import("../src/lib/travel.ts");
const { legalValues, legalSections, fill } = await import("../src/components/LegalDocument.tsx");
const { openingLine } = await import("../src/components/home/opening-line.ts");
const { readZonePolicy, FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { phoneDisplay, metaDescription, localBusinessJsonLd, faqJsonLd } = await import("../src/lib/seo.ts");
const { default: robots } = await import("../src/app/robots.ts");
const { default: sitemap } = await import("../src/app/sitemap.ts");
const { middleware } = await import("../src/middleware.ts");
const { NextRequest } = await import("next/server");
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

console.log("\nLes secteurs, Rive-Sud d'abord, Montréal ensuite");

test("vingt et un secteurs : Saint-Lambert en tête, puis la Rive-Sud, puis Montréal", () => {
  assert.deepEqual(sectorNames(P, "fr"), [
    "Saint-Lambert", "Vieux-Longueuil", "Longueuil", "Greenfield Park", "Saint-Hubert",
    "Brossard", "Boucherville", "Saint-Bruno-de-Montarville", "Sainte-Julie", "Varennes",
    "Chambly", "Candiac", "La Prairie", "Saint-Jean-sur-Richelieu",
    "L'Île-des-Sœurs", "Verdun", "Vieux-Montréal", "Westmount", "Outremont",
    "Centre-ville de Montréal", "Le Plateau-Mont-Royal",
  ]);
  const parZone = (k) => P.sectors.filter((s) => s.zoneKey === k).length;
  assert.equal(parZone("a"), 10);
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
  assert.equal(sans, 16500, "trois heures à 55 $");
  assert.equal(avec, 11000, "une heure offerte sur trois");
  assert.equal(estimateCents(120, s, true), 5500, "la première séance de 2 h revient à 55 $");
  const frais = evaluateZone("J2W 1A1", 180, P).feeCents;
  assert.equal(frais, 2000, "la route ne se raccourcit pas");
  assert.equal(avec + frais, 13000, "le total additionne, il ne compense pas");
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

/* Les bornes que le serveur refuse se signalent pendant la saisie, en
   nommant le secteur ou la zone : un refus en bloc, à l'enregistrement, ne
   disait pas où chercher. */
const { POLICY_LIMITS } = await import("../src/lib/travel.ts");

test("les bornes du serveur se signalent pendant la saisie, avec le nom en cause", () => {
  assert.deepEqual(policyProblems(P), [], "la grille par défaut les respecte");

  const p = clone(P);
  const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const trop = Array.from({ length: POLICY_LIMITS.prefixesPerSector + 1 }, (_, i) => `H${Math.floor(i / 26)}${lettres[i % 26]}`);
  p.sectors.push({ key: "ile", nameFr: "Île de Montréal", nameEn: "", prefixes: trop, zoneKey: "b", enabled: false });
  assert.deepEqual(policyProblems(p), ["Île de Montréal : 61 préfixes, pour 60 au plus. Répartissez-les entre plusieurs secteurs."]);

  const q = clone(P);
  q.zones[1].longFeeCents = POLICY_LIMITS.feeCents + 1;
  q.sectors[0].nameEn = "x".repeat(POLICY_LIMITS.nameLength + 1);
  const pb = policyProblems(q).join("\n");
  assert.match(pb, /Zone B : les frais vont de 0 à 500 \$ par visite/);
  assert.match(pb, /Saint-Lambert : un nom compte 80 caractères au plus/);
});

test("un nom anglais laissé vide suit le français, jusque dans le tunnel", () => {
  const p = clone(P);
  p.zones[1].nameFr = "Zone Montréal";
  p.zones[1].nameEn = "";
  p.sectors.find((s) => s.key === "verdun").nameEn = "";
  assert.equal(evaluateZone("H4G 1A1", COURT, p).labelEn, "Zone Montréal", "le libellé anglais des frais");
  assert.ok(sectorNames(p, "en").includes("Verdun"));
  assert.equal(feeTable(p, "en", (c) => `$${c / 100}`)[1].zone, "Zone Montréal");
});

/* Ce que l'artisan tape dans l'onglet : virgule ou point, et rien de deviné.
   Un champ numérique réécrit à chaque touche changeait « 12,50 » en 130 $. */
const { parseDollars, parseHours, dollarsText, hoursText } = await import("../src/components/admin/inputs.ts");

test("les montants se lisent comme on les tape, au cent près", () => {
  assert.equal(parseDollars("12,50"), 1250);
  assert.equal(parseDollars("12.5"), 1250);
  assert.equal(parseDollars("12 $"), 1200);
  assert.equal(parseDollars("12,"), 1200, "une saisie en cours reste lisible");
  assert.equal(parseDollars(""), 0, "un champ vidé vaut zéro, comme avant");
  assert.equal(parseDollars("12,505"), null, "trois décimales ne se devinent pas");
  assert.equal(parseDollars("abc"), null);
  assert.equal(parseDollars("-5"), null);
  for (const c of [0, 1500, 1250, 99, POLICY_LIMITS.feeCents]) assert.equal(parseDollars(dollarsText(c)), c);
  assert.equal(dollarsText(1250), "12,50");
});

test("les seuils se lisent en heures, décimales ou « 2 h 30 »", () => {
  assert.equal(parseHours("3"), 180);
  assert.equal(parseHours("2,5"), 150);
  assert.equal(parseHours("2.5"), 150, "et non 5 h");
  assert.equal(parseHours("2 h 30"), 150);
  assert.equal(parseHours("2:30"), 150);
  assert.equal(parseHours("2."), 120, "une saisie en cours reste lisible");
  assert.equal(parseHours(""), null, "un seuil vide ne vaut pas zéro");
  assert.equal(parseHours("2 h 75"), null);
  for (const m of [30, 150, 180, 135, 960]) assert.equal(parseHours(hoursText(m)), m);
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

test("la phrase de la zone : la Rive-Sud, puis Montréal, en français et en anglais", () => {
  const f = flat(servedText(P, "fr", fr.zoneText));
  assert.ok(f.startsWith("Secteurs desservis : Saint-Lambert, Vieux-Longueuil, Longueuil, Greenfield Park, Saint-Hubert, Brossard,"));
  assert.ok(f.includes("La Prairie et Saint-Jean-sur-Richelieu. À Montréal : L'Île-des-Sœurs, Verdun,"));
  assert.ok(f.endsWith("Centre-ville de Montréal et Le Plateau-Mont-Royal."));
  const e = servedText(P, "en", en.zoneText);
  assert.match(e, /^Areas served: Saint-Lambert, Vieux-Longueuil, /);
  assert.ok(e.includes("La Prairie and Saint-Jean-sur-Richelieu. In Montreal: Nuns' Island, Verdun, Old Montreal,"));
  assert.ok(e.endsWith("Downtown Montreal and Plateau-Mont-Royal."));
});

test("sans quartier de Montréal, la phrase s'arrête à la Rive-Sud ; sans Rive-Sud, elle ne dit que Montréal", () => {
  const p = clone(P);
  for (const x of p.sectors) if (isMontrealSector(x)) x.enabled = false;
  assert.doesNotMatch(flat(servedText(p, "fr", fr.zoneText)), /Montréal :/);
  const q = clone(P);
  for (const x of q.sectors) if (!isMontrealSector(x)) x.enabled = false;
  assert.match(flat(servedText(q, "fr", fr.zoneText)), /^À Montréal : L'Île-des-Sœurs/);
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
  assert.equal(l.length, 21);
  assert.deepEqual(l.slice(0, 5), ["Saint-Lambert", "Vieux-Longueuil", "Longueuil", "Greenfield Park", "Saint-Hubert"]);
  assert.equal(l[13], "Saint-Jean-sur-Richelieu");
  assert.equal(l[14], "L'Île-des-Sœurs", "Montréal vient après la Rive-Sud");
  assert.equal(l[20], "Le Plateau-Mont-Royal");
  const p = clone(P);
  p.sectors.find((s) => s.key === "candiac").enabled = false;
  assert.equal(googleList(p).split("\n").length, 20, "un secteur inactif n'y figure pas");
});

test("le tableau des frais montre chaque zone, ses secteurs et ses deux tarifs", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const rows = feeTable(P, "fr", money);
  assert.deepEqual(rows.map((r) => r.zone), ["Zone A", "Zone B", "Zone C"]);
  assert.equal(rows[0].free, true);
  assert.equal(rows[0].sectors.length, 10);
  assert.deepEqual(rows[0].sectors.slice(0, 5), ["Saint-Lambert", "Vieux-Longueuil", "Longueuil", "Greenfield Park", "Saint-Hubert"]);
  assert.deepEqual(rows[1].sectors.slice(0, 3), ["Chambly", "Candiac", "La Prairie"], "la Rive-Sud d'abord, dans la zone aussi");
  assert.equal(rows[1].sectors.at(-1), "Le Plateau-Mont-Royal", "les quartiers de l'île ensuite");
  assert.equal(rows[1].sectors.length, 10);
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

console.log("\nMontréal");

test("un quartier de Montréal se reconnaît à ses préfixes en H, Laval à part", () => {
  const s = (prefixes) => ({ key: "x", nameFr: "x", nameEn: "", prefixes, zoneKey: "b", enabled: true });
  assert.equal(isMontrealSector(s(["H3E"])), true);
  assert.equal(isMontrealSector(s(["H4G", "H4H"])), true);
  assert.equal(isMontrealSector(s(["J4K"])), false);
  assert.equal(isMontrealSector(s(["H7A"])), false, "Laval n'est pas Montréal");
  assert.equal(isMontrealSector(s([])), false);
});

test("les quartiers de Montréal : les sept secteurs de l'île, et eux seuls", () => {
  assert.deepEqual(montrealNames(P, "fr"), [
    "L'Île-des-Sœurs", "Verdun", "Vieux-Montréal", "Westmount", "Outremont", "Centre-ville de Montréal", "Le Plateau-Mont-Royal",
  ]);
  assert.equal(montrealNames(P, "en")[0], "Nuns' Island");
  assert.equal(sectorsByRegion(P).south.some(isMontrealSector), false);
});

test("les frais de Montréal : ceux de la zone B, sans Chambly ni Candiac", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const rows = montrealFees(P, "fr", money);
  assert.equal(rows.length, 1);
  assert.deepEqual({ short: rows[0].short, long: rows[0].long, threshold: rows[0].threshold }, { short: "15 $", long: "10 $", threshold: "3 h" });
  assert.ok(!rows[0].sectors.includes("Chambly"));
  const p = clone(P);
  p.sectors.find((x) => x.key === "verdun").zoneKey = "c";
  assert.equal(montrealFees(p, "fr", money).length, 2, "deux zones, deux lignes");
});

console.log("\nCe que lisent les moteurs et les assistants");

test("le numéro s'écrit +1 450 943-1217", () => {
  assert.equal(phoneDisplay(), "+1 450 943-1217");
});

test("la description de l'accueil nomme Saint-Lambert d'abord, puis Montréal", () => {
  assert.equal(metaDescription(fr, P, "fr").split(".")[0],
    "Repassage à domicile à Saint-Lambert, Vieux-Longueuil, Longueuil, Greenfield Park, Saint-Hubert et Montréal");
  assert.match(metaDescription(en, P, "en"), /^In-home ironing in Saint-Lambert, Vieux-Longueuil, Longueuil, Greenfield Park, Saint-Hubert and Montreal\./);
  assert.doesNotMatch(metaDescription(fr, P, "fr"), /\{|!/);
});

test("la fiche LocalBusiness : nom, téléphone, site, prix, et la Rive-Sud avant Montréal", () => {
  const ld = localBusinessJsonLd(fr, FALLBACK_SETTINGS, "fr");
  assert.equal(ld["@type"], "LocalBusiness");
  assert.equal(ld.name, "NIVEX");
  assert.equal(ld.telephone, "+1 450 943-1217");
  assert.equal(ld.email, "contact@nivexrepassage.ca", "le courriel du domaine, pas le Gmail");
  assert.match(ld.url, /\/fr$/);
  assert.equal(flat(ld.priceRange), "55 $ / h");
  assert.equal(ld.makesOffer[0].priceSpecification.price, FALLBACK_SETTINGS.hourlyRate / 100, "le prix vient des réglages");
  assert.equal(ld.makesOffer[0].eligibleQuantity.minValue, 2, "deux heures au minimum");
  /* La capacité, avec sa précision, et les deux séances de la vitrine à leur prix. */
  assert.match(flat(ld.makesOffer[0].description), /^Jusqu'à 18 pièces en 2 h, et jusqu'à 27 en 3 h, selon la taille, le type et la matière des vêtements\. Chaque séance inclut l'installation/);
  assert.deepEqual(ld.makesOffer.slice(1, 3).map((o) => [o.price, o.description.split(".")[0]]),
    [[110, "Jusqu'à 18 pièces"], [165, "Jusqu'à 27 pièces"]]);
  const lieux = ld.areaServed.map((x) => x.name);
  assert.equal(lieux[0], "Saint-Lambert");
  assert.equal(lieux.length, 21);
  const premierMontreal = ld.areaServed.findIndex((x) => x.address.addressLocality === "Montréal");
  assert.equal(lieux[premierMontreal], "L'Île-des-Sœurs");
  assert.ok(ld.areaServed.slice(premierMontreal).every((x) => x.address.addressLocality === "Montréal"), "Montréal en dernier, d'un bloc");
});

test("la foire aux questions structurée reprend le texte affiché", () => {
  const ld = faqJsonLd([{ q: "Q ?", a: "R." }]);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, "R.");
});

const { pageMeta, notFoundMeta, siteMetadata, siteViewport } = await import("../src/lib/seo.ts");

test("chaque page a sa carte de partage : son adresse, ses deux langues, son titre complet", () => {
  const m = pageMeta(en, "en", "/tarifs", en.tarifs.eyebrow, en.tarifs.lede);
  assert.equal(m.title, en.tarifs.eyebrow, "le gabarit de la racine ajoute « · NIVEX » au <title>");
  assert.equal(m.alternates.canonical, "/en/tarifs");
  assert.deepEqual(m.alternates.languages, { "fr-CA": "/fr/tarifs", "en-CA": "/en/tarifs", "x-default": "/fr/tarifs" });
  assert.equal(m.openGraph.url, "/en/tarifs", "og:url est la page partagée, pas l'accueil");
  assert.equal(m.openGraph.type, "website");
  assert.equal(m.openGraph.siteName, "NIVEX");
  assert.equal(m.openGraph.title, `${en.tarifs.eyebrow} · NIVEX`, "la carte reçoit le titre complet");
  assert.equal(m.openGraph.description, en.tarifs.lede);
  assert.equal(m.openGraph.locale, "en_CA");
  assert.deepEqual(m.openGraph.alternateLocale, ["fr_CA"]);
  assert.equal(m.openGraph.images[0].url, "/opengraph-image.jpg", "l'image ne se perd pas avec le bloc");
  assert.equal(m.twitter, undefined, "la carte Twitter de la racine survit si personne ne la redéclare");

  const mtl = pageMeta(fr, "fr", "/montreal", { absolute: fr.montreal.metaTitle }, fr.montreal.lede);
  assert.equal(mtl.openGraph.title, fr.montreal.metaTitle, "un titre absolu reste tel quel");
  assert.deepEqual(mtl.openGraph.alternateLocale, ["en_CA"]);
  assert.equal(pageMeta(fr, "de", "", "x", "y").alternates.canonical, "/fr", "une langue inconnue retombe sur le français");
});

test("la page introuvable : un titre dans chaque langue, sans adresse canonique ni point d'exclamation", () => {
  assert.deepEqual(notFoundMeta(fr), { title: "Page introuvable", alternates: {} });
  assert.deepEqual(notFoundMeta(en), { title: "Page not found", alternates: {} });
  assert.deepEqual(Object.keys(en.notFound), Object.keys(fr.notFound));
  for (const t of [fr, en]) for (const v of Object.values(t.notFound)) assert.doesNotMatch(v, /!/, v);
});

test("l'en-tête commun aux deux racines : clair seulement, et sans « index, follow »", () => {
  assert.equal(siteViewport.colorScheme, "only light", "« light » seul laisserait Chrome inverser les couleurs");
  assert.ok(siteMetadata.metadataBase instanceof URL);
  assert.equal(siteMetadata.robots, undefined, "il contredisait le noindex des pages 404");
});

test("robots.txt : les cinq robots nommés, chacun avec les mêmes interdits", () => {
  const r = robots();
  const agents = r.rules.map((x) => x.userAgent);
  for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "*"]) {
    const rule = r.rules.find((x) => x.userAgent === bot);
    assert.ok(rule, `${bot} devrait être nommé`);
    assert.equal(rule.allow, "/");
    assert.ok(rule.disallow.includes("/admin") && rule.disallow.includes("/api/"), `${bot} ne doit pas lire l'espace artisan`);
    assert.ok(rule.disallow.includes("/fr/ne-pas-compter") && rule.disallow.includes("/en/ne-pas-compter"),
      `${bot} ne doit pas lire la page de retrait`);
  }
  assert.equal(agents.length, 6);
});

test("le plan du site contient la page Montréal, en français et en anglais", () => {
  const urls = sitemap().map((x) => x.url);
  assert.ok(urls.some((u) => u.endsWith("/fr/montreal")));
  assert.ok(urls.some((u) => u.endsWith("/en/montreal")));
});

test("le lien court /avis traverse le middleware, les autres adresses gardent leur langue", () => {
  const avis = middleware(new NextRequest("https://nivexrepassage.ca/avis"));
  assert.equal(avis.headers.get("location"), null, "envoyé vers /fr/avis, il tombait sur la page introuvable");
  assert.equal(avis.headers.get("x-middleware-next"), "1");
  const tarifs = middleware(new NextRequest("https://nivexrepassage.ca/tarifs"));
  assert.equal(new URL(tarifs.headers.get("location")).pathname, "/fr/tarifs");
  const deeper = middleware(new NextRequest("https://nivexrepassage.ca/avis/autre"));
  assert.equal(new URL(deeper.headers.get("location")).pathname, "/fr/avis/autre", "seule l'adresse exacte passe");
});

test("les nouveaux textes : aucun point d'exclamation, et le français a son anglais", () => {
  const textes = [fr.hero.onSite, en.hero.onSite, fr.faq.items[0].q, fr.faq.items[0].a, en.faq.items[0].q, en.faq.items[0].a,
    ...Object.values(fr.montreal).flatMap((v) => (Array.isArray(v) ? v.flatMap((x) => [x.q, x.a]) : [v])),
    ...Object.values(en.montreal).flatMap((v) => (Array.isArray(v) ? v.flatMap((x) => [x.q, x.a]) : [v]))];
  for (const t of textes) assert.doesNotMatch(t, /!/, t);
  assert.equal(flat(fr.faq.items[0].q), "Est-ce que vous ramassez les vêtements ?");
  assert.equal(fr.montreal.metaTitle, "Repassage à domicile à Montréal — NIVEX");
  assert.equal(fr.meta.title, "Repassage à domicile à Saint-Lambert et Longueuil — NIVEX");
});

test("le français garde ses espaces insécables : avant : ; ? et dans les guillemets", () => {
  /* Une espace ordinaire laisse le navigateur rejeter un « ? » seul en début
     de ligne, au téléphone surtout. Le dictionnaire les écrit en échappements. */
  const chaines = [];
  const lire = (v) => (typeof v === "string" ? chaines.push(v) : v && typeof v === "object" && Object.values(v).forEach(lire));
  lire(fr);
  assert.deepEqual(chaines.filter((s) => / [:;?!»]|« /.test(s)), []);
  assert.ok(chaines.length > 300, "tout le dictionnaire est relu");
});

console.log("\nCe que la vitrine écrit depuis les réglages");

test("la description n'annonce la première heure que si l'artisan l'offre", () => {
  assert.match(metaDescription(fr, P, "fr", true), /pas de livraison\. Première heure offerte\.$/);
  assert.match(metaDescription(en, P, "en", true), /no delivery\. First hour on the house\.$/);
  assert.doesNotMatch(metaDescription(fr, P, "fr", false), /offerte/);
  assert.doesNotMatch(metaDescription(en, P, "en", false), /on the house/);
  assert.match(localBusinessJsonLd(fr, FALLBACK_SETTINGS, "fr").description, /Première heure offerte\.$/);
  assert.doesNotMatch(localBusinessJsonLd(fr, { ...FALLBACK_SETTINGS, firstHourFree: false }, "fr").description, /offerte/);
});

test("les conditions ne nomment l'offre, pour l'écarter des abonnements, que si elle existe", () => {
  const abonnements = (s) => fr.legal.terms.sections.find((x) => x.title === "Les abonnements").body
    .map((p) => fill(p, legalValues("fr", s)).map((x) => (typeof x === "string" ? x : "·")).join("")).join(" ");
  assert.match(abonnements(FALLBACK_SETTINGS), /ne s'applique pas aux abonnements/);
  assert.doesNotMatch(abonnements({ ...FALLBACK_SETTINGS, firstHourFree: false }), /première heure/);
});

test("les documents légaux : aucune accolade ne reste, en français comme en anglais", () => {
  const reglages = [FALLBACK_SETTINGS, { ...FALLBACK_SETTINGS, firstHourFree: false, minMinutes: 180 }];
  for (const [locale, d] of [["fr", fr], ["en", en]]) {
    for (const s of reglages) {
      const v = legalValues(locale, s);
      for (const doc of [d.legal.privacy, d.legal.terms]) {
        for (const section of legalSections(doc, s)) {
          for (const p of [...section.body, ...(section.list ?? [])]) {
            const texte = fill(p, v).map((x) => (typeof x === "string" ? x : "·")).join("");
            assert.doesNotMatch(texte, /[{}]/, `${locale} : ${texte.slice(0, 90)}`);
          }
        }
      }
    }
  }
});

test("le prix des conditions suit la durée minimale réglée", () => {
  const article = (d) => d.legal.terms.sections.flatMap((x) => x.body).find((p) => p.includes("{entry}"));
  const prix = (s, d = fr, locale = "fr") => flat(fill(article(d), legalValues(locale, s)).join(""));
  assert.match(prix(FALLBACK_SETTINGS), /au minimum 2 heures et se facture 110 \$\./);
  assert.match(prix(FALLBACK_SETTINGS), /tranche de 30 min, au même taux de 55 \$ l'heure/, "la demi-heure de plus : 27,50 $");
  assert.match(prix({ ...FALLBACK_SETTINGS, minMinutes: 180 }), /au minimum 3 heures et se facture 165 \$\./);
  assert.match(prix(FALLBACK_SETTINGS, en, "en"), /2 hours at the least and is billed \$110\./);
});

test("la section de la première heure offerte disparaît avec l'offre", () => {
  const sans = { ...FALLBACK_SETTINGS, firstHourFree: false };
  const titres = (doc, s) => legalSections(doc, s).map((x) => x.title);
  assert.ok(titres(fr.legal.terms, FALLBACK_SETTINGS).includes("La première heure offerte"));
  assert.ok(!titres(fr.legal.terms, sans).includes("La première heure offerte"));
  assert.equal(titres(fr.legal.terms, sans).length, fr.legal.terms.sections.length - 1);
  assert.equal(titres(en.legal.terms, sans).length, titres(fr.legal.terms, sans).length, "l'anglais suit le français");
  assert.equal(titres(fr.legal.privacy, sans).length, fr.legal.privacy.sections.length, "la confidentialité n'en dépend pas");
});

test("la dernière carte des prestations nomme les régions desservies", () => {
  assert.deepEqual(servedRegions(P, fr.services.regions), ["Rive-Sud", "Montréal"]);
  const p = clone(P);
  for (const s of p.sectors) if (isMontrealSector(s)) s.enabled = false;
  assert.deepEqual(servedRegions(p, fr.services.regions), ["Rive-Sud"], "sans quartier de l'île, Montréal se tait");
  assert.deepEqual(servedRegions(P, en.services.regions), ["South Shore", "Montreal"]);
});

test("l'horaire du bloc Contact garde ses heures, et la semaine commence le lundi", () => {
  const ligne = (hours, locale = "fr", d = fr) => flat(openingLine(d, { ...FALLBACK_SETTINGS, hours }, locale));
  const H = FALLBACK_SETTINGS.hours;
  assert.equal(ligne(H), "7 h – 22 h, du lundi au samedi");
  assert.equal(ligne(H, "en", en), "7 a.m. – 10 p.m., Monday to Saturday");
  const samediCourt = H.map((h) => (h.day === 6 ? { ...h, open: "09:00", close: "17:00" } : h));
  assert.equal(ligne(samediCourt), "7 h – 22 h, du lundi au vendredi ; 9 h – 17 h, samedi");
  assert.equal(ligne(samediCourt, "en", en), "7 a.m. – 10 p.m., Monday to Friday; 9 a.m. – 5 p.m., Saturday");
  assert.equal(ligne(H.map((h) => ({ ...h, enabled: h.day !== 1 }))), "7 h – 22 h, du mardi au dimanche");
  assert.equal(ligne(H.map((h) => ({ ...h, enabled: [5, 6, 0].includes(h.day) }))), "7 h – 22 h, du vendredi au dimanche");
  assert.equal(ligne(H.map((h) => ({ ...h, enabled: [1, 3, 5].includes(h.day) }))), "7 h – 22 h, lundi, mercredi, vendredi");
  assert.equal(ligne(H.map((h) => ({ ...h, enabled: false }))), "");
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

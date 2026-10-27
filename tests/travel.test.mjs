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
  montrealTravelFree, feeZones, mergeZonesAB, zoneFeeCents, DEFAULT_ZONE_POLICY,
} = await import("../src/lib/travel.ts");
const { faqFill } = await import("../src/components/home/faq-fill.ts");
const { cycleTravel, cycleTravelText } = await import("../src/lib/pricing.ts");
const { legalValues, legalSections, fill } = await import("../src/components/LegalDocument.tsx");
const { openingLine } = await import("../src/components/home/opening-line.ts");
const { readZonePolicy, FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const {
  phoneSchema, pageDescription, localBusinessJsonLd, websiteJsonLd, faqJsonLd, jsonLdHtml, BUSINESS_NAME,
} = await import("../src/lib/seo.ts");
const { seoFr, seoEn, seoAdmin, getSeo } = await import("../src/lib/i18n/seo.ts");
const { llmsText, llmsFullText } = await import("../src/lib/llms.ts");
const { PUBLIC_PAGES, publicUrls, pageDate } = await import("../src/lib/pages.ts");
const { publicFingerprint, todayInMontreal } = await import("../src/lib/freshness.ts");
/* Un jour postérieur à toute date de PUBLIC_PAGES, présente ou future. */
const PLUS_TARD = "2999-01-01";
const {
  SITE_URL, INDEXNOW_KEY, CONTACT_EMAIL, FOUNDER, FOUNDER_PROFILES, SOCIAL_PROFILES, GOOGLE_SITE_VERIFICATION, GOOGLE_MAPS_URL,
} = await import("../src/lib/brand.ts");
const { indexNowBody, changedStamps, currentStamps, keyLocation } = await import("../src/lib/indexnow.ts");
const { siteOrigin } = await import("../src/lib/google.ts");
const { readFileSync, readdirSync, statSync } = await import("node:fs");
const { createHash } = await import("node:crypto");
const { retiredFr } = await import("../src/lib/i18n/retired.ts");
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

/* La grille à trois zones que la production portait jusqu'au 23 octobre
   2026, dans l'ordre de son tableau : la zone A sans frais, la zone B
   (Montréal, Chambly, Candiac, La Prairie) à 15 $ et 10 $, la zone C
   (Saint-Jean) à 25 $ et 20 $. Elle sert de départ à la migration, et à
   éprouver le moteur avec plus de deux zones. */
const ORDRE_AVANT = ["saint-lambert", "vieux-longueuil", "longueuil", "greenfield-park", "saint-hubert", "brossard",
  "boucherville", "saint-bruno", "sainte-julie", "varennes", "ile-des-soeurs", "verdun", "vieux-montreal", "westmount",
  "outremont", "centre-ville", "plateau", "chambly", "candiac", "la-prairie", "saint-jean"];
const ZONE_AVANT = (key, ile) => (key === "saint-jean" ? "c" : ile || ["chambly", "candiac", "la-prairie"].includes(key) ? "b" : "a");
const TROIS = {
  version: 2,
  zones: [
    { key: "a", nameFr: "Zone A", nameEn: "Zone A", shortFeeCents: 0, longFeeCents: 0, thresholdMinutes: 180 },
    { key: "b", nameFr: "Zone B", nameEn: "Zone B", shortFeeCents: 1500, longFeeCents: 1000, thresholdMinutes: 180 },
    { key: "c", nameFr: "Zone C", nameEn: "Zone C", shortFeeCents: 2500, longFeeCents: 2000, thresholdMinutes: 180 },
  ],
  sectors: ORDRE_AVANT.map((k) => {
    const s = P.sectors.find((x) => x.key === k);
    return { ...s, prefixes: [...s.prefixes], zoneKey: ZONE_AVANT(k, isMontrealSector(s)) };
  }),
};

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
  assert.equal(parZone("a"), 20);
  assert.equal(parZone("b"), 1);
  assert.deepEqual(P.zones.map((z) => z.key), ["a", "b"], "plus de zone C");
});

test("chaque préfixe tombe dans sa zone", () => {
  const attendu = {
    a: ["J4G", "J4H", "J4J", "J4K", "J4L", "J4M", "J4N", "J3Y", "J3Z", "J4T", "J4V", "J4P", "J4R", "J4S",
        "J4W", "J4X", "J4Y", "J4Z", "J4B", "J3V", "J3E", "J3X",
        "H3E", "H4G", "H4H", "H2Y", "H3Y", "H3Z", "H2V", "H3A", "H3B", "H3G", "H3H",
        "H3C", "H2Z", "H2L", "H2X", "H2J", "H2T", "H2W", "H2H", "J3L", "J5R"],
    b: ["J2W", "J2X", "J2Y", "J3A", "J3B"],
  };
  for (const [zone, codes] of Object.entries(attendu)) {
    for (const code of codes) assert.equal(evaluateZone(`${code} 1A1`, COURT, P).zoneKey, zone, `${code} devrait être en zone ${zone.toUpperCase()}`);
  }
  assert.equal(activePrefixes(P).length, 22 + 21 + 5, "aucun préfixe en trop, aucun oublié");
});

test("la grille par défaut ne pose aucun problème, et aucun préfixe dans deux zones", () => {
  assert.deepEqual(policyProblems(P), []);
});

test("J3L — Chambly, et Carignan avec elle — est en zone A, sans frais", () => {
  assert.equal(evaluateZone("J3L 1A1", COURT, P).zoneKey, "a");
  assert.equal(evaluateZone("J3L 1A1", COURT, P).feeCents, 0);
  assert.equal(evaluateZone("J3L 1A1", LONG, P).feeCents, 0);
});

test("J5R, partagé par Candiac et La Prairie, est en zone A, sans frais", () => {
  assert.equal(evaluateZone("J5R 1A1", COURT, P).zoneKey, "a");
  assert.equal(evaluateZone("J5R 1A1", COURT, P).feeCents, 0);
  assert.equal(evaluateZone("J5R 1A1", LONG, P).feeCents, 0);
  const deux = P.sectors.filter((s) => s.prefixes.includes("J5R")).map((s) => s.nameFr);
  assert.deepEqual(deux, ["Candiac", "La Prairie"]);
});

console.log("\nLes six codes de la vérification, en 2 h et en 3 h");

const VERIF = [
  ["J4J 1A1", "a", 0, 0],
  ["J5R 1A1", "a", 0, 0],
  ["H3E 1A1", "a", 0, 0],
  ["H3B 1A1", "a", 0, 0],
  ["J2W 1A1", "b", 1500, 1000],
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
  assert.equal(evaluateZone("J2W 1A1", 179, P).feeCents, 1500, "179 min : tarif plein");
  assert.equal(evaluateZone("J2W 1A1", 180, P).feeCents, 1000, "180 min : tarif réduit");
  assert.equal(evaluateZone("J2W 1A1", 179, TROIS).feeCents, 2500, "l'ancienne zone C suivait la même règle");
  assert.equal(evaluateZone("J2W 1A1", 180, TROIS).feeCents, 2000);
});

test("un seuil changé sur une zone ne touche pas les autres", () => {
  const p = clone(TROIS);
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
    assert.equal(evaluateZone(code, COURT, P).zoneKey, "a", `${code} devrait être reconnu`);
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
  assert.equal(frais, 1000, "la route ne se raccourcit pas");
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
  assert.equal(evaluateZone("J5R 1A1", COURT, p).zoneKey, "a");
});

test("un secteur qui change de zone change de tarif", () => {
  const p = clone(P);
  p.sectors.find((s) => s.key === "verdun").zoneKey = "b";
  assert.equal(evaluateZone("H4G 1A1", COURT, p).feeCents, 1500);
  assert.equal(evaluateZone("H3E 1A1", COURT, p).feeCents, 0, "les voisins ne bougent pas");
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
  p.sectors.push({ key: "carignan", nameFr: "Carignan", nameEn: "Carignan", prefixes: ["J3L"], zoneKey: "b", enabled: true });
  const pb = policyProblems(p);
  assert.equal(pb.length, 1);
  assert.match(pb[0], /J3L est dans deux zones à la fois : Chambly \(Zone A\) et Carignan \(Zone B\)/);
});

test("le même conflit est toléré tant que l'un des deux secteurs est inactif", () => {
  const p = clone(P);
  p.sectors.push({ key: "carignan", nameFr: "Carignan", nameEn: "Carignan", prefixes: ["J3L"], zoneKey: "b", enabled: false });
  assert.deepEqual(policyProblems(p), []);
  assert.equal(evaluateZone("J3L 1A1", COURT, p).zoneKey, "a");
});

test("Carignan peut s'ajouter en zone A, à côté de Chambly", () => {
  const p = clone(P);
  p.sectors.push({ key: "carignan", nameFr: "Carignan", nameEn: "Carignan", prefixes: ["J3L"], zoneKey: "a", enabled: true });
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
  p.zones[0].nameFr = "Zone Montréal";
  p.zones[0].nameEn = "";
  p.sectors.find((s) => s.key === "verdun").nameEn = "";
  assert.equal(evaluateZone("H4G 1A1", COURT, p).labelEn, "Zone Montréal", "le libellé anglais des frais");
  assert.ok(sectorNames(p, "en").includes("Verdun"));
  assert.equal(feeTable(p, "en", (c) => `$${c / 100}`)[0].zone, "Zone Montréal");
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
  assert.equal(orderedSectors(p).at(-1).key, "saint-jean", "…mais toujours après la zone A");
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
  assert.deepEqual(rows.map((r) => r.zone), ["Zone A", "Zone B"], "plus de zone C");
  assert.equal(rows[0].free, true);
  assert.equal(rows[0].sectors.length, 20);
  assert.deepEqual(rows[0].sectors.slice(0, 5), ["Saint-Lambert", "Vieux-Longueuil", "Longueuil", "Greenfield Park", "Saint-Hubert"]);
  assert.deepEqual(rows[0].sectors.slice(10, 13), ["Chambly", "Candiac", "La Prairie"], "la Rive-Sud d'abord, dans la zone aussi");
  assert.equal(rows[0].sectors[13], "L'Île-des-Sœurs", "les quartiers de l'île ensuite");
  assert.equal(rows[0].sectors.at(-1), "Le Plateau-Mont-Royal");
  assert.equal(rows[1].free, false);
  assert.deepEqual(rows[1].sectors, ["Saint-Jean-sur-Richelieu"]);
  assert.deepEqual({ short: rows[1].short, long: rows[1].long, threshold: rows[1].threshold }, { short: "15 $", long: "10 $", threshold: "3 h" });
  assert.equal(feeTable(P, "en", money)[1].threshold, "3 hours");
  assert.ok(feeTable(P, "en", money)[0].sectors.includes("Old Montreal"));
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

test("les frais de Montréal : la zone A, sans frais, et ses seuls quartiers de l'île", () => {
  const money = (c) => `${Math.round(c / 100)} $`;
  const rows = montrealFees(P, "fr", money);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].zone, "Zone A");
  assert.equal(rows[0].free, true);
  assert.equal(rows[0].sectors.length, 7);
  assert.ok(!rows[0].sectors.includes("Chambly"));
  const p = clone(P);
  p.sectors.find((x) => x.key === "verdun").zoneKey = "b";
  assert.equal(montrealFees(p, "fr", money).length, 2, "deux zones, deux lignes");
});

test("« Aucuns frais de déplacement à Montréal » tient tant que la grille le dit", () => {
  assert.equal(montrealTravelFree(P), true);
  assert.equal(montrealTravelFree(TROIS), false, "l'ancienne zone B facturait Montréal");
  const p = clone(P);
  p.sectors.find((x) => x.key === "verdun").zoneKey = "b";
  assert.equal(montrealTravelFree(p), false, "un seul quartier payant suffit à la retirer");
  const q = clone(P);
  for (const x of q.sectors) if (isMontrealSector(x)) x.enabled = false;
  assert.equal(montrealTravelFree(q), false, "sans quartier desservi, rien à annoncer");
  const r = clone(P);
  r.zones[0].longFeeCents = 500;
  assert.equal(montrealTravelFree(r), false, "des frais à partir du seuil sont des frais");
});

test("la réponse sur les zones le dit à l'accueil, et se tait si un quartier paie", () => {
  const zone = (t) => t.faq.items.find((f) => f.a.includes("{zone}")).a;
  const s = { ...FALLBACK_SETTINGS, zonePolicy: P };
  const f = flat(faqFill(zone(fr), fr, s, "fr"));
  assert.ok(f.includes("Le Plateau-Mont-Royal. Aucuns frais de déplacement à Montréal ; ailleurs, entrez votre code postal"), f);
  assert.ok(flat(faqFill(zone(en), en, s, "en")).includes("Plateau-Mont-Royal. No travel fees in Montreal; elsewhere, enter your postal code"));
  const p = clone(P);
  p.sectors.find((x) => x.key === "verdun").zoneKey = "b";
  const g = flat(faqFill(zone(fr), fr, { ...s, zonePolicy: p }, "fr"));
  assert.ok(g.includes("et Verdun. Entrez votre code postal"), g);
  assert.ok(!g.includes("Aucuns frais") && !g.includes("{"), g);
});

console.log("\nCe que lisent les moteurs et les assistants");

test("le numéro des fiches s'écrit +1-450-943-1217", () => {
  assert.equal(phoneSchema(), "+1-450-943-1217");
});

test("chaque page a son titre, qui commence par le nom de la maison, dans chaque langue", () => {
  assert.equal(seoFr.home.title, "NIVEX Repassage à domicile — Montréal et Rive-Sud");
  assert.equal(seoEn.home.title, "NIVEX In-Home Ironing — Montreal and South Shore");
  assert.deepEqual(Object.keys(seoEn), Object.keys(seoFr), "le français a son anglais");
  for (const v of Object.values(seoFr)) assert.ok(v.title.startsWith("NIVEX Repassage"), v.title);
  for (const v of Object.values(seoEn)) assert.ok(v.title.startsWith("NIVEX In-Home Ironing"), v.title);
  for (const t of [seoAdmin.title, seoAdmin.login]) assert.ok(t.startsWith("NIVEX Repassage"), t);
  const titres = [...Object.values(seoFr), ...Object.values(seoEn)].map((v) => v.title).concat(seoAdmin.title, seoAdmin.login);
  assert.equal(new Set(titres).size, titres.length, "aucun titre n'appartient à deux pages");
  for (const t of titres) assert.doesNotMatch(t, /!/);
  assert.equal(getSeo("de"), seoFr, "une langue inconnue retombe sur le français");
});

test("chaque description tient en 150 à 160 caractères et nomme le service, Montréal et la Rive-Sud", () => {
  const reglages = [FALLBACK_SETTINGS, { ...FALLBACK_SETTINGS, hourlyRate: 6000 }, { ...FALLBACK_SETTINGS, hourlyRate: 5000 }];
  for (const s of reglages) {
    for (const page of Object.keys(seoFr)) {
      const fr_ = pageDescription(page, "fr", s);
      const en_ = pageDescription(page, "en", s);
      for (const d of [fr_, en_]) {
        assert.ok(d.length >= 150 && d.length <= 160, `${page} (${s.hourlyRate}) : ${d.length} caractères — ${d}`);
        assert.doesNotMatch(d, /[{}!]/, d);
      }
      assert.match(fr_, /repassage à domicile/i, fr_);
      assert.ok(fr_.includes("Montréal") && fr_.includes("Rive-Sud"), fr_);
      assert.match(en_, /in-home ironing/i, en_);
      assert.ok(en_.includes("Montreal") && en_.includes("South Shore"), en_);
    }
  }
  assert.equal(pageDescription("home", "fr", FALLBACK_SETTINGS).length, flat(pageDescription("home", "fr", FALLBACK_SETTINGS)).length);
});

test("les descriptions disent les prix de la page, tirés des réglages", () => {
  assert.match(flat(pageDescription("home", "fr", FALLBACK_SETTINGS)), /Abonnements dès 150 \$ par cycle\.$/);
  assert.match(pageDescription("home", "en", FALLBACK_SETTINGS), /Subscriptions from \$150 per cycle\.$/);
  assert.match(flat(pageDescription("tarifs", "fr", FALLBACK_SETTINGS)),
    /abonnements de 150 \$ à 600 \$ par cycle, séance de 2 heures à 110 \$, prix des pièces à l'unité\.$/);
  assert.match(pageDescription("tarifs", "en", FALLBACK_SETTINGS), /from \$150 to \$600 per cycle, a session of 2 hours for \$110, and single pieces\.$/);
  assert.match(flat(pageDescription("tarifs", "fr", { ...FALLBACK_SETTINGS, hourlyRate: 6000 })),
    /de 165 \$ à 660 \$ par cycle, séance de 2 heures à 120 \$/, "un autre taux change tout d'un coup");
});

test("la fiche de la maison : un DryCleaningOrLaundry, son identité, ses lieux et ses réseaux", () => {
  const ld = localBusinessJsonLd(fr, FALLBACK_SETTINGS, "fr");
  const o = siteOrigin();
  assert.equal(ld["@type"], "DryCleaningOrLaundry");
  assert.equal(ld["@id"], `${o}/#nivex`, "le même identifiant sur toutes les pages");
  assert.equal(ld.name, "NIVEX Repassage à domicile");
  assert.equal(ld.name, BUSINESS_NAME);
  assert.equal(ld.alternateName, "NIVEX");
  assert.equal(ld.url, `${o}/fr`);
  assert.equal(ld.logo, `${o}/logo-nivex.png`);
  assert.equal(ld.image, `${o}/opengraph-image.jpg`);
  assert.equal(ld.telephone, "+1-450-943-1217");
  assert.equal(ld.email, CONTACT_EMAIL, "le courriel affiché sur le site");
  assert.deepEqual(ld.founder, {
    "@type": "Person", name: FOUNDER, sameAs: ["https://www.linkedin.com/in/styve-ketchandji-ngaleu-70a765362"],
  });
  assert.equal(FOUNDER, "Styve Ketchandji Ngaleu");
  assert.equal(flat(ld.priceRange), "110 $ – 600 $", "de la séance d'essai au plus haut cycle");
  /* Pas de rue ni de code postal : l'artisan se déplace. La ville seule, que
     Google exige pour une fiche locale. */
  assert.deepEqual(ld.address, { "@type": "PostalAddress", addressLocality: "Longueuil", addressRegion: "QC", addressCountry: "CA" });
  /* Les pages de la maison sur la maison, le profil personnel sur le
     fondateur ; l'adresse de chaque page, sans les paramètres de suivi des
     liens de partage. */
  assert.deepEqual(ld.sameAs, SOCIAL_PROFILES);
  assert.deepEqual(ld.sameAs, [
    "https://www.facebook.com/profile.php?id=61592622475613",
    "https://www.instagram.com/nivexrepassage_a_domicile/",
  ]);
  assert.ok(!ld.sameAs.some((u) => u.includes("linkedin.com/in/")), "un profil personnel ne désigne pas la maison");
  for (const u of [...SOCIAL_PROFILES, ...FOUNDER_PROFILES]) {
    assert.match(u, /^https:\/\/www\.(instagram|facebook|linkedin)\.com\/./, u);
    assert.doesNotMatch(u, /[?&](utm_[a-z]+|mibextid|mdxt|igsh|si|rdid|share_url)=|#/, `${u} : un paramètre de suivi`);
    assert.doesNotMatch(u, /\/share\//, `${u} : un lien de partage n'est pas l'adresse de la page`);
  }
  /* La fiche Google par son identifiant seul : ni lien de partage, ni
     coordonnées, qui situeraient le domicile. */
  assert.equal(ld.hasMap, "https://maps.google.com/?cid=5396462017230912861");
  assert.equal(ld.hasMap, GOOGLE_MAPS_URL);
  assert.match(GOOGLE_MAPS_URL, /^https:\/\/maps\.google\.com\/\?cid=\d+$/);
  assert.equal(ld.geo, undefined, "aucune coordonnée publiée");
  assert.match(ld.description, /^NIVEX, repassage à domicile à Montréal et sur la Rive-Sud/);
  const lieux = ld.areaServed.map((x) => x.name);
  assert.equal(lieux[0], "Saint-Lambert");
  assert.equal(lieux.length, 21);
  const premierMontreal = ld.areaServed.findIndex((x) => x.address.addressLocality === "Montréal");
  assert.equal(lieux[premierMontreal], "L'Île-des-Sœurs");
  assert.ok(ld.areaServed.slice(premierMontreal).every((x) => x.address.addressLocality === "Montréal"), "Montréal en dernier, d'un bloc");
  assert.equal(localBusinessJsonLd(en, FALLBACK_SETTINGS, "en").url, `${o}/en`);
});

test("la fiche : le catalogue des quatre abonnements et de la séance d'essai, chaque offre portant un Service", () => {
  const ld = localBusinessJsonLd(fr, FALLBACK_SETTINGS, "fr");
  const provider = { "@id": ld["@id"] };
  const [catalogue, pieces] = ld.hasOfferCatalog;
  assert.equal(catalogue["@type"], "OfferCatalog");
  assert.equal(catalogue.name, "Abonnements et séance d'essai");
  assert.deepEqual(catalogue.itemListElement.map((x) => [flat(x.name), x.price, x.priceCurrency]), [
    ["Abonnement Essentiel", 150, "CAD"], ["Abonnement Confort", 200, "CAD"], ["Abonnement Exécutif", 400, "CAD"],
    ["Abonnement Grande Famille", 600, "CAD"], ["Repassage à domicile · 2 heures", 110, "CAD"],
  ]);
  assert.match(flat(catalogue.itemListElement[2].description), /Jusqu'à 72 pièces par cycle\. Le nombre de pièces varie/);
  assert.match(flat(catalogue.itemListElement[4].description), /^Jusqu'à 18 pièces\. Le nombre de pièces varie selon la taille, le type et la matière des vêtements\. Chaque séance inclut l'installation/);
  assert.equal(pieces.itemListElement.length, 14);
  assert.deepEqual([pieces.itemListElement[0].itemOffered.name, pieces.itemListElement[0].price], ["Parure Queen ou King complète", 28]);
  const nappe = pieces.itemListElement.find((x) => x.itemOffered.name === "Nappe de réception");
  assert.deepEqual([nappe.priceSpecification.price, nappe.priceSpecification.minPrice, nappe.priceSpecification.maxPrice], [12, 12, 18]);
  assert.equal(ld.openingHoursSpecification[0].dayOfWeek, "https://schema.org/Monday");
  const [heure, ...reste] = ld.makesOffer;
  assert.equal(heure.name, "Une heure de plus, décidée sur place");
  assert.equal(heure.priceSpecification.price, FALLBACK_SETTINGS.hourlyRate / 100, "le prix vient des réglages");
  assert.equal(heure.priceSpecification.unitCode, "HUR");
  /* Toutes les offres, partout : un Service fourni par la maison, jamais un Product. */
  const offres = [...catalogue.itemListElement, ...pieces.itemListElement, ...ld.makesOffer];
  for (const x of offres) {
    assert.equal(x["@type"], "Offer");
    assert.equal(x.itemOffered["@type"], "Service", JSON.stringify(x));
    assert.deepEqual(x.itemOffered.provider, provider);
  }
  assert.doesNotMatch(JSON.stringify(ld), /Product|AggregateOffer|Zone C|165/);
  assert.deepEqual(reste.slice(0, 5).map((x) => x.itemOffered.name),
    ["Chemises", "Complets et vestons", "Robes et pièces délicates", "Uniformes scolaires et de travail", "Draps et linge de maison"]);
  const route = reste.slice(5);
  assert.deepEqual(route.map((x) => x.name), ["Frais de déplacement · Zone A", "Frais de déplacement · Zone B"]);
  assert.equal(route[0].price, 0, "la zone A ne facture rien");
  assert.equal(route[0].areaServed.length, 20);
  assert.ok(route[0].areaServed.some((x) => x.name === "Verdun" && x.address.addressLocality === "Montréal"), "Montréal en zone A");
  assert.deepEqual(route[1].areaServed.map((x) => x.name), ["Saint-Jean-sur-Richelieu"]);
  assert.deepEqual(route[1].priceSpecification.map((x) => [x.price, flat(x.description)]),
    [[15, "15 $ pour une séance de moins de 3 h"], [10, "10 $ pour une séance de 3 h ou plus"]], "un prix chiffré par durée");
  assert.equal(flat(route[1].description), "15 $ pour une séance de moins de 3 h, 10 $ pour une séance de 3 h ou plus.");
});

test("un bloc de données structurées ne peut pas fermer sa balise", () => {
  assert.equal(jsonLdHtml({ name: "</script><b>" }), '{"name":"\\u003c/script>\\u003cb>"}');
  assert.deepEqual(JSON.parse(jsonLdHtml({ name: "</script>" })), { name: "</script>" }, "le JSON reste le même");
});

test("le site, sur l'accueil : le même nom que la fiche, et le nom court", () => {
  const o = siteOrigin();
  const ld = websiteJsonLd("en");
  assert.equal(ld["@type"], "WebSite");
  assert.equal(ld.name, BUSINESS_NAME);
  assert.equal(ld.alternateName, "NIVEX");
  assert.equal(ld.url, `${o}/`);
  assert.equal(ld.inLanguage, "en-CA");
  assert.deepEqual(ld.publisher, { "@id": `${o}/#nivex` });
});

test("la foire aux questions structurée reprend le texte affiché", () => {
  const ld = faqJsonLd([{ q: "Q ?", a: "R." }]);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, "R.");
});

const { pageMeta, privateMeta, notFoundMeta, siteMetadata, siteViewport } = await import("../src/lib/seo.ts");

test("chaque page publique : son titre complet, son adresse canonique, ses trois hreflang, sa carte de partage", () => {
  const m = pageMeta(en, "en", "/tarifs", "tarifs", FALLBACK_SETTINGS);
  assert.deepEqual(m.title, { absolute: seoEn.tarifs.title }, "la racine n'y ajoute rien");
  assert.equal(m.description, pageDescription("tarifs", "en", FALLBACK_SETTINGS));
  assert.equal(m.alternates.canonical, "/en/tarifs");
  assert.deepEqual(m.alternates.languages, { "fr-CA": "/fr/tarifs", "en-CA": "/en/tarifs", "x-default": "/fr/tarifs" });
  assert.equal(m.openGraph.url, "/en/tarifs", "og:url est la page partagée, pas l'accueil");
  assert.equal(m.openGraph.type, "website");
  assert.equal(m.openGraph.siteName, "NIVEX");
  assert.equal(m.openGraph.title, seoEn.tarifs.title);
  assert.equal(m.openGraph.description, m.description);
  assert.equal(m.openGraph.locale, "en_CA");
  assert.deepEqual(m.openGraph.alternateLocale, ["fr_CA"]);
  assert.equal(m.openGraph.images[0].url, "/opengraph-image.jpg", "l'image ne se perd pas avec le bloc");
  assert.equal(m.twitter, undefined, "la carte Twitter de la racine survit si personne ne la redéclare");

  const accueil = pageMeta(fr, "fr", "", "home", FALLBACK_SETTINGS);
  assert.equal(accueil.title.absolute, "NIVEX Repassage à domicile — Montréal et Rive-Sud");
  assert.equal(accueil.alternates.canonical, "/fr");
  assert.deepEqual(accueil.alternates.languages, { "fr-CA": "/fr", "en-CA": "/en", "x-default": "/fr" });
  assert.equal(pageMeta(fr, "de", "", "home").alternates.canonical, "/fr", "une langue inconnue retombe sur le français");
});

test("les pages personnelles : leur titre, jamais indexées, sans adresse canonique ni langues", () => {
  for (const page of ["reservation", "subscription", "optOut"]) {
    const m = privateMeta("fr", page);
    assert.deepEqual(m.title, { absolute: seoFr[page].title });
    assert.deepEqual(m.robots, { index: false, follow: false });
    assert.deepEqual(m.alternates, {}, "ni canonique ni hreflang hérités de la racine");
  }
  assert.equal(privateMeta("en", "reservation").title.absolute, "NIVEX In-Home Ironing — Manage my booking");
});

test("chaque page de la vitrine déclare son en-tête, et la racine ne pose ni canonique ni hreflang", () => {
  const racine = readFileSync("src/app/[locale]/layout.tsx", "utf8");
  assert.doesNotMatch(racine, /alternates|canonical/, "posés par la racine, ils passaient aux pages personnelles");
  const pages = [];
  const visit = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) visit(p);
      else if (f === "page.tsx" || f === "not-found.tsx") pages.push(p);
    }
  };
  visit("src/app/[locale]");
  assert.ok(pages.length >= 12, pages.join(", "));
  for (const p of pages) {
    const src = readFileSync(p, "utf8");
    assert.match(src, /export (async function generateMetadata|const metadata)/, `${p} n'a pas d'en-tête`);
    assert.match(src, /pageMeta\(|privateMeta\(|notFoundMeta\(/, `${p} n'écrit pas son titre depuis lib/seo.ts`);
  }
});

test("la page introuvable : un titre dans chaque langue, sans adresse canonique ni point d'exclamation", () => {
  assert.deepEqual(notFoundMeta("fr").title, { absolute: "NIVEX Repassage — Page introuvable" });
  assert.deepEqual(notFoundMeta("en").title, { absolute: "NIVEX In-Home Ironing — Page not found" });
  assert.deepEqual(notFoundMeta("fr").alternates, {});
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

/* Le plan du site lit la date du contenu en base : sans base, aucune, et
   chaque page garde la date du code. */
const BASES = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];
async function avecEnv(vars, fn) {
  const avant = Object.fromEntries([...BASES, ...Object.keys(vars)].map((k) => [k, process.env[k]]));
  for (const k of BASES) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(avant)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
const plan = await avecEnv({}, () => sitemap());
const planProduction = await avecEnv({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://nivexrepassage.ca" }, () => sitemap());

test("le plan du site : les cinq pages publiques, deux langues, leur vraie date, sans les tunnels", () => {
  const o = siteOrigin();
  assert.equal(plan.length, PUBLIC_PAGES.length * 2);
  assert.deepEqual(plan.map((x) => x.url), publicUrls(o).map((x) => x.url));
  for (const u of ["/fr/montreal", "/en/montreal", "/fr", "/en/tarifs", "/fr/confidentialite"]) {
    assert.ok(plan.some((x) => x.url === `${o}${u}`), u);
  }
  assert.ok(!plan.some((x) => /reserver|abonnement|reservation|ne-pas-compter/.test(x.url)), "ni tunnels ni liens personnels");
  for (const x of plan) {
    assert.match(x.lastModified, /^\d{4}-\d{2}-\d{2}$/, "une date, pas l'heure de la construction");
    const page = PUBLIC_PAGES.find((p) => x.url.endsWith(`/fr${p.path}`) || x.url.endsWith(`/en${p.path}`));
    assert.equal(x.lastModified, page.updated);
    assert.deepEqual(Object.keys(x.alternates.languages), ["fr-CA", "en-CA", "x-default"]);
    assert.ok(Object.values(x.alternates.languages).every((u) => u.startsWith(`${o}/`)), "des adresses absolues");
  }
});

test("la date d'une page suit aussi ce que l'artisan change depuis l'admin", () => {
  const accueil = PUBLIC_PAGES[0];
  assert.equal(pageDate(accueil, ""), accueil.updated, "aucun changement relevé : la date du code");
  assert.equal(pageDate(accueil, "2026-01-01"), accueil.updated, "un changement plus ancien ne recule pas la date");
  assert.equal(pageDate(accueil, PLUS_TARD), PLUS_TARD);
  assert.equal(todayInMontreal(new Date("2026-11-03T03:30:00Z")), "2026-11-02", "à 22 h 30 à Montréal, c'est encore la veille");
  assert.equal(todayInMontreal(new Date("2026-11-03T05:30:00Z")), "2026-11-03");
});

test("l'empreinte du contenu public change avec ce qui se voit, et seulement avec cela", () => {
  const base = publicFingerprint(FALLBACK_SETTINGS);
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.equal(publicFingerprint(clone(FALLBACK_SETTINGS)), base, "les mêmes réglages, la même empreinte");
  const zones = clone(FALLBACK_SETTINGS.zonePolicy);
  zones.zones.find((z) => z.key === "b").shortFeeCents += 500;
  const heures = clone(FALLBACK_SETTINGS.hours);
  heures[1].close = "21:00";
  for (const [quoi, s] of [
    ["le taux", { ...FALLBACK_SETTINGS, hourlyRate: 6000 }],
    ["les frais d'une zone", { ...FALLBACK_SETTINGS, zonePolicy: zones }],
    ["l'horaire", { ...FALLBACK_SETTINGS, hours: heures }],
    ["le pas des créneaux", { ...FALLBACK_SETTINGS, slotStep: 60 }],
    ["le préavis", { ...FALLBACK_SETTINGS, leadHours: FALLBACK_SETTINGS.leadHours + 24 }],
    ["l'offre de la première heure", { ...FALLBACK_SETTINGS, firstHourFree: !FALLBACK_SETTINGS.firstHourFree }],
  ]) assert.notEqual(publicFingerprint(s), base, `${quoi} se voit sur les pages`);
  for (const [quoi, s] of [
    ["le lien d'avis", { ...FALLBACK_SETTINGS, reviewUrl: "https://g.page/r/x/review" }],
    ["la pause", { ...FALLBACK_SETTINGS, paused: !FALLBACK_SETTINGS.paused }],
    ["l'agenda", { ...FALLBACK_SETTINGS, calendarId: "autre@group.calendar.google.com" }],
    ["la connexion Google", { ...FALLBACK_SETTINGS, connected: true, ownerEmail: "x@example.com" }],
  ]) assert.equal(publicFingerprint(s), base, `${quoi} ne se voit sur aucune page publique`);
  /* Un texte du code ne compte pas : c'est le rôle de PUBLIC_PAGES. */
  const reponse = fr.faq.items[0].a;
  fr.faq.items[0].a = `${reponse},`;
  try {
    assert.equal(publicFingerprint(FALLBACK_SETTINGS), base, "une virgule dans une réponse ne date pas toutes les pages");
  } finally {
    fr.faq.items[0].a = reponse;
  }
  const renomme = clone(FALLBACK_SETTINGS.zonePolicy);
  renomme.sectors.find((x) => x.enabled).nameFr += " (Centre)";
  assert.notEqual(publicFingerprint({ ...FALLBACK_SETTINGS, zonePolicy: renomme }), base, "un secteur renommé se lit partout");
  const prefixe = clone(FALLBACK_SETTINGS.zonePolicy);
  const sl = prefixe.sectors.find((x) => x.key === "saint-lambert") ?? prefixe.sectors.find((x) => x.enabled && !x.prefixes.some((p) => p.startsWith("H")));
  sl.prefixes = [...sl.prefixes, "J4Z"];
  assert.equal(publicFingerprint({ ...FALLBACK_SETTINGS, zonePolicy: prefixe }), base, "un préfixe de plus ne change aucun texte");
  const inactif = clone(FALLBACK_SETTINGS.zonePolicy);
  const off = inactif.sectors.find((x) => !x.enabled);
  if (off) {
    off.nameFr += " bis";
    assert.equal(publicFingerprint({ ...FALLBACK_SETTINGS, zonePolicy: inactif }), base, "un secteur inactif ne paraît nulle part");
  }
});

test("en production, toutes les adresses partent du www", () => {
  const avant = { ...process.env };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://nivexrepassage.ca";
    assert.equal(siteOrigin(), "https://www.nivexrepassage.ca", "une variable restée sur l'ancien domaine ne compte plus");
    assert.equal(SITE_URL, "https://www.nivexrepassage.ca");
    assert.ok(planProduction.every((x) => x.url.startsWith("https://www.nivexrepassage.ca/")));
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SITE_URL = "https://essai.example";
    assert.equal(siteOrigin(), "https://essai.example", "une version d'essai garde sa propre adresse");
  } finally {
    for (const k of ["VERCEL_ENV", "NEXT_PUBLIC_SITE_URL"]) {
      if (avant[k] === undefined) delete process.env[k]; else process.env[k] = avant[k];
    }
  }
});

test("la balise de la Search Console : le jeton seul, posé par la racine sur toutes les pages", () => {
  assert.equal(GOOGLE_SITE_VERIFICATION, "qr9tWTjQLrKWeKSnXhvDQWGpP0_zqSdxksUIWVSg3w8");
  assert.match(GOOGLE_SITE_VERIFICATION, /^[A-Za-z0-9_-]{20,}$/, "la valeur de content= seule, jamais la balise entière");
  const racine = readFileSync("src/app/[locale]/layout.tsx", "utf8");
  assert.match(racine, /verification: \{ google: GOOGLE_SITE_VERIFICATION \}/);
});

test("le favicon est le fer de la maison, jamais le triangle du gabarit de Next.js", () => {
  /* Google montre le favicon à côté du nom, dans ses résultats, et il retient
     app/favicon.ico, que Next déclare le premier. Resté celui de Create Next
     App jusqu'au 27 octobre 2026, il y affichait le triangle de Vercel. */
  const ico = readFileSync("src/app/favicon.ico");
  assert.notEqual(createHash("md5").update(ico).digest("hex"), "c30c7d42707a47a3f4591831641e50dc",
    "le favicon du gabarit Create Next App");
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1], "un fichier .ico");
  const tailles = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i] || 256);
  for (const t of [16, 32, 48, 256]) assert.ok(tailles.includes(t), `l'entrée de ${t} px`);
});

test("IndexNow : la clé publiée à la racine, un seul hôte, et seulement ce qui a changé", () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
  assert.equal(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8"), INDEXNOW_KEY, "le fichier ne contient que la clé");
  const urls = currentStamps().map((x) => x.url);
  assert.equal(urls.length, 10);
  assert.ok(urls.every((u) => u.startsWith("https://www.nivexrepassage.ca/")), "jamais d'adresse sans www");
  assert.ok(!urls.some((u) => /reserver|abonnement/.test(u)));
  assert.deepEqual(indexNowBody(urls.slice(0, 2)), {
    host: "www.nivexrepassage.ca",
    key: INDEXNOW_KEY,
    keyLocation: `https://www.nivexrepassage.ca/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 2),
  });
  assert.equal(keyLocation(), `https://www.nivexrepassage.ca/${INDEXNOW_KEY}.txt`);
  const now = currentStamps();
  assert.equal(changedStamps(now, new Map()).length, 10, "tout part au premier envoi");
  const sent = new Map(now.map((x) => [x.url, x.updated]));
  assert.deepEqual(changedStamps(now, sent), [], "un déploiement qui n'avance aucune date n'envoie rien");
  sent.set(now[1].url, "2026-01-01");
  assert.deepEqual(changedStamps(now, sent).map((x) => x.url), [now[1].url]);
  sent.set(now[1].url, now[1].updated);
  const apresAdmin = currentStamps(SITE_URL, PLUS_TARD);
  assert.ok(apresAdmin.every((x) => x.updated === PLUS_TARD), "un tarif changé depuis l'admin date toutes les pages");
  assert.equal(changedStamps(apresAdmin, sent).length, 10, "et les renvoie toutes, une fois");
  const wf = readFileSync(".github/workflows/indexnow.yml", "utf8");
  assert.match(wf, /deployment_status/);
  assert.match(wf, /startsWith\(github\.event\.deployment\.environment, 'Production'\)/);
  assert.match(wf, /vercel\.deployment\.success/);
  assert.match(wf, /https:\/\/www\.nivexrepassage\.ca\/api\/indexnow\?sha=/);
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
  assert.equal(seoFr.montreal.title, "NIVEX Repassage à domicile à Montréal");
});

test("le français garde ses espaces insécables : avant : ; ? et dans les guillemets", () => {
  /* Une espace ordinaire laisse le navigateur rejeter un « ? » seul en début
     de ligne, au téléphone surtout. Le dictionnaire les écrit en échappements. */
  const chaines = [];
  const lire = (v) => (typeof v === "string" ? chaines.push(v) : v && typeof v === "object" && Object.values(v).forEach(lire));
  lire(fr);
  lire(retiredFr);
  assert.deepEqual(chaines.filter((s) => / [:;?!»]|« /.test(s)), []);
  assert.ok(chaines.length > 300, "tout le dictionnaire est relu");
});

console.log("\nCe que la vitrine écrit depuis les réglages");

test("llms.txt, version courte : le service, les zones, les prix, le contact et les pages, dans les deux langues", () => {
  const txt = flat(llmsText({ ...FALLBACK_SETTINGS, zonePolicy: P }));
  for (const bit of [
    "# NIVEX Repassage à domicile", "> NIVEX, repassage à domicile à Montréal et sur la Rive-Sud",
    "## Zones desservies", "Secteurs desservis : Saint-Lambert", "Aucuns frais de déplacement à Montréal.",
    "- Zone B (Saint-Jean-sur-Richelieu) : 15 $ pour une séance de moins de 3 h",
    "- Essentiel : 150 $ / cycle, 1 visite de 3 h", "- Confort : 200 $ / cycle", "- Exécutif : 400 $ / cycle", "- Grande Famille : 600 $ / cycle",
    "## Séance d'essai", "Pour un premier essai : la séance de 2 heures, 110 $.",
    "- Téléphone : +1 450 943 1217", "- Courriel : contact@nivexrepassage.ca",
    "/fr/tarifs)", "/fr/montreal)", "/fr/reserver)", "/fr/abonnement)", "/llms-full.txt)",
    "# NIVEX In-Home Ironing", "> NIVEX, in-home ironing in Montreal and on the South Shore",
    "## Areas served", "No travel fees in Montreal.", "- Executive: $400 / cycle, four 2-hour visits", "## Trial session",
    "For a first try: a session of 2 hours, $110.", "- Phone: +1 450 943 1217", "/en/tarifs)",
  ]) assert.ok(txt.includes(bit), `« ${bit} » manquant`);
  assert.ok(txt.length < 4000, `la version courte reste courte : ${txt.length}`);
  assert.doesNotMatch(txt, /###|Zone C|\{|!|Découverte|velours|Corduroy/);
});

test("llms-full.txt : les mêmes prix, zones et questions que les pages, dans les deux langues", () => {
  const txt = flat(llmsFullText({ ...FALLBACK_SETTINGS, zonePolicy: P }));
  for (const bit of [
    "# NIVEX — Repassage à domicile", "Abonnement Exécutif : 400 $ / cycle (au lieu de 440 $)",
    "Pour un premier essai : la séance de 2 heures, 110 $.", "Une heure de plus, décidée sur place : 55 $.",
    "Nappe de réception : 12 $ – 18 $", "Secteurs desservis : Saint-Lambert",
    "### Faut-il fournir la planche et le fer ?", "### Puis-je annuler ou déplacer mon rendez-vous ?",
    "Aucuns frais de déplacement à Montréal.", "- Zone B (Saint-Jean-sur-Richelieu) : 15 $ pour une séance de moins de 3 h",
    "### Abonnements en Zone B, par cycle", "- Exécutif : 400 $ + 60 $ de déplacement, soit 4 visites × 15 $",
    "- Essentiel : 150 $ + 10 $ de déplacement, soit 1 visite × 10 $",
    "# NIVEX — In-home ironing", "Executive subscription: $400 / cycle (instead of $440)",
    "For a first try: a session of 2 hours, $110.", "### Can I cancel or reschedule?",
    "No travel fees in Montreal.", "### Subscriptions in Zone B, per cycle", "- Executive: $400 + $60 travel, i.e. 4 visits × $15",
  ]) assert.ok(txt.includes(bit), `« ${bit} » manquant`);
  assert.equal((txt.match(/^### /gm) ?? []).length, 16, "sept questions et une zone payante par langue");
  assert.doesNotMatch(txt, /Zone C|réduits de|reduced by/);
  assert.doesNotMatch(txt, /\{|!|Découverte|Grand Foyer|Douce Nuit|Prolongation|velours|Corduroy/);
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
  const p = clone(TROIS);
  p.zones.find((z) => z.key === "b").shortFeeCents = 2000;
  p.zones.find((z) => z.key === "c").thresholdMinutes = 240;
  p.sectors.find((s) => s.key === "verdun").zoneKey = "c";
  p.sectors.find((s) => s.key === "chambly").prefixes.push("J3M");
  p.sectors.find((s) => s.key === "outremont").enabled = false;
  p.sectors = p.sectors.filter((s) => s.key !== "candiac");
  p.sectors.push({ key: "laval", nameFr: "Laval", nameEn: "Laval", prefixes: ["H7A"], zoneKey: "c", enabled: true });
  const l = describeChanges(TROIS, p);
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

console.log("\nDeux zones au lieu de trois (23 octobre 2026)");

test("la migration donne exactement la grille du code : zone A réunie et sans frais, Saint-Jean en zone B", () => {
  const apres = mergeZonesAB(clone(TROIS));
  assert.deepEqual(apres, P, "même zones, mêmes secteurs, même ordre");
  assert.deepEqual(apres.zones.map((z) => [z.key, z.shortFeeCents, z.longFeeCents, z.thresholdMinutes]),
    [["a", 0, 0, 180], ["b", 1500, 1000, 180]]);
  assert.deepEqual(policyProblems(apres), [], "aucun préfixe dans deux zones");
});

test("la migration note chaque secteur déplacé, et la zone C supprimée", () => {
  const l = describeChanges(TROIS, mergeZonesAB(clone(TROIS)));
  assert.equal(l.length, 12);
  assert.ok(l.includes("Zone « Zone C » supprimée."));
  assert.ok(l.includes("Secteur « Verdun » : Zone B → Zone A."));
  assert.ok(l.includes("Secteur « La Prairie » : Zone B → Zone A."));
  assert.ok(l.includes("Secteur « Saint-Jean-sur-Richelieu » : Zone C → Zone B."));
  assert.ok(!l.includes("Ordre des secteurs modifié."));
});

test("la migration ne repasse pas, et ne touche à rien d'autre qu'aux trois zones", () => {
  assert.equal(mergeZonesAB(P), null, "sans zone C, rien à faire");
  assert.equal(mergeZonesAB(mergeZonesAB(clone(TROIS))), null, "un second passage ne fait rien");
  for (const rien of [null, undefined, 42, "x", {}, { version: 1, zones: [], sectors: [] }, { version: 2, zones: "a", sectors: [] }]) {
    assert.equal(mergeZonesAB(rien), null, JSON.stringify(rien));
  }
  /* Ce que l'artisan a réglé reste : les noms, un secteur inactif, une zone
     de plus, l'ordre de chaque groupe. */
  const p = clone(TROIS);
  p.zones[0].nameFr = "Rive-Sud et Montréal";
  p.sectors.find((s) => s.key === "westmount").enabled = false;
  p.zones.push({ key: "d", nameFr: "Laval", nameEn: "Laval", shortFeeCents: 3000, longFeeCents: 2500, thresholdMinutes: 180 });
  p.sectors.push({ key: "laval", nameFr: "Laval", nameEn: "Laval", prefixes: ["H7A"], zoneKey: "d", enabled: true });
  const q = mergeZonesAB(p);
  assert.equal(q.zones[0].nameFr, "Rive-Sud et Montréal");
  assert.equal(q.sectors.find((s) => s.key === "westmount").enabled, false);
  assert.equal(q.sectors.find((s) => s.key === "westmount").zoneKey, "a");
  assert.deepEqual(q.zones.find((z) => z.key === "d"), p.zones.find((z) => z.key === "d"));
  assert.equal(q.sectors.find((s) => s.key === "laval").zoneKey, "d");
  /* Des frais de l'ancienne zone B changés à la main ne survivent pas : la
     nouvelle zone B prend ceux qui ont été décidés. */
  const r = clone(TROIS);
  r.zones[1].shortFeeCents = 2000;
  r.zones[0].longFeeCents = 500;
  const s = mergeZonesAB(r);
  assert.deepEqual([s.zones[0].shortFeeCents, s.zones[0].longFeeCents], [0, 0]);
  assert.deepEqual([s.zones[1].shortFeeCents, s.zones[1].longFeeCents], [1500, 1000]);
});

test("les zones payantes : la seule zone B, avec Saint-Jean", () => {
  const z = feeZones(P);
  assert.deepEqual(z.map((x) => [x.zone.key, x.sectors.map((s) => s.nameFr)]), [["b", ["Saint-Jean-sur-Richelieu"]]]);
  assert.equal(zoneFeeCents(z[0].zone, 120), 1500);
  assert.equal(zoneFeeCents(z[0].zone, 180), 1000);
  const p = clone(P);
  p.sectors.find((s) => s.key === "saint-jean").enabled = false;
  assert.deepEqual(feeZones(p), [], "une zone sans secteur actif ne se détaille pas");
});

test("le coût d'un cycle en zone B : chaque visite paie les frais de sa durée", () => {
  const zoneB = P.zones.find((z) => z.key === "b");
  const money = (c) => `${Math.round(c / 100)} $`;
  const lignes = cycleTravel(zoneB, FALLBACK_SETTINGS).map((c) => flat(cycleTravelText(c, fr, "fr", money)));
  assert.deepEqual(lignes, [
    "Essentiel : 150 $ + 10 $ de déplacement, soit 1 visite × 10 $",
    "Confort : 200 $ + 30 $ de déplacement, soit 2 visites × 15 $",
    "Exécutif : 400 $ + 60 $ de déplacement, soit 4 visites × 15 $",
    "Grande Famille : 600 $ + 40 $ de déplacement, soit 4 visites × 10 $",
  ]);
  const usd = (c) => `$${Math.round(c / 100)}`;
  assert.equal(flat(cycleTravelText(cycleTravel(zoneB, FALLBACK_SETTINGS)[2], en, "en", usd)),
    "Executive: $400 + $60 travel, i.e. 4 visits × $15");
  const gratuite = cycleTravel(P.zones.find((z) => z.key === "a"), FALLBACK_SETTINGS)[0];
  assert.equal(flat(cycleTravelText(gratuite, fr, "fr", money)), "Essentiel : 150 $, sans frais de déplacement");
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

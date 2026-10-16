/**
 * Tests du client Google Routes.
 * Exécution : npx tsx tests/transit.test.mjs
 *
 * `fetch` est remplacé : on vérifie ce qu'on envoie à Google et ce qu'on
 * fait de ce qu'il renvoie — sans appeler Google, donc sans rien payer.
 * Ce qui compte ici : qu'une réponse inattendue se taise au lieu de deviner.
 */
import assert from "node:assert/strict";

process.env.NIVEX_HOME_ADDRESS = "123 rue de la Maison, Longueuil, QC";
process.env.GOOGLE_MAPS_API_KEY = "cle-de-test";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL_UNPOOLED;
delete process.env.POSTGRES_URL_NON_POOLING;

const { transitMinutes, weekdayIn } = await import("../src/lib/transit.ts");

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

const vrai = globalThis.fetch;
let derniere = null;
function simuler(reponse) {
  globalThis.fetch = async (url, init) => {
    derniere = { url: String(url), init, body: JSON.parse(init.body) };
    if (typeof reponse === "function") return reponse();
    return reponse;
  };
}
const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });

const ARRIVEE = new Date(Date.now() + 5 * 86400_000);
const OPTS = { timeZone: "America/Toronto", cacheDays: 30 };

console.log("\nLe détournement d'essai ne peut pas toucher la production");

await test("en production, la variable d'essai est ignorée", async () => {
  process.env.NIVEX_ROUTES_ENDPOINT = "http://localhost:5055";
  process.env.VERCEL_ENV = "production";
  simuler(json({ routes: [{ duration: "600s" }] }));
  await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
  assert.equal(derniere.url, "https://routes.googleapis.com/directions/v2:computeRoutes",
    "le site public n'interroge que Google");
  delete process.env.VERCEL_ENV;
  delete process.env.NIVEX_ROUTES_ENDPOINT;
});

console.log("\nCe qu'on demande à Google");

await test("l'appel part bien vers l'API Routes, en transport en commun", async () => {
  simuler(json({ routes: [{ duration: "4920s" }] }));
  await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
  assert.equal(derniere.url, "https://routes.googleapis.com/directions/v2:computeRoutes");
  assert.equal(derniere.init.method, "POST");
  assert.equal(derniere.body.travelMode, "TRANSIT");
});

await test("c'est une heure d'arrivée, pas une heure de départ", async () => {
  /* Un horaire d'autobus ne se renverse pas : demander « quel bus part à
     13 h » quand il faut être installé à 12 h 45 revient à promettre un
     retard. */
  simuler(json({ routes: [{ duration: "600s" }] }));
  await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
  assert.ok(derniere.body.arrivalTime, "arrivalTime doit être présent");
  assert.equal(derniere.body.departureTime, undefined, "et departureTime absent");
});

await test("la clé et le masque de champs sont posés", async () => {
  simuler(json({ routes: [{ duration: "600s" }] }));
  await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
  assert.equal(derniere.init.headers["X-Goog-Api-Key"], "cle-de-test");
  assert.equal(derniere.init.headers["X-Goog-FieldMask"], "routes.duration");
});

await test("l'adresse de départ ne sort pas d'ici — elle n'est que dans l'appel", async () => {
  simuler(json({ routes: [{ duration: "600s" }] }));
  const r = await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
  assert.equal(derniere.body.origin.address, "123 rue de la Maison, Longueuil, QC");
  assert.deepEqual(Object.keys(r).sort(), ["cached", "minutes", "reason"],
    "la réponse ne porte que des minutes, jamais l'adresse");
  assert.doesNotMatch(JSON.stringify(r), /rue de la Maison/);
});

console.log("\nCe qu'on fait de la réponse");

await test("une durée en secondes devient des minutes", async () => {
  simuler(json({ routes: [{ duration: "4920s" }] }));
  assert.equal((await transitMinutes("J3A 1P1", ARRIVEE, OPTS)).minutes, 82);
});

await test("on arrondit à la minute la plus proche", async () => {
  simuler(json({ routes: [{ duration: "3570s" }] }));   // 59,5 min
  assert.equal((await transitMinutes("J3A 1P1", ARRIVEE, OPTS)).minutes, 60);
});

console.log("\nCe qui doit se taire plutôt que deviner");

const muets = [
  ["aucun itinéraire",            json({ routes: [] })],
  ["réponse vide",                json({})],
  ["champ renommé par Google",    json({ routes: [{ durationSeconds: 4920 }] })],
  ["durée dans un autre format",  json({ routes: [{ duration: "1h22m" }] })],
  ["durée nulle",                 json({ routes: [{ duration: "0s" }] })],
  ["corps qui n'est pas du JSON", new Response("<html>oups</html>", { status: 200 })],
  ["clé refusée",                 json({ error: { message: "API key not valid" } }, 403)],
  ["quota dépassé",               json({ error: {} }, 429)],
  ["panne chez Google",           json({}, 500)],
];

for (const [nom, reponse] of muets) {
  await test(`${nom} → null, et la liste de secours prendra le relais`, async () => {
    simuler(reponse);
    const r = await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
    assert.equal(r.minutes, null, "aucun nombre ne doit être inventé");
    assert.ok(r.reason, "et la raison doit être lisible");
  });
}

await test("le réseau qui tombe ne lève pas d'exception", async () => {
  simuler(() => { throw new Error("ECONNREFUSED"); });
  const r = await transitMinutes("J3A 1P1", ARRIVEE, OPTS);
  assert.equal(r.minutes, null);
  assert.match(r.reason, /ECONNREFUSED/);
});

await test("un code postal incomplet n'appelle même pas Google", async () => {
  let appele = false;
  globalThis.fetch = async () => { appele = true; return json({}); };
  const r = await transitMinutes("J3", ARRIVEE, OPTS);
  assert.equal(r.minutes, null);
  assert.equal(appele, false, "pas d'appel payant pour une saisie incomplète");
});

console.log("\nLa fenêtre que Google accepte");

await test("une date trop lointaine est ramenée, en gardant le jour de la semaine", async () => {
  simuler(json({ routes: [{ duration: "600s" }] }));
  const loin = new Date(Date.now() + 300 * 86400_000);
  await transitMinutes("J3A 1P1", loin, OPTS);
  const envoye = new Date(derniere.body.arrivalTime);
  assert.ok(envoye.getTime() < Date.now() + 100 * 86400_000, "dans la fenêtre");
  assert.ok(envoye.getTime() > Date.now(), "et dans le futur");
  assert.equal(envoye.getUTCDay(), loin.getUTCDay(), "même jour de la semaine");
  assert.equal(envoye.getUTCHours(), loin.getUTCHours(), "et même heure");
});

console.log("\nLe jour de la semaine");

await test("il se lit à Montréal, pas en UTC", async () => {
  const dimancheSoir = new Date("2026-11-02T01:00:00Z");
  assert.equal(dimancheSoir.getUTCDay(), 1);
  assert.equal(weekdayIn(dimancheSoir, "America/Toronto"), 0);
});

globalThis.fetch = vrai;
console.log(`\n${n} réussis, 0 échoués\n`);

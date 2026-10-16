/**
 * Tests de la provenance et de la zone desservie.
 * Exécution : npx tsx tests/provenance.test.mjs
 *
 * Ce qui n'est pas vérifiable ici : l'écriture en base et la lecture de
 * l'en-tête de l'hébergeur, qui demandent une requête réelle. Ce qui l'est,
 * et qui compte : qu'un code postal hors zone soit refusé, que la fusion des
 * préfixes survive à une valeur déjà enregistrée, et qu'aucune adresse IP ne
 * puisse se glisser dans le journal.
 */
import assert from "node:assert/strict";

const { mergeArea, DEFAULT_AREA } = await import("../src/lib/settings.ts");
const { visitSource, referrerHost, deviceType, clip, isHeardFrom, HEARD_FROM } =
  await import("../src/lib/attribution.ts");
const { isCounted } = await import("../src/lib/visits.ts");
const { ownerNotification } = await import("../src/lib/email.ts");
const { BookingInput } = await import("../src/lib/bookings.ts");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const flat = (x) => x.replace(/[   ]/g, " ");

console.log("\nZone desservie : un libellé, plus une décision");

/* La liste de codes postaux ne décide plus rien : le temps de trajet réel a
   pris sa place (voir travel.test.mjs). Ce qui reste à vérifier ici, c'est
   que la bascule n'a rien cassé en chemin — le libellé affiché suit le code,
   et une phrase écrite à la main depuis /admin survit. */

test("le nouveau libellé invite à vérifier, au lieu d'énumérer des villes", () => {
  assert.match(DEFAULT_AREA.labelFr, /Entrez votre code postal/);
  assert.match(DEFAULT_AREA.labelEn, /Enter your postal code/);
  assert.doesNotMatch(DEFAULT_AREA.labelFr, /Saint-Jean-sur-Richelieu/,
    "plus de liste de villes : elle ne répondait pas à la question posée");
});

test("un libellé laissé au défaut d'hier suit le code", () => {
  for (const ancien of [
    "Longueuil (Vieux-Longueuil, Saint-Hubert, Greenfield Park), Brossard, Saint-Lambert, Boucherville, Saint-Bruno et la Rive-Sud environnante",
    "Longueuil, Brossard, Saint-Lambert, Boucherville, Saint-Bruno, Saint-Jean-sur-Richelieu, Île-des-Sœurs, Verdun, Westmount, Outremont et le Vieux-Montréal",
  ]) {
    const merged = mergeArea({ prefixes: ["J4K"], labelFr: ancien, labelEn: "x" });
    assert.equal(merged.labelFr, DEFAULT_AREA.labelFr, "le nouveau texte doit prendre la place");
  }
});

test("un libellé écrit à la main n'est pas écrasé", () => {
  const merged = mergeArea({
    prefixes: ["J4K"], labelFr: "Longueuil et Brossard", labelEn: "Longueuil and Brossard",
  });
  assert.equal(merged.labelFr, "Longueuil et Brossard", "la phrase de l'artisan doit survivre");
});

test("les préfixes enregistrés survivent : ils servent de liste de secours", () => {
  const merged = mergeArea({ prefixes: ["J4K", "J4W"], labelFr: "", labelEn: "" });
  assert.equal(merged.prefixes.includes("J4K"), true);
  assert.equal(merged.prefixes.filter((p) => p === "J4K").length, 1, "aucun doublon");
});

test("une zone absente retombe sur le défaut complet", () => {
  assert.deepEqual(mergeArea(null), DEFAULT_AREA);
});

console.log("\nSource d'une visite");

test("l'étiquette de campagne l'emporte sur le référent", () => {
  assert.equal(visitSource("accroche-porte", "https://www.facebook.com/x"), "accroche-porte");
});

test("sans campagne, le domaine du référent fait la source", () => {
  assert.equal(visitSource(null, "https://www.facebook.com/nivex/posts/1"), "facebook.com");
  assert.equal(visitSource(null, "https://www.google.com/search?q=repassage"), "google.com");
});

test("sans rien, la visite est directe", () => {
  assert.equal(visitSource(null, null), "direct");
  assert.equal(visitSource("", ""), "direct");
});

test("un référent illisible ne fait pas tomber la lecture", () => {
  assert.equal(referrerHost("pas une url"), null);
  assert.equal(visitSource(null, "pas une url"), "direct");
});

console.log("\nType d'appareil");

test("les trois catégories, et rien de plus fin", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const ipad = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
  assert.equal(deviceType(iphone), "mobile");
  assert.equal(deviceType(ipad), "tablette");
  assert.equal(deviceType(mac), "ordinateur");
  assert.equal(deviceType(null), "ordinateur");
});

console.log("\nCe que le journal refuse");

test("les pages de l'espace artisan ne se comptent jamais", () => {
  for (const p of ["/admin", "/admin/", "/admin/login", "/api/visit", "/api/bookings"]) {
    assert.equal(isCounted(p), false, `${p} ne devrait pas être compté`);
  }
});

test("les pages publiques se comptent", () => {
  for (const p of ["/", "/fr", "/fr/tarifs", "/en/reserver", "/fr/confidentialite"]) {
    assert.equal(isCounted(p), true, `${p} devrait être compté`);
  }
});

test("une valeur hors bornes est coupée, jamais devinée", () => {
  assert.equal(clip("x".repeat(500), 60).length, 60);
  assert.equal(clip("   ", 60), null);
  assert.equal(clip(42, 60), null, "un nombre n'est pas une chaîne");
  assert.equal(clip(null, 60), null);
});

console.log("\nQuestion « Comment nous avez-vous connus ? »");

test("la liste est fermée", () => {
  assert.equal(HEARD_FROM.length, 7);
  for (const k of ["carte", "accroche-porte", "instagram", "facebook", "google", "recommandation", "autre"]) {
    assert.equal(isHeardFrom(k), true, `${k} devrait être accepté`);
  }
  for (const k of ["<script>", "", "CARTE", null, 7]) {
    assert.equal(isHeardFrom(k), false, `${JSON.stringify(k)} ne devrait pas être accepté`);
  }
});

console.log("\nUne provenance abîmée ne coûte jamais une réservation");

test("aucune provenance, même absurde, ne fait échouer le formulaire", () => {
  /* L'invariant qui compte. La provenance est un renseignement de marketing :
     un référent à rallonge ou un compteur abîmé par une extension de
     navigateur ne doit jamais valoir à un client de perdre sa séance. Tout
     est donc accepté puis nettoyé, jamais refusé. */
  const base = {
    locale: "fr", items: [{ key: "shirt", qty: 10 }],
    name: "Claire Dubois", email: "claire@example.com", phone: "450 555-0199",
    address: "12 rue Principale", city: "Verdun", postalCode: "H4G 1A1",
    startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), consent: true,
  };
  const absurdes = [
    { attribution: { referrer: "https://x.com/?" + "a".repeat(800) } },
    { attribution: { visits: -5 } },
    { attribution: { visits: Number.NaN } },
    { attribution: { firstSeen: "2099-01-01T00:00:00Z" } },
    { attribution: "n'importe quoi" },
    { attribution: null },
    { heardFrom: "<script>alert(1)</script>".repeat(20) },
    { heardFrom: 42 },
    {},
  ];
  for (const extra of absurdes) {
    const r = BookingInput.safeParse({ ...base, ...extra });
    assert.equal(r.success, true, `devrait passer : ${JSON.stringify(extra).slice(0, 60)}`);
  }
});

console.log("\nProvenance dans le courriel de l'artisan");

const base = {
  ref: "NVX-123456", locale: "fr", clientName: "Claire Dubois",
  clientEmail: "claire@example.com", clientPhone: "450 555-0199",
  address: "12 rue des Sœurs", city: "Montréal", postalCode: "H3E 1A1",
  notes: null, items: [{ label: "Chemises", qty: 6 }],
  startsAt: new Date("2026-11-04T18:00:00Z"), durationMinutes: 120,
  estimateCents: 5000, currency: "CAD", firstHourFree: true,
  timezone: "America/Toronto", manageUrl: "https://x/fr/reservation/t",
  siteUrl: "https://nivexrepassage.ca", businessPhone: "+1 450 943 1217",
  businessEmail: "nivexrepassage@gmail.com",
};

test("la fiche de mission porte la provenance", () => {
  const mail = ownerNotification({
    ...base,
    origin: {
      heardFromLabel: "Accroche-porte", source: "accroche-porte",
      campaign: "verdun-octobre", firstSeenAt: new Date("2026-10-28T14:30:00Z"), visits: 3,
    },
  });
  const text = flat(mail.text);
  assert.match(text, /Provenance/, "le bloc Provenance devrait figurer");
  assert.match(text, /Nous a connus par: Accroche-porte/);
  assert.match(text, /accroche-porte · verdun-octobre/);
  assert.match(text, /Visites avant de réserver: 3/);
  assert.match(text, /Première visite: /);
  assert.match(flat(mail.html), /Provenance/);
});

test("un rendez-vous sans provenance n'affiche pas de bloc vide", () => {
  const mail = ownerNotification({ ...base, origin: null });
  assert.doesNotMatch(flat(mail.text), /Provenance/, "rien ne devrait s'afficher");
  assert.doesNotMatch(flat(mail.html), /Provenance/);
});

test("le courriel du client ne parle pas de provenance", async () => {
  const { clientConfirmation } = await import("../src/lib/email.ts");
  const mail = clientConfirmation({
    ...base,
    origin: { heardFromLabel: "Accroche-porte", source: "accroche-porte", campaign: null, firstSeenAt: null, visits: 3 },
  });
  assert.doesNotMatch(flat(mail.text), /Provenance|Accroche-porte/, "cela ne regarde que l'artisan");
  assert.doesNotMatch(flat(mail.html), /Accroche-porte/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

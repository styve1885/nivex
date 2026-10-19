/**
 * Tests de la provenance et de la zone desservie.
 * Exécution : npx tsx tests/provenance.test.mjs
 *
 * Ce qui n'est pas vérifiable ici : l'écriture en base et la lecture de
 * l'en-tête de l'hébergeur, qui demandent une requête réelle. Ce qui l'est,
 * et qui compte : que la phrase de la zone suive les secteurs réglés plutôt
 * qu'une ancienne liste, et qu'aucune adresse IP ne puisse se glisser dans
 * le journal.
 */
import assert from "node:assert/strict";

const { readZonePolicy } = await import("../src/lib/settings.ts");
const { servedText, DEFAULT_ZONE_POLICY } = await import("../src/lib/travel.ts");
const { fr } = await import("../src/lib/i18n/fr.ts");
const { en } = await import("../src/lib/i18n/en.ts");
const {
  visitSource, referrerHost, deviceType, clip, isHeardFrom, isStoredHeardFrom, HEARD_FROM, HEARD_FROM_FR,
  groupOfSource, visitGroup, bookingGroup, heardFromHint, heardFromText, refName, robotReason,
  isDatacenterVisit, isPrivatePath, SOURCE_GROUPS,
} = await import("../src/lib/attribution.ts");
const { isCounted, digestSummary, visitBilan, sourcesOf } = await import("../src/lib/visits.ts");
const { ownerNotification } = await import("../src/lib/email.ts");
const { BookingInput, cleanOrigin } = await import("../src/lib/bookings.ts");

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const flat = (x) => x.replace(/[   ]/g, " ");

console.log("\nZone desservie : une phrase écrite depuis les secteurs");

/* Les secteurs, les zones et les frais vivent dans travel.test.mjs. Ce qui
   reste à vérifier ici, c'est que la phrase affichée suit la grille, et que
   l'ancienne liste `service_area` — préfixes et libellé écrits à la main —
   ne peut plus revenir par la lecture. */

test("la phrase nomme les secteurs desservis", () => {
  const f = servedText(DEFAULT_ZONE_POLICY, "fr", fr.zoneText);
  for (const lieu of ["Saint-Jean-sur-Richelieu", "Outremont", "L'Île-des-Sœurs", "Candiac"]) assert.ok(f.includes(lieu), lieu);
  assert.match(servedText(DEFAULT_ZONE_POLICY, "en", en.zoneText), /Nuns' Island/);
});

test("l'ancienne liste, même enregistrée, ne décide plus rien", () => {
  const ancienne = { prefixes: ["J4K"], labelFr: "Longueuil et Brossard", labelEn: "Longueuil and Brossard" };
  const lu = readZonePolicy(ancienne);
  assert.deepEqual(lu, DEFAULT_ZONE_POLICY, "une forme qui n'est pas la 2 se lit comme jamais réglée");
  assert.doesNotMatch(servedText(lu, "fr", fr.zoneText), /Longueuil et Brossard/);
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

test("la page qui retire un navigateur ne se compte pas non plus", () => {
  for (const p of ["/fr/ne-pas-compter", "/en/ne-pas-compter", "/fr/ne-pas-compter/"]) {
    assert.equal(isCounted(p), false, `${p} ne devrait pas être compté`);
    assert.equal(isPrivatePath(p), true);
  }
  assert.equal(isPrivatePath("/fr/ne-pas-compter-du-tout"), false);
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

console.log("\nQuestion « Comment avez-vous connu NIVEX ? »");

test("la liste est fermée, dans l'ordre du formulaire", () => {
  assert.deepEqual([...HEARD_FROM], [
    "porte-a-porte", "recommandation", "facebook", "instagram", "linkedin", "google", "assistant-ia", "autre",
  ]);
  for (const k of HEARD_FROM) assert.equal(isHeardFrom(k), true, `${k} devrait être accepté`);
  for (const k of ["<script>", "", "PORTE-A-PORTE", null, 7]) {
    assert.equal(isHeardFrom(k), false, `${JSON.stringify(k)} ne devrait pas être accepté`);
  }
});

test("les deux libellés suivent la liste, en français et en anglais", () => {
  for (const k of HEARD_FROM) {
    assert.ok(fr.booking.step2.heardFromOptions[k], `fr : ${k}`);
    assert.ok(en.booking.step2.heardFromOptions[k], `en : ${k}`);
  }
  assert.equal(fr.booking.step2.heardFromOptions["porte-a-porte"], "Une visite à ma porte ou une carte de NIVEX");
  assert.equal(fr.booking.step2.heardFromOptions["assistant-ia"], "Un assistant IA (ChatGPT ou autre)");
  assert.match(flat(fr.booking.step2.heardFrom), /^Comment avez-vous connu NIVEX \?/);
  assert.match(flat(fr.booking.step2.referredBy), /^Qui vous a recommandé \?/);
});

test("les anciennes réponses se lisent encore, mais ne s'envoient plus", () => {
  for (const k of ["carte", "accroche-porte"]) {
    assert.equal(isHeardFrom(k), false, `${k} ne se propose plus`);
    assert.equal(isStoredHeardFrom(k), true, `${k} se relit en base`);
    assert.ok(HEARD_FROM_FR[k]);
  }
});

test("la recommandation se lit avec le nom de la personne", () => {
  assert.equal(heardFromText({ heardFrom: "recommandation", referredBy: "Marie Tremblay", referral: "Marie" }),
    "Recommandation d'un proche (Marie Tremblay)");
  assert.equal(heardFromText({ heardFrom: "recommandation", referredBy: null, referral: "Marie" }),
    "Recommandation d'un proche (Marie)");
  assert.equal(heardFromText({ heardFrom: "facebook", referredBy: "Marie", referral: null }), "Facebook");
  assert.equal(heardFromText({ heardFrom: null }), null);
});

test("le nom écrit à la main n'est gardé qu'avec la recommandation", () => {
  const a = cleanOrigin({ heardFrom: "recommandation", referredBy: "  Marie\nTremblay  ", attribution: { ref: "marie" } });
  assert.equal(a.referredBy, "Marie Tremblay");
  assert.equal(a.referral, "Marie");
  const b = cleanOrigin({ heardFrom: "google", referredBy: "Marie", attribution: {} });
  assert.equal(b.referredBy, null);
  assert.equal(cleanOrigin({ heardFrom: "recommandation", referredBy: "x".repeat(300) }).referredBy.length, 80);
  assert.equal(cleanOrigin({ heardFrom: "recommandation", referredBy: 42 }).referredBy, null);
});

test("le formulaire se pré-remplit sur un lien de recommandation ou une carte", () => {
  assert.equal(heardFromHint({ source: null, ref: "Marie" }), "recommandation");
  assert.equal(heardFromHint({ source: "porte-a-porte", ref: null }), "porte-a-porte");
  assert.equal(heardFromHint({ source: "Porte-a-Porte", ref: null }), "porte-a-porte");
  assert.equal(heardFromHint({ source: "facebook", ref: null }), null, "seuls la recommandation et la carte se devinent");
  assert.equal(heardFromHint({ source: null, ref: null }), null);
});

console.log("\nLien de recommandation");

test("le prénom est mis au propre", () => {
  assert.equal(refName("marie"), "Marie");
  assert.equal(refName("MARIE"), "Marie");
  assert.equal(refName("jean-luc"), "Jean-Luc");
  assert.equal(refName("éloïse"), "Éloïse");
  assert.equal(refName("  d'arcy  o'neil "), "D'Arcy O'Neil");
  assert.equal(refName("<script>alert(1)</script>"), "Scriptalert1script");
  assert.equal(refName("x".repeat(90)).length, 40);
  assert.equal(refName(""), null);
  assert.equal(refName("<>"), null);
  assert.equal(refName(null), null);
  assert.equal(refName(["marie"]), null);
});

console.log("\nFamilles de sources");

test("chaque famille reconnaît les sources demandées", () => {
  const cas = {
    facebook: ["facebook.com", "m.facebook.com", "l.facebook.com", "facebook", "Facebook", "fb"],
    instagram: ["instagram.com", "l.instagram.com", "instagram"],
    linkedin: ["linkedin.com", "lnkd.in", "linkedin", "fr.linkedin.com"],
    ia: ["chatgpt.com", "perplexity.ai", "gemini.google.com", "copilot.microsoft.com", "claude.ai", "chat.openai.com"],
    google: ["google.com", "google.ca", "google.fr", "google.co.uk", "google"],
    "porte-a-porte": ["porte-a-porte"],
    direct: ["direct", "", null, "vercel.com", "bing.com", "mail.google.com", "news.google.com", "nivexrepassage.ca"],
  };
  for (const [g, sources] of Object.entries(cas)) {
    for (const src of sources) assert.equal(groupOfSource(src), g, `${src} → ${g}`);
  }
});

test("la source enregistrée d'un vrai référent tombe dans sa famille", () => {
  assert.equal(groupOfSource(visitSource(null, "https://www.google.ca/")), "google");
  assert.equal(groupOfSource(visitSource(null, "https://l.facebook.com/l.php?u=x")), "facebook");
  assert.equal(groupOfSource(visitSource("chatgpt.com", null)), "ia");
  assert.equal(groupOfSource(visitSource(null, "android-app://com.google.android.googlequicksearchbox/")), "google");
});

test("un lien de recommandation l'emporte sur la source", () => {
  assert.equal(visitGroup({ source: "facebook.com", referral: "Marie" }), "recommandation");
  assert.equal(visitGroup({ source: "facebook.com", referral: null }), "facebook");
});

test("une réservation : la recommandation, puis la réponse, puis le navigateur", () => {
  const o = (x) => ({ heardFrom: null, referral: null, source: null, referrer: null, ...x });
  assert.equal(bookingGroup(o({ referral: "Marie", heardFrom: "facebook" })), "recommandation");
  assert.equal(bookingGroup(o({ heardFrom: "porte-a-porte", source: "google" })), "porte-a-porte",
    "une carte reçue puis une recherche, c'est la carte");
  assert.equal(bookingGroup(o({ heardFrom: "carte" })), "porte-a-porte", "l'ancienne réponse se range aussi");
  assert.equal(bookingGroup(o({ heardFrom: "assistant-ia" })), "ia");
  assert.equal(bookingGroup(o({ heardFrom: "autre", source: "instagram" })), "instagram", "« Autre » laisse parler la mesure");
  assert.equal(bookingGroup(o({ referrer: "https://www.linkedin.com/feed" })), "linkedin");
  assert.equal(bookingGroup(o({})), "direct");
});

console.log("\nRobots");

const humain = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  webdriver: false, timeZone: "America/Toronto",
  country: "CA", city: "Longueuil", source: "direct", device: "mobile", referral: null,
};

test("un visiteur ordinaire n'est pas un robot", () => {
  assert.equal(robotReason(humain), null);
  const fb = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]";
  assert.equal(robotReason({ ...humain, userAgent: fb }), null, "le navigateur intégré de Facebook est un humain");
  const ig = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Instagram 350.0";
  assert.equal(robotReason({ ...humain, userAgent: ig }), null, "celui d'Instagram aussi");
});

test("un agent qui se déclare robot, aperçu ou navigateur sans écran", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0 Safari/537.36",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (compatible; Chrome-Lighthouse)",
    "WhatsApp/2.23.20.0", "curl/8.4.0", "python-requests/2.31", "",
  ]) {
    assert.equal(robotReason({ ...humain, userAgent: ua }), "agent", ua || "(vide)");
  }
});

test("un navigateur piloté, une horloge de serveur", () => {
  assert.equal(robotReason({ ...humain, webdriver: true }), "pilote");
  assert.equal(robotReason({ ...humain, webdriver: "true" }), null, "seul le vrai booléen compte");
  assert.equal(robotReason({ ...humain, timeZone: "UTC" }), "fuseau");
  assert.equal(robotReason({ ...humain, timeZone: "Etc/UTC" }), "fuseau");
  assert.equal(robotReason({ ...humain, timeZone: "Europe/Paris" }), null, "un voyageur n'est pas un robot");
});

test("un centre de données : américain, direct, sur ordinateur, d'une ville connue", () => {
  const dc = { ...humain, country: "US", city: "San Jose", device: "ordinateur",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36" };
  assert.equal(robotReason(dc), "centre");
  for (const city of ["Seattle", "Charlotte", "Ashburn", "Council Bluffs"]) {
    assert.equal(isDatacenterVisit({ ...dc, city }), true, city);
  }
  assert.equal(isDatacenterVisit({ ...dc, device: "mobile" }), false, "un téléphone n'est pas un serveur");
  assert.equal(isDatacenterVisit({ ...dc, source: "google.com" }), false, "une visite avec référent reste humaine");
  assert.equal(isDatacenterVisit({ ...dc, referral: "Marie" }), false);
  assert.equal(isDatacenterVisit({ ...dc, country: "CA", city: "Montréal" }), false);
  assert.equal(isDatacenterVisit({ ...dc, city: "Burlington" }), false, "une ville hors liste reste humaine");
});

console.log("\nBilan et filtres de l'onglet Visites");

const ligne = (source, n, x = {}) => ({
  source, hasRef: false, robot: false, city: "Longueuil",
  counts: { 7: n[0], 30: n[1], 90: n[2], 0: n[3] }, ...x,
});
const journal = [
  ligne("porte-a-porte", [2, 5, 5, 5]),
  ligne("l.facebook.com", [1, 3, 4, 4]),
  ligne("facebook", [0, 1, 1, 1], { city: "Brossard" }),
  ligne("direct", [1, 2, 6, 9], { hasRef: true }),
  ligne("direct", [3, 4, 4, 4], { robot: true, city: "San Jose" }),
  ligne("vercel.com", [0, 1, 1, 1]),
];

test("les robots sont écartés du total par défaut, et comptés à part", () => {
  const s = digestSummary(journal, 30, "hide", null);
  assert.equal(s.views, 5 + 3 + 1 + 2 + 1);
  assert.equal(s.robots, 4);
  assert.equal(s.cities, 2, "San Jose ne compte pas parmi les villes");
  assert.equal(digestSummary(journal, 30, "only", null).views, 4);
  assert.equal(digestSummary(journal, 30, "all", null).views, 16);
});

test("le filtre de source se fait par famille", () => {
  const s = digestSummary(journal, 30, "hide", "facebook");
  assert.equal(s.views, 4, "facebook.com et l'étiquette facebook se rejoignent");
  assert.equal(s.robots, 0, "les robots comptés sont ceux de la famille choisie");
  assert.equal(digestSummary(journal, 30, "hide", "direct").robots, 4);
  assert.deepEqual(s.groups.map((g) => g.group), ["facebook", "porte-a-porte", "recommandation", "direct"]);
  assert.deepEqual(sourcesOf(journal, "facebook").sort(), ["facebook", "l.facebook.com"]);
  assert.deepEqual(sourcesOf(journal, "direct").sort(), ["direct", "vercel.com"], "la ligne recommandée n'est pas directe");
});

test("le bilan range chaque famille sur les quatre périodes, sans les robots", () => {
  const b = visitBilan(journal);
  assert.deepEqual(Object.keys(b), [...SOURCE_GROUPS]);
  assert.deepEqual(b["porte-a-porte"], { 7: 2, 30: 5, 90: 5, 0: 5 });
  assert.deepEqual(b.facebook, { 7: 1, 30: 4, 90: 5, 0: 5 });
  assert.deepEqual(b.recommandation, { 7: 1, 30: 2, 90: 6, 0: 9 });
  assert.deepEqual(b.direct, { 7: 0, 30: 1, 90: 1, 0: 1 }, "le robot de San Jose n'y est pas");
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
    { heardFrom: "recommandation", referredBy: { nom: "Marie" } },
    { referredBy: "x".repeat(5000) },
    { attribution: { ref: ["marie"], source: 12 } },
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

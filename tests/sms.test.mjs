/**
 * Tests des textos : le numéro, les messages, et l'envoi vers Twilio.
 * Exécution : npx tsx tests/sms.test.mjs
 *
 * L'envoi est éprouvé contre un Twilio simulé : la remise réelle se vérifie
 * depuis l'espace artisan, avec le bouton « Envoyer un texto de test ».
 */
import assert from "node:assert/strict";

const { toE164, sendSms, smsConfigured, smsWhen, SMS, ownerSmsNumber } = await import("../src/lib/sms.ts");
const { fromWall } = await import("../src/lib/time.ts");
const { SETUP_MINUTES } = await import("../src/lib/brand.ts");

const TZ = "America/Toronto";
const flat = (x) => x.replace(/[   ]/g, " ");
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

console.log("\nTextos\n");

await test("les numéros saisis au formulaire se ramènent au format E.164", () => {
  assert.equal(toE164("450 943-1217"), "+14509431217");
  assert.equal(toE164("(450) 943 1217"), "+14509431217");
  assert.equal(toE164("+1 450 943 1217"), "+14509431217");
  assert.equal(toE164("1-514-555-0101"), "+15145550101");
});

await test("ce qui n'est pas un numéro nord-américain est refusé", () => {
  assert.equal(toE164("943-1217"), null);          // sept chiffres
  assert.equal(toE164("050 943 1217"), null);      // indicatif impossible
  assert.equal(toE164("+33 6 12 34 56 78"), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164(null), null);
});

await test("l'artisan reçoit ses textos sur le numéro de la maison, sauf SMS_OWNER_TO", () => {
  delete process.env.SMS_OWNER_TO;
  assert.equal(ownerSmsNumber(), "+14509431217");
  process.env.SMS_OWNER_TO = "514 555-0199";
  assert.equal(ownerSmsNumber(), "+15145550199");
  delete process.env.SMS_OWNER_TO;
});

const when = smsWhen(fromWall({ year: 2026, month: 10, day: 20, hour: 14, minute: 0 }, TZ), TZ, "fr");

await test("la date se lit en heure de Montréal, dans la langue du client", () => {
  assert.equal(flat(when), "mardi 20 octobre à 14 h 00");
  const en = smsWhen(fromWall({ year: 2026, month: 10, day: 20, hour: 14, minute: 0 }, TZ), TZ, "en");
  assert.match(flat(en), /Tuesday, October 20.*2:00/);
});

await test("le rappel annonce l'arrivée en avance, et le paiement seulement quand il est dû", () => {
  const due = flat(SMS.reminder("fr", when, false, "400 $"));
  assert.match(due, /demain, mardi 20 octobre/);
  assert.match(due, new RegExp(`${SETUP_MINUTES} minutes avant`));
  assert.match(due, /Paiement du cycle à cette visite : 400 \$/);
  assert.ok(!/Paiement/.test(SMS.reminder("fr", when, false, null)));
  assert.match(SMS.reminder("en", when, true, null), /today/);
});

await test("aucun point d'exclamation, et chaque texto signé NIVEX", () => {
  const all = [
    SMS.bookingConfirmed("fr", when, "https://x"), SMS.bookingConfirmed("en", when, "https://x"),
    SMS.subscriptionConfirmed("fr", "Exécutif", when, "chaque semaine", "https://x"),
    SMS.subscriptionConfirmed("en", "Executive", when, "every week", "https://x"),
    SMS.reminder("fr", when, false, "400 $"), SMS.reminder("en", when, true, null),
    SMS.bookingCancelled("fr", when), SMS.bookingCancelled("en", when),
    SMS.visitCancelled("fr", when, when), SMS.visitCancelled("en", when, null),
    SMS.visitMoved("fr", when, when), SMS.visitMoved("en", when, when),
    SMS.owner.newBooking("Claire", when, "Longueuil"), SMS.owner.newSubscription("Claire", "Exécutif", when),
    SMS.owner.cancelled("Claire", when), SMS.owner.moved("Claire", when, when),
  ];
  for (const m of all) {
    assert.ok(!m.includes("!"), m);
    assert.ok(m.startsWith("NIVEX"), m);
  }
});

await test("sans clés Twilio, rien ne part et rien ne lève", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  assert.equal(smsConfigured(), false);
  assert.equal(await sendSms("450 943-1217", "essai"), false);
});

await test("avec les clés, le texto part vers Twilio au bon format", async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "jeton", TWILIO_FROM: "+14385550000" });
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
  };
  try {
    assert.equal(await sendSms("450 943-1217", "NIVEX : essai"), true);
    assert.equal(calls[0].url, "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const body = new URLSearchParams(calls[0].init.body.toString());
    assert.equal(body.get("To"), "+14509431217");
    assert.equal(body.get("From"), "+14385550000");
    assert.equal(body.get("Body"), "NIVEX : essai");
    assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from("AC123:jeton").toString("base64")}`);

    /* Un refus de Twilio ne lève pas : il rend faux. */
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 21608, message: "unverified" }), { status: 400 });
    assert.equal(await sendSms("450 943-1217", "NIVEX : essai"), false);
    /* Un numéro invalide n'appelle même pas Twilio. */
    let called = false;
    globalThis.fetch = async () => { called = true; return new Response("{}", { status: 201 }); };
    assert.equal(await sendSms("123", "NIVEX : essai"), false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = real;
    delete process.env.TWILIO_ACCOUNT_SID;
  }
});

console.log(`\n${n} réussis, 0 échoués\n`);

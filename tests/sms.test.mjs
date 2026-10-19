/**
 * Tests des textos : le numéro, les messages, et l'envoi vers Twilio.
 * Exécution : npx tsx tests/sms.test.mjs
 *
 * L'envoi est éprouvé contre un Twilio simulé : la remise réelle se vérifie
 * depuis l'espace artisan, avec le bouton « Envoyer un texto de test ».
 */
import assert from "node:assert/strict";

const { toE164, isCanadianNumber, sendSms, smsConfigured, smsWhen, SMS, ownerSmsNumber, twilioSignature, twilioSignatureValid, twimlForward, forwardedReply, stopHint } = await import("../src/lib/sms.ts");
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

await test("on n'écrit qu'aux numéros canadiens : ni les Caraïbes, ni les États-Unis", () => {
  for (const ok of ["450 943-1217", "514 555-0101", "438 555-0101", "613 555-0101", "604 555-0101"]) {
    assert.equal(isCanadianNumber(toE164(ok)), true, ok);
  }
  /* Jamaïque, République dominicaine, Antigua, îles Turques-et-Caïques, New York. */
  for (const no of ["876 555 0123", "(809) 555-0123", "+1 268 555 0123", "649 555 0123", "212 555 0123"]) {
    assert.equal(isCanadianNumber(toE164(no)), false, no);
  }
  assert.equal(isCanadianNumber("+33612345678"), false);
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
  /* L'heure du matin s'écrit sans zéro devant : « 9 h 00 », « 9:00 a.m. ». */
  const morning = fromWall({ year: 2026, month: 10, day: 20, hour: 9, minute: 0 }, TZ);
  assert.match(flat(smsWhen(morning, TZ, "fr")), / à 9 h 00$/);
  assert.match(flat(smsWhen(morning, TZ, "en")), / 9:00 a\.m\.$/);
});

await test("les confirmations disent comment ne plus recevoir de textos, les autres non", () => {
  assert.match(SMS.bookingConfirmed("fr", when, "https://x"), /Répondez STOP pour ne plus recevoir de textos\.$/);
  assert.match(SMS.bookingConfirmed("en", when, "https://x"), /Reply STOP to opt out\.$/);
  assert.match(SMS.subscriptionConfirmed("fr", "Exécutif", when, "chaque semaine", "https://x"), /Répondez STOP/);
  assert.match(SMS.subscriptionConfirmed("en", "Executive", when, "every week", "https://x"), /Reply STOP/);
  assert.ok(!/STOP/.test(SMS.reminder("fr", when, false, null)));
  assert.ok(!/STOP/.test(SMS.visitMoved("fr", when, when)));
});

/* L'alphabet des textos (GSM 03.38, table de base). Un seul caractère hors de
   cette table fait passer tout le message en Unicode, à 70 caractères la tranche. */
const GSM7 = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const gsm7 = (s) => [...s].every((c) => GSM7.has(c));

await test("les textos de l'artisan tiennent dans l'alphabet des textos, en une tranche", () => {
  const all = [
    SMS.owner.newBooking("Marie Tremblay", when, "Saint-Lambert"),
    SMS.owner.newSubscription("Marie Tremblay", "Exécutif", when),
    SMS.owner.cancelled("Marie Tremblay", when),
    SMS.owner.moved("Marie Tremblay", when, when),
    /* Un mois d'août et des noms accentués : û, ç, ô, î, ë sortent de l'alphabet. */
    SMS.owner.newBooking("François Côté", "lundi 3 août à 9 h 00", "Saint-Lambert"),
    SMS.owner.cancelled("Gaëtan Benoît", "lundi 3 août à 9 h 00"),
    SMS.owner.moved("Chloé Bélanger", "lundi 3 août à 9 h 00", "mardi 4 août à 14 h 00"),
  ];
  for (const m of all) {
    assert.ok(gsm7(m), `hors alphabet : ${m}`);
    assert.ok(m.length <= 160, `${m.length} caractères : ${m}`);
  }
  assert.match(SMS.owner.newBooking("François Côté", "lundi 3 août à 9 h 00", "Saint-Lambert"), /Francois Coté, lundi 3 aout à 9 h 00/);
  /* Un nom qui ne se ramène pas à l'alphabet reste lisible, en deux tranches. */
  assert.match(SMS.owner.cancelled("王小明", "lundi 3 août"), /王小明/);
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
    /* Un numéro des Caraïbes non plus : la réservation tient, le texto ne part pas. */
    assert.equal(await sendSms("876 555 0123", "NIVEX : essai"), false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = real;
    delete process.env.TWILIO_ACCOUNT_SID;
  }
});

await test("la signature suit l'exemple publié par Twilio, au caractère près", () => {
  const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
  assert.equal(twilioSignature("https://mycompany.com/myapp.php?foo=1&bar=2", params, "12345"), "0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
});

await test("une requête signée par Twilio est reconnue, une requête trafiquée ne l'est pas", () => {
  const url = "https://nivexrepassage.ca/api/sms/incoming";
  const params = { From: "+14505550222", To: "+14503676231", Body: "Merci, à mardi", NumMedia: "0" };
  const sig = twilioSignature(url, params, "jeton");
  assert.equal(twilioSignatureValid([url], params, sig, "jeton"), true);
  /* L'ordre d'arrivée des champs ne compte pas : Twilio les trie. */
  const shuffled = { Body: params.Body, NumMedia: "0", To: params.To, From: params.From };
  assert.equal(twilioSignatureValid([url], shuffled, sig, "jeton"), true);
  assert.equal(twilioSignatureValid([url], { ...params, Body: "Autre chose" }, sig, "jeton"), false);
  assert.equal(twilioSignatureValid([url], params, sig, "autre-jeton"), false);
  assert.equal(twilioSignatureValid(["https://autre.ca/api/sms/incoming"], params, sig, "jeton"), false);
  assert.equal(twilioSignatureValid(["https://autre.ca/x", url], params, sig, "jeton"), true);
  assert.equal(twilioSignatureValid([url], params, null, "jeton"), false);
});

await test("la réponse d'un client part vers l'artisan, avec son nom et son numéro", () => {
  const m = forwardedReply({ from: "+14505550222", name: "Marc Essai", body: "Je serai en retard de 10 minutes", media: 0 });
  assert.equal(m, "NIVEX : réponse de Marc Essai (450 555-0222) : Je serai en retard de 10 minutes");
  assert.match(forwardedReply({ from: "+14505550222", name: null, body: "Oui", media: 1 }), /^NIVEX : réponse de 450 555-0222 : Oui \[1 pièce jointe/);
  assert.match(forwardedReply({ from: "+14505550222", name: "Marc", body: "STOP", media: 0 }), /ne recevra plus de textos/);
  assert.match(forwardedReply({ from: "+14505550222", name: "Marc", body: "optout", media: 0 }), /ne recevra plus de textos/);
  assert.equal(forwardedReply({ from: "+14505550222", name: "Marc", body: "x".repeat(3000), media: 0 }).length < 1100, true);
});

await test("« ARRÊT » ne désabonne pas chez Twilio : l'artisan n'est pas trompé, le client apprend le bon mot", () => {
  for (const body of ["ARRÊT", "arret", "Arrêter", " arrête. "]) {
    assert.match(stopHint(body) ?? "", /répondez STOP/, body);
    const fwd = forwardedReply({ from: "+14505550222", name: "Marc", body, media: 0, hinted: true });
    assert.ok(!/ne recevra plus/.test(fwd), fwd);
    assert.match(fwd, /toujours inscrit/);
  }
  assert.equal(stopHint("Je vais arrêter de travailler plus tôt"), null);
  assert.equal(stopHint("STOP"), null);
  assert.ok(!/toujours inscrit/.test(forwardedReply({ from: "+14505550222", name: "Marc", body: "ARRÊT", media: 0 })));
});

await test("l'instruction TwiML échappe le texte du client", () => {
  const x = twimlForward("+14509431217", "Bonjour <b> & \"merci\"");
  assert.equal(x, '<?xml version="1.0" encoding="UTF-8"?><Response><Message to="+14509431217">Bonjour &lt;b&gt; &amp; &quot;merci&quot;</Message></Response>');
  /* Avec une réponse au client : un second message, sans destinataire, qui revient à l'expéditeur. */
  const y = twimlForward("+14509431217", "NIVEX : réponse", stopHint("ARRÊT"));
  assert.match(y, /<\/Message><Message>NIVEX : pour ne plus recevoir de textos, répondez STOP\.<\/Message><\/Response>$/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

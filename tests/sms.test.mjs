/**
 * Tests des textos : le numéro, les messages, et l'envoi vers Twilio.
 * Exécution : npx tsx tests/sms.test.mjs
 *
 * L'envoi est éprouvé contre un Twilio simulé : la remise réelle se vérifie
 * depuis l'espace artisan, avec le bouton « Envoyer un texto de test ».
 */
import assert from "node:assert/strict";

const {
  toE164, isCanadianNumber, sendSms, smsConfigured, smsWhen, smsDay, smsTime, SMS, ownerSmsNumber, twilioSignature,
  twilioSignatureValid, twimlForward, forwardedReply, stopHint, scheduleSms, cancelScheduledSms, smsScheduleConfigured,
} = await import("../src/lib/sms.ts");
const { fromWall } = await import("../src/lib/time.ts");
const { SMS_SIGNATURE, PHONE } = await import("../src/lib/brand.ts");
const {
  twimlRingOwner, twimlMissedMessage, missedCallAlert, callMissed, callerNumber, MISSED_MESSAGE, RING_SECONDS,
} = await import("../src/lib/voice.ts");

const TZ = "America/Toronto";
const flat = (x) => x.replace(/[   ]/g, " ");
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

console.log("\nTextos\n");

await test("les numéros saisis au formulaire se ramènent au format E.164", () => {
  assert.equal(toE164("514 555-0142"), "+15145550142");
  assert.equal(toE164("(514) 555 0142"), "+15145550142");
  assert.equal(toE164("+1 514 555 0142"), "+15145550142");
  assert.equal(toE164("1-514-555-0101"), "+15145550101");
});

await test("ce qui n'est pas un numéro nord-américain est refusé", () => {
  assert.equal(toE164("555-0142"), null);          // sept chiffres
  assert.equal(toE164("050 555 0142"), null);      // indicatif impossible
  assert.equal(toE164("+33 6 12 34 56 78"), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164(null), null);
});

await test("on n'écrit qu'aux numéros canadiens : ni les Caraïbes, ni les États-Unis", () => {
  for (const ok of ["514 555-0142", "514 555-0101", "438 555-0101", "613 555-0101", "604 555-0101"]) {
    assert.equal(isCanadianNumber(toE164(ok)), true, ok);
  }
  /* Jamaïque, République dominicaine, Antigua, îles Turques-et-Caïques, New York. */
  for (const no of ["876 555 0123", "(809) 555-0123", "+1 268 555 0123", "649 555 0123", "212 555 0123"]) {
    assert.equal(isCanadianNumber(toE164(no)), false, no);
  }
  assert.equal(isCanadianNumber("+33612345678"), false);
});

await test("l'artisan reçoit ses textos sur SMS_OWNER_TO seulement, jamais sur le numéro de la maison", () => {
  /* Le numéro de la maison est celui de Twilio depuis le 6 novembre 2026 :
     il ne sert plus de repli, il ne peut pas s'écrire à lui-même. */
  delete process.env.SMS_OWNER_TO;
  assert.equal(ownerSmsNumber(), null);
  process.env.SMS_OWNER_TO = "514 555-0199";
  assert.equal(ownerSmsNumber(), "+15145550199");
  process.env.SMS_OWNER_TO = PHONE;
  assert.equal(ownerSmsNumber(), null, "le numéro de la maison n'est pas un cellulaire");
  process.env.TWILIO_FROM = "+14385550000";
  process.env.SMS_OWNER_TO = "438 555-0000";
  assert.equal(ownerSmsNumber(), null, "ni le numéro d'envoi de Twilio");
  delete process.env.TWILIO_FROM;
  process.env.SMS_OWNER_TO = "pas un numéro";
  assert.equal(ownerSmsNumber(), null);
  delete process.env.SMS_OWNER_TO;
});

await test("les appels : le cellulaire sonne sous le numéro de la maison, puis l'action dit le sort de l'appel", () => {
  const xml = twimlRingOwner({ owner: "+15145550199", callerId: "+14503676231", action: "https://www.nivexrepassage.ca/api/voice/missed" });
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Dial /);
  assert.match(xml, new RegExp(`timeout="${RING_SECONDS}"`));
  assert.ok(RING_SECONDS >= 15 && RING_SECONDS <= 22, "la sonnerie s'arrête avant la boîte vocale de l'opérateur");
  assert.match(xml, /answerOnBridge="true"/);
  assert.match(xml, /callerId="\+14503676231"/);
  assert.match(xml, /action="https:\/\/www\.nivexrepassage\.ca\/api\/voice\/missed" method="POST"/);
  assert.match(xml, /<Number>\+15145550199<\/Number><\/Dial><\/Response>$/);
  /* Rien ne s'injecte dans l'instruction. */
  assert.ok(!twimlRingOwner({ owner: "<x>", callerId: "\"y", action: "a&b" }).includes("<x>"));
  assert.equal(callMissed("completed"), false);
  for (const s of ["no-answer", "busy", "failed", "canceled", undefined, null, ""]) assert.equal(callMissed(s), true, String(s));
});

await test("l'appelant entend un message d'absence en français puis en anglais, sans boîte vocale", () => {
  const xml = twimlMissedMessage();
  assert.match(xml, /<Say language="fr-CA" voice="Polly\.Chantal">Bonjour, vous avez joint NIVEX/);
  assert.match(xml, /<Say language="en-US" voice="Polly\.Joanna">Hello, you have reached NIVEX/);
  assert.match(xml, /<Hangup\/><\/Response>$/);
  assert.ok(!xml.includes("<Record"), "rien n'est enregistré");
  for (const m of Object.values(MISSED_MESSAGE)) {
    assert.ok(!m.includes("!"), m);
    assert.match(m, /nivexrepassage\.ca/);
  }
});

await test("l'alerte d'appel manqué donne le nom, le numéro et l'heure de Montréal, en alphabet des textos", () => {
  const at = fromWall({ year: 2026, month: 11, day: 6, hour: 14, minute: 5 }, TZ);
  assert.equal(missedCallAlert({ from: "+15145550123", name: "Marie Tremblay", at, tz: TZ }),
    "NIVEX : appel manqué de Marie Tremblay (514 555-0123), à 14 h 05.");
  assert.equal(missedCallAlert({ from: "+15145550123", name: null, at, tz: TZ }),
    "NIVEX : appel manqué du 514 555-0123, à 14 h 05.");
  assert.equal(missedCallAlert({ from: null, name: null, at, tz: TZ }),
    "NIVEX : appel manqué d'un numéro masqué, à 14 h 05.");
  /* Un nom hors de l'alphabet des textos perd ses accents, comme les autres avis de l'artisan. */
  assert.equal(missedCallAlert({ from: "+15145550123", name: "Françoise Côté", at, tz: TZ }),
    "NIVEX : appel manqué de Francoise Coté (514 555-0123), à 14 h 05.");
  /* Un numéro masqué arrive en chiffres de clavier : il reste masqué. RESTRICTED
     (+7378742833) ressemble à un numéro d'ici une fois le « + » retiré. */
  for (const hidden of ["+266696687", "anonymous", "+7378742833", "+2562533", "+86282452253", "", undefined]) {
    assert.equal(callerNumber(hidden), null, String(hidden));
  }
  assert.equal(callerNumber("+15145550123"), "+15145550123");
  assert.equal(callerNumber("5145550123"), null, "Twilio donne toujours le +1");
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

const t14 = fromWall({ year: 2026, month: 10, day: 20, hour: 14, minute: 0 }, TZ);
const t16 = fromWall({ year: 2026, month: 10, day: 20, hour: 16, minute: 0 }, TZ);
const day = smsDay(t14, TZ, "fr");
const confirmed = SMS.bookingConfirmed("fr", day, smsTime(t14, TZ, "fr"), smsTime(t16, TZ, "fr"));
const confirmedEn = SMS.bookingConfirmed("en", smsDay(t14, TZ, "en"), smsTime(t14, TZ, "en"), smsTime(t16, TZ, "en"));

await test("le jour et l'heure se disent comme à l'oral : « mardi 20 octobre », « 14 h », « 9 h 30 »", () => {
  assert.equal(day, "mardi 20 octobre");
  assert.equal(smsTime(t14, TZ, "fr"), "14 h");
  assert.equal(smsTime(fromWall({ year: 2026, month: 10, day: 20, hour: 9, minute: 30 }, TZ), TZ, "fr"), "9 h 30");
  assert.equal(smsTime(t14, TZ, "en"), "2 p.m.");
  assert.equal(smsTime(fromWall({ year: 2026, month: 10, day: 20, hour: 9, minute: 30 }, TZ), TZ, "en"), "9:30 a.m.");
});

await test("les trois textos de la séance suivent les modèles de la maison, signés Styve", () => {
  assert.equal(SMS_SIGNATURE, "Styve");
  assert.equal(confirmed, "NIVEX - Votre séance est confirmée le mardi 20 octobre, de 14 h à 16 h. Vous n'avez que la planche à prévoir. Répondez STOP pour ne plus recevoir de textos. Styve");
  assert.equal(SMS.reminder("fr", day, "14 h", false, null), "NIVEX - Rappel : demain mardi 20 octobre, j'arrive à 14 h. À demain. Styve");
  assert.equal(SMS.soon("fr", "14 h"), "NIVEX - Je serai chez vous à 14 h. Styve");
  assert.equal(confirmedEn, "NIVEX - Your session is confirmed for Tuesday, October 20, from 2 p.m. to 4 p.m. All you need to provide is the ironing board. Reply STOP to opt out. Styve");
  assert.equal(SMS.soon("en", "2 p.m."), "NIVEX - I will be at your door at 2 p.m. Styve");
  /* Aucun tiret cadratin : il ferait passer le texto en Unicode. */
  for (const m of [confirmed, confirmedEn, SMS.reminder("fr", day, "14 h", false, null), SMS.soon("fr", "14 h")]) {
    assert.ok(!m.includes("—"), m);
  }
});

await test("les confirmations disent comment ne plus recevoir de textos, les autres non", () => {
  assert.match(confirmed, /Répondez STOP pour ne plus recevoir de textos\. Styve$/);
  assert.match(confirmedEn, /Reply STOP to opt out\. Styve$/);
  assert.match(SMS.subscriptionConfirmed("fr", "VIP", when, "chaque semaine", "https://x"), /Répondez STOP/);
  assert.match(SMS.subscriptionConfirmed("en", "VIP", when, "every week", "https://x"), /Reply STOP/);
  assert.ok(!/STOP/.test(SMS.reminder("fr", day, "14 h", false, null)));
  assert.ok(!/STOP/.test(SMS.soon("fr", "14 h")));
  assert.ok(!/STOP/.test(SMS.visitMoved("fr", when, when)));
});

/* L'alphabet des textos (GSM 03.38, table de base). Un seul caractère hors de
   cette table fait passer tout le message en Unicode, à 70 caractères la tranche. */
const GSM7 = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const gsm7 = (s) => [...s].every((c) => GSM7.has(c));

await test("les textos de l'artisan tiennent dans l'alphabet des textos, en une tranche", () => {
  const all = [
    SMS.owner.newBooking("Marie Tremblay", when, "Saint-Lambert"),
    /* Le plus long nom de formule. */
    SMS.owner.newSubscription("Marie Tremblay", "Premium Plus", when),
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

await test("le rappel donne l'heure d'arrivée, et le paiement seulement quand il est dû", () => {
  const due = flat(SMS.reminder("fr", day, "13 h 45", false, "400 $"));
  assert.equal(due, "NIVEX - Rappel : demain mardi 20 octobre, j'arrive à 13 h 45. Paiement du cycle à cette visite : 400 $. À demain. Styve");
  assert.ok(!/Paiement/.test(SMS.reminder("fr", day, "14 h", false, null)));
  assert.match(SMS.reminder("fr", day, "14 h", true, null), /aujourd'hui mardi 20 octobre, j'arrive à 14 h\. À tout à l'heure\. Styve$/);
  assert.match(SMS.reminder("en", "Tuesday, October 20", "2 p.m.", true, null), /^NIVEX - Reminder: today, Tuesday, October 20, I arrive at 2 p\.m\. See you soon\. Styve$/);
});

await test("aucun point d'exclamation, et chaque texto signé NIVEX", () => {
  const all = [
    confirmed, confirmedEn, SMS.soon("fr", "14 h"), SMS.soon("en", "2 p.m."),
    SMS.subscriptionConfirmed("fr", "VIP", when, "chaque semaine", "https://x"),
    SMS.subscriptionConfirmed("en", "VIP", when, "every week", "https://x"),
    SMS.reminder("fr", day, "14 h", false, "400 $"), SMS.reminder("en", "Tuesday, October 20", "2 p.m.", true, null),
    SMS.bookingCancelled("fr", when), SMS.bookingCancelled("en", when),
    SMS.visitCancelled("fr", when, when), SMS.visitCancelled("en", when, null),
    SMS.visitMoved("fr", when, when), SMS.visitMoved("en", when, when),
    SMS.owner.newBooking("Claire", when, "Longueuil"), SMS.owner.newSubscription("Claire", "VIP", when),
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
  assert.equal(await sendSms("514 555-0142", "essai"), false);
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
    assert.equal(await sendSms("514 555-0142", "NIVEX : essai"), true);
    assert.equal(calls[0].url, "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const body = new URLSearchParams(calls[0].init.body.toString());
    assert.equal(body.get("To"), "+15145550142");
    assert.equal(body.get("From"), "+14385550000");
    assert.equal(body.get("Body"), "NIVEX : essai");
    assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from("AC123:jeton").toString("base64")}`);

    /* Un refus de Twilio ne lève pas : il rend faux. */
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 21608, message: "unverified" }), { status: 400 });
    assert.equal(await sendSms("514 555-0142", "NIVEX : essai"), false);
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

await test("le texto de deux heures avant se programme chez Twilio par le service de messagerie, et s'annule", async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "jeton", TWILIO_FROM: "+14385550000" });
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ sid: "SM0123456789abcdef0123456789abcdef" }), { status: 201 });
  };
  try {
    /* Sans service de messagerie, rien n'est programmé, et Twilio n'est pas appelé. */
    assert.equal(smsScheduleConfigured(), false);
    assert.deepEqual(await scheduleSms("514 555-0142", "NIVEX - essai", t14), { sid: null, retry: true });
    assert.equal(calls.length, 0);

    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG1";
    const r = await scheduleSms("514 555-0142", "NIVEX - Je serai chez vous à 14 h. Styve", t14);
    assert.deepEqual(r, { sid: "SM0123456789abcdef0123456789abcdef", retry: false });
    const body = new URLSearchParams(calls[0].init.body.toString());
    assert.equal(body.get("MessagingServiceSid"), "MG1");
    assert.equal(body.get("ScheduleType"), "fixed");
    assert.equal(body.get("SendAt"), t14.toISOString().replace(/\.\d{3}Z$/, "Z"));
    assert.equal(body.get("From"), null, "un envoi programmé part du service, pas du numéro");

    /* Un numéro étranger ne se réessaie pas ; un refus de Twilio, si. */
    assert.deepEqual(await scheduleSms("876 555 0123", "x", t14), { sid: null, retry: false });
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 35111 }), { status: 400 });
    assert.deepEqual(await scheduleSms("514 555-0142", "x", t14), { sid: null, retry: true });

    globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); };
    assert.equal(await cancelScheduledSms("SM0123456789abcdef0123456789abcdef"), true);
    const last = calls[calls.length - 1];
    assert.match(last.url, /Messages\/SM0123456789abcdef0123456789abcdef\.json$/);
    assert.equal(new URLSearchParams(last.init.body.toString()).get("Status"), "canceled");
    assert.equal(await cancelScheduledSms("../../autre"), false, "un identifiant douteux ne part pas dans l'adresse");
  } finally {
    globalThis.fetch = real;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
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
  const x = twimlForward("+15145550142", "Bonjour <b> & \"merci\"");
  assert.equal(x, '<?xml version="1.0" encoding="UTF-8"?><Response><Message to="+15145550142">Bonjour &lt;b&gt; &amp; &quot;merci&quot;</Message></Response>');
  /* Avec une réponse au client : un second message, sans destinataire, qui revient à l'expéditeur. */
  const y = twimlForward("+15145550142", "NIVEX : réponse", stopHint("ARRÊT"));
  assert.match(y, /<\/Message><Message>NIVEX : pour ne plus recevoir de textos, répondez STOP\.<\/Message><\/Response>$/);
});

console.log(`\n${n} réussis, 0 échoués\n`);

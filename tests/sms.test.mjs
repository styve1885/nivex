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
  twimlRingOwner, ringFor, passthroughRefused, twimlMissedMessage, missedCallAlert, answeredCallAlert, callMissed, callerNumber,
  MISSED_MESSAGE, RING_SECONDS,
  ACCEPT_SECONDS, callerKey, callerFromKey, spokenNumber, screenPrompt, twimlScreen, twimlAccept,
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

await test("les appels : l'instruction de sonnerie, l'annonce qui filtre, l'action qui dit le sort", () => {
  const xml = twimlRingOwner({
    owner: "+15145550199", callerId: "+14503676231",
    screen: "https://www.nivexrepassage.ca/api/voice/screen/15145550123",
    action: "https://www.nivexrepassage.ca/api/voice/missed",
  });
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Dial /);
  assert.match(xml, new RegExp(`timeout="${RING_SECONDS}"`));
  assert.match(xml, /answerOnBridge="true"/, "le filtre l'exige : l'appelant entend sonner pendant l'annonce");
  assert.match(xml, /callerId="\+14503676231"/);
  assert.match(xml, /action="https:\/\/www\.nivexrepassage\.ca\/api\/voice\/missed" method="POST"/);
  assert.match(xml, /<Number url="https:\/\/www\.nivexrepassage\.ca\/api\/voice\/screen\/15145550123" method="POST">\+15145550199<\/Number><\/Dial><\/Response>$/);
  /* Rien ne s'injecte dans l'instruction. */
  assert.ok(!twimlRingOwner({ owner: "<x>", callerId: "\"y", screen: "s", action: "a&b" }).includes("<x>"));
  /* Manqué : tout ce qui n'a pas relié l'appelant à l'artisan, boîte vocale écartée comprise. */
  assert.equal(callMissed("completed", "true"), false);
  assert.equal(callMissed("completed", undefined), false, "sans DialBridged, un appel abouti compte comme répondu");
  assert.equal(callMissed("completed", "false"), true, "une boîte vocale a décroché, personne n'a appuyé");
  for (const st of ["no-answer", "busy", "failed", "canceled", undefined, null, ""]) assert.equal(callMissed(st), true, String(st));
});

await test("le cellulaire affiche le numéro du client ; un numéro masqué sonne sous celui de la maison", () => {
  /* Depuis le 9 novembre 2026 : sans callerId, Twilio garde le numéro de
     l'appelant, et c'est lui que le cellulaire affiche. */
  const base = { owner: "+15145550199", house: "+14503676231", origin: "https://www.nivexrepassage.ca" };
  const client = ringFor({ ...base, from: "+15145550123", passthrough: true });
  assert.ok(!client.includes("callerId"), "aucun callerId : Twilio garde celui du client");
  assert.match(client, /action="https:\/\/www\.nivexrepassage\.ca\/api\/voice\/missed\?via=client"/);
  assert.match(client, /<Number url="https:\/\/www\.nivexrepassage\.ca\/api\/voice\/screen\/15145550123"/);
  assert.match(client, /answerOnBridge="true"/);
  /* Masqué (RESTRICTED, en chiffres de clavier) : le numéro de la maison, et pas de nouvel essai. */
  const hidden = ringFor({ ...base, from: "+7378742833", passthrough: true });
  assert.match(hidden, /callerId="\+14503676231"/);
  assert.match(hidden, /action="https:\/\/www\.nivexrepassage\.ca\/api\/voice\/missed" /);
  assert.match(hidden, /\/api\/voice\/screen\/masque"/);
  /* Le nouvel essai, après un refus : sous le numéro de la maison, sans ?via, donc une seule fois. */
  const retry = ringFor({ ...base, from: "+15145550123", passthrough: false });
  assert.match(retry, /callerId="\+14503676231"/);
  assert.ok(!retry.includes("via=client"));
  assert.match(retry, /\/api\/voice\/screen\/15145550123"/, "l'annonce dit toujours qui appelle");
  /* Seul l'échec sous le numéro du client relance : « occupé », c'est aussi l'artisan qui refuse. */
  assert.equal(passthroughRefused("failed", "client"), true);
  for (const st of ["busy", "no-answer", "completed", "canceled", null]) assert.equal(passthroughRefused(st, "client"), false, String(st));
  assert.equal(passthroughRefused("failed", null), false, "déjà sous le numéro de la maison : pas de troisième sonnerie");
});

await test("l'annonce dit qui appelle, chiffre par chiffre, et attend une touche ; une boîte vocale n'en tape aucune", () => {
  assert.equal(callerKey("+15145550123"), "15145550123");
  assert.equal(callerKey(null), "masque");
  assert.equal(callerFromKey("15145550123"), "+15145550123");
  for (const bad of ["masque", "", undefined, "1514555012", "25145550123", "15145550123x", "../admin"]) {
    assert.equal(callerFromKey(bad), null, String(bad));
  }
  assert.equal(spokenNumber("+15145550123"), "5 1 4, 5 5 5, 0 1 2 3");
  assert.equal(screenPrompt({ from: "+15145550123", name: "Marie Tremblay" }),
    "Appel NIVEX de Marie Tremblay, 5 1 4, 5 5 5, 0 1 2 3. Appuyez sur une touche pour répondre.");
  assert.equal(screenPrompt({ from: "+15145550123", name: null }),
    "Appel NIVEX du 5 1 4, 5 5 5, 0 1 2 3. Appuyez sur une touche pour répondre.");
  assert.equal(screenPrompt({ from: null, name: null }),
    "Appel NIVEX d'un numéro masqué. Appuyez sur une touche pour répondre.");
  const xml = twimlScreen({ prompt: "Appel NIVEX <test>", accept: "https://www.nivexrepassage.ca/api/voice/accept" });
  assert.match(xml, new RegExp(`<Gather numDigits="1" timeout="${ACCEPT_SECONDS}" action="https://www\\.nivexrepassage\\.ca/api/voice/accept" method="POST">`));
  assert.match(xml, /<Say language="fr-CA" voice="Polly\.Chantal">Appel NIVEX &lt;test&gt;<\/Say><\/Gather><Hangup\/><\/Response>$/,
    "sans touche, on raccroche du côté du cellulaire");
  assert.equal(twimlAccept("1"), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>', "une touche : on relie");
  assert.equal(twimlAccept("#"), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  for (const none of ["", undefined, null, " "]) assert.match(twimlAccept(none), /<Hangup\/>/, String(none));
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

await test("après un appel répondu, l'artisan reçoit le numéro du client, l'heure du début et la durée", () => {
  /* Son téléphone n'a montré que le numéro de la maison, « Nivex Clients » :
     le texto lui donne de quoi rappeler ou réserver (9 novembre 2026). */
  const start = fromWall({ year: 2026, month: 11, day: 9, hour: 10, minute: 57 }, TZ);
  assert.equal(answeredCallAlert({ from: "+15145550123", name: "Marie Tremblay", at: start, tz: TZ, seconds: 371 }),
    "NIVEX : appel de Marie Tremblay (514 555-0123), à 10 h 57, 6 min.");
  assert.equal(answeredCallAlert({ from: "+15145550123", name: null, at: start, tz: TZ, seconds: 371 }),
    "NIVEX : appel du 514 555-0123, à 10 h 57, 6 min.");
  assert.equal(answeredCallAlert({ from: "+15145550123", name: null, at: start, tz: TZ, seconds: 25 }),
    "NIVEX : appel du 514 555-0123, à 10 h 57.", "sous une demi-minute, la durée ne se dit pas");
  assert.equal(answeredCallAlert({ from: "+15145550123", name: "Françoise Côté", at: start, tz: TZ }),
    "NIVEX : appel de Francoise Coté (514 555-0123), à 10 h 57.");
  const t = answeredCallAlert({ from: "+15145550123", name: "Marie Tremblay", at: start, tz: TZ, seconds: 3600 });
  assert.ok(!t.includes("!") && !t.includes("—") && t.length <= 160, "un seul texto, sans tiret cadratin");
  /* Un appel relié n'est pas manqué : c'est ce texto-là qui part, pas l'alerte. */
  assert.equal(callMissed("completed", "true"), false);
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


/* ============================ L'onglet Messages : les textos ============================ */

const { smsSegments, ADMIN_TEXT_MAX } = await import("../src/lib/phone.ts");
const {
  groupConversations, textFrom, threadFrom, optedOut, deliveryProblem, excerpt, listTwilioMessages, loadConversation,
  sendText, fetchMedia, readFailure, TwilioReadError, CONVERSATION_MAX,
} = await import("../src/lib/conversations.ts");

console.log("\nL'onglet Messages : les textos\n");

await test("la longueur d'un texto se compte comme Twilio la facture", () => {
  assert.deepEqual(smsSegments(""), { unicode: false, length: 0, segments: 0 });
  assert.deepEqual(smsSegments("Bonjour Marie, à demain."), { unicode: false, length: 24, segments: 1 });
  assert.equal(smsSegments("a".repeat(160)).segments, 1);
  assert.equal(smsSegments("a".repeat(161)).segments, 2, "153 signes par tranche au-delà de 160");
  assert.equal(smsSegments("a".repeat(306)).segments, 2);
  assert.equal(smsSegments("a".repeat(307)).segments, 3);
  assert.equal(smsSegments("€".repeat(80)).length, 160, "la table d'extension compte double");
  assert.equal(smsSegments("€".repeat(81)).segments, 2);
  assert.equal(smsSegments("Ça marche").unicode, false, "le Ç majuscule est de l'alphabet");
  assert.equal(smsSegments("ça marche").unicode, true, "le ç minuscule n'en est pas");
  const tete = smsSegments("Je m'arrête là");
  assert.equal(tete.unicode, true);
  assert.equal(tete.segments, 1);
  assert.equal(smsSegments("ê" + "a".repeat(69)).segments, 1, "70 signes en Unicode");
  assert.equal(smsSegments("ê" + "a".repeat(70)).segments, 2, "puis 67 par tranche");
  assert.equal(smsSegments("ê" + "a".repeat(133)).segments, 2);
  assert.equal(smsSegments("ê" + "a".repeat(134)).segments, 3);
  assert.equal(smsSegments("👍").length, 2, "un émoji vaut deux unités");
  assert.ok(ADMIN_TEXT_MAX >= 300 && ADMIN_TEXT_MAX <= 1600);
});

const MARIE = "+15145550123", PAUL = "+14505550177", NY = "+12125550100", OWNER = "+15145550199";
const at = (h, m = 0) => `Mon, 09 Nov 2026 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00 +0000`;
const msg = (o) => ({ status: "delivered", num_media: "0", error_code: null, date_created: o.date_sent ?? null, ...o });
const sid = (k) => `SM${String(k).padStart(32, "0")}`;

await test("les conversations : la plus récente d'abord, « à répondre » quand le client a écrit le dernier", () => {
  const raw = [
    msg({ sid: sid(1), direction: "outbound-api", to: MARIE, from: PHONE, body: "NIVEX - Votre séance est confirmée", date_sent: at(14) }),
    msg({ sid: sid(2), direction: "inbound", from: MARIE, to: PHONE, body: "Merci, à jeudi", status: "received", date_sent: at(15) }),
    msg({ sid: sid(3), direction: "outbound-reply", to: OWNER, from: PHONE, body: "NIVEX : réponse de Marie", date_sent: at(15, 1) }),
    msg({ sid: sid(4), direction: "outbound-api", to: PAUL, from: PHONE, body: "NIVEX - Rappel", date_sent: at(16) }),
    msg({ sid: sid(5), direction: "outbound-api", to: PAUL, from: null, body: "Je serai chez vous", status: "canceled", date_sent: null, date_created: at(17) }),
    msg({ sid: sid(6), direction: "inbound", from: NY, to: PHONE, body: "STOP", status: "received", date_sent: at(13) }),
    msg({ sid: sid(7), direction: "outbound-api", to: "whatsapp:+15145550000", body: "?", date_sent: at(18) }),
  ];
  const names = new Map([["5145550123", "Marie Tremblay"]]);
  const list = groupConversations(raw, { exclude: [OWNER, PHONE], names });
  assert.deepEqual(list.map((c) => c.number), [PAUL, MARIE, NY], "les avis à l'artisan n'en sont pas ; un texto décommandé ne compte pas");
  const marie = list.find((c) => c.number === MARIE);
  assert.equal(marie.name, "Marie Tremblay");
  assert.equal(marie.awaiting, true);
  assert.equal(marie.direction, "in");
  assert.equal(marie.excerpt, "Merci, à jeudi");
  const paul = list.find((c) => c.number === PAUL);
  assert.equal(paul.awaiting, false);
  assert.equal(paul.excerpt, "NIVEX - Rappel", "le texto décommandé n'est jamais parti");
  const ny = list.find((c) => c.number === NY);
  assert.equal(ny.awaiting, false, "un STOP n'attend pas de réponse");
  assert.equal(ny.canText, false, "New York : on n'y écrit pas");
  assert.equal(marie.canText, true);
});

await test("un texto se lit dans l'ordre, avec ce qu'il est devenu", () => {
  const failed = textFrom(msg({ sid: sid(8), direction: "outbound-api", to: MARIE, body: "x", status: "undelivered", error_code: 30006, date_sent: at(9) }));
  assert.equal(failed.direction, "out");
  assert.equal(failed.problem, "ligne fixe, ou numéro qui ne reçoit pas de textos");
  assert.equal(failed.at, "2026-11-09T09:00:00.000Z");
  const queued = textFrom(msg({ sid: sid(9), direction: "outbound-api", to: MARIE, body: "x", status: "scheduled", date_sent: null, date_created: at(10) }));
  assert.equal(queued.at, "2026-11-09T10:00:00.000Z", "pas encore parti : l'heure de création");
  assert.equal(queued.problem, null);
  assert.equal(textFrom(msg({ sid: sid(10), direction: "inbound", from: MARIE, body: "", num_media: "2", date_sent: at(11) })).numMedia, 2);
  assert.equal(deliveryProblem(21610), "le client a répondu STOP : Twilio ne lui écrit plus tant qu'il n'a pas répondu START");
  assert.equal(deliveryProblem(12345), "refusé par Twilio (code 12345)");
  assert.equal(deliveryProblem(null), "non remis");
  assert.equal(excerpt({ body: "", numMedia: 1 }), "Une pièce jointe");
  assert.equal(excerpt({ body: "  Bonjour\n\n  Marie ", numMedia: 0 }), "Bonjour Marie");
  assert.equal(excerpt({ body: "x".repeat(200), numMedia: 0 }).length, 140);

  const thread = threadFrom([
    msg({ sid: sid(12), direction: "inbound", from: MARIE, body: "deux", date_sent: at(12) }),
    msg({ sid: sid(11), direction: "outbound-api", to: MARIE, body: "un", date_sent: at(11) }),
    msg({ sid: sid(11), direction: "outbound-api", to: MARIE, body: "un", date_sent: at(11) }),
    msg({ sid: sid(13), direction: "outbound-api", to: MARIE, body: "jamais parti", status: "canceled", date_sent: null, date_created: at(13) }),
  ]);
  assert.deepEqual(thread.map((t) => t.body), ["un", "deux"], "dans l'ordre, sans doublon, sans le décommandé");
  const long = threadFrom(Array.from({ length: CONVERSATION_MAX + 5 }, (_, k) =>
    msg({ sid: sid(100 + k), direction: "inbound", from: MARIE, body: String(k), date_sent: new Date(Date.UTC(2026, 10, 1, 0, k)).toUTCString() })));
  assert.equal(long.length, CONVERSATION_MAX);
  assert.equal(long.at(-1).body, String(CONVERSATION_MAX + 4), "les plus récents");
});

await test("un client qui a répondu STOP n'est plus joignable, jusqu'à son START", () => {
  const t = (body, direction = "in") => ({ direction, body });
  assert.equal(optedOut([t("Bonjour"), t("STOP")]), true);
  assert.equal(optedOut([t("stop"), t("Start")]), false);
  assert.equal(optedOut([t("STOP"), t("STOP", "out")]), true, "seuls ses messages à lui comptent");
  assert.equal(optedOut([t("Stop, je vous rappelle")]), false, "un mot seul, comme chez Twilio");
});

/* Un Twilio simulé : la liste des messages, les pièces jointes, l'envoi. */
function fakeTwilio(o = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const u = new URL(url);
    if (o.fail) return new Response(JSON.stringify({ code: 20003, message: "Authenticate" }), { status: o.fail });
    if (u.hostname === "media.example.com") {
      return new Response("image", { status: 200, headers: { "content-type": o.mediaType ?? "image/png" } });
    }
    if (/\/Messages\/MM[0-9a-f]{32}\/Media\/ME[0-9a-f]{32}$/.test(u.pathname)) {
      return new Response(null, { status: 307, headers: { location: "https://media.example.com/photo" } });
    }
    if (/\/Messages\/(MM[0-9a-f]{32})\/Media\.json$/.test(u.pathname)) {
      return Response.json({ media_list: [
        { sid: `ME${"a".repeat(32)}`, content_type: "image/jpeg" },
        { sid: `ME${"b".repeat(32)}`, content_type: "image/svg+xml" },
      ] });
    }
    if (u.pathname.endsWith("/Messages.json") && (init.method ?? "GET") === "GET") {
      const to = u.searchParams.get("To"), from = u.searchParams.get("From");
      const page = Number(u.searchParams.get("Page") ?? 0);
      const all = (o.messages ?? []).filter((m) => (!to || m.to === to) && (!from || m.from === from));
      const next = page === 0 && o.paged ? `${u.pathname}?Page=1&PageSize=1&PageToken=PA1${to ? `&To=${encodeURIComponent(to)}` : ""}` : null;
      return Response.json({ messages: o.paged ? all.slice(page, page + 1) : all, next_page_uri: next });
    }
    if (u.pathname.endsWith("/Messages.json") && init.method === "POST") {
      if (o.refuse) return new Response(JSON.stringify({ code: o.refuse, message: "Refusé +15145550123" }), { status: 400 });
      const b = new URLSearchParams(String(init.body));
      return Response.json({ sid: sid(999), status: "queued", to: b.get("To"), from: b.get("From"), body: b.get("Body"), date_created: at(20), date_sent: null, num_media: "0" }, { status: 201 });
    }
    return new Response("inconnu", { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

await test("une conversation se lit chez Twilio : envoyés et reçus, photos comprises, rien n'est gardé", async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "jeton", TWILIO_FROM: "+14385550000" });
  const photo = `MM${"c".repeat(32)}`;
  const tw = fakeTwilio({ messages: [
    msg({ sid: sid(1), direction: "outbound-api", to: MARIE, from: "+14385550000", body: "Bonjour Marie", date_sent: at(14) }),
    msg({ sid: photo, direction: "inbound", from: MARIE, to: "+14385550000", body: "Voici la tache", num_media: "2", status: "received", date_sent: at(15) }),
    msg({ sid: sid(3), direction: "inbound", from: PAUL, to: "+14385550000", body: "Autre client", status: "received", date_sent: at(16) }),
  ] });
  try {
    const c = await loadConversation(MARIE);
    assert.deepEqual(c.messages.map((t) => t.body), ["Bonjour Marie", "Voici la tache"]);
    assert.equal(c.canText, true);
    assert.equal(c.optedOut, false);
    assert.equal(c.truncated, false);
    assert.deepEqual(c.messages[1].media.map((m) => m.inline), [true, false], "une image ordinaire s'affiche ; un SVG se télécharge");
    const lists = tw.calls.filter((x) => x.url.includes("Messages.json?"));
    assert.equal(lists.length, 2, "une liste par sens");
    assert.ok(lists.some((x) => x.url.includes("To=%2B15145550123")) && lists.some((x) => x.url.includes("From=%2B15145550123")));
    assert.ok(lists.every((x) => x.init.headers.authorization === `Basic ${Buffer.from("AC123:jeton").toString("base64")}`));
  } finally {
    tw.restore();
  }

  /* Les pages suivent, jusqu'à la limite demandée. */
  const paged = fakeTwilio({ paged: true, messages: [
    msg({ sid: sid(1), direction: "outbound-api", to: MARIE, body: "a", date_sent: at(14) }),
    msg({ sid: sid(2), direction: "outbound-api", to: MARIE, body: "b", date_sent: at(13) }),
  ] });
  try {
    const one = await listTwilioMessages({ To: MARIE }, { pages: 1 });
    assert.equal(one.messages.length, 1);
    assert.equal(one.more, true);
    const two = await listTwilioMessages({ To: MARIE }, { pages: 2 });
    assert.equal(two.messages.length, 2);
  } finally {
    paged.restore();
  }

  /* Une clé refusée se dit sans rien montrer de la clé. */
  const denied = fakeTwilio({ fail: 401 });
  try {
    const e = await loadConversation(MARIE).catch((x) => x);
    assert.ok(e instanceof TwilioReadError);
    assert.match(readFailure(e), /TWILIO_AUTH_TOKEN chez Vercel/);
    assert.ok(!readFailure(e).includes("jeton"));
  } finally {
    denied.restore();
  }
});

await test("l'artisan écrit depuis l'onglet : le texto part du numéro de la maison, les refus disent pourquoi", async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "jeton", TWILIO_FROM: "+14385550000" });
  let tw = fakeTwilio();
  try {
    const ok = await sendText({ to: "514 555-0123", body: "  Bonjour Marie, je serai là à 18 h.\nStyve  " });
    assert.equal(ok.ok, true);
    assert.equal(ok.message.direction, "out");
    assert.equal(ok.message.status, "queued");
    assert.equal(ok.message.body, "Bonjour Marie, je serai là à 18 h.\nStyve");
    const sent = new URLSearchParams(String(tw.calls[0].init.body));
    assert.equal(sent.get("To"), "+15145550123");
    assert.equal(sent.get("From"), "+14385550000", "le numéro de la maison");
    assert.equal(sent.get("Body"), "Bonjour Marie, je serai là à 18 h.\nStyve");

    tw.calls.length = 0;
    for (const [to, body, why] of [
      ["212 555 0100", "Bonjour", /canadiens/],
      ["555-0123", "Bonjour", /dix chiffres/],
      ["514 555-0123", "   ", /vide/],
      ["514 555-0123", "x".repeat(ADMIN_TEXT_MAX + 1), new RegExp(String(ADMIN_TEXT_MAX))],
    ]) {
      const r = await sendText({ to, body });
      assert.equal(r.ok, false);
      assert.match(r.reason, why);
    }
    assert.equal(tw.calls.length, 0, "aucun refus évident ne va jusqu'à Twilio");
  } finally {
    tw.restore();
  }

  tw = fakeTwilio({ refuse: 21610 });
  try {
    const stop = await sendText({ to: "514 555-0123", body: "Bonjour" });
    assert.equal(stop.ok, false);
    assert.match(stop.reason, /répondu STOP/);
    assert.ok(!stop.reason.includes("555"), "le message de Twilio, qui cite le numéro, ne remonte pas");
  } finally {
    tw.restore();
  }

  delete process.env.TWILIO_FROM;
  const off = await sendText({ to: "514 555-0123", body: "Bonjour" });
  assert.equal(off.ok, false);
  assert.equal(off.status, 503);
  delete process.env.TWILIO_ACCOUNT_SID;
});

await test("une photo jointe se lit chez Twilio, renvoi suivi sans la clé ; seules les images ordinaires s'affichent", async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "jeton", TWILIO_FROM: "+14385550000" });
  const MM = `MM${"c".repeat(32)}`, ME = `ME${"a".repeat(32)}`;
  let tw = fakeTwilio();
  try {
    const r = await fetchMedia(MM, ME);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("content-disposition"), "inline");
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.equal(tw.calls.length, 2);
    assert.ok(tw.calls[0].init.headers.authorization, "Twilio demande la clé");
    assert.equal(tw.calls[1].url, "https://media.example.com/photo");
    assert.equal(tw.calls[1].init.headers, undefined, "le stockage ne reçoit jamais la clé");
    for (const [m, e] of [["MM../x", ME], [MM, "../../Messages.json"], ["", ""]]) {
      assert.equal((await fetchMedia(m, e)).status, 404);
    }
  } finally {
    tw.restore();
  }
  tw = fakeTwilio({ mediaType: "image/svg+xml" });
  try {
    const svg = await fetchMedia(MM, ME);
    assert.equal(svg.headers.get("content-type"), "application/octet-stream");
    assert.match(svg.headers.get("content-disposition"), /^attachment/);
  } finally {
    tw.restore();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_FROM;
  }
});

console.log(`\n${n} réussis, 0 échoués\n`);

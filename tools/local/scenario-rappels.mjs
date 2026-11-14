/**
 * Les rappels de séance, rejoués par le vrai code, sur la base locale, avec
 * Google et Twilio simulés (tests/tools/fake-google.mjs) : aucun courriel ni
 * texto ne sort du conteneur.
 *
 *   node tools/local/neon-relay.mjs &
 *   bash -c 'source tools/local/env.sh && npx tsx tools/local/scenario-rappels.mjs'
 *
 * Un faux client à la séance (Paul) et une fausse abonnée VIP (Sophie).
 * Depuis le 14 novembre 2026, plus aucun texto de deux heures avant : Paul
 * reçoit sa confirmation et son rappel de la veille, rien d'autre. Sophie
 * (11 novembre 2026) reçoit sa confirmation d'abonnement, puis plus rien
 * avant ses visites ; un message quand une visite est déplacée ou annulée.
 * Les textos de deux heures avant que l'ancienne version avait programmés,
 * pour l'un comme pour l'autre, sont tous retirés chez Twilio. L'interrupteur
 * « Rappels de séance » rallume le rappel de la veille de Sophie, puis le
 * coupe. L'essai du rappel de l'onglet Connexion ne part que vers l'artisan.
 * Les avis de l'artisan ne changent pas. Le scénario efface ce qu'il a écrit
 * en base.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { fakeGoogle } = await import("../../tests/tools/fake-google.mjs");
const { sql, ensureSchema } = await import("../../src/lib/db.ts");
const { encrypt } = await import("../../src/lib/crypto.ts");
const { fromWall, dateKey, addDaysToKey, weekdayOfKey } = await import("../../src/lib/time.ts");
const { REQUEST_INBOX } = await import("../../src/lib/brand.ts");
const { createBooking, findById, queuedSoonTexts, setBookingReminders, withdrawQueuedReminders } = await import("../../src/lib/bookings.ts");
const { sendReminderTrial } = await import("../../src/lib/reminder-trial.ts");
const { getSettingsStrict } = await import("../../src/lib/settings.ts");
const {
  cancelVisit, createOwnerSubscription, deleteSubscription, findSubscription, moveVisit, runDaily, setSubscriptionReminders,
} = await import("../../src/lib/subscriptions.ts");

const TZ = "America/Toronto";
const HOST = "localhost:3000";
const OWNER = "+15145550199";
const PAUL = { name: "Paul Essai", email: "paul.essai@example.com", phone: "514 555-0177", e164: "+15145550177" };
const SOPHIE = { name: "Sophie Abonnée", email: "sophie.abonnee@example.com", phone: "514 555-0142", e164: "+15145550142" };

/* Les textos d'artisan partent vers un faux cellulaire. Le service de
   messagerie, qui servait à programmer le texto de deux heures avant, est
   posé exprès : même avec lui, plus rien ne se programme. */
process.env.SMS_OWNER_TO = OWNER;
process.env.TWILIO_MESSAGING_SERVICE_SID = `MG${"0".repeat(32)}`;

/* Twilio simulé : un envoi, une programmation (SendAt), un retrait. */
const texts = [];
const g = fakeGoogle({ tz: TZ });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
g.route(/^https:\/\/api\.twilio\.com\//, (url, init) => {
  const form = new URLSearchParams(String(init?.body ?? ""));
  const cancel = /\/Messages\/(SM[0-9a-f]{32})\.json$/.exec(url);
  if (cancel) {
    texts.push({ kind: "retrait", sid: cancel[1] });
    return json(200, { sid: cancel[1], status: "canceled" });
  }
  const sid = `SM${randomBytes(16).toString("hex")}`;
  const kind = form.get("SendAt") ? "programmé" : "envoyé";
  texts.push({ kind, to: form.get("To"), body: form.get("Body"), sid });
  return json(201, { sid, status: kind === "programmé" ? "scheduled" : "queued" });
});
g.install();

/* Les courriels partis par le faux Gmail : destinataire et objet, en clair. */
const decode = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
const mails = () => g.mails.map((raw) => ({
  to: (/^To: (?:.*<)?([^<>\s]+@[^<>\s]+)>?$/m.exec(raw) ?? [])[1] ?? "?",
  subject: decode((/^Subject: (.*)$/m.exec(raw) ?? [])[1] ?? ""),
}));
let mailMark = 0, textMark = 0;
/* Ce qui est parti depuis le dernier appel. */
const sent = () => {
  const m = mails().slice(mailMark), t = texts.slice(textMark);
  mailMark = g.mails.length;
  textMark = texts.length;
  return { mails: m, texts: t };
};
const to = (list, who) => list.filter((x) => x.to === who);

/* Les dates : le premier jeudi à deux jours au moins (le délai de 24 h), et
   le vendredi qui suit. La tâche du matin est jouée le jeudi à 8 h. */
const today = dateKey(new Date(), TZ);
let THU = addDaysToKey(today, 2);
while (weekdayOfKey(THU) !== 4) THU = addDaysToKey(THU, 1);
const FRI = addDaysToKey(THU, 1);
const at = (key, h, m = 0) => fromWall({ ...Object.fromEntries(key.split("-").map((x, i) => [["year", "month", "day"][i], Number(x)])), hour: h, minute: m }, TZ);
const MORNING = at(THU, 8);

let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const journal = [];
const note = (who, what) => journal.push(`${who.padEnd(7)} ${what}`);

await ensureSchema();
await sql()`INSERT INTO nivex_settings (id) VALUES (1) ON CONFLICT DO NOTHING`;
await sql()`UPDATE nivex_settings SET refresh_token = ${encrypt("jeton-essai")}, owner_email = 'artisan@example.com',
  calendar_id = 'primary', paused = false WHERE id = 1`;

console.log(`\nLes rappels de séance, par le vrai code (jeudi ${THU})\n`);

let paulId = null;
let subId = null;
try {
  await step("Paul réserve une séance à la carte : confirmation par courriel et texto, l'artisan est prévenu, rien n'est programmé", async () => {
    const b = await createBooking({
      locale: "fr", units: [], name: PAUL.name, email: PAUL.email, phone: PAUL.phone,
      address: "8 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
      startsAt: at(THU, 18).toISOString(), consent: true,
    }, HOST);
    paulId = b.id;
    assert.equal(b.reminders, true, "une séance à la carte garde son rappel de la veille");
    const s = sent();
    assert.equal(to(s.mails, PAUL.email).length, 1, "confirmation au client");
    assert.equal(to(s.mails, REQUEST_INBOX).length, 1, "fiche à l'artisan");
    assert.deepEqual(to(s.texts, PAUL.e164).map((t) => t.kind), ["envoyé"], "le texto de confirmation, et lui seul");
    assert.equal(to(s.texts, OWNER).length, 1, "texto à l'artisan");
    assert.equal(s.texts.filter((t) => t.kind === "programmé").length, 0, "aucun texto de deux heures avant");
    assert.equal((await findById(paulId)).smsSoonAt, null);
    note("Paul", "réservation : confirmation (courriel + texto) ; artisan prévenu (courriel + texto)");
  });

  await step("Sophie prend un abonnement VIP : sa confirmation, une fois, ses rappels coupés, rien de programmé", async () => {
    const full = await createOwnerSubscription({
      locale: "fr", planKey: "executif", name: SOPHIE.name, email: SOPHIE.email, phone: SOPHIE.phone,
      address: "12 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
      date: FRI, time: "13:00", startCycle: 1, startDone: 0, paidCurrent: false,
    }, HOST);
    subId = full.sub.id;
    assert.equal(full.sub.reminders, false, "coupés par défaut pour un abonné");
    const s = sent();
    assert.equal(to(s.mails, SOPHIE.email).length, 1, "une seule confirmation, pas une par visite");
    assert.match(to(s.mails, SOPHIE.email)[0].subject, /abonnement .* est confirmé/i);
    assert.equal(to(s.texts, SOPHIE.e164).length, 1, "un seul texto de confirmation");
    assert.equal(to(s.mails, REQUEST_INBOX).length, 1, "la fiche de l'abonnement à l'artisan");
    assert.equal(s.texts.filter((t) => t.kind === "programmé").length, 0, "aucun texto de deux heures avant");
    note("Sophie", `abonnement : confirmation (courriel + texto), ${full.visits.length} visites posées, aucun message par visite`);
  });

  await step("les textos de deux heures avant laissés par l'ancienne version sont tous retirés, rappels actifs ou non", async () => {
    const first = (await findSubscription(subId)).visits[0];
    const sophieOld = `SM${randomBytes(16).toString("hex")}`;
    const paulOld = `SM${randomBytes(16).toString("hex")}`;
    /* Comme l'ancienne version les aurait laissés : Paul a ses rappels, Sophie non. */
    await sql()`UPDATE nivex_bookings SET sms_soon_at = ${at(FRI, 11).toISOString()}, sms_soon_sid = ${sophieOld} WHERE id = ${first.id}`;
    await sql()`UPDATE nivex_bookings SET sms_soon_at = ${at(THU, 16).toISOString()}, sms_soon_sid = ${paulOld} WHERE id = ${paulId}`;
    assert.deepEqual(await queuedSoonTexts(MORNING), { count: 2, next: at(THU, 16) }, "le décompte de l'onglet Connexion");
    const r = await withdrawQueuedReminders(MORNING);
    assert.deepEqual(r, { withdrawn: 2, failed: 0, remaining: 0 });
    const s = sent();
    assert.deepEqual(s.texts.map((t) => `${t.kind} ${t.sid}`).sort(), [`retrait ${paulOld}`, `retrait ${sophieOld}`].sort());
    assert.equal((await findById(first.id)).smsSoonSid, null);
    assert.equal((await findById(paulId)).smsSoonSid, null);
    assert.deepEqual(await queuedSoonTexts(MORNING), { count: 0, next: null });
    assert.deepEqual(await withdrawQueuedReminders(MORNING), { withdrawn: 0, failed: 0, remaining: 0 }, "un second passage ne trouve rien");
    note("Paul", "texto de deux heures avant laissé par l'ancienne version : retiré chez Twilio");
    note("Sophie", "texto de deux heures avant laissé par l'ancienne version : retiré chez Twilio");
  });

  await step("la tâche du matin : Paul a son rappel de la veille, et rien d'autre ; Sophie, rien", async () => {
    const d = await runDaily(HOST, MORNING);
    const s = sent();
    assert.equal(to(s.mails, PAUL.email).length, 1, "rappel par courriel à Paul");
    assert.match(to(s.mails, PAUL.email)[0].subject, /Rappel/);
    assert.deepEqual(to(s.texts, PAUL.e164).map((t) => t.kind), ["envoyé"], "le rappel par texto, sans texto de deux heures avant");
    /* La tâche passe le jeudi matin, la séance est le soir même : « aujourd'hui ». */
    assert.match(to(s.texts, PAUL.e164)[0].body, /^NIVEX - Rappel : aujourd'hui jeudi /);
    assert.equal(to(s.mails, SOPHIE.email).length, 0, "aucun rappel à Sophie");
    assert.equal(to(s.texts, SOPHIE.e164).length, 0, "aucun texto à Sophie");
    assert.equal(to(s.texts, OWNER).length + to(s.mails, REQUEST_INBOX).length, 0, "rien pour l'artisan ce matin-là");
    assert.equal(s.texts.filter((t) => t.kind === "programmé").length, 0);
    assert.equal(d.withdrawn, 0);
    assert.equal("soon" in d, false);
    note("Paul", "veille : rappel (courriel + texto), rien d'autre");
    note("Sophie", "veille : rien");
  });

  await step("« Rappels de séance » cochés pour Sophie : la tâche suivante lui envoie son rappel de la veille", async () => {
    assert.equal(await setSubscriptionReminders(subId, true), true);
    assert.equal(sent().texts.length, 0, "cocher n'envoie ni ne programme rien");
    const d = await runDaily(HOST, MORNING);
    const s = sent();
    assert.equal(to(s.mails, SOPHIE.email).length, 1, "rappel par courriel");
    assert.deepEqual(to(s.texts, SOPHIE.e164).map((t) => t.kind), ["envoyé"], "le rappel par texto, sans texto de deux heures avant");
    assert.equal(to(s.mails, PAUL.email).length + to(s.texts, PAUL.e164).length, 0, "Paul a déjà eu le sien");
    assert.equal(d.reminders, 1);
    note("Sophie", "rappels cochés : rappel de la veille (courriel + texto)");
  });

  await step("rappels décochés, pour Sophie puis pour Paul : rien ne part, rien n'est retiré", async () => {
    assert.equal(await setSubscriptionReminders(subId, false), false);
    const b = await setBookingReminders(paulId, false);
    assert.equal(b.reminders, false);
    assert.equal(sent().texts.length, 0);
    await sql()`UPDATE nivex_bookings SET reminder_sent_at = NULL, sms_reminded_at = NULL WHERE id = ${paulId}`;
    await runDaily(HOST, MORNING);
    const s = sent();
    assert.equal(to(s.texts, PAUL.e164).length + to(s.mails, PAUL.email).length, 0, "rappels coupés : Paul ne reçoit rien");
    await setBookingReminders(paulId, true);
    note("Paul", "rappels coupés à la main : rien ne part ; remis ensuite");
  });

  await step("l'artisan déplace une visite de Sophie : un message, courriel et texto ; un vieux texto programmé est retiré", async () => {
    const v = (await findSubscription(subId)).visits[1];
    const old = `SM${randomBytes(16).toString("hex")}`;
    await sql()`UPDATE nivex_bookings SET sms_soon_at = ${new Date(v.startsAt.getTime() - 2 * 3600_000).toISOString()}, sms_soon_sid = ${old} WHERE id = ${v.id}`;
    await moveVisit(await findById(v.id), at(addDaysToKey(FRI, 7), 15), "owner", HOST);
    const s = sent();
    assert.equal(to(s.mails, SOPHIE.email).length, 1);
    assert.equal(to(s.texts, SOPHIE.e164).filter((t) => t.kind === "envoyé").length, 1);
    assert.equal(s.texts.filter((t) => t.kind === "programmé").length, 0, "rien ne se reprogramme à la nouvelle heure");
    assert.deepEqual(s.texts.filter((t) => t.kind === "retrait").map((t) => t.sid), [old]);
    assert.equal((await findById(v.id)).smsSoonSid, null);
    assert.equal(to(s.mails, REQUEST_INBOX).length + to(s.texts, OWNER).length, 0, "l'artisan sait ce qu'il a fait");
    note("Sophie", "visite déplacée par l'artisan : un message (courriel + texto)");
  });

  await step("Sophie annule une visite elle-même : un message pour elle, et l'artisan est prévenu", async () => {
    const v = (await findSubscription(subId)).visits[2];
    await cancelVisit(await findById(v.id), "client", HOST);
    const s = sent();
    assert.equal(to(s.mails, SOPHIE.email).length, 1);
    assert.equal(to(s.texts, SOPHIE.e164).length, 1);
    assert.equal(to(s.mails, REQUEST_INBOX).length, 1, "courriel à l'artisan");
    assert.equal(to(s.texts, OWNER).length, 1, "texto à l'artisan");
    note("Sophie", "visite annulée par elle : un message (courriel + texto) ; artisan prévenu (courriel + texto)");
  });

  await step("l'essai du rappel de l'onglet Connexion part vers l'artisan seul, mot pour mot comme celui d'un client", async () => {
    const r = await sendReminderTrial(await getSettingsStrict(), "https://www.nivexrepassage.ca", MORNING);
    assert.equal(r.email.ok, true);
    assert.equal(r.sms.ok, true);
    const s = sent();
    assert.deepEqual(s.mails.map((m) => m.to), [REQUEST_INBOX], "le courriel, vers la boîte de la maison");
    assert.match(s.mails[0].subject, /^Rappel : votre séance NIVEX demain$/);
    assert.deepEqual(s.texts.map((t) => `${t.kind} ${t.to}`), [`envoyé ${OWNER}`], "le texto, vers le cellulaire de l'artisan");
    assert.match(s.texts[0].body, /^NIVEX - Rappel : demain .*, j'arrive à .*\. À demain\. Styve$/);
    note("Artisan", "essai du rappel : courriel à la boîte de la maison, texto à son cellulaire");
  });

  await step("personne d'autre n'a rien reçu : tous les destinataires sont fictifs", async () => {
    const all = mails().map((m) => m.to);
    const allowed = new Set([PAUL.email, SOPHIE.email, REQUEST_INBOX]);
    assert.ok(all.every((x) => allowed.has(x)), `courriels : ${[...new Set(all)].join(", ")}`);
    const numbers = texts.filter((t) => t.to).map((t) => t.to);
    assert.ok(numbers.every((x) => [PAUL.e164, SOPHIE.e164, OWNER].includes(x)), `textos : ${[...new Set(numbers)].join(", ")}`);
    assert.equal(texts.filter((t) => t.kind === "programmé").length, 0, "aucun texto programmé, de tout le scénario");
  });
} finally {
  if (subId) await deleteSubscription(subId).catch((e) => console.error("nettoyage :", e));
  if (paulId) await sql()`DELETE FROM nivex_bookings WHERE id = ${paulId}`;
  g.uninstall();
}

console.log("\nCe que chacun a reçu :\n");
for (const line of journal) console.log(`  ${line}`);
console.log(`\n${n} réussis, 0 échoués\n`);

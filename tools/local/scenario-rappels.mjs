/**
 * Les rappels de séance du 11 novembre 2026, rejoués par le vrai code, sur la
 * base locale, avec Google et Twilio simulés (tests/tools/fake-google.mjs) :
 * aucun courriel ni texto ne sort du conteneur.
 *
 *   node tools/local/neon-relay.mjs &
 *   bash -c 'source tools/local/env.sh && npx tsx tools/local/scenario-rappels.mjs'
 *
 * Un faux client à la séance (Paul) et une fausse abonnée VIP (Sophie). Paul
 * garde tout : confirmation, rappel de la veille, texto de deux heures avant.
 * Sophie reçoit sa confirmation d'abonnement, puis plus rien avant ses
 * visites ; un message quand une visite est déplacée ou annulée. Un texto de
 * deux heures avant programmé pour elle avant le changement est retiré chez
 * Twilio. L'interrupteur « Rappels de séance » rallume ses rappels, puis les
 * coupe. Les avis de l'artisan ne changent pas. Le scénario efface ce qu'il a
 * écrit en base.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { fakeGoogle } = await import("../../tests/tools/fake-google.mjs");
const { sql, ensureSchema } = await import("../../src/lib/db.ts");
const { encrypt } = await import("../../src/lib/crypto.ts");
const { fromWall, dateKey, addDaysToKey, weekdayOfKey } = await import("../../src/lib/time.ts");
const { REQUEST_INBOX } = await import("../../src/lib/brand.ts");
const { createBooking, findById, setBookingReminders, withdrawQueuedReminders } = await import("../../src/lib/bookings.ts");
const {
  cancelVisit, createOwnerSubscription, deleteSubscription, findSubscription, moveVisit, runDaily, setSubscriptionReminders,
} = await import("../../src/lib/subscriptions.ts");

const TZ = "America/Toronto";
const HOST = "localhost:3000";
const OWNER = "+15145550199";
const PAUL = { name: "Paul Essai", email: "paul.essai@example.com", phone: "514 555-0177", e164: "+15145550177" };
const SOPHIE = { name: "Sophie Abonnée", email: "sophie.abonnee@example.com", phone: "514 555-0142", e164: "+15145550142" };

/* Les textos d'artisan partent vers un faux cellulaire ; le texto de deux
   heures avant demande un service de messagerie, faux lui aussi. */
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
  await step("Paul réserve une séance à la carte : confirmation par courriel et texto, et l'artisan est prévenu", async () => {
    const b = await createBooking({
      locale: "fr", units: [], name: PAUL.name, email: PAUL.email, phone: PAUL.phone,
      address: "8 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
      startsAt: at(THU, 18).toISOString(), consent: true,
    }, HOST);
    paulId = b.id;
    assert.equal(b.reminders, true, "une séance à la carte garde ses rappels");
    const s = sent();
    assert.equal(to(s.mails, PAUL.email).length, 1, "confirmation au client");
    assert.equal(to(s.mails, REQUEST_INBOX).length, 1, "fiche à l'artisan");
    assert.equal(to(s.texts, PAUL.e164).filter((t) => t.kind === "envoyé").length, 1, "texto de confirmation");
    assert.equal(to(s.texts, OWNER).length, 1, "texto à l'artisan");
    note("Paul", "réservation : confirmation (courriel + texto) ; artisan prévenu (courriel + texto)");
  });

  await step("Sophie prend un abonnement VIP : sa confirmation, une fois, et ses rappels sont coupés", async () => {
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
    note("Sophie", `abonnement : confirmation (courriel + texto), ${full.visits.length} visites posées, aucun message par visite`);
  });

  await step("un texto de deux heures avant programmé pour Sophie avant le changement est retiré chez Twilio", async () => {
    const first = (await findSubscription(subId)).visits[0];
    const old = `SM${randomBytes(16).toString("hex")}`;
    const paulOld = `SM${randomBytes(16).toString("hex")}`;
    /* Comme l'ancienne version l'aurait laissé : programmé deux heures avant. */
    await sql()`UPDATE nivex_bookings SET sms_soon_at = ${at(FRI, 11).toISOString()}, sms_soon_sid = ${old} WHERE id = ${first.id}`;
    await sql()`UPDATE nivex_bookings SET sms_soon_at = ${at(THU, 16).toISOString()}, sms_soon_sid = ${paulOld} WHERE id = ${paulId}`;
    const r = await withdrawQueuedReminders(MORNING);
    assert.deepEqual(r, { withdrawn: 1, failed: 0, remaining: 0 });
    const s = sent();
    assert.deepEqual(s.texts.map((t) => `${t.kind} ${t.sid}`), [`retrait ${old}`], "seul celui de Sophie part en retrait");
    assert.equal((await findById(first.id)).smsSoonSid, null);
    assert.equal((await findById(paulId)).smsSoonSid, paulOld, "celui de Paul reste programmé");
    await sql()`UPDATE nivex_bookings SET sms_soon_at = NULL, sms_soon_sid = NULL WHERE id = ${paulId}`;
    note("Sophie", "texto de deux heures avant déjà programmé : retiré chez Twilio");
  });

  await step("la tâche du matin : Paul a son rappel et son texto de deux heures avant ; Sophie, rien", async () => {
    const d = await runDaily(HOST, MORNING);
    const s = sent();
    assert.equal(to(s.mails, PAUL.email).length, 1, "rappel par courriel à Paul");
    assert.match(to(s.mails, PAUL.email)[0].subject, /Rappel/);
    assert.deepEqual(to(s.texts, PAUL.e164).map((t) => t.kind).sort(), ["envoyé", "programmé"], "rappel et deux heures avant");
    assert.equal(to(s.mails, SOPHIE.email).length, 0, "aucun rappel à Sophie");
    assert.equal(to(s.texts, SOPHIE.e164).length, 0, "aucun texto à Sophie");
    assert.equal(to(s.texts, OWNER).length + to(s.mails, REQUEST_INBOX).length, 0, "rien pour l'artisan ce matin-là");
    assert.equal(d.withdrawn, 0);
    note("Paul", "veille : rappel (courriel + texto) ; texto de deux heures avant programmé");
    note("Sophie", "veille : rien");
  });

  await step("« Rappels de séance » cochés pour Sophie : la tâche suivante lui envoie son rappel", async () => {
    assert.equal(await setSubscriptionReminders(subId, true), true);
    const d = await runDaily(HOST, MORNING);
    const s = sent();
    assert.equal(to(s.mails, SOPHIE.email).length, 1, "rappel par courriel");
    assert.deepEqual(to(s.texts, SOPHIE.e164).map((t) => t.kind).sort(), ["envoyé", "programmé"], "rappel et deux heures avant");
    assert.equal(to(s.mails, PAUL.email).length + to(s.texts, PAUL.e164).length, 0, "Paul a déjà eu les siens");
    assert.equal(d.reminders, 1);
    note("Sophie", "rappels cochés : rappel (courriel + texto) et deux heures avant, comme avant");
  });

  await step("décochés : son texto de deux heures avant, déjà programmé, est retiré", async () => {
    const first = (await findSubscription(subId)).visits[0];
    const queued = (await findById(first.id)).smsSoonSid;
    assert.ok(queued);
    assert.equal(await setSubscriptionReminders(subId, false), false);
    const s = sent();
    assert.deepEqual(s.texts.map((t) => `${t.kind} ${t.sid}`), [`retrait ${queued}`]);
    assert.equal((await findById(first.id)).smsSoonSid, null);
    note("Sophie", "rappels décochés : texto de deux heures avant retiré");
  });

  await step("Paul, rappels coupés sur son rendez-vous : son texto est retiré, rien ne repart", async () => {
    const queued = (await findById(paulId)).smsSoonSid;
    assert.ok(queued);
    const b = await setBookingReminders(paulId, false, TZ);
    assert.equal(b.reminders, false);
    assert.deepEqual(sent().texts.map((t) => `${t.kind} ${t.sid}`), [`retrait ${queued}`]);
    await runDaily(HOST, MORNING);
    const s = sent();
    assert.equal(to(s.texts, PAUL.e164).length + to(s.mails, PAUL.email).length, 0);
    await setBookingReminders(paulId, true, TZ);
    note("Paul", "rappels coupés à la main : texto retiré ; remis ensuite");
  });

  await step("l'artisan déplace une visite de Sophie : un message, courriel et texto, sans texto de deux heures avant", async () => {
    const v = (await findSubscription(subId)).visits[1];
    await moveVisit(await findById(v.id), at(addDaysToKey(FRI, 7), 15), "owner", HOST);
    const s = sent();
    assert.equal(to(s.mails, SOPHIE.email).length, 1);
    assert.equal(to(s.texts, SOPHIE.e164).filter((t) => t.kind === "envoyé").length, 1);
    assert.equal(s.texts.filter((t) => t.kind === "programmé").length, 0);
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

  await step("personne d'autre n'a rien reçu : tous les destinataires sont fictifs", async () => {
    const all = mails().map((m) => m.to);
    const allowed = new Set([PAUL.email, SOPHIE.email, REQUEST_INBOX]);
    assert.ok(all.every((x) => allowed.has(x)), `courriels : ${[...new Set(all)].join(", ")}`);
    const numbers = texts.filter((t) => t.to).map((t) => t.to);
    assert.ok(numbers.every((x) => [PAUL.e164, SOPHIE.e164, OWNER].includes(x)), `textos : ${[...new Set(numbers)].join(", ")}`);
  });
} finally {
  if (subId) await deleteSubscription(subId).catch((e) => console.error("nettoyage :", e));
  if (paulId) await sql()`DELETE FROM nivex_bookings WHERE id = ${paulId}`;
  g.uninstall();
}

console.log("\nCe que chacun a reçu :\n");
for (const line of journal) console.log(`  ${line}`);
console.log(`\n${n} réussis, 0 échoués\n`);

/**
 * « Avertir le client » et « Envoyer la confirmation au client », rejoués par
 * le vrai code sur la base locale, avec Google et Twilio simulés
 * (tests/tools/fake-google.mjs) : aucun courriel ni texto ne sort du
 * conteneur.
 *
 *   node tools/local/neon-relay.mjs &
 *   bash -c 'source tools/local/env.sh && npx tsx tools/local/scenario-avertir.mjs'
 *
 * Une fausse abonnée (Claire, client.essai@example.com) : l'artisan entre son
 * abonnement, case cochée, et elle reçoit sa confirmation. Il déplace ensuite
 * sa première visite trois fois, case décochée : elle ne reçoit rien, ni
 * courriel ni texto ; l'artisan reçoit un avis à chaque fois. Puis
 * « Envoyer la confirmation au client » : un seul courriel, avec l'ancienne
 * heure barrée et l'heure finale. Suivent l'annulation sans avertir (et son
 * remplacement), une page restée ouverte d'avant la case (le client est
 * averti, comme avant), un déplacement fait par l'abonnée elle-même, et une
 * séance à la carte réservée sur le site puis annulée sans avertir. Le
 * scénario efface ce qu'il a écrit en base.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { fakeGoogle } = await import("../../tests/tools/fake-google.mjs");
const { sql, ensureSchema } = await import("../../src/lib/db.ts");
const { encrypt } = await import("../../src/lib/crypto.ts");
const { fromWall, dateKey, addDaysToKey, weekdayOfKey, formatDateTime } = await import("../../src/lib/time.ts");
const { REQUEST_INBOX } = await import("../../src/lib/brand.ts");
const { cancelBooking, clientBehind, createBooking, findById, sendClientConfirmation } = await import("../../src/lib/bookings.ts");
const {
  cancelVisit, createOwnerSubscription, deleteSubscription, findSubscription, moveVisit, sendSubscriptionUpdate,
} = await import("../../src/lib/subscriptions.ts");

const TZ = "America/Toronto";
const HOST = "localhost:3000";
const OWNER = "+15145550199";
const CLAIRE = { name: "Claire Essai", email: "client.essai@example.com", phone: "514 555-0123", e164: "+15145550123" };
const PAUL = { name: "Paul Essai", email: "paul.essai@example.com", phone: "514 555-0177", e164: "+15145550177" };

process.env.SMS_OWNER_TO = OWNER;

/* Twilio simulé : chaque texto envoyé, avec son destinataire. */
const texts = [];
const g = fakeGoogle({ tz: TZ });
g.route(/^https:\/\/api\.twilio\.com\//, (url, init) => {
  const form = new URLSearchParams(String(init?.body ?? ""));
  texts.push({ to: form.get("To"), body: form.get("Body") });
  return new Response(JSON.stringify({ sid: `SM${randomBytes(16).toString("hex")}`, status: "queued" }),
    { status: 201, headers: { "content-type": "application/json" } });
});
g.install();

/* Les courriels du faux Gmail : destinataire, objet et texte, en clair. */
const decode = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
const mails = () => g.mails.map((raw) => ({
  to: (/^To: (?:.*<)?([^<>\s]+@[^<>\s]+)>?$/m.exec(raw) ?? [])[1] ?? "?",
  subject: decode((/^Subject: (.*)$/m.exec(raw) ?? [])[1] ?? ""),
  text: Buffer.from((/text\/plain[^]*?base64\r\n\r\n([A-Za-z0-9+/=]+)/.exec(raw) ?? [])[1] ?? "", "base64").toString("utf8"),
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

/* Les dates : le premier vendredi à deux jours au moins, et le dimanche qui
   suit. Vendredi et dimanche ouvrent de 7 h à 22 h. */
const today = dateKey(new Date(), TZ);
let FRI = addDaysToKey(today, 2);
while (weekdayOfKey(FRI) !== 5) FRI = addDaysToKey(FRI, 1);
const SUN = addDaysToKey(FRI, 2);
const at = (key, h, m = 0) => fromWall({ ...Object.fromEntries(key.split("-").map((x, i) => [["year", "month", "day"][i], Number(x)])), hour: h, minute: m }, TZ);
const fr = (d) => formatDateTime(d, TZ, "fr");

let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const journal = [];
const note = (what) => journal.push(what);

await ensureSchema();
await sql()`INSERT INTO nivex_settings (id) VALUES (1) ON CONFLICT DO NOTHING`;
await sql()`UPDATE nivex_settings SET refresh_token = ${encrypt("jeton-essai")}, owner_email = 'artisan@example.com',
  calendar_id = 'primary', paused = false WHERE id = 1`;

console.log(`\n« Avertir le client », par le vrai code (vendredi ${FRI})\n`);

let subId = null;
let paulId = null;
try {
  let firstId = null;

  await step("l'artisan entre l'abonnement de Claire, case cochée : sa confirmation part, et se note", async () => {
    const full = await createOwnerSubscription({
      locale: "fr", planKey: "executif", name: CLAIRE.name, email: CLAIRE.email, phone: CLAIRE.phone,
      address: "12 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
      date: FRI, time: "13:00", startCycle: 1, startDone: 0, paidCurrent: false, notify: true,
    }, HOST);
    subId = full.sub.id;
    firstId = full.visits[0].id;
    const s = sent();
    assert.equal(to(s.mails, CLAIRE.email).length, 1, "une confirmation");
    assert.match(to(s.mails, CLAIRE.email)[0].subject, /abonnement .* est confirmé/i);
    assert.equal(to(s.texts, CLAIRE.e164).length, 1, "un texto de confirmation");
    const v = await findById(firstId);
    assert.equal(v.clientEmailKind, "confirmation");
    assert.equal(v.clientEmailedFor.getTime(), at(FRI, 13).getTime(), "l'heure annoncée");
    assert.ok(v.clientEmailedAt, "l'heure de l'envoi");
    assert.equal(clientBehind(v), false);
    note(`Claire : abonnement VIP entré, 1re visite ${fr(at(FRI, 13))} ; confirmation reçue (1 courriel, 1 texto)`);
  });

  const moves = [[FRI, 9], [SUN, 10], [SUN, 15]];
  for (const [day, hour] of moves) {
    await step(`déplacement au ${day} ${hour} h, case décochée : rien à Claire, un avis à l'artisan`, async () => {
      const v = await findById(firstId);
      await moveVisit(v, at(day, hour), "owner", HOST, { notify: false });
      const s = sent();
      assert.equal(to(s.mails, CLAIRE.email).length, 0, "aucun courriel au client");
      assert.equal(to(s.texts, CLAIRE.e164).length, 0, "aucun texto au client");
      assert.equal(to(s.mails, REQUEST_INBOX).length, 1, "l'avis de l'artisan");
      assert.match(to(s.mails, REQUEST_INBOX)[0].subject, /^Client non averti — Claire Essai · visite déplacée/);
      const after = await findById(firstId);
      assert.equal(after.startsAt.getTime(), at(day, hour).getTime(), "la visite a bougé");
      assert.equal(after.clientEmailedFor.getTime(), at(FRI, 13).getTime(), "le client connaît toujours l'heure d'origine");
      assert.equal(clientBehind(after), true, "« client non averti »");
      note(`déplacée au ${fr(at(day, hour))}, case décochée : 0 courriel et 0 texto à ${CLAIRE.email} ; 1 avis à l'artisan`);
    });
  }

  await step("« Envoyer la confirmation au client » : un seul courriel, l'heure d'origine barrée et l'heure finale", async () => {
    const r = await sendSubscriptionUpdate(subId, HOST);
    assert.deepEqual(r, { ok: true, error: null });
    const s = sent();
    const mine = to(s.mails, CLAIRE.email);
    assert.equal(mine.length, 1, "un seul courriel");
    assert.equal(s.mails.length, 1, "et rien d'autre, pas même à l'artisan");
    assert.equal(s.texts.length, 0, "pas de texto");
    assert.match(mine[0].subject, /^Votre horaire NIVEX à jour · ABO-/);
    const final = fr(at(SUN, 15));
    assert.ok(mine[0].text.includes(`Déplacée: ${fr(at(FRI, 13))} → ${final}`), mine[0].text);
    assert.ok(mine[0].text.includes(`Vos prochaines visites:\n  · ${final}`), "l'heure finale ouvre la liste");
    for (const [day, hour] of moves.slice(0, 2)) assert.ok(!mine[0].text.includes(fr(at(day, hour))), "aucune heure intermédiaire");
    const v = await findById(firstId);
    assert.equal(v.clientEmailKind, "update");
    assert.equal(v.clientEmailedFor.getTime(), at(SUN, 15).getTime());
    assert.equal(clientBehind(v), false);
    note(`« Envoyer la confirmation au client » : 1 courriel à ${CLAIRE.email}, « ${mine[0].subject} », horaire final ${final}`);
    console.log(`\n--- le courriel reçu par ${CLAIRE.email} ---\n${mine[0].text}\n---\n`);
  });

  await step("annulation sans avertir, puis l'horaire à jour : « Annulée » et le remplacement « Ajoutée »", async () => {
    const full = await findSubscription(subId);
    const second = full.visits[1];
    const { replacement } = await cancelVisit(second, "owner", HOST, { notify: false });
    assert.ok(replacement, "un remplacement en fin de série");
    let s = sent();
    assert.equal(to(s.mails, CLAIRE.email).length + to(s.texts, CLAIRE.e164).length, 0, "rien au client");
    assert.match(to(s.mails, REQUEST_INBOX)[0].subject, /visite annulée/);
    assert.equal(clientBehind(await findById(second.id)), true, "« client non averti de l'annulation »");
    const r = await sendSubscriptionUpdate(subId, HOST);
    assert.equal(r.ok, true);
    s = sent();
    const mine = to(s.mails, CLAIRE.email);
    assert.equal(mine.length, 1);
    assert.ok(mine[0].text.includes(`Annulée: ${fr(second.startsAt)}`), mine[0].text);
    assert.ok(mine[0].text.includes(`Ajoutée: ${fr(replacement.startsAt)}`), mine[0].text);
    assert.equal(clientBehind(await findById(second.id)), false);
    assert.equal(clientBehind(await findById(replacement.id)), false);
    note("visite annulée sans avertir : rien au client ; l'horaire à jour dit « Annulée » et « Ajoutée » (le remplacement)");
  });

  await step("une page d'avant la case (sans « notify ») : le client est averti, comme avant", async () => {
    const full = await findSubscription(subId);
    const third = full.visits.find((v) => v.status === "confirmed" && v.id !== firstId);
    const target = new Date(third.startsAt.getTime() + 60 * 60_000);
    await moveVisit(third, target, "owner", HOST);
    const s = sent();
    assert.equal(to(s.mails, CLAIRE.email).length, 1, "« Visite déplacée »");
    assert.match(to(s.mails, CLAIRE.email)[0].subject, /^Visite déplacée/);
    assert.equal(to(s.texts, CLAIRE.e164).length, 1);
    const v = await findById(third.id);
    assert.equal(v.clientEmailKind, "moved");
    assert.equal(clientBehind(v), false);
    note("déplacement sans la case (page d'avant) : le client reçoit « Visite déplacée » (courriel + texto), comme avant");
  });

  await step("l'abonnée déplace elle-même une visite : son avis part toujours, et l'artisan est prévenu", async () => {
    const v = await findById(firstId);
    await moveVisit(v, at(SUN, 16), "client", HOST, { notify: false });
    const s = sent();
    assert.equal(to(s.mails, CLAIRE.email).length, 1, "la case ne vaut que pour l'artisan");
    assert.equal(to(s.texts, CLAIRE.e164).length, 1);
    assert.match(to(s.mails, REQUEST_INBOX)[0].subject, /^Visite déplacée — Claire Essai/);
    note("déplacement fait par l'abonnée : son courriel et son texto partent, l'artisan est prévenu (inchangé)");
  });

  await step("Paul réserve sur le site : sa confirmation automatique part, et se note", async () => {
    const b = await createBooking({
      locale: "fr", units: [], name: PAUL.name, email: PAUL.email, phone: PAUL.phone,
      address: "8 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
      startsAt: at(SUN, 9).toISOString(), consent: true,
    }, HOST);
    paulId = b.id;
    const s = sent();
    assert.equal(to(s.mails, PAUL.email).length, 1);
    assert.match(to(s.mails, PAUL.email)[0].subject, /^Votre séance NIVEX est confirmée/);
    assert.equal(to(s.texts, PAUL.e164).length, 1);
    const v = await findById(paulId);
    assert.equal(v.clientEmailKind, "confirmation");
    assert.equal(clientBehind(v), false);
    note("réservation faite sur le site : confirmation automatique (courriel + texto), inchangée");
  });

  await step("l'artisan annule la séance de Paul sans l'avertir, puis lui envoie l'avis d'annulation", async () => {
    await cancelBooking(await findById(paulId), "owner", { notify: false });
    let s = sent();
    assert.equal(to(s.mails, PAUL.email).length + to(s.texts, PAUL.e164).length, 0, "rien au client");
    assert.match(to(s.mails, REQUEST_INBOX)[0].subject, /séance annulée/);
    assert.equal(clientBehind(await findById(paulId)), true);
    const r = await sendClientConfirmation(await findById(paulId), HOST);
    assert.deepEqual(r, { ok: true, error: null });
    s = sent();
    assert.equal(to(s.mails, PAUL.email).length, 1);
    assert.match(to(s.mails, PAUL.email)[0].subject, /annul/i);
    assert.equal(s.texts.length, 0);
    const v = await findById(paulId);
    assert.equal(v.clientEmailKind, "cancelled");
    assert.equal(clientBehind(v), false);
    note("séance annulée sans avertir : rien au client ; le bouton lui envoie un seul courriel, l'avis d'annulation");
  });
} finally {
  if (subId) await deleteSubscription(subId).catch((e) => console.error("nettoyage :", e));
  if (paulId) await sql()`DELETE FROM nivex_bookings WHERE id = ${paulId}`;
  g.uninstall();
}

console.log(`\n${n} étapes réussies.\n`);
for (const line of journal) console.log(`  ${line}`);
console.log("");

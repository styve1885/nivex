/**
 * La question de la planche à repasser (14 novembre 2026), rejouée par le
 * vrai code, sur la base locale, avec Google et Twilio simulés
 * (tests/tools/fake-google.mjs) : aucun courriel ni texto ne sort du
 * conteneur.
 *
 *   node tools/local/neon-relay.mjs &
 *   bash -c 'source tools/local/env.sh && npx tsx tools/local/scenario-planche.mjs'
 *
 * Trois faux clients réservent une séance à la carte, un par réponse : Oui,
 * Non, Je ne suis pas sûr. Le scénario vérifie la réponse gardée en base,
 * l'avis de l'artisan (courriel et texto, « À contacter » pour Non et Pas
 * sûr), la confirmation du client (courriel et texto, avec la ligne de la
 * planche) et son rappel de la veille ; puis une réservation venue d'une page
 * restée ouverte, sans la réponse, qui passe quand même. Il efface ce qu'il a
 * écrit.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { fakeGoogle } = await import("../../tests/tools/fake-google.mjs");
const { sql, ensureSchema } = await import("../../src/lib/db.ts");
const { encrypt } = await import("../../src/lib/crypto.ts");
const { fromWall, dateKey, addDaysToKey, weekdayOfKey } = await import("../../src/lib/time.ts");
const { REQUEST_INBOX } = await import("../../src/lib/brand.ts");
const { createBooking, findById } = await import("../../src/lib/bookings.ts");
const { runDaily } = await import("../../src/lib/subscriptions.ts");

const TZ = "America/Toronto";
const HOST = "localhost:3000";
const OWNER = "+15145550199";
process.env.SMS_OWNER_TO = OWNER;

/* Twilio simulé : chaque texto envoyé est gardé, destinataire et texte. */
const texts = [];
const g = fakeGoogle({ tz: TZ });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
g.route(/^https:\/\/api\.twilio\.com\//, (url, init) => {
  const form = new URLSearchParams(String(init?.body ?? ""));
  const sid = `SM${randomBytes(16).toString("hex")}`;
  texts.push({ to: form.get("To"), body: form.get("Body"), scheduled: Boolean(form.get("SendAt")) });
  return json(201, { sid, status: "queued" });
});
g.install();

/* Les courriels partis par le faux Gmail : destinataire, objet et corps. */
const decode = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
/* Le corps : les deux parties, texte et HTML, en base64 dans le message. */
const body = (raw) => [...raw.matchAll(/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/g)]
  .map((m) => Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8")).join("\n");
const mails = () => g.mails.map((raw) => ({
  to: (/^To: (?:.*<)?([^<>\s]+@[^<>\s]+)>?$/m.exec(raw) ?? [])[1] ?? "?",
  subject: decode((/^Subject: (.*)$/m.exec(raw) ?? [])[1] ?? ""),
  raw,
}));
let mailMark = 0, textMark = 0;
const sent = () => {
  const m = mails().slice(mailMark), t = texts.slice(textMark);
  mailMark = g.mails.length;
  textMark = texts.length;
  return { mails: m, texts: t };
};
const to = (list, who) => list.filter((x) => x.to === who);
const has = (m, s) => body(m.raw).replace(/[\u00a0\u202f]/g, " ").includes(s);

/* Un jeudi à deux jours au moins, à 18 h, 19 h 30, puis 21 h... à Saint-Lambert. */
const today = dateKey(new Date(), TZ);
let THU = addDaysToKey(today, 2);
while (weekdayOfKey(THU) !== 4) THU = addDaysToKey(THU, 1);
const at = (key, h, m = 0) => fromWall({ ...Object.fromEntries(key.split("-").map((x, i) => [["year", "month", "day"][i], Number(x)])), hour: h, minute: m }, TZ);
const MORNING = at(THU, 7);   // la tâche du matin ne rappelle qu'une séance à plus d'une heure

let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

await ensureSchema();
await sql()`INSERT INTO nivex_settings (id) VALUES (1) ON CONFLICT DO NOTHING`;
await sql()`UPDATE nivex_settings SET refresh_token = ${encrypt("jeton-essai")}, owner_email = 'artisan@example.com',
  calendar_id = 'primary', paused = false WHERE id = 1`;
/* Une semaine de 7 h à 22 h, pour que les quatre séances tiennent le même jour. */
await sql()`UPDATE nivex_settings SET hours = ${JSON.stringify([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: true, open: "07:00", close: "22:00" })))}::jsonb WHERE id = 1`;

console.log(`\nLa planche à repasser, par le vrai code (jeudi ${THU})\n`);

const ids = [];
const CLIENTS = [
  { board: "yes", name: "Alice Oui", email: "alice.oui@example.com", phone: "514 555-0111", e164: "+15145550111", hour: 9, label: "Oui", contact: false },
  { board: "no", name: "Bruno Non", email: "bruno.non@example.com", phone: "514 555-0122", e164: "+15145550122", hour: 12, label: "Non", contact: true },
  { board: "unsure", name: "Chloé Peut-être", email: "chloe.pe@example.com", phone: "514 555-0133", e164: "+15145550133", hour: 15, label: "Je ne suis pas sûr", contact: true },
];
const OWNER_TEXT = { yes: "Planche : oui.", no: "Planche : non, à contacter.", unsure: "Planche : ne sait pas, à contacter." };

try {
  for (const c of CLIENTS) {
    await step(`${c.name} répond « ${c.label} » : la séance est prise, la réponse gardée, l'artisan ${c.contact ? "averti « À contacter »" : "informé"}`, async () => {
      const b = await createBooking({
        locale: "fr", units: [], name: c.name, email: c.email, phone: c.phone,
        address: "8 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
        startsAt: at(THU, c.hour).toISOString(), consent: true, board: c.board,
      }, HOST);
      ids.push(b.id);
      assert.equal((await findById(b.id)).ironingBoard, c.board, "gardée en base");
      const s = sent();
      /* L'avis de l'artisan : courriel et texto. */
      const owner = to(s.mails, REQUEST_INBOX);
      assert.equal(owner.length, 1);
      assert.equal(/ · À contacter$/.test(owner[0].subject), c.contact, owner[0].subject);
      assert.ok(has(owner[0], c.contact ? `${c.label} · À contacter` : "Planche à repasser"), "la réponse sur la fiche");
      const ownerText = to(s.texts, OWNER);
      assert.equal(ownerText.length, 1);
      assert.ok(ownerText[0].body.endsWith(OWNER_TEXT[c.board]), ownerText[0].body);
      /* Le client : confirmation par courriel et par texto, avec la ligne de la planche, sans la réponse. */
      const mine = to(s.mails, c.email);
      assert.equal(mine.length, 1);
      assert.ok(has(mine[0], "Pensez à préparer votre planche à repasser."), "la ligne dans le courriel");
      assert.ok(!has(mine[0], "À contacter"), "la réponse ne paraît pas chez le client");
      const sms = to(s.texts, c.e164);
      assert.equal(sms.length, 1);
      assert.match(sms[0].body, /\. Pensez à préparer votre planche à repasser\. Répondez STOP pour ne plus recevoir de textos\. Styve$/);
      assert.equal(s.texts.filter((t) => t.scheduled).length, 0, "aucun texto programmé");
    });
  }

  await step("une page restée ouverte, sans la réponse : la séance passe, notée non renseignée, sans « À contacter »", async () => {
    const b = await createBooking({
      locale: "fr", units: [], name: "Denis Ancien", email: "denis.ancien@example.com", phone: "514 555-0144",
      address: "8 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
      startsAt: at(THU, 18).toISOString(), consent: true,
    }, HOST);
    ids.push(b.id);
    assert.equal((await findById(b.id)).ironingBoard, null);
    const s = sent();
    const owner = to(s.mails, REQUEST_INBOX)[0];
    assert.doesNotMatch(owner.subject, /À contacter/);
    assert.ok(to(s.texts, OWNER)[0].body.endsWith("Saint-Lambert."), "rien sur la planche");
  });

  await step("la tâche du matin : chaque client a son rappel, avec la ligne de la planche", async () => {
    await runDaily(HOST, MORNING);
    const s = sent();
    for (const c of CLIENTS) {
      const sms = to(s.texts, c.e164);
      assert.equal(sms.length, 1, c.name);
      assert.match(sms[0].body, /^NIVEX - Rappel : aujourd'hui jeudi .*, j'arrive à .*\. Pensez à préparer votre planche à repasser\. À tout à l'heure\. Styve$/);
      const mail = to(s.mails, c.email);
      assert.equal(mail.length, 1, c.name);
      assert.ok(has(mail[0], "Pensez à préparer votre planche à repasser."));
    }
    assert.equal(to(s.texts, OWNER).length, 0, "rien pour l'artisan ce matin-là");
  });

  await step("personne d'autre n'a rien reçu : tous les destinataires sont fictifs", async () => {
    const allowed = new Set([REQUEST_INBOX, ...CLIENTS.map((c) => c.email), "denis.ancien@example.com"]);
    assert.ok(mails().every((m) => allowed.has(m.to)), [...new Set(mails().map((m) => m.to))].join(", "));
    const numbers = new Set([OWNER, ...CLIENTS.map((c) => c.e164), "+15145550144"]);
    assert.ok(texts.every((t) => numbers.has(t.to)), [...new Set(texts.map((t) => t.to))].join(", "));
  });
} finally {
  for (const id of ids) await sql()`DELETE FROM nivex_bookings WHERE id = ${id}`;
  g.uninstall();
}

console.log(`\n${n} réussis, 0 échoués\n`);

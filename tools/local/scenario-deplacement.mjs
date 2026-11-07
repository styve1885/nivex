/**
 * Le déplacement de visites du 7 novembre 2026, rejoué par le vrai code, sur
 * la base locale, avec un Google simulé (tests/tools/fake-google.mjs) :
 * aucun appel ne sort du conteneur, Twilio compris.
 *
 *   node tools/local/neon-relay.mjs &
 *   bash -c 'source tools/local/env.sh && npx tsx tools/local/scenario-deplacement.mjs'
 *
 * Un abonné VIP, chaque vendredi à 13 h, dont les visites 3/4 et 4/4 sont à
 * venir. L'artisan déplace la 3/4 au mardi d'avant, 18 h 30, puis la 4/4 au
 * vendredi libéré, 13 h : deux visites dans la même semaine. L'agenda doit
 * suivre sans doublon, et le second déplacement passer. Viennent ensuite les
 * refus, chacun avec sa raison, les replis quand Google refuse, Google
 * injoignable, et la remise à l'heure d'un événement resté en arrière, par
 * le bouton comme par la tâche du matin. Le scénario efface ce qu'il a
 * écrit en base.
 */
import assert from "node:assert/strict";

const { fakeGoogle } = await import("../../tests/tools/fake-google.mjs");
const { sql, ensureSchema } = await import("../../src/lib/db.ts");
const { encrypt } = await import("../../src/lib/crypto.ts");
const { fromWall, dateKey, addDaysToKey, weekdayOfKey } = await import("../../src/lib/time.ts");
const { findById } = await import("../../src/lib/bookings.ts");
const { clearTokenCache } = await import("../../src/lib/google.ts");
const {
  createOwnerSubscription, deleteSubscription, findSubscription, moveVisit, runDaily, syncVisitCalendar, visitMoveSlots,
  SubscriptionError,
} = await import("../../src/lib/subscriptions.ts");

const TZ = "America/Toronto";
const HOST = "localhost:3000";
const g = fakeGoogle({ tz: TZ });
let sms = 0;
g.route(/^https:\/\/api\.twilio\.com\//, () =>
  new Response(JSON.stringify({ sid: `SMessai${++sms}`, status: "queued" }), { status: 201, headers: { "content-type": "application/json" } }));
g.install();

/* Les dates, à partir d'aujourd'hui : le premier vendredi à six jours au
   moins (le 13 novembre, un 7 novembre), le mardi d'avant, et ainsi de suite. */
const today = dateKey(new Date(), TZ);
let F = addDaysToKey(today, 6);
while (weekdayOfKey(F) !== 5) F = addDaysToKey(F, 1);
const day = (offset) => addDaysToKey(F, offset);
const at = (key, h, m = 0) => fromWall({ ...Object.fromEntries(key.split("-").map((x, i) => [["year", "month", "day"][i], Number(x)])), hour: h, minute: m }, TZ);
const tue = day(-3), thu = day(-1);

let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const refusal = async (fn) => {
  try { await fn(); } catch (e) { if (e instanceof SubscriptionError) return e; throw e; }
  assert.fail("le déplacement devait être refusé");
};

await ensureSchema();
await sql()`INSERT INTO nivex_settings (id) VALUES (1) ON CONFLICT DO NOTHING`;
await sql()`UPDATE nivex_settings SET refresh_token = ${encrypt("jeton-essai")}, owner_email = 'artisan@example.com',
  calendar_id = 'primary', paused = false WHERE id = 1`;

console.log(`\nDéplacer une visite, par le vrai code (vendredi ${F})\n`);

const full0 = await createOwnerSubscription({
  locale: "fr", planKey: "executif", name: "Client Essai", email: "client.essai@example.com", phone: "514 555-0142",
  address: "12 rue de l'Essai", city: "Saint-Lambert", postalCode: "J4P 1A1",
  date: F, time: "13:00", startCycle: 1, startDone: 2, paidCurrent: false,
}, HOST);
const subId = full0.sub.id;
const other = (await sql()`
  INSERT INTO nivex_bookings (ref, manage_token, client_name, client_email, client_phone, address, city, postal_code,
    starts_at, ends_at, duration_minutes, setup_minutes)
  VALUES ('NVX-AUTRE', 'jeton-autre-essai', 'Marie Tremblay', 'marie@example.com', '514 555-0199', '1 rue Autre',
    'Longueuil', 'J4K 1A1', ${at(F, 16).toISOString()}, ${at(F, 18).toISOString()}, 120, 0)
  RETURNING id`)[0].id;

try {
  const visitAt = async (key, h, m = 0) => (await findSubscription(subId)).visits
    .find((v) => v.startsAt.getTime() === at(key, h, m).getTime());
  const v3 = await visitAt(F, 13), v4 = await visitAt(day(7), 13), v5 = await visitAt(day(14), 13);
  const id3 = v3.googleEventId, id4 = v4.googleEventId;
  const count = g.visible().length;

  await step("la série est dans l'agenda : la 3/4 au vendredi, la 4/4 la semaine d'après", async () => {
    const f = await findSubscription(subId);
    assert.equal(`${f.view.numbers.get(v3.id).index}/4`, "3/4");
    assert.equal(`${f.view.numbers.get(v4.id).index}/4`, "4/4");
    assert.ok(id3 && id4 && v3.googleSeriesId);
    assert.equal(count, f.visits.length);
  });

  await step(`la 3/4 passe du ven. ${F} 13 h au mar. ${tue} 18 h 30 : l'événement est retouché, l'ancien créneau libre`, async () => {
    const r = await moveVisit(await findById(v3.id), at(tue, 18, 30), "owner", HOST);
    assert.deepEqual(r.calendar, { status: "moved", eventId: id3 });
    assert.deepEqual(g.at(at(tue, 18, 30)).map((e) => e.id), [id3]);
    assert.equal(g.at(at(F, 13)).length, 0);
    assert.equal(g.visible().length, count, "aucun doublon");
    assert.equal((await findById(v3.id)).startsAt.getTime(), at(tue, 18, 30).getTime());
  });

  await step(`puis la 4/4 passe au ven. ${F} 13 h : accepté, deux visites la même semaine, les rangs suivent`, async () => {
    const r = await moveVisit(await findById(v4.id), at(F, 13), "owner", HOST);
    assert.deepEqual(r.calendar, { status: "moved", eventId: id4 });
    assert.deepEqual(g.at(at(F, 13)).map((e) => e.id), [id4]);
    assert.equal(g.at(at(day(7), 13)).length, 0);
    const f = await findSubscription(subId);
    assert.equal(f.view.numbers.get(v3.id).index, 3);
    assert.equal(f.view.numbers.get(v4.id).index, 4);
    assert.match(g.events.get(id4).summary, /4\/4$/);
    assert.match(g.events.get(id3).summary, /3\/4$/);
  });

  await step("chaque refus dit sa raison : horaire, autre client, battement, même abonnement, agenda", async () => {
    const why = async (key, h, m = 0) => (await refusal(() => moveVisit(v5, at(key, h, m), "owner", HOST))).detail;
    assert.match(await why(tue, 13), /^Hors de l'horaire : le mardi, une visite de 2 heures se place entre 18 h et 22 h, donc au plus tard à 20 h\.$/);
    assert.match(await why(F, 16), /^Conflit avec la séance de Marie Tremblay \(NVX-AUTRE\), ven\. \d+ nov\., 16 h – 18 h\.$/);
    assert.match(await why(F, 18, 15), /^Trop près de la séance de Marie Tremblay .* il faut 30 min entre deux rendez-vous, pour la route\.$/);
    assert.match(await why(tue, 19), /^Conflit avec la visite 3\/4 de ce même abonnement, mar\. \d+ nov\., 18 h 30 – 20 h 30\.$/);
    g.add({ summary: "Dentiste", start: at(thu, 19), end: at(thu, 20) });
    assert.match(await why(thu, 18), /^Conflit avec « Dentiste », dans votre agenda Google, jeu\. \d+ nov\., 19 h – 20 h\.$/);
  });

  await step("le client, lui, ne reçoit jamais le nom d'un autre client", async () => {
    const e = await refusal(() => moveVisit(v5, at(F, 16), "client", HOST));
    assert.equal(e.code, "invalid_slot");
    assert.equal(e.detail, undefined);
  });

  await step("le sélecteur de l'abonné dit la même chose : 11 h libre (collée à la 4/4), 15 h prise (Marie Tremblay)", async () => {
    const s = await visitMoveSlots(await findSubscription(subId), v5, { from: F, days: 1 });
    const times = s.days.find((d) => d.date === F).slots.map((x) => x.time);
    assert.ok(times.includes("11:00"));
    assert.ok(!times.includes("13:00") && !times.includes("15:00"));
  });

  await step("Google refuse la retouche : l'événement est remplacé, jamais doublé, et la base suit", async () => {
    const id5 = v5.googleEventId;
    g.fail({ op: "events.patch", id: id5, status: 400, reason: "invalid", message: "Invalid start time" });
    const before = g.visible().length;
    const r = await moveVisit(await findById(v5.id), at(day(15), 18), "owner", HOST);
    assert.equal(r.calendar.status, "replaced");
    assert.equal(g.events.get(id5).status, "cancelled");
    assert.deepEqual(g.at(at(day(15), 18)).map((e) => e.id), [r.calendar.eventId]);
    assert.equal(g.visible().length, before);
    const row = await findById(v5.id);
    assert.equal(row.googleEventId, r.calendar.eventId);
    assert.equal(row.googleSeriesId, null);
  });

  await step("Google refuse tout : rien n'est créé, l'échec remonte ; le même déplacement remet l'agenda à l'heure", async () => {
    const v6 = await visitAt(day(21), 13);
    const id6 = v6.googleEventId;
    g.fail({ op: "events.patch", id: id6, status: 400, message: "Invalid start time" });
    g.fail({ op: "events.delete", id: id6, status: 400, message: "Bad Request" });
    const r = await moveVisit(await findById(v6.id), at(day(22), 18), "owner", HOST);
    assert.deepEqual([r.calendar.status, r.calendar.stale], ["failed", true]);
    assert.deepEqual(g.at(at(day(21), 13)).map((e) => e.id), [id6], "resté à l'ancienne heure");
    assert.equal(g.at(at(day(22), 18)).length, 0);
    assert.ok((await findById(v6.id)).calendarStaleAt, "la visite est marquée");
    const fix = await moveVisit(await findById(v6.id), at(day(22), 18), "owner", HOST);
    assert.deepEqual(fix.calendar, { status: "moved", eventId: id6 });
    assert.deepEqual(g.at(at(day(22), 18)).map((e) => e.id), [id6]);
    assert.equal(g.at(at(day(21), 13)).length, 0);
    assert.equal((await findById(v6.id)).calendarStaleAt, null, "la marque tombe");
  });

  /* Google injoignable : le jeton ne se renouvelle pas. */
  const offline = () => {
    clearTokenCache();
    g.fail({ op: "token", status: 400, reason: "invalid_grant", message: "Token has been expired or revoked." });
  };

  await step("Google injoignable : la visite se déplace, elle est marquée, et « Remettre à l'heure » la rattrape", async () => {
    const v7 = await visitAt(day(28), 13);
    const id7 = v7.googleEventId;
    offline();
    const r = await moveVisit(await findById(v7.id), at(day(29), 18), "owner", HOST);
    assert.deepEqual([r.offline, r.calendar], [true, null]);
    assert.ok((await findById(v7.id)).calendarStaleAt);
    assert.deepEqual(g.at(at(day(28), 13)).map((e) => e.id), [id7], "l'agenda n'a pas bougé");
    const fix = await syncVisitCalendar(await findById(v7.id), HOST);
    assert.deepEqual([fix.offline, fix.calendar], [false, { status: "moved", eventId: id7 }]);
    assert.deepEqual(g.at(at(day(29), 18)).map((e) => e.id), [id7]);
    assert.equal((await findById(v7.id)).calendarStaleAt, null);
  });

  await step("la tâche du matin remet à l'heure ce que Google n'avait pas suivi", async () => {
    const v8 = await visitAt(day(35), 13);
    offline();
    await moveVisit(await findById(v8.id), at(day(36), 18), "owner", HOST);
    assert.ok((await findById(v8.id)).calendarStaleAt);
    const d = await runDaily(HOST);
    assert.ok(d.calendarFixed >= 1, `remises à l'heure : ${d.calendarFixed}`);
    assert.equal((await findById(v8.id)).calendarStaleAt, null);
    assert.deepEqual(g.at(at(day(36), 18)).map((e) => e.id), [v8.googleEventId]);
    assert.equal(g.at(at(day(35), 13)).length, 0);
  });
} finally {
  await deleteSubscription(subId).catch((e) => console.error("nettoyage :", e));
  await sql()`DELETE FROM nivex_bookings WHERE id = ${other}`;
  g.uninstall();
}

console.log(`\n${n} réussis, 0 échoués\n`);

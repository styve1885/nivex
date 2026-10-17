/**
 * Tests des abonnements : la grille des dates, le rang des visites, le
 * montant d'un cycle, le délai de la veille et ce que les courriels disent.
 * Exécution : npx tsx tests/subscription.test.mjs
 *
 * Ce qui n'est pas vérifiable ici : l'écriture en base et l'agenda Google.
 * Pour ceux-là, voir le scénario décrit dans CLAUDE.md (base PostgreSQL
 * réelle, Google simulé).
 */
import assert from "node:assert/strict";

const {
  gridFrom, gridDate, gridDates, gridIndexAfter, visitsToEndOfSeries, subscriberFeeCents, quoteCycle,
  changeDeadline, canSubscriberChange, numberVisits, startOffset, viewSubscription, seriesConflicts,
  seriesOfCycle, TERM_CYCLES,
} = await import("../src/lib/cycles.ts");
const { PLANS } = await import("../src/lib/pricing.ts");
const { FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { fromWall, toWall, dateKey } = await import("../src/lib/time.ts");
const { canSelfCancel } = await import("../src/lib/bookings.ts");
const { visitReminder, subscriptionConfirmation, visitChanged, seriesNotice } = await import("../src/lib/email.ts");
const { CANCEL_WINDOW_HOURS, SUBSCRIBER_TRAVEL_DISCOUNT_CENTS, SERIES_CYCLES } = await import("../src/lib/brand.ts");

const TZ = "America/Toronto";
const settings = { ...FALLBACK_SETTINGS, timezone: TZ };
const plan = (k) => PLANS.find((p) => p.key === k);
const at = (y, m, d, h = 10, min = 0) => fromWall({ year: y, month: m, day: d, hour: h, minute: min }, TZ);
const flat = (x) => x.replace(/[   ]/g, " ");
const DAY = 86_400_000;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log("\nAbonnements\n");

/* ————— Les formules ————— */

test("les rythmes de la demande : chaque semaine, aux deux semaines, toutes les quatre semaines", () => {
  assert.equal(plan("executif").everyWeeks, 1);
  assert.equal(plan("grande-famille").everyWeeks, 1);
  assert.equal(plan("confort").everyWeeks, 2);
  assert.equal(plan("essentiel").everyWeeks, 4);
  assert.deepEqual(PLANS.map((p) => p.minutesPerVisit), [180, 120, 120, 180]);
});

test("chaque formule tient un cycle en quatre semaines", () => {
  for (const p of PLANS) assert.equal(p.visits * p.everyWeeks, 4, p.key);
});

/* ————— La grille ————— */

test("10 h reste 10 h de l'autre côté du passage à l'heure normale (1er novembre)", () => {
  const g = gridFrom(at(2026, 10, 30), 1, TZ);
  const next = gridDate(g, 1);
  const w = toWall(next, TZ);
  assert.equal(dateKey(next, TZ), "2026-11-06");
  assert.equal(`${w.hour}:${w.minute}`, "10:0");
  assert.equal(next.getTime() - at(2026, 10, 30).getTime(), 7 * DAY + 3600_000);
});

test("une série Confort avance de deux semaines en deux semaines", () => {
  const ds = gridDates(gridFrom(at(2026, 11, 3, 14), 2, TZ), 0, 3).map((d) => dateKey(d, TZ));
  assert.deepEqual(ds, ["2026-11-03", "2026-11-17", "2026-12-01"]);
});

test("le rang suivant de la grille, après une date donnée", () => {
  const g = gridFrom(at(2026, 11, 6), 1, TZ);
  assert.equal(gridIndexAfter(g, at(2026, 11, 6)), 1);
  assert.equal(gridIndexAfter(g, at(2026, 11, 20, 9)), 2);
  assert.equal(gridIndexAfter(g, at(2027, 3, 26)), 21);
});

/* ————— Les séries ————— */

test("une série neuve compte six cycles : 24, 12 ou 6 visites", () => {
  assert.equal(visitsToEndOfSeries(4, 1, 0), 24);
  assert.equal(visitsToEndOfSeries(2, 1, 0), 12);
  assert.equal(visitsToEndOfSeries(1, 1, 0), 6);
  assert.equal(SERIES_CYCLES, 6);
});

test("un abonné d'avant le site reprend où il en est, jusqu'à la fin de sa série", () => {
  assert.equal(visitsToEndOfSeries(4, 3, 2), 14);   // cycles 3 à 6, deux visites déjà faites
  assert.equal(visitsToEndOfSeries(4, 7, 0), 24);   // il entre directement dans la seconde série
  assert.equal(seriesOfCycle(6), 1);
  assert.equal(seriesOfCycle(7), 2);
  assert.equal(TERM_CYCLES, 12);
});

/* ————— Les montants ————— */

test("les frais d'un abonné : ceux de la zone moins la réduction, jamais sous zéro", () => {
  assert.equal(SUBSCRIBER_TRAVEL_DISCOUNT_CENTS, 500);
  assert.equal(subscriberFeeCents(1500), 1000);
  assert.equal(subscriberFeeCents(2000), 1500);
  assert.equal(subscriberFeeCents(500), 0);
  assert.equal(subscriberFeeCents(300), 0);
  assert.equal(subscriberFeeCents(0), 0);
});

test("Exécutif à Montréal, visites de 2 h : 360 $ + (15 $ − 5 $) × 4 = 400 $", () => {
  const q = quoteCycle(plan("executif"), settings, 1500);
  assert.deepEqual(q, { planCents: 36000, travelCents: 4000, totalCents: 40000, feePerVisitCents: 1000 });
});

test("Grande Famille à Saint-Jean, visites de 3 h : tarif réduit de la zone, moins 5 $", () => {
  const q = quoteCycle(plan("grande-famille"), settings, 2000);
  assert.equal(q.feePerVisitCents, 1500);
  assert.equal(q.travelCents, 6000);
  assert.equal(q.totalCents, q.planCents + 6000);
});

test("une adresse sans frais ne paie que la formule", () => {
  const q = quoteCycle(plan("confort"), settings, 0);
  assert.equal(q.travelCents, 0);
  assert.equal(q.totalCents, q.planCents);
});

/* ————— Le délai de la veille ————— */

test("une visite du lundi 10 h se modifie jusqu'à dimanche 23 h 59, heure de Montréal", () => {
  const visit = at(2026, 11, 2);                         // lundi, lendemain du changement d'heure
  assert.equal(changeDeadline(visit, TZ).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(canSubscriberChange(visit, TZ, at(2026, 11, 1, 23, 59)), true);
  /* Dimanche 23 h 59 à Montréal, c'est déjà lundi en UTC : la date se lit
     dans le fuseau, sinon le délai tomberait un jour trop tôt. */
  assert.equal(dateKey(at(2026, 11, 1, 23, 59), "UTC"), "2026-11-02");
  assert.equal(canSubscriberChange(visit, TZ, at(2026, 11, 2, 0, 0)), false);
  assert.equal(canSubscriberChange(visit, TZ, at(2026, 11, 2, 8, 0)), false);
});

test("une séance ponctuelle garde son préavis en heures ; une visite d'abonné suit la veille", () => {
  const soon = new Date(Date.now() + (CANCEL_WINDOW_HOURS + 1) * 3600_000);
  const base = { status: "confirmed", startsAt: soon, doneAt: null, subscriptionId: null };
  assert.equal(canSelfCancel(base, TZ), true);
  /* La même heure, pour un abonné : si elle tombe aujourd'hui, c'est trop tard. */
  const sameDay = dateKey(soon, TZ) === dateKey(new Date(), TZ);
  assert.equal(canSelfCancel({ ...base, subscriptionId: "x" }, TZ), !sameDay);
  const nextWeek = new Date(Date.now() + 7 * DAY);
  assert.equal(canSelfCancel({ ...base, startsAt: nextWeek, subscriptionId: "x" }, TZ), true);
  assert.equal(canSelfCancel({ ...base, startsAt: nextWeek, subscriptionId: "x", doneAt: new Date() }, TZ), false);
});

/* ————— Le rang des visites ————— */

const fridays = (count, from = at(2026, 11, 6)) =>
  gridDates(gridFrom(from, 1, TZ), 0, count).map((d, i) => ({ id: `v${i + 1}`, startsAt: d, cancelled: false, doneAt: null, series: 1 }));

test("une visite annulée ne compte pas : le cycle se termine au vendredi effectué suivant", () => {
  /* L'exemple de la demande : trois vendredis faits en novembre, le
     quatrième annulé pour un voyage, le cycle finit en décembre. */
  const v = fridays(6, at(2026, 11, 6));
  v[3].cancelled = true;                                   // vendredi 27 novembre
  const num = numberVisits(v, 4);
  assert.equal(num.get("v4"), undefined);
  assert.deepEqual(num.get("v5"), { cycle: 1, index: 4 });
  assert.equal(dateKey(v[4].startsAt, TZ), "2026-12-04");
  assert.deepEqual(num.get("v6"), { cycle: 2, index: 1 });
});

test("un abonné entré au cycle 3, deux visites faites : sa première visite enregistrée est 3/4", () => {
  const num = numberVisits(fridays(3), 4, startOffset(4, 3, 2));
  assert.deepEqual(num.get("v1"), { cycle: 3, index: 3 });
  assert.deepEqual(num.get("v2"), { cycle: 3, index: 4 });
  assert.deepEqual(num.get("v3"), { cycle: 4, index: 1 });
});

test("le cycle en cours avance avec le bouton « visite effectuée », pas avec l'heure", () => {
  const v = fridays(8);
  v[0].doneAt = v[0].startsAt;
  v[1].doneAt = v[1].startsAt;
  const now = new Date(v[2].startsAt.getTime() + DAY);   // le 3e vendredi est passé, non coché
  const view = viewSubscription({
    perCycle: 4, everyWeeks: 1, startCycle: 1, startDone: 0, paidCycles: { 1: "2026-11-06" },
    pendingMakeups: 0, active: true, visits: v,
  }, now);
  assert.equal(view.currentCycle, 1);
  assert.equal(view.doneInCurrent, 2);
  assert.equal(view.cycles[0].paidAt, "2026-11-06");
  assert.ok(view.alerts.some((a) => a.kind === "to_confirm" && a.visitId === "v3"));
  assert.equal(view.nextVisit.id, "v4");
});

test("un cycle qui dépasse huit semaines déclenche une alerte", () => {
  const v = fridays(4);
  v[3].startsAt = new Date(v[0].startsAt.getTime() + 9 * 7 * DAY);   // la 4e visite repoussée
  const view = viewSubscription({
    perCycle: 4, everyWeeks: 1, startCycle: 1, startDone: 0, paidCycles: {},
    pendingMakeups: 0, active: true, visits: v,
  }, v[0].startsAt);
  assert.equal(view.cycles[0].overdue, true);
  assert.ok(view.alerts.some((a) => a.kind === "overdue" && a.cycle === 1));
});

test("une semaine avant la dernière visite de la série, l'alerte de fin de série s'allume", () => {
  const v = fridays(24);
  const last = v[23].startsAt;
  const view = viewSubscription({
    perCycle: 4, everyWeeks: 1, startCycle: 1, startDone: 0, paidCycles: {},
    pendingMakeups: 0, active: true, visits: v.map((x) => ({ ...x, doneAt: x.startsAt < last ? x.startsAt : null })),
  }, new Date(last.getTime() - 6 * DAY));
  const alert = view.alerts.find((a) => a.kind === "series_ending");
  assert.equal(alert?.series, 1);
  assert.equal(alert?.lastAt.getTime(), last.getTime());
  /* Huit jours avant, pas encore. */
  const early = viewSubscription({
    perCycle: 4, everyWeeks: 1, startCycle: 1, startDone: 0, paidCycles: {},
    pendingMakeups: 0, active: true, visits: v,
  }, new Date(last.getTime() - 8 * DAY));
  assert.equal(early.alerts.some((a) => a.kind === "series_ending"), false);
});

test("la fin des douze mois se projette sur une seconde série, et s'annonce 30 jours avant", () => {
  const v = fridays(24);
  const view = viewSubscription({
    perCycle: 4, everyWeeks: 1, startCycle: 1, startDone: 0, paidCycles: {},
    pendingMakeups: 0, active: true, visits: v,
  }, v[0].startsAt);
  assert.equal(Math.round((view.termEndsAt.getTime() - v[23].startsAt.getTime()) / DAY), 24 * 7);

  const both = fridays(48).map((x, i) => ({ ...x, series: i < 24 ? 1 : 2 }));
  const end = viewSubscription({
    perCycle: 4, everyWeeks: 1, startCycle: 1, startDone: 0, paidCycles: {},
    pendingMakeups: 0, active: true, visits: both,
  }, new Date(both[47].startsAt.getTime() - 20 * DAY));
  assert.equal(end.termEndsAt.getTime(), both[47].startsAt.getTime());
  assert.ok(end.alerts.some((a) => a.kind === "term_ending"));
  assert.equal(end.latestSeries, 2);
});

/* ————— La vérification d'une série ————— */

test("une date déjà prise ou un jour fermé se signale, avec la raison", () => {
  const starts = gridDates(gridFrom(at(2026, 11, 7), 1, TZ), 0, 4);   // samedis
  const busy = [{ start: starts[2].getTime(), end: starts[2].getTime() + 2 * 3600_000 }];
  const noSaturday = { ...settings, hours: settings.hours.map((h) => (h.day === 6 ? { ...h, enabled: false } : h)) };
  const c = seriesConflicts(starts, 120, busy, settings, { now: at(2026, 10, 1), checkLead: true });
  assert.deepEqual(c.map((x) => [dateKey(x.startsAt, TZ), x.reason]), [["2026-11-21", "busy"]]);
  const closed = seriesConflicts(starts, 120, [], noSaturday, { now: at(2026, 10, 1) });
  assert.equal(closed.length, 4);
  assert.ok(closed.every((x) => x.reason === "closed"));
});

test("le délai de prévenance ne vaut que pour la première date, et pas pour l'artisan", () => {
  const starts = gridDates(gridFrom(at(2026, 11, 7), 1, TZ), 0, 3);
  const now = new Date(starts[0].getTime() - 3600_000);
  assert.deepEqual(seriesConflicts(starts, 120, [], settings, { now, checkLead: true }).map((x) => x.reason), ["lead"]);
  assert.equal(seriesConflicts(starts, 120, [], settings, { now, checkLead: false }).length, 0);
});

/* ————— Les courriels ————— */

const base = {
  ref: "ABO-TEST01", locale: "fr", clientName: "Claire Beaulieu", clientEmail: "claire@example.com",
  clientPhone: "450 943-1217", address: "88 rue Saint-Charles Ouest", city: "Longueuil", postalCode: "J4H 1C6",
  planName: "Exécutif", perCycle: 4, everyWeeks: 1, minutesPerVisit: 120,
  visits: gridDates(gridFrom(at(2026, 11, 6), 1, TZ), 0, 24),
  planCents: 36000, travelCents: 4000, totalCents: 40000, feePerVisitCents: 1000, travelZone: "Quartiers de Montréal",
  currency: "CAD", timezone: TZ, manageUrl: "https://nivexrepassage.ca/fr/abonnement/abc",
  siteUrl: "https://nivexrepassage.ca", businessPhone: "+1 450 943 1217", businessEmail: "styve1884@gmail.com",
};

test("la confirmation dit le rythme, la série, le montant du cycle et la règle de la veille", () => {
  const m = subscriptionConfirmation(base);
  const text = flat(m.text);
  assert.match(text, /vendredi, à 10 h 00, chaque semaine/);
  assert.match(text, /24 visites, jusqu'au/);
  assert.match(text, /Total d'un cycle: 400 \$/);
  assert.match(text, /23 h 59 la veille/);
  assert.match(text, /première visite du cycle/);
  assert.ok(m.html.includes(base.manageUrl));
  assert.ok(!/première heure offerte/i.test(text));
});

test("le rappel de la première visite d'un cycle annonce le paiement ; les autres non", () => {
  const first = flat(visitReminder({ ...base, startsAt: base.visits[4], cycle: 2, index: 1, paymentDue: true }).text);
  assert.match(first, /ouvre le cycle 2/);
  assert.match(first, /400 \$/);
  assert.match(first, /1\/4 du cycle 2/);
  const other = flat(visitReminder({ ...base, startsAt: base.visits[5], cycle: 2, index: 2, paymentDue: false }).text);
  assert.ok(!/ouvre le cycle/.test(other));
  assert.match(other, /jusqu'à 23 h 59 ce soir/);
});

test("le rappel d'un cycle déjà payé ne redemande rien", () => {
  const paid = flat(visitReminder({ ...base, startsAt: base.visits[4], cycle: 2, index: 1, paymentDue: false }).text);
  assert.ok(!/ouvre le cycle/.test(paid));
});

test("l'annulation dit la date de remplacement en fin de série", () => {
  const m = visitChanged({ ...base, startsAt: base.visits[3], cycle: 1, index: 4, paymentDue: false },
    { kind: "cancelled", replacement: at(2027, 4, 23) });
  assert.match(flat(m.text), /remplacée en fin de série, le vendredi 23 avril 2027/);
});

test("le courriel de l'artisan, une semaine avant la fin d'une série, demande si la suite est confirmée", () => {
  const s1 = flat(seriesNotice(base, { series: 1, lastAt: base.visits[23], termEnds: false }).text);
  assert.match(s1, /La série 1 de l'abonnement de Claire Beaulieu se termine/);
  assert.match(s1, /confirmée pour la série suivante/);
  const s2 = flat(seriesNotice(base, { series: 2, lastAt: base.visits[23], termEnds: true }).text);
  assert.match(s2, /douze mois/);
  assert.match(s2, /renouvellement/);
});

test("aucun point d'exclamation dans les courriels d'abonnement", () => {
  for (const locale of ["fr", "en"]) {
    const d = { ...base, locale };
    const v = { ...d, startsAt: base.visits[0], cycle: 1, index: 1, paymentDue: true };
    for (const m of [subscriptionConfirmation(d), visitReminder(v), visitReminder(v, true),
      visitChanged(v, { kind: "moved", from: base.visits[1] }), seriesNotice(d, { series: 1, lastAt: base.visits[23], termEnds: false })]) {
      assert.ok(!m.text.includes("!") && !m.subject.includes("!"), `${locale} : ${m.subject}`);
    }
  }
});

console.log(`\n${n} réussis, 0 échoués\n`);

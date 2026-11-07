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
  seriesOfCycle, TERM_CYCLES, withoutInterval, renewalFrom, paidCycleAmount, moveHorizonDays, MOVE_REACH_DAYS,
} = await import("../src/lib/cycles.ts");
const {
  ownerFirstVisit, SubscriptionError, phoneKey, addressKey, onlineSubscriptionRefused, ONLINE_SUBSCRIPTIONS_PER_DAY,
  planName,
} = await import("../src/lib/subscriptions.ts");
const { slotProblem } = await import("../src/lib/availability.ts");
const { SMS, smsWhen } = await import("../src/lib/sms.ts");
const { PLANS, planCents, planFullCents, planFromParam } = await import("../src/lib/pricing.ts");
const { readFileSync } = await import("node:fs");
const { FALLBACK_SETTINGS } = await import("../src/lib/settings.ts");
const { fromWall, toWall, dateKey, weekdayOfKey } = await import("../src/lib/time.ts");
const { canSelfCancel } = await import("../src/lib/bookings.ts");
const { visitReminder, subscriptionConfirmation, subscriptionOwnerNotification, visitChanged, seriesNotice } = await import("../src/lib/email.ts");
const { CANCEL_WINDOW_HOURS, SERIES_CYCLES } = await import("../src/lib/brand.ts");
const { evaluateZone, DEFAULT_ZONE_POLICY } = await import("../src/lib/travel.ts");

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
  assert.equal(plan("essentiel-2h").everyWeeks, 4);
  assert.deepEqual(PLANS.map((p) => p.minutesPerVisit), [120, 180, 120, 120, 180]);
});

test("cinq formules, de la plus légère à la plus complète, sous leurs noms du 1er novembre 2026", () => {
  assert.deepEqual(PLANS.map((p) => [p.key, p.fr.name, p.en.name]), [
    ["essentiel-2h", "Essentiel", "Essential"],
    ["essentiel", "Premium", "Premium"],
    ["confort", "Premium Plus", "Premium Plus"],
    ["executif", "VIP", "VIP"],
    ["grande-famille", "Prestige", "Prestige"],
  ]);
  assert.equal(new Set(PLANS.map((p) => p.key)).size, PLANS.length, "une clé par formule");
});

test("une clé ne change jamais de formule : les anciennes gardent leur rythme et leur durée", () => {
  /* Les abonnés et les liens déjà envoyés (?formule=…) portent ces clés :
     elles désignent pour toujours la même formule, quel que soit son nom.
     Le nouvel Essentiel a reçu une clé neuve ; « essentiel » est le Premium. */
  const forme = (k) => { const p = plan(k); return p && [p.visits, p.minutesPerVisit, p.everyWeeks]; };
  assert.deepEqual(forme("essentiel"), [1, 180, 4]);
  assert.deepEqual(forme("confort"), [2, 120, 2]);
  assert.deepEqual(forme("executif"), [4, 120, 1]);
  assert.deepEqual(forme("grande-famille"), [4, 180, 1]);
  assert.deepEqual(forme("essentiel-2h"), [1, 120, 4]);
  for (const p of PLANS) {
    for (const nom of [p.fr.name, p.en.name, p.fr.detail, p.en.detail, p.fr.short, p.en.short]) {
      assert.doesNotMatch(nom, /Confort|Comfort|Exécutif|Executive|Grande Famille|Large Family/, `${p.key} : « ${nom} »`);
    }
  }
  assert.deepEqual(PLANS.filter((p) => /Essenti/.test(p.fr.name + p.en.name)).map((p) => p.key), ["essentiel-2h"],
    "« Essentiel » ne désigne plus que la formule de 2 h");
});

test("l'adresse dit le nom du jour, et un lien d'avant ouvre toujours la même formule", () => {
  assert.deepEqual(PLANS.map((p) => p.slug), ["essentiel-2h", "premium", "premium-plus", "vip", "prestige"]);
  const cle = (v) => planFromParam(v)?.key ?? null;
  assert.equal(cle("premium"), "essentiel");
  assert.equal(cle("premium-plus"), "confort");
  assert.equal(cle("vip"), "executif");
  assert.equal(cle("prestige"), "grande-famille");
  assert.equal(cle("essentiel-2h"), "essentiel-2h");
  /* Les liens envoyés ou imprimés avant le 1er novembre 2026. */
  assert.equal(cle("essentiel"), "essentiel", "un ancien lien Essentiel ouvre le Premium, la formule de 3 h");
  assert.equal(cle("confort"), "confort");
  assert.equal(cle("executif"), "executif");
  assert.equal(cle("grande-famille"), "grande-famille");
  assert.equal(cle("inconnue"), null);
  assert.equal(cle(undefined), null);
  for (const p of PLANS) {
    assert.ok(!PLANS.some((q) => q !== p && q.key === p.slug), `le mot « ${p.slug} » n'est la clé d'aucune autre formule`);
  }
  assert.equal(new Set(PLANS.map((p) => p.slug)).size, PLANS.length);
});

test("un abonné d'avant lit le nom de sa clé, jamais celui qu'il a gardé en base", () => {
  assert.equal(planName({ planKey: "essentiel", planName: "Essentiel" }, "fr"), "Premium");
  assert.equal(planName({ planKey: "confort", planName: "Confort" }, "en"), "Premium Plus");
  assert.equal(planName({ planKey: "executif", planName: "Exécutif" }, "fr"), "VIP");
  assert.equal(planName({ planKey: "grande-famille", planName: "Grande Famille" }, "fr"), "Prestige");
  assert.equal(planName({ planKey: "essentiel-2h", planName: "Essentiel" }, "en"), "Essential");
  assert.equal(planName({ planKey: "disparue", planName: "Ancienne" }, "fr"), "Ancienne", "une clé inconnue garde son nom");
});

test("la synchronisation des noms donne à chaque ancienne clé le nom de la grille, et ne touche pas au nouvel Essentiel", () => {
  /* Une coquille dans le SQL ne se verrait qu'en production, une seule fois. */
  const db = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
  const bloc = db.slice(db.indexOf("names (plan_key, plan_name) AS"), db.indexOf("), subs AS"));
  const paires = [...bloc.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(paires, PLANS.filter((p) => p.key !== "essentiel-2h").map((p) => [p.key, p.fr.name]));
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

test("une série Premium Plus avance de deux semaines en deux semaines", () => {
  const ds = gridDates(gridFrom(at(2026, 11, 3, 14), 2, TZ), 0, 3).map((d) => dateKey(d, TZ));
  assert.deepEqual(ds, ["2026-11-03", "2026-11-17", "2026-12-01"]);
});

test("le rang suivant de la grille, après une date donnée", () => {
  const g = gridFrom(at(2026, 11, 6), 1, TZ);
  assert.equal(gridIndexAfter(g, at(2026, 11, 6)), 1);
  assert.equal(gridIndexAfter(g, at(2026, 11, 20, 9)), 2);
  assert.equal(gridIndexAfter(g, at(2027, 3, 26)), 21);
});

test("une série renouvelée en retard reprend à la prochaine date utile, jamais dans le passé", () => {
  /* La série 1 s'est terminée le mardi 15 septembre ; l'artisan pose la
     suivante le 18 octobre. Avant, elle repartait le 22 septembre, avec
     quatre dates déjà passées. */
  const g = gridFrom(at(2026, 3, 31), 1, TZ);                 // mardis 10 h
  const now = at(2026, 10, 18, 9);
  const earliest = new Date(now.getTime() + settings.leadHours * 3600_000);
  const late = gridDate(g, renewalFrom(g, at(2026, 9, 15), earliest));
  assert.equal(dateKey(late, TZ), "2026-10-20");
  assert.ok(late.getTime() > earliest.getTime());
  /* Posée à l'avance, elle suit simplement la dernière visite. */
  const early = gridDate(g, renewalFrom(g, at(2026, 12, 15), earliest));
  assert.equal(dateKey(early, TZ), "2026-12-22");
  /* Sans visite gardée, elle part de la prochaine date utile. */
  assert.equal(dateKey(gridDate(g, renewalFrom(g, null, earliest)), TZ), "2026-10-20");
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

test("les frais d'un abonné : ceux de la zone pour la durée de la visite, sans réduction", () => {
  assert.equal(subscriberFeeCents(1500), 1500);
  assert.equal(subscriberFeeCents(1000), 1000);
  assert.equal(subscriberFeeCents(0), 0);
  assert.equal(subscriberFeeCents(-300), 0, "jamais sous zéro");
});

test("à 55 $ l'heure, les formules coûtent 100, 150, 200, 400 et 600 $, au lieu de 110, 165, 220, 440 et 660 $", () => {
  assert.equal(settings.hourlyRate, 5500);
  const prix = Object.fromEntries(PLANS.map((p) => [p.key, [planCents(p, settings), planFullCents(p, settings)]]));
  assert.deepEqual(prix, {
    "essentiel-2h": [10000, 11000], essentiel: [15000, 16500], confort: [20000, 22000], executif: [40000, 44000],
    "grande-famille": [60000, 66000],
  });
});

test("VIP en zone B, visites de 2 h : 400 $ + 15 $ × 4 = 460 $", () => {
  const q = quoteCycle(plan("executif"), settings, 1500);
  assert.deepEqual(q, { planCents: 40000, travelCents: 6000, totalCents: 46000, feePerVisitCents: 1500 });
});

test("les cinq formules lues sur la grille : en zone B, 15 $ par visite de 2 h et 10 $ par visite de 3 h ; à Montréal, rien", () => {
  const devis = (k, code) => quoteCycle(plan(k), settings, evaluateZone(code, plan(k).minutesPerVisit, DEFAULT_ZONE_POLICY).feeCents);
  const cles = ["essentiel-2h", "essentiel", "confort", "executif", "grande-famille"];
  assert.deepEqual(cles.map((k) => { const q = devis(k, "J2W 1A1"); return [q.feePerVisitCents, q.travelCents, q.totalCents]; }),
    [[1500, 1500, 11500], [1000, 1000, 16000], [1500, 3000, 23000], [1500, 6000, 46000], [1000, 4000, 64000]]);
  for (const k of cles) {
    assert.equal(devis(k, "H3B 1A1").travelCents, 0, `${k} au centre-ville de Montréal, en zone A`);
    assert.equal(devis(k, "J5R 1A1").travelCents, 0, `${k} à Candiac, en zone A`);
  }
});

test("une adresse sans frais ne paie que la formule", () => {
  const q = quoteCycle(plan("confort"), settings, 0);
  assert.equal(q.travelCents, 0);
  assert.equal(q.totalCents, q.planCents);
});

test("un cycle encaissé garde son montant, même si les frais changent ensuite", () => {
  /* Reçu à 400 $ (360 $ + 4 × 10 $), puis frais mis à 0 $ : la fiche du cycle
     dit toujours 400 $, dont 40 $ de frais. */
  assert.deepEqual(paidCycleAmount(36000, 40000), { planCents: 36000, travelCents: 4000, totalCents: 40000 });
  assert.deepEqual(paidCycleAmount(36000, 36000), { planCents: 36000, travelCents: 0, totalCents: 36000 });
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

test("une série du samedi soir tient dans 18 h – 22 h : 2 h jusqu'à 20 h, 3 h jusqu'à 19 h", () => {
  /* L'horaire du 2 novembre 2026 : le samedi ouvre de 18 h à 22 h. */
  const soirs = { ...settings, hours: settings.hours.map((h) => (
    h.day === 6 || (h.day >= 1 && h.day <= 4) ? { ...h, enabled: true, open: "18:00", close: "22:00" }
      : { ...h, enabled: true, open: "07:00", close: "22:00" })) };
  const serie = (h, min, everyWeeks) => gridDates(gridFrom(at(2026, 11, 7, h, min), everyWeeks, TZ), 0, 6);
  const now = at(2026, 11, 2);
  for (const [plan, h, min] of [["vip", 20, 0], ["essentiel-2h", 20, 0], ["premium-plus", 20, 0], ["prestige", 19, 0], ["premium", 19, 0]]) {
    const p = planFromParam(plan);
    const starts = serie(h, min, p.everyWeeks);
    assert.ok(starts.every((d) => weekdayOfKey(dateKey(d, TZ)) === 6), `${plan} : tous des samedis`);
    assert.deepEqual(seriesConflicts(starts, p.minutesPerVisit, [], soirs, { now }), [], `${plan} à ${h} h ${min}`);
  }
  for (const [plan, h, min] of [["vip", 20, 30], ["prestige", 19, 30], ["premium", 20, 0], ["essentiel-2h", 17, 30]]) {
    const p = planFromParam(plan);
    const c = seriesConflicts(serie(h, min, p.everyWeeks), p.minutesPerVisit, [], soirs, { now });
    assert.equal(c.length, 6, `${plan} à ${h} h ${min} : toutes les dates refusées`);
    assert.ok(c.every((x) => x.reason === "closed"), plan);
  }
});

test("le délai de prévenance ne vaut que pour la première date, et pas pour l'artisan", () => {
  const starts = gridDates(gridFrom(at(2026, 11, 7), 1, TZ), 0, 3);
  const now = new Date(starts[0].getTime() - 3600_000);
  assert.deepEqual(seriesConflicts(starts, 120, [], settings, { now, checkLead: true }).map((x) => x.reason), ["lead"]);
  assert.equal(seriesConflicts(starts, 120, [], settings, { now, checkLead: false }).length, 0);
});

/* ————— Déplacer une visite ————— */

const block = (start, end) => ({ start: start.getTime(), end: end.getTime() });

test("une visite de 10 h glisse à 11 h le même jour : son propre événement Google ne la gêne plus", () => {
  /* Mardi 10 h–12 h : son événement couvre 9 h 45–12 h 15, installation et
     rangement compris. Un autre rendez-vous l'après-midi. */
  const own = block(at(2026, 11, 3, 9, 45), at(2026, 11, 3, 12, 15));
  const other = block(at(2026, 11, 3, 16), at(2026, 11, 3, 17));
  const now = at(2026, 10, 1);
  const p = (h, m, busy) => slotProblem(at(2026, 11, 3, h, m).getTime(), 120, busy, settings, now, { checkLead: true });
  assert.equal(p(11, 0, [own, other]), "busy");                       // avant : elle se gênait elle-même
  const busy = withoutInterval([own, other], own);
  assert.equal(p(11, 0, busy), null);
  assert.equal(p(8, 0, busy), null);
  assert.equal(p(12, 30, busy), null);
  assert.equal(p(14, 0, busy), "busy");                                // le rendez-vous de 16 h, tampon compris
});

test("son bloc se retranche même fondu avec un rendez-vous voisin dans la disponibilité de Google", () => {
  /* Google rend une seule plage, 9 h 45–14 h, quand un autre événement suit
     la visite : chercher une plage identique ne trouverait rien. */
  const fused = block(at(2026, 11, 3, 9, 45), at(2026, 11, 3, 14));
  const own = block(at(2026, 11, 3, 9, 45), at(2026, 11, 3, 12, 15));
  const busy = withoutInterval([fused], own);
  assert.deepEqual(busy, [block(at(2026, 11, 3, 12, 15), at(2026, 11, 3, 14))]);
  const now = at(2026, 10, 1);
  assert.equal(slotProblem(at(2026, 11, 3, 8).getTime(), 120, busy, settings, now), null);
  assert.equal(slotProblem(at(2026, 11, 3, 10, 30).getTime(), 120, busy, settings, now), "busy");
  /* Ce qui ne touche pas le bloc reste entier ; ce qui le déborde des deux côtés est coupé en deux. */
  assert.deepEqual(withoutInterval([{ start: 0, end: 10 }], { start: 20, end: 30 }), [{ start: 0, end: 10 }]);
  assert.deepEqual(withoutInterval([{ start: 0, end: 100 }], { start: 20, end: 30 }), [{ start: 0, end: 20 }, { start: 30, end: 100 }]);
  assert.deepEqual(withoutInterval([{ start: 20, end: 30 }], { start: 0, end: 100 }), []);
});

test("le client cherche une nouvelle heure jusqu'à deux semaines après sa visite, au-delà de l'horizon", () => {
  assert.equal(MOVE_REACH_DAYS, 14);
  assert.equal(moveHorizonDays("2026-10-19", "2027-03-09", 45), 141 + 14);   // une visite de mars
  assert.equal(moveHorizonDays("2026-10-19", "2026-10-29", 45), 45);         // l'horizon suffit déjà
  /* Le passage à l'heure normale ne décale pas le compte des jours. */
  assert.equal(moveHorizonDays("2026-10-30", "2026-11-02", 0), 3 + 14);
});

/* ————— La saisie de l'artisan ————— */

test("l'artisan ne peut pas entrer une prochaine visite déjà passée", () => {
  const now = at(2026, 10, 18, 9);
  const refused = (date, time) => {
    try { ownerFirstVisit(date, time, TZ, now); return null; } catch (e) { return e; }
  };
  const typo = refused("2025-10-14", "10:00");                        // l'année mal saisie
  assert.ok(typo instanceof SubscriptionError);
  assert.equal(typo.code, "past");
  assert.equal(refused("2026-10-18", "08:30")?.code, "past");        // ce matin, déjà commencé
  assert.equal(refused("2026-10-20", "10:00"), null);
  assert.equal(ownerFirstVisit("2026-10-20", "10:00", TZ, now).getTime(), at(2026, 10, 20, 10).getTime());
});

/* ————— Les garde-fous de l'abonnement en ligne ————— */

test("un même téléphone ou une même adresse, écrits autrement, se reconnaissent", () => {
  assert.equal(phoneKey("514 555-0142"), "5145550142");
  assert.equal(phoneKey("+1 (514) 5550142"), "5145550142");
  assert.equal(phoneKey("abc"), null);
  assert.equal(addressKey("88, rue Saint-Édouard", "j4h 1c6"), addressKey("88 RUE SAINT-EDOUARD", "J4H1C6"));
  assert.notEqual(addressKey("88 rue Saint-Édouard", "J4H 1C6"), addressKey("90 rue Saint-Édouard", "J4H 1C6"));
});

test("un abonnement en ligne de plus est refusé : même téléphone, même adresse, ou trop pour la journée", () => {
  const sub = (o) => ({ phone: "514 555-0142", address: "88 rue Saint-Charles Ouest", postalCode: "J4H 1C6", active: true, recent: false, ...o });
  const ask = { phone: "514 555-0101", address: "12 rue Notre-Dame", postalCode: "J4P 2A1" };
  assert.equal(onlineSubscriptionRefused([sub()], ask), false);
  assert.equal(onlineSubscriptionRefused([sub()], { ...ask, phone: "+1 514 555 0142" }), true);
  assert.equal(onlineSubscriptionRefused([sub()], { ...ask, address: "88, Rue Saint-Charles Ouest", postalCode: "j4h1c6" }), true);
  /* Un abonnement terminé ne retient ni le téléphone ni l'adresse. */
  assert.equal(onlineSubscriptionRefused([sub({ active: false, recent: true })], { ...ask, phone: "514 555-0142" }), false);
  const day = Array.from({ length: ONLINE_SUBSCRIPTIONS_PER_DAY }, (_, i) => sub({ phone: `450 555-01${10 + i}`, address: `${i} rue X`, recent: true }));
  assert.equal(onlineSubscriptionRefused(day.slice(1), ask), false);
  assert.equal(onlineSubscriptionRefused(day, ask), true);
});

/* ————— Les textos de l'abonnement ————— */

test("fin d'abonnement, série renouvelée, visite replacée : un texto calme, signé, dans les deux langues", () => {
  const visit = at(2026, 11, 3, 14);
  const msgs = ["fr", "en"].flatMap((l) => [
    SMS.subscriptionEnded(l, 1), SMS.subscriptionEnded(l, 5),
    SMS.seriesRenewed(l, smsWhen(visit, TZ, l), l === "en" ? "every week" : "chaque semaine", "https://x"),
    SMS.visitPlaced(l, smsWhen(visit, TZ, l)),
  ]);
  for (const m of msgs) {
    assert.ok(m.startsWith("NIVEX") && !m.includes("!"), m);
    assert.ok(!m.includes(".."), `double point : ${m}`);
  }
  assert.match(SMS.subscriptionEnded("fr", 1), /Votre visite à venir est annulée\./);
  assert.match(SMS.subscriptionEnded("fr", 5), /Vos 5 visites à venir sont annulées\./);
  assert.match(SMS.subscriptionEnded("en", 1), /Your upcoming visit is cancelled\./);
  assert.match(flat(SMS.visitPlaced("fr", smsWhen(visit, TZ, "fr"))), /remplacement est posée le mardi 3 novembre/);
});

/* ————— Les courriels ————— */

const base = {
  ref: "ABO-TEST01", locale: "fr", clientName: "Claire Beaulieu", clientEmail: "claire@example.com",
  clientPhone: "514 555-0142", address: "88 rue Saint-Charles Ouest", city: "Longueuil", postalCode: "J4H 1C6",
  planName: "VIP", perCycle: 4, everyWeeks: 1, minutesPerVisit: 120,
  visits: gridDates(gridFrom(at(2026, 11, 6), 1, TZ), 0, 24),
  planCents: 36000, travelCents: 4000, totalCents: 40000, feePerVisitCents: 1000, travelZone: "Quartiers de Montréal",
  currency: "CAD", timezone: TZ, manageUrl: "https://nivexrepassage.ca/fr/abonnement/abc",
  siteUrl: "https://nivexrepassage.ca", businessPhone: "+1 514 555 0142", businessEmail: "contact@nivexrepassage.ca",
};

test("la confirmation dit le rythme, la série, le montant du cycle et la règle de la veille", () => {
  const m = subscriptionConfirmation(base);
  const text = flat(m.text);
  assert.match(text, /vendredi, à 10 h 00, chaque semaine/);
  assert.match(text, /24 visites, jusqu'au/);
  assert.match(text, /Total d'un cycle: 400 \$/);
  assert.match(text, /Frais de déplacement de votre zone : 10 \$ par visite, réglés avec le cycle\./);
  assert.doesNotMatch(text, /réduit/, "plus de réduction des abonnés sur la route");
  assert.match(text, /23 h 59 la veille/);
  assert.match(text, /première visite du cycle/);
  assert.ok(m.html.includes(base.manageUrl));
  assert.ok(!/première heure offerte/i.test(text));
});

test("une série d'une seule visite se dit au singulier, au client comme à l'artisan", () => {
  /* Un abonné entré au cycle 6 : il ne reste qu'une visite à poser. */
  const one = { ...base, visits: base.visits.slice(0, 1) };
  assert.match(flat(subscriptionConfirmation(one).text), /Une visite, le vendredi 6 novembre/);
  assert.ok(!/1 visites/.test(subscriptionConfirmation(one).text));
  assert.match(flat(subscriptionConfirmation({ ...one, locale: "en" }).text), /One visit, on Friday, November 6/);
  assert.match(flat(subscriptionOwnerNotification(one, true).text), /Une visite, le vendredi 6 novembre/);
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

test("le rappel dit l'arrivée : à l'heure du début, ou 15 minutes avant dans l'ancien déroulement", () => {
  const v = { ...base, startsAt: base.visits[5], cycle: 2, index: 2, paymentDue: false };
  const neuf = flat(visitReminder({ ...v, setupMinutes: 0 }).text);
  assert.match(neuf, /arrive à l'heure du début\. Chaque visite de 2 heures inclut l'installation et le rangement de notre matériel, 5 minutes chacun : 1 h 50 de repassage\./);
  assert.doesNotMatch(neuf, /15 minutes/);
  assert.match(flat(visitReminder({ ...v, setupMinutes: 15 }).text), /15 minutes avant le début de chaque visite/);
  assert.match(flat(subscriptionConfirmation({ ...base, setupMinutes: 0 }).text), /arrive à l'heure du début/);
  assert.match(flat(subscriptionConfirmation({ ...base, locale: "en", setupMinutes: 0 }).text), /Each visit of 2 hours includes setting up/);
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

/* ————— Déplacer une visite (7 novembre 2026) —————

   Le cas vécu : la visite 3/4, du ven. 13 nov. 13 h au mar. 10 nov. 18 h 30,
   restait au 13 dans l'agenda, et le 13 restait bloqué ; la 4/4, du 20 nov.
   au 13 nov. 13 h, était refusée. L'agenda est simulé (tests/tools/fake-google.mjs),
   la base aussi, ici en mémoire : le banc rejoue le même scénario sur une
   vraie base, par le vrai `moveVisit` (tools/local/scenario-deplacement.mjs). */

const { fakeGoogle } = await import("./tools/fake-google.mjs");
const { createRecurringEvent, listInstances, listEvents, freeBusy, moveEvent, deleteEvent } = await import("../src/lib/google.ts");
const { slotVerdict, occupationsFromEvents, computeSlots } = await import("../src/lib/availability.ts");
const { refusalText } = await import("../src/lib/subscriptions.ts");

const testAsync = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
console.log("\nDéplacer une visite : l'agenda suit, l'ancien créneau se libère\n");

/* L'horaire de la maison depuis le 1er novembre 2026. */
const HOURS = [
  { day: 0, enabled: true, open: "07:00", close: "22:00" },
  ...[1, 2, 3, 4].map((day) => ({ day, enabled: true, open: "18:00", close: "22:00" })),
  { day: 5, enabled: true, open: "07:00", close: "22:00" },
  { day: 6, enabled: true, open: "18:00", close: "22:00" },
];
const house = { ...settings, hours: HOURS, bufferMinutes: 30 };
const TOKEN = "jeton-essai", CAL = "primary", SUB = "abonnement-essai";
const nov = (d, h, min = 0) => at(2026, 11, d, h, min);
const NOW = nov(7, 11);
const noWait = { sleep: async () => {} };

/**
 * Un abonné VIP : chaque vendredi à 13 h, deux heures, une série de six
 * dans l'agenda. Les rangs : 30 oct. 1/4, 6 nov. 2/4, 13 nov. 3/4,
 * 20 nov. 4/4, puis 27 nov. et 4 déc. au cycle suivant. Une autre cliente
 * a sa séance le vendredi 13 de 16 h à 18 h.
 */
async function vipSeries(opts = {}) {
  const g = fakeGoogle({ tz: TZ, ...opts });
  g.install();
  const master = await createRecurringEvent(TOKEN, {
    calendarId: CAL, summary: "NIVEX — Client essai · VIP", description: "", location: "",
    start: at(2026, 10, 30, 13).toISOString(), end: at(2026, 10, 30, 15).toISOString(), timeZone: TZ,
    rrule: "RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=6",
  });
  const visits = (await listInstances(TOKEN, CAL, master.id)).map((x, i) => ({
    id: `visite-${i + 1}`, ref: `NVX-V${i + 1}`, startsAt: new Date(x.originalStart),
    endsAt: new Date(Date.parse(x.originalStart) + 2 * 3600_000), googleEventId: x.id, cancelled: false,
  }));
  const other = { id: "seance-autre", ref: "NVX-AUTRE", name: "Marie Tremblay", startsAt: nov(13, 16), endsAt: nov(13, 18) };
  const visit = (d) => visits.find((v) => v.startsAt.getTime() === nov(d, 13).getTime());
  g.calls.length = 0;

  /* Ce qui occupe l'artisan, comme `visitOccupations` : la base, sans la
     visite qu'on déplace, ses autres visites sans battement ; l'agenda,
     sans aucun événement de l'abonnement. */
  async function busy(excludeId) {
    const row = (v, home) => ({
      start: v.startsAt.getTime(), end: v.endsAt.getTime(), sameHome: home,
      who: { kind: "booking", id: v.id, ref: v.ref, name: v.name ?? "Client essai", subscriptionId: home ? SUB : null,
        startsAt: v.startsAt.getTime(), endsAt: v.endsAt.getTime() },
    });
    const items = await listEvents(TOKEN, CAL, nov(1, 0).toISOString(), at(2026, 12, 31, 0).toISOString());
    return [
      ...visits.filter((v) => v.id !== excludeId && !v.cancelled).map((v) => row(v, true)),
      row(other, false),
      ...occupationsFromEvents(items, TZ, { eventIds: visits.map((v) => v.googleEventId), seriesIds: [master.id] }),
    ];
  }

  const ranks = () => new Map([...numberVisits(visits, 4)].map(([id, x]) => [id, `${x.index}/4`]));
  const why = async (v, to) => refusalText(
    slotVerdict(to.getTime(), 120, await busy(v.id), house, NOW, { checkLead: false }),
    { tz: TZ, bufferMinutes: 30, durationMinutes: 120, ranks: ranks() },
  );

  /* Le déplacement par l'artisan, dans l'ordre de `moveVisit` : le contrôle,
     la base, puis l'événement de la visite seul. */
  async function move(v, to) {
    const verdict = slotVerdict(to.getTime(), 120, await busy(v.id), house, NOW, { checkLead: false });
    if (verdict.problem) return { verdict, calendar: null };
    v.startsAt = to;
    v.endsAt = new Date(to.getTime() + 2 * 3600_000);
    const calendar = await moveEvent(TOKEN, CAL, v.googleEventId, {
      summary: "NIVEX — Client essai · VIP", description: "", location: "",
      start: v.startsAt.toISOString(), end: v.endsAt.toISOString(), timeZone: TZ,
    }, noWait);
    if (calendar.status !== "moved" && !(calendar.status === "failed" && calendar.stale)) {
      v.googleEventId = calendar.status === "failed" ? null : calendar.eventId;
    }
    return { verdict, calendar };
  }

  return { g, master, visits, visit, busy, ranks, why, move };
}

{
  const s = await vipSeries();
  const v3 = s.visit(13), v4 = s.visit(20);
  const id3 = v3.googleEventId, id4 = v4.googleEventId;

  await testAsync("la 3/4 passe du ven. 13 nov. 13 h au mar. 10 nov. 18 h 30 : son événement est retouché, l'ancien créneau se libère", async () => {
    const r = await s.move(v3, nov(10, 18, 30));
    assert.equal(r.verdict.problem, null);
    assert.deepEqual(r.calendar, { status: "moved", eventId: id3 });
    assert.deepEqual(s.g.at(nov(10, 18, 30)).map((e) => e.id), [id3]);
    assert.equal(s.g.at(nov(13, 13)).length, 0, "plus rien au 13 à 13 h");
    assert.equal(s.g.visible().length, 6, "aucun doublon");
    assert.deepEqual(s.g.calls.filter((c) => c.op !== "events.list").map((c) => `${c.op} ${c.id}`), [`events.patch ${id3}`]);
  });

  await testAsync("puis la 4/4 passe du 20 nov. au ven. 13 nov. 13 h : accepté, deux visites dans la même semaine", async () => {
    const r = await s.move(v4, nov(13, 13));
    assert.equal(r.verdict.problem, null);
    assert.deepEqual(r.calendar, { status: "moved", eventId: id4 });
    assert.deepEqual(s.g.at(nov(13, 13)).map((e) => e.id), [id4]);
    assert.equal(s.g.at(nov(20, 13)).length, 0, "le 20 se libère");
    assert.equal(s.g.visible().length, 6);
    /* Lundi 9 – dimanche 15 novembre : la même semaine. */
    assert.ok(v3.startsAt >= nov(9, 0) && v4.startsAt < nov(16, 0));
    const r2 = s.ranks();
    assert.equal(r2.get(v3.id), "3/4");
    assert.equal(r2.get(v4.id), "4/4");
  });

  await testAsync("chaque refus dit sa vraie raison : horaire, autre client, battement, même abonnement, agenda", async () => {
    const v5 = s.visit(27);
    assert.equal(await s.why(v5, nov(10, 13)),
      "Hors de l'horaire : le mardi, une visite de 2 heures se place entre 18 h et 22 h, donc au plus tard à 20 h.");
    assert.equal(await s.why(v5, nov(13, 16)),
      "Conflit avec la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h.");
    assert.equal(await s.why(v5, nov(13, 15, 30)),
      "Conflit avec la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h.");
    assert.equal(await s.why(v5, nov(13, 18, 15)),
      "Trop près de la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h : il faut 30 min entre deux rendez-vous, pour la route.");
    assert.equal(await s.why(v5, nov(10, 19)),
      "Conflit avec la visite 3/4 de ce même abonnement, mar. 10 nov., 18 h 30 – 20 h 30.");
    /* Collée à une visite du même abonnement : même adresse, pas de route. */
    assert.equal(await s.why(v5, nov(13, 11)), "");
    s.g.add({ summary: "Dentiste", start: nov(12, 19), end: nov(12, 20) });
    assert.equal(await s.why(v5, nov(12, 18)),
      "Conflit avec « Dentiste », dans votre agenda Google, jeu. 12 nov., 19 h – 20 h.");
    s.g.add({ summary: "Congé", allDay: true, start: nov(14, 0), end: nov(15, 0) });
    assert.equal(await s.why(v5, nov(14, 18)),
      "Conflit avec « Congé », dans votre agenda Google, toute la journée du sam. 14 nov.");
    s.g.add({ summary: "Anniversaire de Léa", transparency: "transparent", start: nov(16, 18), end: nov(16, 22) });
    assert.equal(await s.why(v5, nov(16, 18)), "", "un événement « Disponible » ne gêne pas");
  });
  s.g.uninstall();
}

await testAsync("l'agenda resté à l'ancienne heure (la production le 7 novembre) ne bloque plus le 13", async () => {
  const s = await vipSeries();
  const v3 = s.visit(13), v4 = s.visit(20);
  /* Google n'a pas suivi : la base a la 3/4 au mar. 10, l'agenda au ven. 13. */
  v3.startsAt = nov(10, 18, 30);
  v3.endsAt = nov(10, 20, 30);
  assert.equal(s.g.at(nov(13, 13)).length, 1);

  /* L'ancien contrôle : la disponibilité de Google, moins le bloc de la
     visite qu'on déplace. Le 13 y est encore pris : c'était le refus. */
  const fb = (await freeBusy(TOKEN, CAL, nov(12, 13).toISOString(), nov(15, 13).toISOString(), TZ))
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const old = withoutInterval(fb, { start: v4.startsAt.getTime(), end: v4.endsAt.getTime() });
  assert.equal(slotProblem(nov(13, 13).getTime(), 120, old, house, NOW, { checkLead: false }), "busy");

  /* Le nouveau : les événements de l'abonnement ne comptent pas, la base fait foi. */
  const r = await s.move(v4, nov(13, 13));
  assert.equal(r.verdict.problem, null);
  assert.equal(r.calendar.status, "moved");

  /* Le même déplacement de la 3/4, à la même heure, remet son événement au 10. */
  const fix = await moveEvent(TOKEN, CAL, v3.googleEventId, {
    summary: "s", description: "", location: "", start: v3.startsAt.toISOString(), end: v3.endsAt.toISOString(), timeZone: TZ,
  }, noWait);
  assert.equal(fix.status, "moved");
  assert.deepEqual(s.g.at(nov(13, 13)).map((e) => e.id), [v4.googleEventId]);
  assert.deepEqual(s.g.at(nov(10, 18, 30)).map((e) => e.id), [v3.googleEventId]);
  s.g.uninstall();
});

await testAsync("Google refuse la retouche : l'événement est remplacé, jamais doublé", async () => {
  const s = await vipSeries();
  const v3 = s.visit(13), id3 = v3.googleEventId;
  s.g.fail({ op: "events.patch", id: id3, status: 400, reason: "invalid", message: "Invalid start time" });
  const r = await s.move(v3, nov(10, 18, 30));
  assert.equal(r.calendar.status, "replaced");
  assert.equal(r.calendar.previous, id3);
  assert.match(r.calendar.reason, /Invalid start time/);
  assert.equal(s.g.events.get(id3).status, "cancelled", "l'ancien est retiré");
  assert.deepEqual(s.g.at(nov(10, 18, 30)).map((e) => e.id), [r.calendar.eventId]);
  assert.equal(v3.googleEventId, r.calendar.eventId);
  assert.equal(s.g.at(nov(13, 13)).length, 0);
  assert.equal(s.g.visible().length, 6, "un retiré, un créé");
  s.g.uninstall();
});

await testAsync("Google refuse la retouche puis la suppression : rien n'est créé, l'échec remonte", async () => {
  const s = await vipSeries();
  const v3 = s.visit(13), id3 = v3.googleEventId;
  s.g.fail({ op: "events.patch", id: id3, status: 400, message: "Invalid start time" });
  s.g.fail({ op: "events.delete", id: id3, status: 400, message: "Bad Request" });
  const r = await s.move(v3, nov(10, 18, 30));
  assert.equal(r.calendar.status, "failed");
  assert.equal(r.calendar.stale, true);
  assert.equal(r.calendar.eventId, id3);
  assert.equal(s.g.calls.filter((c) => c.op === "events.insert").length, 0, "pas de second événement");
  assert.equal(s.g.at(nov(13, 13)).length, 1, "l'ancien reste, et l'onglet le dit");
  assert.equal(v3.googleEventId, id3);
  s.g.uninstall();
});

await testAsync("un refus passager se retente : débit dépassé, puis la retouche passe", async () => {
  const s = await vipSeries();
  const v3 = s.visit(13), id3 = v3.googleEventId;
  s.g.fail({ op: "events.patch", id: id3, status: 403, reason: "rateLimitExceeded", message: "Rate Limit Exceeded" });
  const waits = [];
  const r = await moveEvent(TOKEN, CAL, id3, {
    summary: "s", description: "", location: "", start: nov(10, 18, 30).toISOString(), end: nov(10, 20, 30).toISOString(), timeZone: TZ,
  }, { sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(r, { status: "moved", eventId: id3 });
  assert.deepEqual(waits, [400]);
  s.g.uninstall();
});

for (const deletedPatch of ["ok", "gone"]) {
  await testAsync(`un événement effacé à la main (Google répond ${deletedPatch === "ok" ? "200, supprimé" : "410"}) : la visite en reçoit un nouveau`, async () => {
    const s = await vipSeries({ deletedPatch });
    const v3 = s.visit(13), id3 = v3.googleEventId;
    await deleteEvent(TOKEN, CAL, id3, { notify: false });
    const r = await s.move(v3, nov(10, 18, 30));
    assert.equal(r.calendar.status, "created");
    assert.deepEqual(s.g.at(nov(10, 18, 30)).map((e) => e.id), [r.calendar.eventId]);
    assert.equal(s.g.events.get(id3).status, "cancelled", "l'ancien ne revient pas");
    s.g.uninstall();
  });
}

await testAsync("une création réussie dont la réponse se perd : la reprise ne double rien", async () => {
  const s = await vipSeries();
  const v3 = s.visit(13), id3 = v3.googleEventId;
  s.g.fail({ op: "events.patch", id: id3, status: 400, message: "Invalid start time" });
  s.g.fail({ op: "events.insert", status: 503, reason: "backendError", message: "Backend Error", after: true });
  const r = await s.move(v3, nov(10, 18, 30));
  assert.equal(r.calendar.status, "replaced");
  assert.deepEqual(s.g.at(nov(10, 18, 30)).map((e) => e.id), [r.calendar.eventId]);
  assert.equal(s.g.visible().length, 6, "un retiré, un seul créé");
  assert.equal(s.g.calls.filter((c) => c.op === "events.insert").length, 2, "la création reprise une fois");
  assert.match(r.calendar.eventId, /^[0-9a-v]{26}$/, "un identifiant choisi par nous, dans l'alphabet de Google");
  s.g.uninstall();
});

test("l'agenda lu événement par événement : ce que Google compterait occupé, sans l'abonnement", () => {
  const ev = (id, extra = {}) => ({
    id, status: "confirmed", summary: id,
    start: { dateTime: "2026-11-13T13:00:00-05:00" }, end: { dateTime: "2026-11-13T15:00:00-05:00" }, ...extra,
  });
  const got = occupationsFromEvents([
    ev("perso"),
    ev("libre", { transparency: "transparent" }),
    ev("refusee", { attendees: [{ self: true, responseStatus: "declined" }] }),
    ev("invitation", { attendees: [{ self: true, responseStatus: "needsAction" }] }),
    ev("bureau", { eventType: "workingLocation" }),
    ev("annulee", { status: "cancelled" }),
    ev("visite-simple"),
    ev("serie_20261113T180000Z", { recurringEventId: "serie" }),
    ev("journee", { start: { date: "2026-11-14" }, end: { date: "2026-11-15" } }),
  ], TZ, { eventIds: ["visite-simple"], seriesIds: ["serie"] });
  assert.deepEqual(got.map((o) => o.who.summary), ["perso", "invitation", "journee"]);
  const day = got[2];
  assert.equal(day.start, at(2026, 11, 14, 0).getTime());
  assert.equal(day.end, at(2026, 11, 15, 0).getTime());
  assert.equal(day.who.allDay, true);
});

test("la raison d'un refus ne cite jamais de point d'exclamation, et dit « fermée » un jour sans horaire", () => {
  const closed = { ...house, hours: HOURS.map((h) => (h.day === 0 ? { ...h, enabled: false } : h)) };
  const v = slotVerdict(at(2026, 11, 15, 13).getTime(), 120, [], closed, NOW, { checkLead: false });
  assert.equal(refusalText(v, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 }), "Hors de l'horaire : la maison est fermée le dimanche.");
  const short = { ...house, hours: HOURS.map((h) => (h.day === 2 ? { ...h, open: "21:00" } : h)) };
  const w = slotVerdict(nov(10, 21).getTime(), 120, [], short, NOW, { checkLead: false });
  assert.equal(refusalText(w, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 }),
    "Hors de l'horaire : le mardi, de 21 h à 22 h, une visite de 2 heures ne tient pas.");
  const anon = slotVerdict(nov(13, 13).getTime(), 120, [{ start: nov(13, 14).getTime(), end: nov(13, 15).getTime() }], house, NOW, { checkLead: false });
  assert.equal(refusalText(anon, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 }),
    "Conflit avec un autre rendez-vous, ven. 13 nov., 14 h – 15 h.");
  for (const t of [refusalText(v, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 }), refusalText(anon, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 })]) {
    assert.ok(!t.includes("!"));
  }
});

test("la raison dit l'arrivée anticipée quand c'est elle qui gêne", () => {
  const other = (setup) => ({
    start: nov(13, 16).getTime() - setup * 60_000, end: nov(13, 18).getTime() + setup * 60_000,
    who: { kind: "booking", id: "x", ref: "NVX-AUTRE", name: "Marie Tremblay", subscriptionId: null,
      startsAt: nov(13, 16).getTime(), endsAt: nov(13, 18).getTime() },
  });
  const say = (at, setup, theirs) => refusalText(
    slotVerdict(at.getTime(), 120, [other(theirs)], house, NOW, { checkLead: false, setupMinutes: setup }),
    { tz: TZ, bufferMinutes: 30, durationMinutes: 120 });
  assert.equal(say(nov(13, 18), 15, 0),
    "Conflit avec la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h, en comptant l'arrivée 15 min avant.");
  assert.equal(say(nov(13, 18), 0, 15),
    "Conflit avec la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h, en comptant l'arrivée 15 min avant.");
  assert.equal(say(nov(13, 18, 30), 15, 0),
    "Trop près de la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h, en comptant l'arrivée 15 min avant : il faut 30 min entre deux rendez-vous, pour la route.");
  assert.equal(say(nov(13, 17), 15, 0), "Conflit avec la séance de Marie Tremblay (NVX-AUTRE), ven. 13 nov., 16 h – 18 h.");
});

test("une journée entière, le jour du changement d'heure, reste une seule journée", () => {
  /* Le 7 novembre 2027, l'heure recule : ce dimanche dure 25 heures. */
  const busy = occupationsFromEvents([{ id: "conge", summary: "Congé", start: { date: "2027-11-07" }, end: { date: "2027-11-08" } }], TZ);
  const v = slotVerdict(at(2027, 11, 7, 13).getTime(), 120, busy, house, NOW, { checkLead: false });
  assert.equal(refusalText(v, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 }),
    "Conflit avec « Congé », dans votre agenda Google, toute la journée du dim. 7 nov.");
  const two = occupationsFromEvents([{ id: "c2", summary: "Congé", start: { date: "2027-11-06" }, end: { date: "2027-11-08" } }], TZ);
  const w = slotVerdict(at(2027, 11, 7, 13).getTime(), 120, two, house, NOW, { checkLead: false });
  assert.equal(refusalText(w, { tz: TZ, bufferMinutes: 30, durationMinutes: 120 }),
    "Conflit avec « Congé », dans votre agenda Google, du sam. 6 nov. au dim. 7 nov.");
});

test("le moteur de créneaux et le contrôle disent la même chose : pas de battement avec le même abonnement", () => {
  const visit = { start: nov(13, 13).getTime(), end: nov(13, 15).getTime() };
  const slots = (busy) => computeSlotsFor(busy).find((d) => d.date === "2026-11-13").slots.map((x) => x.time);
  const computeSlotsFor = (busy) => computeSlots({ fromKey: "2026-11-13", days: 1, durationMinutes: 120, settings: { ...house, leadHours: 0, horizonDays: 30 }, busy, now: NOW });
  assert.ok(slots([{ ...visit, sameHome: true }]).includes("15:00"), "collée à la visite du même abonnement");
  assert.ok(!slots([visit]).includes("15:00"), "à 30 min d'un autre rendez-vous");
  assert.equal(slotProblem(nov(13, 15).getTime(), 120, [{ ...visit, sameHome: true }], house, NOW, { checkLead: false }), null);
  assert.equal(slotProblem(nov(13, 15).getTime(), 120, [visit], house, NOW, { checkLead: false }), "busy");
});

console.log(`\n${n} réussis, 0 échoués\n`);

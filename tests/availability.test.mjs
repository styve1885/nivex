/**
 * Tests du moteur de disponibilités et des utilitaires de temps.
 * Exécution : node tests/availability.test.mjs
 * (on importe les sources TypeScript via un petit transpilateur maison :
 *  ici on ré-implémente rien, on charge les modules compilés par tsc.)
 */
import assert from "node:assert/strict";

const {
  computeSlots, merge, overlaps, slotIsFree, slotProblem, estimateMinutes, estimateCents,
  withSetup, onSlotGrid, horizonEnd, loadBusyRange,
} = await import("../src/lib/availability.ts");
const { fromWall, dateKey, addDaysToKey, weekdayOfKey, parseHM } = await import("../src/lib/time.ts");

const TZ = "America/Toronto";

const settings = {
  connected: true, paused: false, calendarId: "primary", timezone: TZ,
  businessName: "NIVEX", hourlyRate: 4500, currency: "CAD",
  minMinutes: 120, bufferMinutes: 30, leadHours: 24, horizonDays: 45, slotStep: 30,
  firstHourFree: true, ownerEmail: "a@b.c", ownerName: null, ownerPicture: null, connectedAt: null,
  hours: [
    { day: 0, enabled: false, open: "10:00", close: "16:00" },
    { day: 1, enabled: true,  open: "09:00", close: "19:00" },
    { day: 2, enabled: true,  open: "09:00", close: "19:00" },
    { day: 3, enabled: true,  open: "09:00", close: "19:00" },
    { day: 4, enabled: true,  open: "09:00", close: "19:00" },
    { day: 5, enabled: true,  open: "09:00", close: "19:00" },
    { day: 6, enabled: true,  open: "09:00", close: "16:00" },
  ],
  services: [
    { key: "shirt", icon: "shirt", fr: "Chemises", en: "Shirts", minutesPerUnit: 6, unitFr: "", unitEn: "", enabled: true },
    { key: "suit",  icon: "suit",  fr: "Costumes", en: "Suits",  minutesPerUnit: 16, unitFr: "", unitEn: "", enabled: true },
    { key: "off",   icon: "suit",  fr: "Inactif",  en: "Off",    minutesPerUnit: 60, unitFr: "", unitEn: "", enabled: false },
  ],
};

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

/* — un mercredi d'été, midi heure de l'Est — */
const NOW = new Date("2026-08-26T16:00:00.000Z"); // 12:00 EDT
const TODAY = dateKey(NOW, TZ);                    // 2026-08-26

console.log("\nFusion d'intervalles");
t("fusionne les chevauchements", () => {
  const r = merge([{ start: 10, end: 20 }, { start: 15, end: 30 }, { start: 40, end: 50 }]);
  assert.deepEqual(r, [{ start: 10, end: 30 }, { start: 40, end: 50 }]);
});
t("fusionne les intervalles adjacents", () => {
  assert.deepEqual(merge([{ start: 0, end: 10 }, { start: 10, end: 20 }]), [{ start: 0, end: 20 }]);
});
t("liste vide", () => assert.deepEqual(merge([]), []));
t("chevauchement strict", () => {
  assert.equal(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }), false);
  assert.equal(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 }), true);
});

console.log("\nEstimation");
t("durée = repassage + installation et rangement, arrondie au pas, plancher au minimum", () => {
  assert.equal(estimateMinutes([{ key: "shirt", qty: 5 }], settings), 120);  // 30 + 10 → plancher 120
  assert.equal(estimateMinutes([{ key: "shirt", qty: 18 }], settings), 120); // 108 + 10 : dix-huit pièces en 2 h
  assert.equal(estimateMinutes([{ key: "shirt", qty: 19 }], settings), 150); // 114 + 10 → 150
  assert.equal(estimateMinutes([{ key: "shirt", qty: 28 }], settings), 180); // 168 + 10 → 180
  assert.equal(estimateMinutes([{ key: "shirt", qty: 29 }], settings), 210); // 174 + 10 → 210
});
t("ignore les prestations inconnues", () => {
  assert.equal(estimateMinutes([{ key: "inexistant", qty: 99 }], settings), 0);
});
t("quantité négative neutralisée", () => {
  assert.equal(estimateMinutes([{ key: "shirt", qty: -5 }], settings), 0);
});
t("première heure offerte déduite", () => {
  assert.equal(estimateCents(180, settings, true), 4500 * 2);
  assert.equal(estimateCents(180, settings, false), 4500 * 3);
  assert.equal(estimateCents(60, settings, true), 0);
});

console.log("\nCalcul des créneaux");
const base = { fromKey: TODAY, days: 7, durationMinutes: 120, settings, busy: [], now: NOW };

t("dimanche fermé, aucun créneau", () => {
  const days = computeSlots(base);
  const sunday = days.find((d) => d.weekday === 0);
  assert.ok(sunday, "dimanche présent dans la plage");
  assert.equal(sunday.open, false);
  assert.equal(sunday.slots.length, 0);
});

t("respecte le délai de prévenance de 24 h", () => {
  const days = computeSlots(base);
  const all = days.flatMap((d) => d.slots);
  const earliest = Math.min(...all.map((s) => new Date(s.iso).getTime()));
  assert.ok(earliest >= NOW.getTime() + 24 * 3600_000, "aucun créneau avant 24 h");
});

t("dernier créneau du jour laisse la durée avant fermeture", () => {
  const days = computeSlots(base);
  const day = days.find((d) => d.open && d.slots.length > 0 && d.weekday !== 6);
  const last = day.slots[day.slots.length - 1];
  assert.equal(last.time, "17:00"); // 19:00 − 2 h
});

t("samedi ferme plus tôt", () => {
  const days = computeSlots({ ...base, days: 10 });
  const sat = days.find((d) => d.weekday === 6 && d.slots.length > 0);
  assert.equal(sat.slots[sat.slots.length - 1].time, "14:00"); // 16:00 − 2 h
});

/* Le vendredi 28 est hors du délai de prévenance : on y isole le tampon. */
const BUSY_FRI = (() => {
  const start = fromWall({ year: 2026, month: 8, day: 28, hour: 13, minute: 0 }, TZ).getTime();
  return [{ start, end: start + 3600_000 }]; // 13:00 – 14:00 heure locale
})();

t("une occupation bloque le créneau et le tampon autour", () => {
  const days = computeSlots({ ...base, busy: BUSY_FRI });
  const fri = days.find((d) => d.date === "2026-08-28");
  const times = fri.slots.map((s) => s.time);
  // durée 2 h, tampon 30 min → zone interdite 12:30–14:30
  for (const blocked of ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00"]) {
    assert.ok(!times.includes(blocked), `${blocked} devrait être bloqué`);
  }
});

t("le tampon est appliqué des deux côtés, et le créneau bloqué est la séance seule", () => {
  const days = computeSlots({ ...base, busy: BUSY_FRI });
  const fri = days.find((d) => d.date === "2026-08-28");
  const times = fri.slots.map((s) => s.time);
  // Occupation 13:00–14:00, tampon 30 min : rien entre 12:30 et 14:30.
  // L'installation et le rangement sont dans la séance : elle ne déborde pas.
  assert.ok(times.includes("10:30"), "10:30 finit à 12:30, au bord du tampon");
  assert.ok(!times.includes("11:00"), "11:00 finirait à 13:00, dans le tampon");
  assert.ok(!times.includes("14:00"), "14:00 commencerait dans le tampon");
  assert.ok(times.includes("14:30"), "14:30 commence juste après le tampon");
});

t("un abonné resté à l'ancien déroulement garde son quart d'heure de part et d'autre", () => {
  const days = computeSlots({ ...base, busy: BUSY_FRI, setupMinutes: 15 });
  const times = days.find((d) => d.date === "2026-08-28").slots.map((s) => s.time);
  assert.ok(times.includes("10:00") && !times.includes("10:30"), "10:30 rangerait jusqu'à 12:45, dans le tampon");
  assert.ok(!times.includes("14:30") && times.includes("15:00"), "14:30 s'installerait dès 14:15, dans le tampon");
});

/* Des réservations lues en base, telles que loadBusy les rend : la séance,
   élargie de ses propres minutes hors séance. */
const ROW_FRI = (() => {
  const start = fromWall({ year: 2026, month: 8, day: 28, hour: 13, minute: 0 }, TZ).getTime();
  return withSetup({ start, end: start + 2 * 3600_000 }, 15); // ancien déroulement : bloc 12:45 – 15:15
})();
const ROW_FRI_NEW = (() => {
  const start = fromWall({ year: 2026, month: 8, day: 28, hour: 13, minute: 0 }, TZ).getTime();
  return withSetup({ start, end: start + 2 * 3600_000 }, 0); // aujourd'hui : bloc 13:00 – 15:00
})();

t("une réservation en base laisse tout le tampon entre deux clients", () => {
  const fri = computeSlots({ ...base, busy: [ROW_FRI_NEW] }).find((d) => d.date === "2026-08-28");
  const times = fri.slots.map((s) => s.time);
  // Fin à 15:00, trente minutes de route : la séance suivante à 15:30.
  assert.ok(times.includes("15:30") && !times.includes("15:00"), "après : 15:30, pas 15:00");
  assert.ok(times.includes("10:30") && !times.includes("11:00"), "avant : 10:30, pas 11:00");
  // Un rendez-vous de l'ancien déroulement garde son quart d'heure.
  const old = computeSlots({ ...base, busy: [ROW_FRI] }).find((d) => d.date === "2026-08-28").slots.map((s) => s.time);
  assert.ok(old.includes("16:00") && !old.includes("15:30"), "ancien, après : 16:00, pas 15:30");
  assert.ok(old.includes("10:00") && !old.includes("10:30"), "ancien, avant : 10:00, pas 10:30");
});

t("sans tampon, le moteur dit la même chose que la contrainte de la base", () => {
  const sans = { ...settings, bufferMinutes: 0 };
  const fri = computeSlots({ ...base, settings: sans, busy: [ROW_FRI] }).find((d) => d.date === "2026-08-28");
  const times = fri.slots.map((s) => s.time);
  // nivex_occupied : [12:45, 15:15). Une séance à 15:30 occupe [15:15, …) —
  // acceptée ; à 15:00, elle occuperait [14:45, …) — refusée.
  assert.ok(times.includes("15:30") && !times.includes("15:00"), "après : 15:30, pas 15:00");
  assert.ok(times.includes("10:30") && !times.includes("11:00"), "avant : 10:30, pas 11:00");
  const quinze = fromWall({ year: 2026, month: 8, day: 28, hour: 15, minute: 0 }, TZ).getTime();
  assert.equal(slotProblem(quinze, 120, [ROW_FRI], sans, NOW), "busy");
  // Aujourd'hui, deux séances qui se touchent pile tiennent, comme en base :
  // 13:00–15:00 puis 15:00–17:00.
  assert.equal(slotProblem(quinze, 120, [ROW_FRI_NEW], sans, NOW), null);
  const onze = fromWall({ year: 2026, month: 8, day: 28, hour: 11, minute: 0 }, TZ).getTime();
  assert.equal(slotProblem(onze, 120, [ROW_FRI_NEW], sans, NOW), null);
  assert.equal(slotProblem(onze, 120, [ROW_FRI_NEW], sans, NOW, { setupMinutes: 15 }), "busy");
});

t("le délai de prévenance ampute le début de la journée limite", () => {
  // NOW = 26 août 12:00 EDT, délai 24 h → rien avant le 27 à 12:00
  const days = computeSlots(base);
  const thu = days.find((d) => d.date === "2026-08-27");
  const times = thu.slots.map((s) => s.time);
  assert.ok(!times.includes("09:00"), "09:00 est encore dans les 24 h");
  assert.ok(!times.includes("11:30"), "11:30 est encore dans les 24 h");
  assert.ok(times.includes("12:00"), "12:00 est exactement à la limite, donc accepté");
});

t("horizon respecté", () => {
  const short = { ...settings, horizonDays: 3 };
  const days = computeSlots({ ...base, settings: short, days: 14 });
  const all = days.flatMap((d) => d.slots);
  const latest = Math.max(...all.map((s) => new Date(s.iso).getTime()));
  const limit = fromWall({ ...{ year: 2026, month: 8, day: 30 }, hour: 0, minute: 0 }, TZ).getTime();
  assert.ok(latest < limit, "aucun créneau au-delà de l'horizon");
});

t("durée plus longue que la journée → aucun créneau", () => {
  const days = computeSlots({ ...base, durationMinutes: 11 * 60 });
  assert.equal(days.flatMap((d) => d.slots).length, 0);
});

t("les créneaux sont en ordre croissant et alignés sur le pas", () => {
  const days = computeSlots(base);
  for (const d of days) {
    let prev = -1;
    for (const s of d.slots) {
      const m = parseHM(s.time);
      assert.ok(m > prev, "ordre croissant");
      assert.equal(m % settings.slotStep, 0, `${s.time} aligné sur ${settings.slotStep} min`);
      prev = m;
    }
  }
});

console.log("\nVérification finale du créneau");
t("accepte un créneau réellement libre", () => {
  const days = computeSlots(base);
  const slot = days.flatMap((d) => d.slots)[0];
  assert.equal(slotIsFree(slot.iso, 120, [], settings, NOW), true);
});
t("refuse un créneau hors des heures d'ouverture", () => {
  const early = fromWall({ year: 2026, month: 8, day: 28, hour: 7, minute: 0 }, TZ);
  assert.equal(slotIsFree(early.toISOString(), 120, [], settings, NOW), false);
});
t("refuse un créneau qui déborde la fermeture", () => {
  const late = fromWall({ year: 2026, month: 8, day: 28, hour: 18, minute: 0 }, TZ);
  assert.equal(slotIsFree(late.toISOString(), 120, [], settings, NOW), false);
});
t("refuse un créneau un jour fermé", () => {
  const sunday = fromWall({ year: 2026, month: 8, day: 30, hour: 11, minute: 0 }, TZ);
  assert.equal(weekdayOfKey("2026-08-30"), 0);
  assert.equal(slotIsFree(sunday.toISOString(), 120, [], settings, NOW), false);
});
t("refuse un créneau trop proche", () => {
  const soon = new Date(NOW.getTime() + 2 * 3600_000);
  assert.equal(slotIsFree(soon.toISOString(), 120, [], settings, NOW), false);
});
t("refuse un créneau chevauchant une occupation", () => {
  const start = fromWall({ year: 2026, month: 8, day: 28, hour: 13, minute: 0 }, TZ).getTime();
  const cand = fromWall({ year: 2026, month: 8, day: 28, hour: 12, minute: 0 }, TZ);
  assert.equal(slotIsFree(cand.toISOString(), 120, [{ start, end: start + 3600_000 }], settings, NOW), false);
});
t("refuse une date invalide", () => {
  assert.equal(slotIsFree("pas-une-date", 120, [], settings, NOW), false);
});

const at = (y, mo, d, h, mi = 0) => fromWall({ year: y, month: mo, day: d, hour: h, minute: mi }, TZ);

t("refuse une date au-delà de l'horizon réglé", () => {
  // NOW = 26 août, horizon 45 jours : le samedi 10 octobre est le dernier jour.
  assert.equal(horizonEnd(settings, NOW), at(2026, 10, 11, 0).getTime());
  assert.equal(slotIsFree(at(2026, 10, 10, 9).toISOString(), 120, [], settings, NOW), true);
  assert.equal(slotIsFree(at(2026, 10, 12, 9).toISOString(), 120, [], settings, NOW), false);
  assert.equal(slotIsFree(at(2030, 11, 5, 10).toISOString(), 120, [], settings, NOW), false);
});

t("refuse une heure hors de la grille des créneaux", () => {
  assert.equal(slotIsFree(at(2026, 8, 28, 9, 30).toISOString(), 120, [], settings, NOW), true);
  assert.equal(slotIsFree(at(2026, 8, 28, 9, 7).toISOString(), 120, [], settings, NOW), false);
  assert.equal(slotIsFree(at(2026, 8, 28, 9, 15).toISOString(), 120, [], settings, NOW), false);
  const demi = new Date(at(2026, 8, 28, 9).getTime() + 30_000).toISOString();
  assert.equal(slotIsFree(demi, 120, [], settings, NOW), false, "à la minute pile");
  assert.equal(onSlotGrid(at(2026, 8, 28, 9, 15).getTime(), { ...settings, slotStep: 15 }), true);
});

t("l'artisan et les dates suivantes d'une série ne sont pas tenus à l'horizon", () => {
  // Un lundi de février 2027, loin derrière l'horizon : slotProblem l'accepte.
  assert.equal(slotProblem(at(2027, 2, 1, 9).getTime(), 120, [], settings, NOW, { checkLead: false }), null);
});

console.log("\nBascule d'heure avancée");
t("créneaux corrects la veille du passage à l'heure d'hiver", () => {
  // 2026-11-01 : retour à l'heure normale au Québec
  const nowNov = new Date("2026-10-29T16:00:00.000Z");
  const days = computeSlots({
    fromKey: "2026-10-31", days: 4, durationMinutes: 120, settings, busy: [], now: nowNov,
  });
  const sat = days.find((d) => d.date === "2026-10-31");
  const mon = days.find((d) => d.date === "2026-11-02");
  assert.ok(sat.slots.length > 0, "samedi ouvert");
  assert.equal(sat.slots[0].time, "09:00");
  assert.equal(mon.slots[0].time, "09:00", "lundi après la bascule : toujours 09:00 heure locale");
  // et l'instant absolu a bien décalé d'une heure
  const satFirst = new Date(sat.slots[0].iso).getUTCHours();
  const monFirst = new Date(mon.slots[0].iso).getUTCHours();
  assert.equal(satFirst, 13, "09:00 EDT = 13:00 UTC");
  assert.equal(monFirst, 14, "09:00 EST = 14:00 UTC");
});

console.log("\nPlage d'occupations");
try {
  /* Refusée avant la moindre requête : aucune base n'est nécessaire ici. */
  await assert.rejects(loadBusyRange({
    accessToken: null, settings, timeMin: NOW, timeMax: new Date("9999-11-01T14:00:00Z"),
  }), /trop longue/);
  console.log("  ✓ une plage de plusieurs années est refusée d'emblée"); pass++;
} catch (e) { console.log(`  ✗ une plage de plusieurs années est refusée d'emblée\n      ${e.message}`); fail++; }

console.log(`\n${pass} réussis, ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);

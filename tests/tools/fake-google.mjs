/**
 * Un Google simulé, au niveau de fetch.
 *
 * L'agenda, le jeton et Gmail répondent comme Google, sur un agenda en
 * mémoire : événements simples, séries hebdomadaires dépliées en
 * occurrences (une occurrence retouchée garde son identifiant, comme chez
 * Google), retouches, suppressions, liste et disponibilité. Toute autre
 * adresse part au vrai fetch, sauf celles qu'on confie à `route`. Des refus
 * se programment (`fail`) pour éprouver les replis ; `after: true` fait
 * l'opération puis répond l'erreur, comme une réponse perdue.
 *
 * Un événement supprimé reste en mémoire, à l'état « cancelled », comme
 * chez Google. Sa retouche répond 200 sans le rendre visible
 * (`deletedPatch: "ok"`, par défaut), ou 410 (`"gone"`) : Google ne
 * documente pas lequel, le code doit tenir les deux.
 *
 * Sert aux tests (tests/subscription.test.mjs) et au scénario du banc
 * (tools/local/scenario-deplacement.mjs). Rien ici ne parle à Google.
 */
const { fromWall, toWall } = await import("../../src/lib/time.ts");

const pad = (n) => String(n).padStart(2, "0");

/** « 2026-11-10T18:30:00-05:00 » : l'heure telle que Google la rend, à l'heure de l'agenda. */
function withOffset(iso, tz) {
  const d = new Date(iso);
  const w = toWall(d, tz);
  const off = Math.round((Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - d.getTime()) / 60_000);
  const a = Math.abs(off);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`
    + `${off < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** « 20261113T180000Z » : le suffixe d'une occurrence, son heure d'origine en UTC. */
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Les occurrences d'une série hebdomadaire, à la même heure murale de part et d'autre du changement d'heure. */
function weekly(startIso, endIso, tz, interval, count) {
  const w = toWall(new Date(startIso), tz);
  const length = Date.parse(endIso) - Date.parse(startIso);
  return Array.from({ length: count }, (_, k) => {
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + 7 * interval * k));
    const s = fromWall({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: w.hour, minute: w.minute }, tz);
    return { start: s.toISOString(), end: new Date(s.getTime() + length).toISOString() };
  });
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const googleError = (status, reason, message) => json(status, { error: { code: status, message, errors: [{ reason, message }] } });

export function fakeGoogle({ tz = "America/Toronto", deletedPatch = "ok" } = {}) {
  /** id → { id, master?, recurringEventId?, originalStart?, status, summary, description, location, start, end, transparency?, allDay? } */
  const events = new Map();
  const failures = [];
  const routes = [];
  const calls = [];
  const mails = [];
  let seq = 0;
  let realFetch = null;

  const visible = () => [...events.values()]
    .filter((e) => !e.master && e.status !== "cancelled")
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  function resource(e) {
    const moment = (iso) => (e.allDay ? { date: iso.slice(0, 10) } : { dateTime: withOffset(iso, tz), timeZone: tz });
    return {
      id: e.id, status: e.status, summary: e.summary, description: e.description, location: e.location,
      start: moment(e.start), end: moment(e.end),
      ...(e.recurringEventId ? { recurringEventId: e.recurringEventId, originalStartTime: { dateTime: withOffset(e.originalStart, tz), timeZone: tz } } : {}),
      ...(e.transparency ? { transparency: e.transparency } : {}),
    };
  }

  /** Un refus programmé pour cette opération, s'il en reste un : avant elle, ou après (`after`). */
  function refusal(op, id, after = false) {
    const f = failures.find((x) => x.op === op && x.times > 0 && Boolean(x.after) === after
      && (x.id === undefined || (x.id instanceof RegExp ? x.id.test(id ?? "") : x.id === id)));
    if (!f) return null;
    f.times--;
    return googleError(f.status, f.reason, f.message);
  }

  function insert(body) {
    const start = body.start?.dateTime, end = body.end?.dateTime;
    const rule = (body.recurrence ?? []).map((r) => /FREQ=WEEKLY;INTERVAL=(\d+);COUNT=(\d+)/.exec(r)).find(Boolean);
    const base = { status: "confirmed", summary: body.summary, description: body.description, location: body.location, transparency: body.transparency };
    if (!rule) {
      const id = body.id ?? `evt${++seq}`;
      if (events.has(id)) return null;
      events.set(id, { ...base, id, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      return { id, htmlLink: `https://calendar.google.com/event?eid=${id}` };
    }
    const id = `serie${++seq}`;
    events.set(id, { ...base, id, master: true, start, end });
    for (const o of weekly(start, end, tz, Number(rule[1]), Number(rule[2]))) {
      const iid = `${id}_${stamp(o.start)}`;
      events.set(iid, { ...base, id: iid, recurringEventId: id, originalStart: o.start, start: o.start, end: o.end });
    }
    return { id, htmlLink: `https://calendar.google.com/event?eid=${id}` };
  }

  async function handle(url, init) {
    const method = (init?.method ?? "GET").toUpperCase();
    /* Le jeton et Twilio postent un formulaire, l'agenda et Gmail du JSON. */
    let body = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }

    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      calls.push({ op: "token" });
      return refusal("token") ?? json(200, { access_token: "jeton-essai", expires_in: 3600 });
    }
    if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
      calls.push({ op: "gmail.send" });
      mails.push(Buffer.from(body.raw, "base64url").toString("utf8"));
      return refusal("gmail.send") ?? json(200, { id: `msg${++seq}` });
    }
    if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
      calls.push({ op: "freeBusy" });
      const r = refusal("freeBusy");
      if (r) return r;
      const lo = Date.parse(body.timeMin), hi = Date.parse(body.timeMax);
      const busy = visible().filter((e) => e.transparency !== "transparent" && Date.parse(e.end) > lo && Date.parse(e.start) < hi)
        .map((e) => ({ start: e.start, end: e.end }));
      return json(200, { calendars: { [body.items[0].id]: { busy } } });
    }

    const m = /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/[^/]+\/events(?:\/([^/?]+))?(\/instances)?(?:\?(.*))?$/.exec(url);
    if (!m) return null;
    const id = m[1] ? decodeURIComponent(m[1]) : undefined;
    const q = new URLSearchParams(m[3] ?? "");

    if (!id && method === "POST") {
      calls.push({ op: "events.insert", id: body?.id });
      const r = refusal("events.insert", body?.id);
      if (r) return r;
      const made = insert(body);
      if (!made) return googleError(409, "duplicate", "The requested identifier already exists.");
      return refusal("events.insert", body?.id, true) ?? json(200, made);
    }
    if (!id && method === "GET") {
      calls.push({ op: "events.list" });
      const r = refusal("events.list");
      if (r) return r;
      const lo = Date.parse(q.get("timeMin")), hi = Date.parse(q.get("timeMax"));
      return json(200, { items: visible().filter((e) => Date.parse(e.end) > lo && Date.parse(e.start) < hi).map(resource) });
    }
    if (id && m[2]) {
      calls.push({ op: "events.instances", id });
      const r = refusal("events.instances", id);
      if (r) return r;
      return json(200, { items: visible().filter((e) => e.recurringEventId === id).map(resource) });
    }

    const e = events.get(id);
    if (method === "PATCH") {
      calls.push({ op: "events.patch", id, body });
      const r = refusal("events.patch", id);
      if (r) return r;
      if (!e) return googleError(404, "notFound", "Not Found");
      if (e.status === "cancelled" && deletedPatch === "gone") return googleError(410, "deleted", "Resource has been deleted");
      if (body.summary !== undefined) e.summary = body.summary;
      if (body.description !== undefined) e.description = body.description;
      if (body.start?.dateTime) e.start = new Date(body.start.dateTime).toISOString();
      if (body.end?.dateTime) e.end = new Date(body.end.dateTime).toISOString();
      return json(200, resource(e));
    }
    if (method === "DELETE") {
      calls.push({ op: "events.delete", id });
      const r = refusal("events.delete", id);
      if (r) return r;
      if (!e) return googleError(404, "notFound", "Not Found");
      if (e.status === "cancelled") return googleError(410, "deleted", "Resource has been deleted");
      e.status = "cancelled";
      if (e.master) for (const x of events.values()) if (x.recurringEventId === id) x.status = "cancelled";
      return new Response(null, { status: 204 });
    }
    return null;
  }

  return {
    events, calls, mails,
    /** Les événements qu'on voit dans l'agenda, du plus tôt au plus tard. */
    visible,
    /** Ceux qui commencent à cet instant. */
    at: (when) => visible().filter((e) => Date.parse(e.start) === new Date(when).getTime()),
    /** Un événement posé à la main dans l'agenda : un rendez-vous personnel, une journée bloquée. */
    add(e) {
      const id = `perso${++seq}`;
      events.set(id, { status: "confirmed", ...e, id, start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString() });
      return id;
    },
    /**
     * Un refus de Google, `times` fois : `fail({ op: "events.patch", status: 400, reason: "invalid", message: "Invalid start time" })`.
     * `after: true` : l'opération se fait, puis l'erreur part, comme une réponse perdue.
     */
    fail(f) { failures.push({ times: 1, reason: "error", message: "Refusé", ...f }); },
    /** Une autre adresse à intercepter (Twilio, par exemple). */
    route(pattern, respond) { routes.push({ pattern, respond }); },
    install() {
      realFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const res = await handle(url, init);
        if (res) return res;
        const r = routes.find((x) => x.pattern.test(url));
        if (r) return r.respond(url, init);
        return realFetch(input, init);
      };
    },
    uninstall() { if (realFetch) globalThis.fetch = realFetch; },
  };
}

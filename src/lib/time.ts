/**
 * Utilitaires de fuseau horaire sans dépendance, bâtis sur Intl.
 * Tout ce qui touche aux disponibilités passe par ici : une seule
 * source de vérité pour « quelle heure est-il chez l'artisan ».
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

export type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** Heure murale (dans `tz`) correspondant à un instant absolu. */
export function toWall(date: Date, tz: string): Wall {
  const p = fmt(tz).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const hour = get("hour");
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: hour === 24 ? 0 : hour,           // Intl peut rendre « 24 » à minuit
    minute: get("minute"), second: get("second"),
  };
}

/** Décalage du fuseau, en millisecondes, à cet instant précis. */
export function tzOffset(date: Date, tz: string): number {
  const w = toWall(date, tz);
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Instant absolu correspondant à une heure murale dans `tz`.
 * Deux passes pour absorber les bascules d'heure avancée.
 */
export function fromWall(w: { year: number; month: number; day: number; hour?: number; minute?: number }, tz: string): Date {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour ?? 0, w.minute ?? 0, 0);
  let ts = naive - tzOffset(new Date(naive), tz);
  const off2 = tzOffset(new Date(ts), tz);
  const retry = naive - off2;
  if (retry !== ts) ts = retry;
  return new Date(ts);
}

/** « 2026-08-25 » → objet, sans passer par le fuseau local du serveur. */
export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Instant → « 2026-08-25 » dans `tz`. */
export function dateKey(date: Date, tz: string): string {
  const w = toWall(date, tz);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** Jour de la semaine (0 = dimanche) dans `tz`. */
export function weekday(date: Date, tz: string): number {
  const w = toWall(date, tz);
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Ajoute des jours à une clé de date, sans dérive de fuseau. */
export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** « 09:30 » → 570 minutes. */
export function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Heure affichable dans le fuseau de l'artisan, ex. « 14:30 ». */
export function formatTimeIn(date: Date, tz: string): string {
  const w = toWall(date, tz);
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

/** Date longue et localisée, ex. « samedi 25 août 2026 ». */
export function formatLongDate(date: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: locale === "en",
  }).format(date);
}

/** Nom court du fuseau, ex. « HAE » / « EDT ». */
export function tzLabel(date: Date, tz: string, locale: string): string {
  const p = new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    timeZone: tz, timeZoneName: "short",
  }).formatToParts(date);
  return p.find((x) => x.type === "timeZoneName")?.value ?? "";
}

export function minutesToText(total: number, locale: string): string {
  const h = Math.floor(total / 60), m = total % 60;
  if (locale === "en") {
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} hour${h > 1 ? "s" : ""}`;
    return `${m} min`;
  }
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} heure${h > 1 ? "s" : ""}`;
  return `${m} min`;
}

export function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", {
    style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

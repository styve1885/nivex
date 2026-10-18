/**
 * Provenance d'une réservation, et journal anonyme des visites.
 *
 * Deux mesures qui ne se confondent pas, et dont la frontière est la ligne
 * que la Loi 25 demande de tenir :
 *
 *  — Le journal des visites est anonyme et agrégé. Il ne sait pas qui passe,
 *    seulement combien, d'où et sur quelle page. Aucune adresse IP n'y entre,
 *    aucun identifiant ne relie deux visites entre elles.
 *
 *  — La provenance, elle, est nominative : elle finit attachée à une
 *    réservation, donc à une personne. C'est pourquoi elle reste dans le
 *    navigateur du visiteur, et ne traverse le réseau qu'au moment où cette
 *    personne décide de réserver. Tant qu'elle n'a rien demandé, le serveur
 *    ne sait rien d'elle.
 *
 * Ce module ne dépend de rien : il est lu côté client comme côté serveur.
 */

/** Clé de rangement de la provenance, dans le navigateur du visiteur. */
export const ATTRIBUTION_KEY = "nivex.origin";

/** Marqueur posé par l'artisan pour que son propre appareil ne compte pas. */
export const OPT_OUT_KEY = "nivex.optout";

/**
 * La provenance de la session en cours, dans `sessionStorage`.
 *
 * Le lien suivi ne vaut que pour la première page : dès la deuxième, l'adresse
 * a perdu son `?utm_source=` et un rechargement change le référent. Chaque
 * page lue dans la session est donc rapportée à la source de son arrivée.
 * La clé s'efface d'elle-même quand l'onglet se ferme.
 */
export const ARRIVAL_KEY = "nivex.arrival";

/** Durée de conservation du journal des visites. */
export const VISIT_RETENTION_MONTHS = 12;

/**
 * Ce que le navigateur retient de la toute première visite.
 *
 * Toute première : les campagnes qui suivent ne l'écrasent pas. Ce qu'on
 * cherche à savoir, c'est quelle carte ou quelle publication a amené la
 * personne la première fois — pas par quel chemin elle est revenue.
 */
export type Attribution = {
  source: string | null;        // utm_source, ou le domaine référent
  medium: string | null;        // utm_medium
  campaign: string | null;      // utm_campaign
  referrer: string | null;      // le référent complet, tel que le navigateur le donne
  ref: string | null;           // le prénom d'un lien de recommandation (?ref=)
  landing: string | null;       // la page d'arrivée
  firstSeen: string | null;     // date et heure de la première visite (ISO)
  visits: number;               // nombre de visites avant la réservation
};

export const EMPTY_ATTRIBUTION: Attribution = {
  source: null, medium: null, campaign: null,
  referrer: null, ref: null, landing: null, firstSeen: null, visits: 0,
};

/* ====================== Comment avez-vous connu NIVEX ? ====================== */

/**
 * Les réponses possibles à la question du formulaire. La porte et la carte
 * viennent en tête : c'est le seul canal qu'aucune mesure automatique ne voit
 * quand la personne tape l'adresse elle-même.
 */
export const HEARD_FROM = [
  "porte-a-porte", "recommandation", "facebook", "instagram",
  "linkedin", "google", "assistant-ia", "autre",
] as const;

export type HeardFrom = (typeof HEARD_FROM)[number];

/* Les réponses d'une liste précédente, que le formulaire ne propose plus mais
   que d'anciennes réservations portent encore. */
const HEARD_FROM_LEGACY = ["carte", "accroche-porte"] as const;

/** Une réponse telle qu'elle peut se lire en base. */
export type StoredHeardFrom = HeardFrom | (typeof HEARD_FROM_LEGACY)[number];

/** Une réponse que le formulaire peut envoyer aujourd'hui. */
export function isHeardFrom(v: unknown): v is HeardFrom {
  return typeof v === "string" && (HEARD_FROM as readonly string[]).includes(v);
}

/** Une réponse lisible en base, ancienne liste comprise. */
export function isStoredHeardFrom(v: unknown): v is StoredHeardFrom {
  return isHeardFrom(v) || (typeof v === "string" && (HEARD_FROM_LEGACY as readonly string[]).includes(v));
}

/** Libellés de l'artisan — l'espace d'administration est en français. */
export const HEARD_FROM_FR: Record<StoredHeardFrom, string> = {
  "porte-a-porte": "Visite à la porte ou carte NIVEX",
  "recommandation": "Recommandation d'un proche",
  "facebook": "Facebook",
  "instagram": "Instagram",
  "linkedin": "LinkedIn",
  "google": "Recherche Google",
  "assistant-ia": "Assistant IA",
  "autre": "Autre",
  "carte": "Carte remise en main propre",
  "accroche-porte": "Accroche-porte",
};

/**
 * La réponse, telle que l'artisan la lit : avec le nom de la personne qui a
 * recommandé la maison, quand on le connaît.
 */
export function heardFromText(o: {
  heardFrom: StoredHeardFrom | null; referredBy?: string | null; referral?: string | null;
}): string | null {
  if (!o.heardFrom) return null;
  const who = o.heardFrom === "recommandation" ? o.referredBy || o.referral : null;
  return who ? `${HEARD_FROM_FR[o.heardFrom]} (${who})` : HEARD_FROM_FR[o.heardFrom];
}

/* ============================ Recommandation ============================ */

/**
 * Le prénom d'un lien de recommandation, `?ref=marie`, mis au propre.
 *
 * Il vient d'une adresse que n'importe qui peut écrire : on n'en garde que
 * des lettres, des chiffres, des espaces, des traits d'union et des
 * apostrophes, quarante caractères au plus, avec une majuscule à chaque
 * partie du nom — « jean-luc » se lit « Jean-Luc ».
 */
export function refName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!s) return null;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/* ============================ Normalisation ============================ */

/**
 * Un référent ramené à son domaine, débarrassé du « www. ».
 *
 * Le référent complet garde parfois un chemin et une interrogation entière —
 * utile pour comprendre un cas précis, encombrant pour regrouper. La source
 * retient donc le domaine seul.
 */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * La source d'une visite ou d'une réservation, en un mot.
 *
 * L'étiquette de campagne l'emporte quand elle existe : c'est celle que
 * l'artisan a choisie lui-même, et elle vaut mieux que le domaine deviné.
 * Un visiteur sans référent et sans campagne est venu de nulle part de
 * visible — il a tapé l'adresse, ou suivi un lien qui ne se déclare pas.
 */
export function visitSource(utmSource: string | null, referrer: string | null): string {
  const utm = utmSource?.trim().toLowerCase();
  if (utm) return utm.slice(0, 60);
  const host = referrerHost(referrer);
  if (host) return host.slice(0, 60);
  return "direct";
}

/* ============================ Groupes de sources ============================ */

/**
 * Les familles de provenance de l'onglet Visites, dans l'ordre où elles s'y
 * lisent. Une source qui n'entre dans aucune est « directe » : quelqu'un a
 * tapé l'adresse, ou suivi un lien qui ne dit pas d'où il vient.
 */
export const SOURCE_GROUPS = [
  "facebook", "instagram", "linkedin", "ia", "google",
  "porte-a-porte", "recommandation", "direct",
] as const;

export type SourceGroup = (typeof SOURCE_GROUPS)[number];

export const SOURCE_GROUP_FR: Record<SourceGroup, string> = {
  "facebook": "Facebook",
  "instagram": "Instagram",
  "linkedin": "LinkedIn",
  "ia": "IA",
  "google": "Google",
  "porte-a-porte": "Porte-à-porte",
  "recommandation": "Recommandation",
  "direct": "Direct",
};

export function isSourceGroup(v: unknown): v is SourceGroup {
  return typeof v === "string" && (SOURCE_GROUPS as readonly string[]).includes(v);
}

/* Les étiquettes de campagne (`utm_source`) et les domaines référents se
   partagent le même espace de noms : la colonne `source` garde l'une ou
   l'autre. « chatgpt.com » est à la fois l'étiquette que pose ChatGPT et
   son domaine. */
const LABELS: Record<string, SourceGroup> = {
  "facebook": "facebook", "fb": "facebook",
  "instagram": "instagram", "ig": "instagram",
  "linkedin": "linkedin",
  "chatgpt.com": "ia", "chatgpt": "ia", "openai": "ia",
  "perplexity": "ia", "perplexity.ai": "ia",
  "gemini": "ia", "copilot": "ia", "claude": "ia", "claude.ai": "ia",
  "google": "google",
  "porte-a-porte": "porte-a-porte",
};

/* Un domaine, ou n'importe lequel de ses sous-domaines. */
const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** La famille d'une source telle que l'enregistre la colonne `source`. */
export function groupOfSource(source: string | null | undefined): SourceGroup {
  const s = (source ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!s || s === "direct") return "direct";
  if (LABELS[s]) return LABELS[s];

  /* Les assistants d'abord : gemini.google.com n'est pas une recherche. */
  if (["chatgpt.com", "chat.openai.com", "perplexity.ai", "gemini.google.com",
       "copilot.microsoft.com", "claude.ai"].some((d) => under(s, d))) return "ia";
  if (under(s, "facebook.com") || under(s, "fb.com") || s === "fb.me" || s === "com.facebook.katana") return "facebook";
  if (under(s, "instagram.com") || s === "com.instagram.android") return "instagram";
  if (under(s, "linkedin.com") || s === "lnkd.in" || s === "com.linkedin.android") return "linkedin";
  /* La recherche seule : google.ca, google.com, google.co.uk — pas Gmail ni
     Google Actualités, qui ne disent rien d'une recherche. */
  if (/^google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(s)
      || s === "com.google.android.googlequicksearchbox") return "google";
  return "direct";
}

/**
 * La famille d'une visite : un lien de recommandation l'emporte sur tout,
 * puisqu'il a été donné de la main à la main.
 */
export function visitGroup(v: { source: string | null; referral: string | null }): SourceGroup {
  return v.referral ? "recommandation" : groupOfSource(v.source);
}

/* La réponse au formulaire, ramenée à une famille. « Autre » ne dit rien
   qu'on puisse ranger : la mesure du navigateur reprend alors la main. */
const HEARD_GROUP: Record<StoredHeardFrom, SourceGroup | null> = {
  "porte-a-porte": "porte-a-porte", "carte": "porte-a-porte", "accroche-porte": "porte-a-porte",
  "recommandation": "recommandation",
  "facebook": "facebook", "instagram": "instagram", "linkedin": "linkedin",
  "google": "google", "assistant-ia": "ia", "autre": null,
};

/**
 * La famille d'une réservation.
 *
 * Le lien de recommandation d'abord, comme pour la visite. Puis la réponse de
 * la personne : elle sait mieux que son navigateur ce qui l'a amenée — une
 * carte reçue puis une recherche Google, c'est la carte. Puis, à défaut, ce
 * que le navigateur a relevé.
 */
export function bookingGroup(o: {
  heardFrom: StoredHeardFrom | null; referral: string | null;
  source: string | null; referrer: string | null;
}): SourceGroup {
  if (o.referral) return "recommandation";
  const declared = o.heardFrom ? HEARD_GROUP[o.heardFrom] : null;
  if (declared) return declared;
  return groupOfSource(o.source ?? referrerHost(o.referrer));
}

/** La famille qu'une arrivée laisse deviner, pour pré-remplir le formulaire. */
export function heardFromHint(a: { source: string | null; ref: string | null }): HeardFrom | null {
  if (a.ref) return "recommandation";
  return a.source?.trim().toLowerCase() === "porte-a-porte" ? "porte-a-porte" : null;
}

/* ============================ Robots ============================ */

/* Ce qu'un robot écrit lui-même dans son agent : moteurs, aperçus de liens,
   assistants, outils de mesure, navigateurs pilotés, bibliothèques. */
const ROBOT_AGENT = new RegExp([
  "bot\\b", "bot/", "crawl", "spider", "slurp", "scrap", "preview", "headless",
  "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime", "monitor",
  "phantomjs", "puppeteer", "playwright", "selenium", "webdriver",
  "facebookexternalhit", "facebookcatalog", "meta-external", "embedly", "quora link",
  "whatsapp", "skypeuripreview", "vkshare", "outbrain",
  "chatgpt", "openai", "gptbot", "oai-search", "perplexity", "anthropic", "claude",
  "cohere", "bytespider", "ccbot", "diffbot", "google-extended", "googleother",
  "google-inspectiontool", "feedfetcher", "mediapartners", "adsbot", "apis-google",
  "bingpreview", "yandex", "baidu", "petalbot", "semrush", "ahrefs", "mj12", "dotbot",
  "curl/", "wget/", "python", "go-http", "java/", "okhttp", "axios", "node-fetch",
  "undici", "libwww", "httpclient", "http_request", "postman", "insomnia",
].join("|"), "i");

/** Les fuseaux d'un serveur. Un téléphone ou un ordinateur de la région ne les porte pas. */
const SERVER_ZONES = new Set(["utc", "etc/utc", "etc/gmt", "gmt", "etc/universal", "universal", "etc/zulu", "zulu"]);

/**
 * Les villes des grands centres de données américains, telles que
 * l'hébergeur les nomme. Une visite qui en vient, directe et sur ordinateur,
 * est un serveur qui passe : un client de la Rive-Sud n'arrive pas de San
 * Jose sans référent.
 */
export const DATACENTER_CITIES = [
  "san jose", "santa clara", "sunnyvale", "mountain view", "palo alto", "milpitas",
  "fremont", "san francisco", "los angeles", "las vegas", "reno", "phoenix",
  "chandler", "mesa", "salt lake city", "seattle", "tukwila", "quincy",
  "moses lake", "wenatchee", "portland", "hillsboro", "boardman", "the dalles",
  "prineville", "council bluffs", "omaha", "des moines", "west des moines",
  "kansas city", "dallas", "plano", "richardson", "san antonio", "chicago",
  "elk grove village", "columbus", "dublin", "hilliard", "new albany",
  "charlotte", "lenoir", "moncks corner", "atlanta", "lithia springs",
  "ashburn", "sterling", "reston", "herndon", "leesburg", "manassas",
  "chantilly", "boydton", "secaucus", "north bergen", "newark", "piscataway",
] as const;

/**
 * Une visite venue d'un centre de données : américaine, directe, sur
 * ordinateur, depuis une des villes ci-dessus.
 */
export function isDatacenterVisit(v: {
  country: string | null; city: string | null; source: string | null;
  device: string | null; referral: string | null;
}): boolean {
  return v.country?.toUpperCase() === "US"
    && (v.source ?? "direct") === "direct"
    && !v.referral
    && v.device === "ordinateur"
    && (DATACENTER_CITIES as readonly string[]).includes((v.city ?? "").trim().toLowerCase());
}

export type RobotReason = "agent" | "pilote" | "fuseau" | "centre";

/** Ce que l'onglet Visites écrit à côté d'une visite marquée robot. */
export const ROBOT_FR: Record<RobotReason, string> = {
  agent: "se déclare robot",
  pilote: "navigateur piloté",
  fuseau: "horloge de serveur",
  centre: "centre de données",
};

export function isRobotReason(v: unknown): v is RobotReason {
  return typeof v === "string" && v in ROBOT_FR;
}

/**
 * Pourquoi une visite est celle d'un robot, ou rien si elle a l'air humaine.
 *
 * Trois indices, lus dans la requête puis oubliés — aucun n'entre en base :
 * l'agent qui se déclare robot, aperçu de lien ou navigateur sans écran ;
 * le drapeau `navigator.webdriver` que lèvent les navigateurs pilotés ; une
 * horloge réglée sur l'UTC, celle des serveurs. Le quatrième, le centre de
 * données, se lit aux colonnes déjà gardées.
 */
export function robotReason(v: {
  userAgent: string | null | undefined;
  webdriver?: unknown;
  timeZone?: unknown;
  country: string | null; city: string | null; source: string | null;
  device: string | null; referral: string | null;
}): RobotReason | null {
  const ua = (v.userAgent ?? "").trim();
  if (!ua || ROBOT_AGENT.test(ua)) return "agent";
  if (v.webdriver === true) return "pilote";
  if (typeof v.timeZone === "string" && SERVER_ZONES.has(v.timeZone.trim().toLowerCase())) return "fuseau";
  if (isDatacenterVisit(v)) return "centre";
  return null;
}

/* ============================ Pages jamais comptées ============================ */

/**
 * L'espace artisan, et la page qui retire un navigateur du décompte. Le même
 * filtre vaut dans le navigateur, devant l'hébergeur et au serveur.
 */
export function isPrivatePath(path: string): boolean {
  return /^\/admin(\/|$)/.test(path) || /^\/(fr|en)\/ne-pas-compter(\/|$)/.test(path);
}

/** Catégorie d'appareil, assez grossière pour ne distinguer personne. */
export function deviceType(userAgent: string | null | undefined): "mobile" | "tablette" | "ordinateur" {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablette";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "mobile";
  return "ordinateur";
}

/** Une chaîne bornée, ou rien — pour ne jamais écrire n'importe quoi en base. */
export function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

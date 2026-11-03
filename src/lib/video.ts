/**
 * La présentation de NIVEX en vidéo : le fichier, son image d'aperçu et ce
 * qu'en disent les moteurs. Sans aucune dépendance : le lecteur, côté
 * navigateur, l'importe sans tirer autre chose.
 *
 * Le fichier est servi tel quel depuis `public/videos/`, jamais recompressé :
 * H.264 et AAC, 1920 × 1080, l'index en tête pour se lire pendant qu'il se
 * télécharge (un test le vérifie). Il ne part vers le navigateur que si le
 * visiteur appuie sur lecture (`preload="none"`).
 *
 * La durée ne s'écrit qu'ici : la durée ISO des données structurées
 * (« PT1M11S »), celle du plan du site et le « 1 min » du lien du héros en
 * découlent. Une nouvelle vidéo, c'est une nouvelle durée ici, une nouvelle
 * date de mise en ligne, et sa transcription dans `lib/i18n/video.ts`.
 */
export const PRESENTATION = {
  src: "/videos/nivex-presentation.mp4",
  poster: "/images/nivex-presentation-apercu.jpg",
  width: 1920,
  height: 1080,
  /** 70,97 s, arrondies à la seconde. */
  seconds: 71,
  /** Le jour de la mise en ligne, à l'heure de Montréal. */
  uploaded: "2026-11-02",
  /** La langue parlée dans la vidéo, quelle que soit celle de la page. */
  language: "fr-CA",
} as const;

/** « PT1M11S » : la durée au format ISO 8601, que lisent les moteurs. */
export function isoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `PT${m ? `${m}M` : ""}${s || !m ? `${s}S` : ""}`;
}

/** « 1 min » : la durée annoncée au visiteur, à la minute près. */
export function minutesLabel(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * La date de mise en ligne avec son fuseau, minuit à Montréal : Google
 * recommande le fuseau, et sans lui il prend celui de son robot, qui peut
 * déplacer la date d'un jour. Le décalage est celui du jour dit, heure
 * avancée comprise : « -05:00 » en novembre, « -04:00 » en juillet.
 */
export function uploadDateTime(day: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${day}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  const offset = m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "-05:00";
  return `${day}T00:00:00${offset}`;
}

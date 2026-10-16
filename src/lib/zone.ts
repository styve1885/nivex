import { getSettings, type Settings } from "./settings";
import { transitMinutes, weekdayIn } from "./transit";
import { evaluateTravel, type TravelVerdict } from "./travel";
import { SETUP_MINUTES } from "./brand";

/**
 * Le juge unique : une adresse, une séance, un verdict.
 *
 * Trois endroits ont besoin de cette réponse — le tunnel de réservation
 * pendant qu'on remplit le formulaire, le vérificateur de code postal sur
 * les pages publiques, et la création de la réservation qui, elle, fait foi.
 * Ils passent tous par ici. Trois calculs parallèles auraient fini par se
 * contredire, et c'est le client qui aurait découvert l'écart au moment de
 * confirmer.
 */

export type ZoneAnswer = TravelVerdict & {
  /** L'heure d'arrivée retenue pour la mesure. */
  arriveBy: string;
  /** Vrai quand la mesure venait du cache — utile pour l'artisan, inoffensif pour le client. */
  cached: boolean;
};

/**
 * L'artisan doit être là un quart d'heure avant le début de la séance. C'est
 * donc cette heure-là qu'on donne à Google, et non celle du rendez-vous :
 * demander l'autobus qui arrive à 13 h quand il faut être installé à 12 h 45
 * revient à promettre un retard.
 */
export function arrivalFor(startsAt: Date): Date {
  return new Date(startsAt.getTime() - SETUP_MINUTES * 60_000);
}

export async function judgeZone(input: {
  postalCode: string;
  durationMinutes: number;
  startsAt?: Date | null;
  settings?: Settings;
}): Promise<ZoneAnswer> {
  const s = input.settings ?? (await getSettings());
  const policy = s.travelPolicy;

  const arriveBy = input.startsAt ? arrivalFor(input.startsAt) : nextRepresentativeArrival(s);

  if (!policy.enabled) {
    return {
      ...evaluateTravel(null, input.durationMinutes, input.postalCode, policy),
      arriveBy: arriveBy.toISOString(), cached: false,
    };
  }

  const look = await transitMinutes(input.postalCode, arriveBy, {
    timeZone: s.timezone,
    cacheDays: policy.cacheDays,
  });

  return {
    ...evaluateTravel(look.minutes, input.durationMinutes, input.postalCode, policy),
    arriveBy: arriveBy.toISOString(),
    cached: look.cached,
  };
}

/**
 * Une heure d'arrivée plausible, quand aucun créneau n'est encore choisi.
 *
 * Le vérificateur des pages publiques répond avant qu'on ait parlé de date.
 * On prend donc le prochain jour ouvré, en milieu de matinée : un horaire
 * ordinaire, ni la pointe ni le désert du dimanche soir. La réponse est
 * annoncée comme une estimation, et la mesure exacte se refait au moment de
 * réserver, pour le vrai jour.
 */
function nextRepresentativeArrival(s: Settings): Date {
  const ouverts = new Set(s.hours.filter((h) => h.enabled).map((h) => h.day));
  const d = new Date();
  d.setUTCHours(14, 0, 0, 0);                 // ≈ 10 h à Montréal
  for (let i = 1; i <= 8; i++) {
    const essai = new Date(d.getTime() + i * 86400_000);
    if (ouverts.size === 0 || ouverts.has(weekdayIn(essai, s.timezone))) return essai;
  }
  return new Date(d.getTime() + 86400_000);
}

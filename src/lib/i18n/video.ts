/*
 * Ce que dit la vidéo de présentation, et ce que les moteurs en lisent.
 *
 * Hors des dictionnaires, comme les titres des pages : un dictionnaire part en
 * entier vers les composants clients qui le reçoivent tel quel (les tunnels,
 * les pages personnelles), et ces textes ne servent qu'au serveur — la
 * transcription repliable de l'accueil, celle de la page de présentation et
 * les données structurées.
 *
 * La transcription est celle de la bande son, mot pour mot : elle ne suit
 * donc pas les réglages, contrairement au reste du site. Si l'artisan change
 * ses prix ou son numéro, la vidéo, elle, dit toujours ce qu'elle dit. Elle
 * est rangée en paragraphes pour se lire ; les données structurées la
 * reprennent d'un bloc. L'anglais en est la traduction : la vidéo est en
 * français.
 */

export const presentationTranscript: Record<"fr" | "en", string[]> = {
  fr: [
    "Bonjour, je m'appelle Styve, je suis le fondateur de NIVEX, repassage de vêtements à domicile.",
    "Ce que nous faisons, c'est que nous apportons nos équipements professionnels directement chez vous pour repasser vos chemises, vos draps, vos robes, vos couvre-lits, vos rideaux et tout type d'autres vêtements. On le fait directement sur place. Par exemple, en deux heures, on peut repasser jusqu'à 18 pièces de vêtements.",
    "Pensez-y : normalement, pour le faire, ça prend deux à trois jours chez un nettoyeur normal, sans compter les retouches, sans compter le fait que vous quittez de chez vous au moins deux à trois fois. Nous, on le fait directement sur place, en deux heures.",
    "Aussi, lorsqu'on termine, on les place sur de beaux cintres comme ceci, on les place sur un portant, puis on les met directement dans votre penderie. Économie de temps, économie d'énergie : tout est aussi beau, bien placé, sans aucun pli.",
    "Aussi, sachez que nous pouvons passer chaque semaine, par exemple par un abonnement mensuel. Chaque semaine, on vient, on repasse deux heures, trois heures, dépendamment de la quantité et de la qualité de vos vêtements.",
    "Donc, si vous avez besoin de nos services, vous pouvez prendre une réservation tout de suite sur notre site, nivexrepassage.ca, ou alors nous appeler au 450 943-1217. Merci.",
  ],
  en: [
    "Hello, my name is Styve, and I'm the founder of NIVEX, in-home clothes ironing.",
    "What we do is bring our professional equipment right to your home to iron your shirts, sheets, dresses, bedspreads, curtains and any other clothing. We do it right there, on site. For example, in two hours we can iron up to 18 pieces.",
    "Think about it: normally, at a regular dry cleaner, it takes two to three days, not counting touch-ups, and not counting leaving home at least two or three times. We do it on site, in two hours.",
    "When we're done, we put everything on nice hangers like these, on a rack, then straight into your closet. You save time and energy, and everything looks great, neatly arranged, without a single wrinkle.",
    "We can also come every week, for example with a monthly subscription. Every week, we come and iron for two or three hours, depending on the quantity and type of your clothes.",
    "So if you need our services, you can book right now on our website, nivexrepassage.ca, or call us at 450 943-1217. Thank you.",
  ],
};

/**
 * Le nom et la description de la vidéo dans les données structurées. La
 * description tient en une phrase ; {n} et {duration} viennent du seul
 * chiffre de capacité du site (`capacityPieces`), avec la précision qui
 * l'accompagne toujours.
 */
export const presentationVideoText: Record<"fr" | "en", { name: string; description: string }> = {
  fr: {
    name: "NIVEX Repassage à domicile — présentation",
    description:
      "Repassage à domicile à Montréal et sur la Rive-Sud : NIVEX apporte son équipement professionnel chez vous et repasse jusqu'à {n} pièces en {duration}, selon la taille, le type et la matière des vêtements, à la séance ou par abonnement.",
  },
  en: {
    name: "NIVEX In-Home Ironing — introduction",
    description:
      "In-home ironing in Montreal and on the South Shore: NIVEX brings its professional equipment to your home and irons up to {n} pieces in {duration}, depending on the size, type and fabric of the clothes, per session or by subscription.",
  },
};

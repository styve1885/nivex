export type AdminBooking = {
  id: string; ref: string; status: string;
  clientName: string; clientEmail: string; clientPhone: string;
  address: string; city: string; postalCode: string; notes: string | null;
  /* La séance et ses pièces à l'unité, ou le panier d'un rendez-vous d'avant (voir items.ts). */
  items: { key: string; label: string; qty: number; cents?: number; toCents?: number }[];
  startsAt: string; endsAt: string; durationMinutes: number;
  /* Minutes passées sur place hors de la séance : 0 aujourd'hui, 15 pour l'ancien déroulement. */
  setupMinutes: number;
  estimateCents: number; currency: string; firstHourFree: boolean; createdAt: string;
  /* Frais de route, hors estimation : zéro pour la plupart des adresses. */
  travelFeeCents: number; travelZone: string | null;
  /* Ce qui a suivi la réservation — ou ce qui a manqué. */
  emailSent: boolean; inCalendar: boolean;
  /* Une visite d'abonnement : son montant se règle avec le cycle, pas ici. */
  subscription: boolean;
  /* Une visite d'abonné marquée effectuée : elle ne s'annule plus, sauf à
     retirer d'abord la mention depuis l'onglet Abonnés. */
  done: boolean;
  /* D'où vient ce client. Tout y est nul pour les rendez-vous pris avant
     que la provenance ne soit mesurée : « inconnu » n'est pas une erreur. */
  origin: {
    heardFrom: string | null;
    heardFromLabel: string | null;
    /** Le prénom du lien de recommandation suivi (?ref=). */
    referral: string | null;
    source: string | null;
    campaign: string | null;
    referrer: string | null;
    landing: string | null;
    firstSeenAt: string | null;
    visits: number | null;
  };
};

/** L'état réel du lien avec Google, mesuré en s'en servant. */
export type GoogleLink = { usable: boolean; reason: string | null };

export type AdminStats = {
  upcoming: number; thisMonth: number; cancelled: number;
  total: number; monthCents: number; clients: number;
};

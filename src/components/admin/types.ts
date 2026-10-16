export type AdminBooking = {
  id: string; ref: string; status: string;
  clientName: string; clientEmail: string; clientPhone: string;
  address: string; city: string; postalCode: string; notes: string | null;
  items: { key: string; label: string; qty: number }[];
  startsAt: string; endsAt: string; durationMinutes: number;
  estimateCents: number; currency: string; firstHourFree: boolean; createdAt: string;
  /* Frais de route, hors estimation : zéro pour la plupart des adresses. */
  travelFeeCents: number; travelZone: string | null;
  /* Ce qui a suivi la réservation — ou ce qui a manqué. */
  emailSent: boolean; inCalendar: boolean;
  /* D'où vient ce client. Tout y est nul pour les rendez-vous pris avant
     que la provenance ne soit mesurée : « inconnu » n'est pas une erreur. */
  origin: {
    heardFrom: string | null;
    heardFromLabel: string | null;
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

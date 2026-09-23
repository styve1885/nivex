export type AdminBooking = {
  id: string; ref: string; status: string;
  clientName: string; clientEmail: string; clientPhone: string;
  address: string; city: string; postalCode: string; notes: string | null;
  items: { key: string; label: string; qty: number }[];
  startsAt: string; endsAt: string; durationMinutes: number;
  estimateCents: number; currency: string; firstHourFree: boolean; createdAt: string;
  /* Ce qui a suivi la réservation — ou ce qui a manqué. */
  emailSent: boolean; inCalendar: boolean;
};

/** L'état réel du lien avec Google, mesuré en s'en servant. */
export type GoogleLink = { usable: boolean; reason: string | null };

export type AdminStats = {
  upcoming: number; thisMonth: number; cancelled: number;
  total: number; monthCents: number; clients: number;
};

import { writeFileSync } from "node:fs";
import { clientConfirmation, clientCancellation, ownerNotification, type BookingEmailData } from "../../src/lib/email";

const d: BookingEmailData = {
  ref: "NVX-K7M3QP",
  locale: "fr",
  clientName: "Marie-Claude Bélanger",
  clientEmail: "mc.belanger@example.com",
  clientPhone: "450 555-0142",
  address: "1284 rue Sainte-Hélène, app. 3",
  city: "Longueuil",
  postalCode: "J4K 3R8",
  notes: "Deux robes en soie à traiter avec précaution. Stationnement dans la ruelle, sonnette au nom Bélanger.",
  items: [
    { label: "Chemises", qty: 14 },
    { label: "Robes & délicats", qty: 4 },
    { label: "Linge de maison", qty: 6 },
  ],
  startsAt: new Date("2026-09-03T17:00:00.000Z"), // 13:00 heure de l'Est
  durationMinutes: 210,
  estimateCents: 11250,
  currency: "CAD",
  firstHourFree: true,
  timezone: "America/Toronto",
  manageUrl: "https://nivex-repassage.vercel.app/fr/reservation/exemple",
  siteUrl: "https://nivex-repassage.vercel.app",
  businessPhone: "+1 450 367 6231",
  businessEmail: "contact@nivexrepassage.ca",
};

const out = process.argv[2];
const c = clientConfirmation(d);
const o = ownerNotification(d);
const x = clientCancellation(d);
const en = clientConfirmation({ ...d, locale: "en", items: [
  { label: "Shirts", qty: 14 }, { label: "Dresses & delicates", qty: 4 }, { label: "Household linen", qty: 6 },
]});

writeFileSync(`${out}/email-client-fr.html`, c.html);
writeFileSync(`${out}/email-client-en.html`, en.html);
writeFileSync(`${out}/email-artisan.html`, o.html);
writeFileSync(`${out}/email-annulation.html`, x.html);

console.log("Sujet client FR :", c.subject);
console.log("Sujet client EN :", en.subject);
console.log("Sujet artisan   :", o.subject);
console.log("Sujet annulation:", x.subject);
console.log("\n--- version texte (client FR) ---\n");
console.log(c.text);

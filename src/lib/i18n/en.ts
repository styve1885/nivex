import type { Dict, LegalDoc } from "./fr";
import {
  CANCEL_WINDOW_HOURS, CYCLE_MAX_WEEKS, FIRST_FREE_MIN_MINUTES, PHONE, PHONE_HREF, SERIES_CYCLES,
  SERIES_NOTICE_DAYS, SETUP_MINUTES, SUBSCRIBER_TRAVEL_DISCOUNT_CENTS, TERM_SERIES,
} from "../brand";
import { formatMoney, minutesToText } from "../time";

/* The subscriber reduction on travel fees, written from the constant. */
const DISCOUNT = formatMoney(SUBSCRIBER_TRAVEL_DISCOUNT_CENTS, "CAD", "en");
/* The length that qualifies for the free first hour, from the constant the engine applies. */
const FIRST_FREE_MIN = minutesToText(FIRST_FREE_MIN_MINUTES, "en");

const privacy: LegalDoc = {
  eyebrow: "Privacy",
  title: "What we know about you.",
  lede:
    "NIVEX collects enough to reach you, to find you and to prepare your session, and counts its visits without knowing who makes them. None of it is ever sold, rented or traded. Here is the whole of it, plainly.",
  sections: [
    {
      title: "Who answers for your information",
      body: [
        "NIVEX is an at-home ironing service operated by Styve, in Longueuil, Quebec, registered with the Quebec enterprise registrar under number {neq}. Styve is the person in charge of the protection of personal information within the meaning of Quebec law, and the only person with access to what this site collects.",
        "For a question, an access request or a complaint, write to {email} or call {phone}.",
      ],
    },
    {
      title: "What we collect",
      body: [
        "What you hand us yourself, at the moment you hand it over, and a few technical measurements, each described below. This site follows no one around and buys data from no one.",
      ],
      list: [
        "Booking — your name, your email, your phone number, the address of the session (street, city, postal code), the services and quantities you chose, the time slot you kept, and the notes you write yourself.",
        "Subscription — the same details as a booking, plus the plan you chose, the day and time of your visits, the visits completed and the cycles paid.",
        "Contact form — your name, your email, your phone number if you give it, the subject and the body of your message.",
        "Technical log — the nature and time of the site's operations: a booking created, an email sent, an error raised. No IP address, no browser identifier, no device fingerprint.",
        "Audience measurement — the number of page views, which page was viewed, the site you arrived from, your country and your device type. This data is aggregated: it says how many people came by, never which ones. No cookie is set and no identifier follows you from one visit to the next.",
        "Visit log — for each page displayed: the date and time, the page, the site or campaign you arrived from at the start of your visit, the first name in the referral link if you followed one, the device type, and the approximate city our host infers from the network. Your IP address is never written down: it serves to infer the city, then it is forgotten along with the request. To set robots aside, the server also looks at the name your browser gives itself, whether it is driven by a program, and the time zone of its clock; it keeps none of it, except the mention “robot” when it is one. No identifier ties two entries together — two of your visits appear there as two strangers. Pages in the craftsman's own area are never counted, nor are the craftsman's own visits.",
        "Where a booking came from — on your first visit, your browser keeps to itself the campaign tag of the link you followed, the first name in a referral link, the site you came from, the page you landed on, the date of that first visit, and the number of times you came back. This stays in your browser and leaves it only if you book: it then travels with your booking, so that we know which means made the house known to you. If you do not book, we know none of it, and clearing your browser data erases it.",
        "How you heard about us — the answer you give, if you wish to, to the optional question in the booking form, and the name of the person who recommended us if you choose to write it. A visit at your door or a card handed to you in person leaves no technical trace: that answer is the only way to know. It is suggested in advance when you arrive through a referral link or a card's code, and you remain free to change or clear it.",
      ],
    },
    {
      title: "What it is for",
      body: [
        "Every piece of information answers to a reason. When the reason goes, the information goes with it.",
      ],
      list: [
        "Your address is how we come to you, and how we check that you are inside the service area.",
        "Your email and phone number are how we confirm, warn you of a delay, answer you, and remind you of each visit the day before. Your phone also receives, by text message, the confirmation, the reminder and any change to an appointment; reply STOP to any of those texts to receive no more. Any other reply is passed on to the artisan's mobile phone; the site does not keep it.",
        "The services you chose are how we book the right length of time and pack the right equipment.",
        "Your notes are how we avoid ruining a fragile piece, and how we get into your building.",
        "The appointment book is how the business keeps its accounts and how a past session can be traced if it is ever disputed.",
        "The visit log and the booking's origin serve to know which way of making ourselves known works — a card handed out in a neighbourhood, a recommendation, a post, a search — so that nothing is spent at random. They are never used to solicit you, to contact you again, or to sort you.",
      ],
    },
    {
      title: "What we do not do",
      body: [],
      list: [
        "We sell, rent and trade nothing, to no one, at no price.",
        "We run no targeted advertising, and this site hosts no advertising tracker.",
        "We build no profile of you and make no automated decision about you.",
        "We collect no banking information: payment happens on site, never on the site.",
      ],
    },
    {
      title: "Who else has access",
      body: [
        "Five providers, each for one precise task, and none of them may use any of it for their own ends.",
      ],
      list: [
        "Vercel — hosts the site, serves it to your browser, and counts its traffic in aggregate.",
        "Neon — the database where bookings and messages live.",
        "Google — your artisan's calendar, where your appointment is written down with your name, your address and your contact details, and Gmail, from which your confirmation and invitation are sent.",
        "Twilio — carries the confirmation and reminder text messages. It receives your phone number and the text of the message, nothing else.",
        "ImprovMX — forwards the emails you write to our domain address to your artisan's inbox.",
      ],
    },
    {
      title: "Outside Quebec",
      body: [
        "The site, the database, the Google services and Twilio are hosted in the United States, and ImprovMX forwards emails from abroad. Your information therefore leaves Quebec to be kept there, and is subject to the law of the host country — which may, in certain cases, allow its authorities to reach it.",
        "We chose providers contractually bound to protection comparable to what is required here, and we entrust them with nothing beyond what is necessary. By booking or writing to us through the site, you consent to this communication outside Quebec. If that troubles you, call us and we will arrange the appointment by voice.",
      ],
    },
    {
      title: "How long we keep it",
      body: [],
      list: [
        "A booking and everything attached to it: three years after the session. That is the civil limitation period in Quebec — the window during which a session can still be disputed, either way.",
        "A subscription: three years after its last visit, for the same reason.",
        "A message from the contact form: two years, or until you ask us to delete it.",
        "The technical log: twelve months.",
        "The visit log: twelve months, after which entries are deleted of their own accord.",
        "The origin attached to a booking: it follows the fate of that booking, and goes when it goes.",
      ],
    },
    {
      title: "How it is protected",
      body: [],
      list: [
        "The site is served over HTTPS only: what you write is encrypted in transit.",
        "The token that links the site to the artisan's Google account is encrypted with AES-256-GCM before it reaches the database.",
        "The artisan's area requires a Google sign-in, and the very first sign-in also requires a setup code.",
        "The “Manage my booking” link carries a random token belonging to your appointment alone. It opens that one, and nothing else. A subscription's “Manage my visits” link works the same way, for that subscription's visits only.",
      ],
    },
    {
      title: "Cookies",
      body: [
        "This site drops no advertising cookie, no analytics cookie, no social network button. An ordinary visitor receives none at all. Visit counting uses neither a cookie nor an identifier: the log sent to the server cannot recognise a visitor from one visit to the next. What your browser keeps for itself is described below.",
        "Two cookies exist, and they concern the artisan only: the one that keeps his session open in his own area, and a temporary one that protects his Google sign-in against fraud. Both expire on their own.",
        "Typefaces are served from our own domain: displaying this page calls no third-party server.",
        "Your browser does, however, keep two things for itself, in its local storage: the origin described above, which reaches us only if you book, and, for the length of your session, where you arrived from, which serves to relate every page read to the same source and to count one visit rather than one per page read; it is erased when the tab closes. Neither is an identifier, neither is readable by another site, and clearing your browsing data erases both.",
      ],
    },
    {
      title: "Your rights",
      body: [
        "Quebec law grants you several, and we honour them free of charge, within thirty days.",
      ],
      list: [
        "Know what information we hold about you, and obtain a copy of it.",
        "Have corrected anything inaccurate, incomplete or equivocal.",
        "Withdraw your consent, and ask that what is no longer necessary be deleted.",
        "Receive the information you gave us in a structured, commonly used technological format.",
        "File a complaint with the Commission d'accès à l'information du Québec (cai.gouv.qc.ca) if our answer does not satisfy you.",
      ],
    },
    {
      title: "If there is an incident",
      body: [
        "Should a confidentiality incident present a risk of serious injury, we would notify the people concerned and the Commission d'accès à l'information without delay, and the incident would be entered in the register the law requires.",
      ],
    },
    {
      title: "If this page changes",
      body: [
        "The date at the top governs. A substantive change will be pointed out to you at your next booking, rather than slipped in quietly.",
      ],
    },
  ],
};

const terms: LegalDoc = {
  eyebrow: "Terms",
  title: "What we hold ourselves to.",
  lede:
    "Booking a NIVEX session means accepting what follows. It is short, it is written in plain language, and it binds us as much as it binds you.",
  sections: [
    {
      title: "Who welcomes you",
      body: [
        "NIVEX is an at-home ironing service operated by Styve, in Longueuil, Quebec, registered with the Quebec enterprise registrar under number {neq}. These terms govern the use of {site}, online booking, and the sessions that follow from it.",
        "By booking, you confirm that you are at least eighteen years old and entitled to have the pieces you present to us treated.",
      ],
    },
    {
      title: "The service",
      body: [
        "An artisan comes to your home with his professional equipment: active table, steam generator, pressing cloths and hangers. He irons the pieces you present to him on the spot, then returns them on hangers or folded.",
        "Your clothes never leave your home: everything happens on site, in front of you.",
      ],
    },
    {
      title: "Where we go",
      body: [
        "{zone}",
        "The postal code you enter while booking tells you at once whether you are inside the area, and what the journey costs if anything. Outside it, online booking is not possible: call us at {phone} and we will tell you plainly whether we can make the trip.",
      ],
    },
    {
      title: "Booking",
      body: [],
      list: [
        "The slots on offer account for the hours the house works and the appointments already taken. What you see is bookable.",
        "A session lasts {min} at the least.",
        "A booking is made at least {lead} ahead, and up to {horizon} out.",
        "Confirmation goes out by email as soon as you book, with the invitation for your calendar and a personal link for managing the appointment. A text message doubles it, and another reminds you of the appointment the day before.",
      ],
    },
    {
      title: "The price",
      body: [
        "A session lasts {min} at the least and is billed {entry}. Beyond that, each hour begun is added at the same pace, {rate} per hour. Applicable taxes, if any, are added to that amount.",
        "The estimate shown while booking is indicative: it follows from what you declared. The final amount is set by the time actually spent, and it is confirmed to you on site before the session begins. You are never committed to an amount you have not seen.",
        "If the work asked for goes beyond what was foreseen, we say so before carrying on. Whether to extend or to stop there is your call.",
      ],
    },
    {
      title: "The first hour, on us",
      offer: true,
      body: [
        `On a first booking of ${FIRST_FREE_MIN} or more, the first hour of ironing is offered and deducted from the estimate automatically. Once per email address. It cannot be exchanged for money, and it does not stack with any other offer.`,
      ],
    },
    {
      title: "Payment",
      body: [
        "At the end of the session, on site: cash, Interac e-transfer or card. No prepayment is asked for when booking, and the site collects no banking information.",
        "A subscription differs on one point only: each cycle is paid at its first visit, on site, by the same means. Nothing is ever paid online.",
      ],
    },
    {
      title: "Cancelling or moving",
      body: [
        "A session can be cancelled freely up to {cancel} before the appointment, from the personal link you received by email or by phone at {phone}. To move it, call us within the same window and we will agree on another time together. Nothing to pay, nothing to justify.",
        "A subscription visit can be cancelled or moved at no charge until 11:59 p.m. the day before, from the personal link or by phone, without touching the rest of the series.",
        "Past that, call us at {phone}: we will do our best.",
        "Should we have to cancel on our side — illness, equipment failure, an impassable road — you are told as soon as we know, and you owe nothing.",
      ],
    },
    {
      title: "Subscriptions",
      body: [
        "A subscription reserves your visits on the same day and at the same time, at the plan's rhythm: every week, every other week or every four weeks. Those slots are offered to nobody else.",
        `A cycle is the plan's number of visits actually completed — four, two or one. A cancelled visit, on your side or ours, does not count: the cycle runs on to the next visit, and a replacement visit is added at the end of the series. If a cycle is not finished ${CYCLE_MAX_WEEKS} weeks after its first visit, we call you to agree on what comes next.`,
        `The amount of a cycle is set when you subscribe and guaranteed for twelve months, that is ${TERM_SERIES} series of ${SERIES_CYCLES} cycles. It is paid at the first visit of the cycle, on site. We call you ${SERIES_NOTICE_DAYS} days before a series ends to confirm the next one.`,
        `The travel fee for your area, if there is one, is reduced by ${DISCOUNT} per visit for a subscriber, never below zero, and is paid with the cycle. The first-hour-free offer does not apply to subscriptions.`,
      ],
    },
    {
      title: "What we need at your place",
      body: [],
      list: [
        "About two square metres of clear floor and one free electrical outlet.",
        "Agreed access: building code, parking, elevator, and the household animal mentioned in advance.",
        "The pieces gathered, clean and dry. We iron; we do not wash.",
        "An adult present when the artisan arrives and when he leaves.",
      ],
    },
    {
      title: "Delicate pieces",
      body: [
        "Every fibre is identified before treatment, and care labels govern. Silk, lace, cashmere and pleats are worked with contactless steam or under a pressing cloth.",
        "In case of doubt, we consult you before touching the piece. We may decline to treat one whose label forbids ironing, whose condition makes damage likely, or which calls for a treatment we do not practise. That refusal is said on the spot, and the piece is not billed to you.",
      ],
    },
    {
      title: "If something is damaged",
      body: [
        "We take care of what you entrust to us, and we answer for damage caused by our fault. Report any damage without delay — ideally before we leave, and at the latest within forty-eight hours — and keep the piece as it is: we must be able to see it.",
        "We cannot answer for a pre-existing flaw, for a piece whose care label is missing or misleading, or for damage resulting from a treatment you asked for against our advice.",
        "Nothing in these terms sets aside the rights the Consumer Protection Act grants you.",
      ],
    },
    {
      title: "The site",
      body: [
        "The words, images and design of this site belong to NIVEX. Reading them and sharing them, gladly; passing them off as your own, no.",
        "We work to keep the site available and accurate, without being able to guarantee it at every instant. An outage never cancels an appointment already confirmed.",
        "False bookings, bulk messaging and automated harvesting are not permitted.",
      ],
    },
    {
      title: "Your information",
      body: [
        "What we collect, why, and how long we keep it: all of it is set out in the privacy policy.",
      ],
    },
    {
      title: "Governing law",
      body: [
        "These terms are governed by the laws of Quebec and the laws of Canada applicable therein, and the courts of Quebec have jurisdiction.",
        "Before it comes to that, call us at {phone}. Most disagreements settle in one conversation.",
      ],
    },
    {
      title: "If these terms change",
      body: [
        "The date at the top governs. The terms in force when you book are the ones that apply to that booking.",
      ],
    },
  ],
};

export const en: Dict = {
  code: "en",
  htmlLang: "en-CA",
  meta: {
    service: "In-home ironing",
    title: "In-home ironing in Saint-Lambert and Longueuil — NIVEX",
    description:
      "In-home ironing in {places}. We iron your clothes and bed linen on site, in your home: no pickup, no delivery.",
    offer: "First hour on the house.",
    ogAlt: "NIVEX — Prestige in-home ironing",
  },
  nav: {
    home: "Home",
    story: "The story",
    services: "Services",
    how: "How it works",
    faq: "Questions",
    pricing: "Pricing",
    book: "Book",
    contact: "Contact",
  },
  brand: {
    name: "NIVEX",
    tagline: "Prestige in-home ironing",
    values: "Gentle, delicate, elegant",
    phone: PHONE,
    phoneHref: PHONE_HREF,
    email: "contact@nivexrepassage.ca",
    emailHref: "mailto:contact@nivexrepassage.ca",
  },
  hero: {
    eyebrow: "In-home ironing · Saint-Lambert · Longueuil",
    titleTop: "Give your wardrobe",
    titleBottom: "the care it deserves.",
    onSite:
      "We iron your clothes and bed linen on site, in your home. No pickup, no delivery: nothing leaves your home.",
    lede:
      "A craftsman comes to you, press and high-precision steam in hand. You carry nothing, you fold nothing. You open your closet, and everything hangs straight.",
    ctaPrimary: "Book a session",
    ctaSecondary: "Read the story",
    offer: "Your first hour of ironing is on the house.",
    scroll: "Scroll",
  },
  marquee: [
    "Flawless shirts",
    "Dresses & delicates",
    "Fine household linen",
    "Suits & jackets, sharp",
    "School & work uniforms",
    "Everything happens at your home",
  ],
  story: {
    eyebrow: "The story",
    title: "White, the way it was on day one.",
    chapters: [
      {
        num: "I",
        title: "A gesture we forgot",
        body:
          "There was a time when Sunday evening was for ironing. The iron hissed, steam rose, and the whole week took shape on a wooden board. That gesture didn't vanish because it stopped mattering. It vanished because time did.",
      },
      {
        num: "II",
        title: "What a crease says",
        body:
          "A wrinkled garment doesn't betray carelessness — it betrays a calendar. But the person across from you doesn't know that. The collar that falls straight, the shoulder that holds, the crease that sits: that is what speaks before you do, at the interview and at the first date alike.",
      },
      {
        num: "III",
        title: "The name",
        body:
          "NIVEX comes from the Latin nix, nivis — snow. That kind of white isn't negotiable: it is clean, frank, with no memory of the day before. It is the state we return your fabrics to, one piece at a time.",
      },
      {
        num: "IV",
        title: "At your place, nowhere else",
        body:
          "We don't take your clothes hostage in a van. The workshop comes to you: professional press, calibrated steam, pressing cloths, hangers. You stay home. So do your clothes. And when we leave, the closet is in order.",
      },
    ],
    signature: "Styve",
    signatureRole: "Master presser, founder of NIVEX",
    quote:
      "“Luxury isn't owning many clothes. It's that every one of them is ready to wear.”",
  },
  services: {
    eyebrow: "Services",
    title: "Every fabric has its temperature.",
    lede:
      "We don't press silk the way we press uniform cotton. Each piece gets the setting, the pressure and the steam it calls for.",
    items: [
      {
        icon: "shirt",
        serviceKey: "shirt",
        name: "Immaculate shirts",
        body: "Collar, yoke, cuffs, sleeves, body. In that order, always. Pressed on a wooden hanger, ready to wear.",
        detail: "≈ {qty} shirts an hour",
      },
      {
        icon: "dress",
        serviceKey: "delicate",
        name: "Dresses & delicates",
        body: "Silk, viscose, lace, pleats. Contactless steam when the fibre demands it, a pressing cloth when it deserves one.",
        detail: "≈ {qty} pieces an hour",
      },
      {
        icon: "linen",
        serviceKey: "linen",
        name: "Sheets & household linen",
        body: "Single, double, queen, king. The larger sizes take longer, and they are counted separately. Hotel folding, sharp edges.",
        detail: "≈ {qty} double sheets an hour",
      },
      {
        icon: "suit",
        serviceKey: "suit",
        name: "Suits & jackets",
        body: "Steam relaxing, shoulders reshaped, trouser crease marked. Never any shine.",
        detail: "≈ {qty} pieces an hour",
      },
      {
        icon: "badge",
        serviceKey: "uniform",
        name: "Uniforms",
        body: "School and professional. The whole week's set, handled in one go, returned on numbered hangers.",
        detail: "≈ {qty} sets an hour",
      },
      {
        icon: "clock",
        serviceKey: "trousers",
        name: "Everything happens at your home",
        body: "Nothing leaves your home. Your craftsman arrives with his board, his steam and his hangers, works in front of you, and tidies up before leaving.",
        detail: "{zone}",
      },
    ],
    regions: { south: "South Shore", montreal: "Montreal" },
  },
  how: {
    eyebrow: "How it works",
    title: "Three steps. That's all.",
    steps: [
      {
        n: "1",
        title: "Schedule",
        body: "Pick your slot online. The confirmation goes out by email at once, and the appointment lands in your craftsman's calendar.",
      },
      {
        n: "2",
        title: "Prepare",
        body: "Before we arrive, gather the pieces you want handled. A basket, a bed, the back of a chair: anything works. We take it from there.",
      },
      {
        n: "3",
        title: "Meet",
        body: `Your craftsman arrives ${SETUP_MINUTES} minutes before the agreed time to set up, then irons for the whole time you booked. You get back a wardrobe that's ready to wear, on hangers.`,
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "For the result, not the minute.",
    lede:
      "You choose the pieces to be handled; we arrive with all the equipment. The amount is confirmed on site before we begin.",
    offers: [
      {
        name: "Week session",
        volume: "10 to 15 pieces — your whole week's wardrobe",
        note: "The most requested format, and the shortest visit we make.",
      },
      {
        name: "Family session",
        volume: "15 to 22 pieces — shirts, trousers, school uniforms",
        note: "For a household, or a fortnight in one go.",
      },
      {
        name: "Subscription",
        volume: "Regular visits, reserved time slots",
        note: "Rate guaranteed twelve months.",
      },
    ],
    planFrom: "from {price} per cycle",
    button: "Put my session together",
    seeAll: "See the full price list",
    firstFree: "First hour free",
    firstFreeConditions:
      `On any first booking of ${FIRST_FREE_MIN} or more. One use per customer. Not applicable to subscriptions or single pieces.`,
    note: "The estimate shown is indicative. The final amount is confirmed on site, before we start.",
  },
  testimonials: {
    eyebrow: "Word of mouth",
    title: "Closets, transformed.",
  },
  faq: {
    eyebrow: "Questions",
    title: "What people ask us.",
    cadence: "Figure about {shirts} shirts per hour, or 5 to 7 mixed pieces.",
    cadenceMixed: "Figure about 5 to 7 mixed pieces per hour.",
    items: [
      {
        q: "Do you pick up the clothes?",
        a: "No. Everything is ironed on site, in your home, with our professional equipment.",
      },
      {
        q: "Do I need to provide a board and iron?",
        a: "No. Your craftsman arrives with the full professional kit: active pressing table, steam generator, pressing cloths, hangers. All we need is a power outlet and roughly two square metres.",
      },
      {
        q: "How much time should I plan for?",
        a: "{cadence} During booking, the estimator works out the duration from the quantities you choose; to change it, change the quantities.",
      },
      {
        q: "Do I have to be there during the session?",
        a: "Ideally to let us in and see us out. In between, go about your day. Some clients leave for work after opening the door: we arrange it in advance.",
      },
      {
        q: "What about fragile pieces?",
        a: "Every fibre is identified before treatment. Silk, lace, cashmere and pleats are worked with contactless steam or under a pressing cloth. If we have any doubt about a piece, we ask you before touching it.",
      },
      {
        q: "Which areas do you serve?",
        a: "{zone} The travel fee depends on the area and on the length of the session; the full table is on the pricing page. Enter your postal code on the home page or the pricing page: you will know straight away whether your address is served, and what the journey costs if anything.",
      },
      {
        q: "How does payment work?",
        a: "On site, at the end of the session: cash, Interac e-transfer or card. No prepayment is required to book online.",
      },
      {
        q: "Can I cancel or reschedule?",
        a: `Yes. A session can be cancelled freely up to ${CANCEL_WINDOW_HOURS} hours before the appointment, from the personal link in your confirmation email, without calling us. To move it, call us at ${PHONE} within the same window. For a subscriber, each visit can be cancelled or moved online until 11:59 p.m. the day before.`,
      },
    ],
  },
  cta: {
    title: "Your first hour is on us.",
    titlePlain: "Book your session.",
    body: "Pick a slot. The confirmation goes out by email, with the invitation for your calendar.",
    button: "Book now",
    or: "or call",
  },
  zoneText: {
    served: "Areas served: {list}.",
    montreal: "In Montreal: {list}.",
    none: "Online booking is closed for every area at the moment. Call us.",
  },
  montreal: {
    metaTitle: "In-home ironing in Montreal — NIVEX",
    eyebrow: "Montreal",
    title: "In-home ironing in Montreal",
    lede:
      "NIVEX irons your clothes and bed linen on site, in your home, in Montreal. No pickup, no delivery: nothing leaves your home.",
    areasTitle: "Neighbourhoods served",
    areasLede: "The craftsman travels to these neighbourhoods with all his equipment. Enter your postal code to check your address and see the travel fee.",
    none: `No Montreal neighbourhood is open to online booking at the moment. Call us at ${PHONE}.`,
    conditionsTitle: "Terms in Montreal",
    conditionsLede: "The same as on the {link} page, drawn from the same settings.",
    rate: "Rate",
    rateValue: "{rate} per hour, that is {entry} for a {min} session.",
    minimum: "Minimum length",
    minimumValue: "A session lasts at least {min}. The craftsman arrives {setup} minutes early to set up, at no charge: the time you book is all ironing.",
    travel: "Travel fee",
    travelNote: "Per visit, on top of the session price. The first-hour-free offer does not cover it and does not reduce it.",
    feesFree: "Nothing: the Montreal neighbourhoods we serve have no travel fee.",
    faqTitle: "Questions about Montreal",
    faq: [
      {
        q: "How soon can I get an appointment?",
        a: "Online slots open from {lead} ahead, and up to {horizon} out. You choose your time in the form, and the confirmation goes out by email straight away.",
      },
      {
        q: "How much is the travel fee in Montreal?",
        a: "{fees} It applies to every visit, is added to the session price and is never covered by the first hour on the house.",
      },
      {
        q: "What do I need to provide?",
        a: "An electrical outlet and about two square metres of clear space. Nothing else: the active board, steam generator, pressing cloths and hangers arrive with the craftsman. Mention building access and parking in your booking.",
      },
    ],
    link: "In-home ironing in Montreal: neighbourhoods served and terms",
    cta: "Book a session",
  },
  zoneCheck: {
    label: "Your postal code",
    placeholder: "J4K 1A1",
    check: "Check",
    checking: "Checking…",
    served: "Your address is served.",
    servedWithFee: "Served, with a travel fee of {fee} per visit ({long} for a session of {hours} or more).",
    servedWithFlatFee: "Served, with a travel fee of {fee} per visit.",
    tooFar: "Outside the area for online booking, call us at {phone}.",
    error: "The check did not go through. Try again, or call us at",
  },
  booking: {
    title: "Book a session",
    lede: "Four steps, two minutes. You pick your hour, the confirmation goes out at once.",
    steps: ["Services", "Address", "Time slot", "Confirm"],
    step1: {
      title: "What are we handling?",
      hint: "Select what applies and adjust the quantities. The estimate updates on its own.",
      qty: "Quantity",
      estimate: "Estimate",
      duration: "Estimated duration",
      price: "Estimated amount",
      hours: "h",
      minutes: "min",
      empty: "Select at least one service to continue.",
      firstFreeApplied: "First hour free applied",
      notes: "Anything we should know? (optional)",
      notesPlaceholder: "Fragile pieces, building access, pet at home, parking…",
    },
    step2: {
      title: "Where do we meet you?",
      name: "Full name",
      email: "Email",
      phone: "Phone",
      address: "Address",
      addressPlaceholder: "123 Main Street, apt. 4",
      city: "City",
      postal: "Postal code",
      postalPlaceholder: "J4K 1A1",
      outOfZone:
        "This address is outside our area for online booking. Do call us, we will gladly see together what is possible:",
      checking: "Checking the area…",
      travelFree: "Your address is served, travel included.",
      inZone: "Good news, you're inside the service area.",
      travelFee: "Travel fee",
      travelNote: "This fee is added to the price of the session. The first-hour-free offer does not cover it and does not reduce it.",
      heardFrom: "How did you hear about NIVEX? (optional)",
      heardFromEmpty: "I'd rather not say",
      heardFromOptions: {
        "porte-a-porte": "A visit at my door or a NIVEX card",
        "recommandation": "A recommendation from someone I know",
        "facebook": "Facebook",
        "instagram": "Instagram",
        "linkedin": "LinkedIn",
        "google": "A Google search",
        "assistant-ia": "An AI assistant (ChatGPT or other)",
        "autre": "Other",
      },
      referredBy: "Who recommended us? (optional)",
    },
    step3: {
      title: "When would suit you?",
      hint: "Greyed-out times are already taken. Timezone: Eastern (Montreal).",
      loading: "Reading the schedule…",
      noSlots: "Nothing open that day. Try another date.",
      morning: "Morning",
      afternoon: "Afternoon",
      evening: "Evening",
      timezone: "Timezone: Eastern (Montreal).",
      setup:
        `Your presser arrives ${SETUP_MINUTES} minutes before your session begins to set up, at no charge: the hours you booked are given entirely to ironing.`,
      comment: "Anything to add? (optional)",
      commentPlaceholder: "A scheduling constraint, an hour to avoid, a particular access…",
    },
    step4: {
      title: "Everything correct?",
      when: "Appointment",
      where: "Address",
      what: "Services",
      who: "Contact",
      total: "Estimate",
      travelFee: "Travel fee",
      travelHint: "Not covered by the free first hour",
      grandTotal: "Estimated total",
      consent:
        "I understand the estimate is indicative and the final amount will be confirmed on site before the session begins.",
      submit: "Confirm booking",
      submitting: "Confirming…",
    },
    back: "Back",
    next: "Continue",
    success: {
      title: "You're booked.",
      body: "Your appointment is set. A confirmation email just went out, with the invitation for your calendar; your craftsman has been notified.",
      bodyNoEmail: "Your appointment is set and your craftsman has been notified. The confirmation email could not be sent — note your reference, it is enough.",
      wanted: "Appointment",
      ref: "Reference",
      manage: "Manage my booking",
      home: "Back to home",
    },
    errors: {
      taken: "That slot was just taken. Please pick another.",
      stale: "That time is no longer available. Please pick another.",
      paused: `Booking is paused for the moment. Call us at ${PHONE} and we'll find you a slot.`,
      tooMany: `Several bookings have just been made with this email. Call us at ${PHONE}.`,
      generic: "Something went wrong. Try again, or call us directly.",
      required: "This field is required",
      email: "Invalid email",
      phone: "Invalid number",
      postal: "Invalid postal code (e.g. J4K 1A1)",
      outOfArea: `This address is outside the area we travel to. Call us at ${PHONE} and we will see together what is possible.`,
    },
  },
  manage: {
    title: "Your booking",
    status: {
      confirmed: "Confirmed",
      cancelled: "Cancelled",
      completed: "Completed",
      pending: "Pending",
    },
    cancel: "Cancel this booking",
    cancelConfirm: "Permanently cancel this appointment?",
    cancelled: "Your booking has been cancelled. Your craftsman has been notified.",
    tooLate: `This appointment is less than ${CANCEL_WINDOW_HOURS} h away. Please call ${PHONE}.`,
    notFound: "Booking not found. Check the link from your email.",
    rebook: "Book a new appointment",
  },
  optOut: {
    title: "Stop counting this browser",
    done: "This browser is no longer counted.",
    body: "Your visits to the site from this browser are no longer sent, neither to the visit log nor to the host's audience measurement. Open this same link once in every other browser you use: Safari, Chrome, the in-app browser of Facebook or Instagram, the computer.",
    refused: "This browser refuses to keep the marker, most likely because it is in private browsing. Open the link in an ordinary window.",
    back: "Back to the home page",
  },
  subscribe: {
    title: "Subscribe",
    lede: "You choose your plan, your day and your time once. The visits then follow at the plan's rhythm, and every slot is kept for you.",
    steps: ["Plan", "Address", "Time", "Confirmation"],
    plan: {
      title: "Which plan?",
      hint: "A cycle is the plan's visits actually completed. It is paid at its first visit, on site.",
      perCycle: "/ cycle",
      visits: "{n} × {duration}",
      noFirstHour: "The first-hour-free offer does not apply to subscriptions.",
    },
    address: {
      title: "Where do we meet you?",
      travelReduced: "Travel fee, subscriber rate: {fee} per visit, instead of {full}.",
      travelZero: "For a subscriber, the travel fee for your area drops to zero.",
      cycleTotal: "Total per cycle, fees included: {total}.",
    },
    slot: {
      title: "Your first visit",
      hint: "Choose the date and time of the first visit. The following ones fall on the same day, at the same time, {rhythm}.",
      checking: "Checking the {n} dates of the series…",
      free: "All {n} dates of the series are free.",
      showDates: "Show the dates",
      hideDates: "Hide the dates",
      conflicts: "This slot does not hold for the whole series. These dates are a problem:",
      reasons: { busy: "already booked", closed: "outside our hours", lead: "too soon", invalid: "invalid date" },
      alternatives: "These slots are free for the whole series:",
      noAlternative: `No other slot in the next two weeks holds for the whole series. Choose another time, or call us at ${PHONE}.`,
      failed: "The check did not go through. Please try again in a moment.",
    },
    confirm: {
      title: "Is everything right?",
      plan: "Plan",
      rhythm: "Rhythm",
      first: "First visit",
      series: "Visits reserved",
      seriesValue: "{n} visits, until {last}",
      cycle: "Plan, per cycle",
      travel: "Travel fees for the cycle",
      total: "Total per cycle",
      payment: "The cycle is paid at its first visit, on site: cash, Interac e-transfer or card. Nothing is paid online.",
      rule: "Each visit can be cancelled or moved at no charge until 11:59 p.m. the day before, from the link in your email. A cancelled visit does not count: it is added at the end of the series.",
      consent: "I have read these terms. I understand that a cycle is the visits actually completed, and that it is paid at its first visit.",
      submit: "Confirm the subscription",
      submitting: "Confirming…",
    },
    success: {
      title: "Your subscription is in place.",
      body: "Your visits are reserved. The confirmation has just gone out by email, with the link to manage each visit.",
      bodyNoEmail: "Your visits are reserved. The confirmation email could not be sent: note your reference and keep the link below.",
      first: "First visit",
      ref: "Reference",
      manage: "Manage my visits",
    },
    errors: {
      conflicts: "A date in the series has just been taken. Please choose another slot.",
      tooMany: `A subscription was already taken with this email. Please call us at ${PHONE}.`,
    },
  },
  subManage: {
    title: "Your subscription",
    status: { active: "Active", ended: "Ended" },
    cycleLabel: "Current cycle",
    cycleNow: "Cycle {c} — {d}/{n} visits done",
    amount: "Amount per cycle",
    payment: "The cycle is paid at its first visit, on site.",
    rhythm: "Rhythm",
    upcoming: "Your next visits",
    rank: "Visit {i}/{n} · cycle {c}",
    makeup: "Replacement",
    cancelledTag: "Cancelled",
    move: "Move",
    cancel: "Cancel",
    cancelConfirm: "Cancel this visit? It will not count towards your cycle, and a visit will be added at the end of the series.",
    moveTitle: "Choose the new time",
    moveConfirm: "Move this visit to {when}?",
    keep: "Keep",
    confirmMove: "Move",
    tooLate: "The online deadline has passed (11:59 p.m. the day before). For this visit, please call us:",
    rule: "Each visit can be cancelled or moved at no charge until 11:59 p.m. the day before.",
    ended: "This subscription has ended.",
    notFound: "Subscription not found. Please check the link in your email.",
    replaced: "Visit cancelled. It is replaced on {when}.",
    replacedNone: "Visit cancelled. We will call you to place it at the end of the series.",
    moved: "Visit moved.",
    done: "{n} visits already completed.",
    errors: {
      tooLate: "The deadline has passed. Please call us for any change.",
      taken: "This slot has just been taken. Please choose another one.",
    },
  },
  footer: {
    tagline: "Prestige in-home ironing",
    rights: "All rights reserved",
    zone: "Service area",
    hours: "Hours",
    legal: "Privacy",
    terms: "Terms of use",
    admin: "Craftsman login",
    craft: "Made with care on the South Shore",
  },
  protocol: {
    eyebrow: "The protocol",
    title: "The order isn't improvised.",
    lede:
      "A badly ironed shirt isn't a badly heated one: it's a shirt ironed out of order. Every finished part would be creased again by the next. Here is the sequence — the one that never changes.",
    steps: [
      { n: "01", title: "The collar",  body: "Underside first, from the points toward the centre. Never the reverse: that's how you avoid the false crease that never leaves." },
      { n: "02", title: "The yoke",    body: "The upper back, laid over the nose of the board. One shoulder, then the other, without ever crushing the seam." },
      { n: "03", title: "The cuffs",   body: "Opened flat, inside then outside. The iron works around the buttons — never over them." },
      { n: "04", title: "The sleeves", body: "We follow the existing crease, we don't invent a new one. A sleeve holds one memory; we respect it." },
      { n: "05", title: "The body",    body: "Front buttoned, then the back, rotating the shirt around the board rather than flipping it." },
      { n: "06", title: "The steam",   body: "A final contactless pass. The fibre relaxes, the shape sets, and shine never appears." },
      { n: "07", title: "The hanger",  body: "Wood, immediately. The fabric cools into shape — that's where the work holds, or where it's lost." },
    ],
  },
  contact: {
    eyebrow: "Get in touch",
    title: "A question before you book?",
    lede:
      "An item you're unsure about, an unusual time slot, a quote for a large batch: write to us. You'll hear back the same day, and get an acknowledgement within the minute.",
    name: "Your name",
    email: "Your email",
    phone: "Phone (optional)",
    subject: "Subject (optional)",
    subjectPlaceholder: "Quote for a batch of shirts",
    message: "Your message",
    messagePlaceholder: "Tell us what you need…",
    submit: "Send message",
    submitting: "Sending…",
    successTitle: "Message sent.",
    successBody:
      "An acknowledgement just landed in your inbox. We usually reply the same day.",
    another: "Write another message",
    orCall: "Or talk to us directly",
    phoneLabel: "Phone",
    emailLabel: "Email",
    hoursLabel: "Available",
    hoursValue: "{hours}",
    from: "",
    to: "to",
    errors: {
      required: "This field is required",
      email: "Invalid email",
      short: "A few more words, please",
      rate: "You just wrote to us. Give us a few minutes to reply.",
      unavailable:
        `Sending isn't working right now. Call ${PHONE} — we pick up.`,
      generic: "Sending failed. Try again, or call us directly.",
    },
  },
  legal: {
    updatedLabel: "Last updated",
    summary: "Contents",
    readAlso: "Read also",
    privacy,
    terms,
  },
  tarifs: {
    eyebrow: "Pricing",
    title: "What a session at your place amounts to.",
    lede:
      "We don't sell “ironing”: we sell a measured pace, the same from one session to the next. Here is what it costs, what it covers, and what separates it from a helping hand.",
    headline: "A session of {min} — {price}",
    visitNote: "minimum {min} per visit · {travel}",
    travelIncluded: "travel included",
    travelVaries: "travel fee depends on your area",
    cadence: {
      title: "Our pace, hour by hour",
      lede:
        "These figures aren't a sales promise: they are the ones our booking engine uses to work out how long your session will take. What you read here is what the form will calculate.",
      colType: "Type of piece",
      colQty: "In 1 h",
      note: "A mixed basket runs at about 5 to 7 pieces an hour. That average is what sets the ranges quoted on each package.",
    },
    versus: {
      title: "This is not household ironing.",
      lede: "Five differences, and they show on the garment.",
      elsewhere: "Elsewhere",
      here: "At NIVEX",
      rows: [
        {
          title: "The volume",
          them: "Whatever can be done in the time paid for. You find out how far it got at the end.",
          us: "A number of pieces stated before we start. If we fall short through our own doing, the missing time isn't billed.",
        },
        {
          title: "The equipment",
          them: "Your iron, your board, your power. The result depends on what you happen to own.",
          us: "Active board, steam generator, pressing cloths and wooden hangers brought along. You provide an outlet and two square metres.",
        },
        {
          title: "The order of work",
          them: "Piece after piece, in basket order. What's finished creases again under the next one.",
          us: "A seven-step protocol per shirt, and an order of passage that keeps finished pieces from creasing.",
        },
        {
          title: "Delicate pieces",
          them: "One setting for everything. Silk, pleats and cashmere sometimes come away marked.",
          us: "Fibre tested every time, care label followed, contactless steam. In case of doubt we ask you before touching the piece.",
        },
        {
          title: "What you're left with",
          them: "A pile on the bed, and a verbal arrangement.",
          us: "An orderly wardrobe, an invoice, a link to manage your appointment, and our written liability for damage.",
        },
      ],
    },
    blocks: {
      title: "The sessions",
      lede: "A length, a volume, an amount. Nothing to work out.",
      minimum:
        "Minimum {min} per visit. Add-ons and single pieces attach to a session already booked — on their own they don't warrant a trip.",
    },
    bundles: {
      title: "Set packages",
      lede: "A typical basket, already costed.",
    },
    addons: {
      title: "Add-ons to your session",
      lede: "Alongside a session already booked, with no second trip.",
    },
    units: {
      title: "Single pieces",
      lede: "For one piece added to a session already booked.",
      linen: "Bedding & household linen",
      garments: "Clothes & outfits",
      note: "These prices apply to a single piece added to a session already booked. Beyond a few pieces, a session costs less.",
    },
    plans: {
      title: "Subscriptions",
      lede: "A regular service, and an amount that comes down as the sessions add up.",
      perMonth: "/ cycle",
      cycleNote: "A cycle is the plan's visits actually completed, roughly four weeks. It is paid at its first visit, on site.",
      cta: "Subscribe",
      full: "Single sessions",
      save: "You save",
      perks: [
        "Your slots are kept for you: the same day, at the same time, all year.",
        "A visit can be cancelled or moved at no charge until 11:59 p.m. the day before. It does not count, and is added at the end of the series.",
        "Light starch on collars and cuffs, included at no extra cost.",
        `Travel fee reduced by ${DISCOUNT} per visit.`,
        `Rate guaranteed twelve months, that is ${TERM_SERIES} series of ${SERIES_CYCLES} cycles.`,
      ],
    },
    terms: {
      title: "What holds for every session",
      items: [
        { dt: "Volume honoured", dd: "The number of pieces stated on each package is a commitment. If we fall short through our own doing, the missing time isn't billed." },
        { dt: "Estimate and final amount", dd: "The estimate is indicative. The final amount follows the time actually spent and is confirmed to you on site, before we begin." },
        { dt: "Payment", dd: "On site, at the end of the session: cash, Interac e-transfer or card. No prepayment when booking." },
        { dt: "What we need at your place", dd: "One power outlet and about two square metres of clear floor. Nothing else: the professional equipment arrives with the artisan." },
      ],
      travel: "Travel fee",
      travelFree: "No travel fee",
      travelFlat: "{fee} per visit",
      travelShort: "{fee} for a session under {hours}",
      travelLong: "{fee} for a session of {hours} or more",
      travelNote: `The fee depends on the area and on the length of the session. It is added to the price, is not covered by the first-hour-free offer and is never reduced by it. It applies to every visit; for a subscriber, it is reduced by ${DISCOUNT} per visit, never below zero, and is paid with the cycle.`,
    },
    firstFreeLabel: "First session",
    cta: {
      title: "Put your session together.",
      body: "The booking flow uses exactly these figures: you tick your services, it works out the duration and the amount, and confirms the hour you pick.",
    },
  },
  beforeAfter: {
    eyebrow: "The result",
    title: "Before, after",
    lede: "Pressed on site, returned on a wooden hanger.",
    labels: { before: "Before", after: "After" },
    banner: "Your clothes, ready to wear.",
    bannerAlt: "Garments pressed by NIVEX, hanging on wooden hangers",
    items: [
      { key: "chemise", name: "White shirt",
        altBefore: "White shirt before pressing",
        altAfter: "White shirt after pressing" },
      { key: "pantalon", name: "Suit trousers",
        altBefore: "Suit trousers before pressing",
        altAfter: "Suit trousers after pressing" },
      { key: "t-shirt", name: "Cotton t-shirt",
        altBefore: "Cotton t-shirt before pressing",
        altAfter: "Cotton t-shirt after pressing" },
      { key: "veste", name: "Lined jacket",
        altBefore: "Lined jacket before pressing",
        altAfter: "Lined jacket after pressing" },
      { key: "velours", name: "Corduroy trousers",
        altBefore: "Corduroy trousers before pressing",
        altAfter: "Corduroy trousers after pressing" },
    ],
  },
  gallery: {
    eyebrow: "The pieces",
    title: "What passes through our hands.",
    lede:
      "A wool suit is not handled like a cotton overshirt, nor a pleated skirt like a dinner jacket. Here is the kind of piece we receive, and the care each one calls for.",
    photos: {
      gilet: {
        name: "Waistcoats & suits",
        detail: "Checked wool, notched lapels. Shoulders reshaped, contactless steam, never any shine.",
        alt: "Checked wool suit waistcoat hanging on a wooden hanger",
      },
      veston: {
        name: "Tailored blazers",
        detail: "The lapel is creased at its edge, never flattened. Black wool must take on no sheen.",
        alt: "Black tailored blazer shown on a mannequin",
      },
      chemises: {
        name: "Shirts & overshirts",
        detail: "Collar, yoke, cuffs, sleeves, body — in that order, so nothing creases again.",
        alt: "Two beige cotton overshirts hanging side by side",
      },
      ceremonie: {
        name: "Ceremony wear",
        detail: "Satin piping worked around, never over; trouser crease set under a pressing cloth.",
        alt: "Midnight blue dinner jacket with satin piping, on a hanger",
      },
      uniformes: {
        name: "School uniforms",
        detail: "Pleated skirts are taken pleat by pleat. Returned on hangers numbered per child.",
        alt: "Blue school uniforms hanging on a rail",
      },
    },
  },
  photos: {
    portrait: "Styve, founder of NIVEX, in his apron, professional iron in hand",
    poste:
      "The NIVEX workstation: steam generator, iron, sleeve board and wooden hangers, set up at the client's home",
    travail: "Steam finishing a white shirt on a wooden hanger",
    portraitAlt: "Styve, ironing craftsman, Longueuil",
  },
  days: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
  daysShort: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
  months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  closed: "Closed",
};

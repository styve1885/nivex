import type { Dict, LegalDoc } from "./fr";
import { CANCEL_WINDOW_HOURS } from "../brand";

const privacy: LegalDoc = {
  eyebrow: "Privacy",
  title: "What we know about you.",
  lede:
    "NIVEX collects enough to reach you and enough to find you. Nothing else. None of it is ever sold, rented or traded. Here is the whole of it, plainly.",
  sections: [
    {
      title: "Who answers for your information",
      body: [
        "NIVEX is an at-home ironing service operated by Styve, in Longueuil, Quebec. He is the person in charge of the protection of personal information within the meaning of Quebec law, and the only person with access to what this site collects.",
        "For a question, an access request or a complaint, write to {email} or call {phone}.",
      ],
    },
    {
      title: "What we collect",
      body: [
        "Only what you hand us yourself, at the moment you hand it over. This site follows no one around and buys data from no one.",
      ],
      list: [
        "Booking — your name, your email, your phone number, the address of the session (street, city, postal code), the services and quantities you chose, the time slot you kept, and the notes you write yourself.",
        "Contact form — your name, your email, your phone number if you give it, the subject and the body of your message.",
        "Technical log — the nature and time of the site's operations: a booking created, an email sent, an error raised. No IP address, no browser identifier, no device fingerprint.",
      ],
    },
    {
      title: "What it is for",
      body: [
        "Every piece of information answers to a reason. When the reason goes, the information goes with it.",
      ],
      list: [
        "Your address is how we come to you, and how we check that you are inside the service area.",
        "Your email and phone number are how we confirm, warn you of a delay, and answer you.",
        "The services you chose are how we book the right length of time and pack the right equipment.",
        "Your notes are how we avoid ruining a fragile piece, and how we get into your building.",
        "The appointment book is how the business keeps its accounts and how a past session can be traced if it is ever disputed.",
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
        "Three providers, each for one precise task, and none of them may use any of it for their own ends.",
      ],
      list: [
        "Vercel — hosts the site and serves it to your browser.",
        "Neon — the database where bookings and messages live.",
        "Google — your artisan's calendar, where your appointment is written down with your name, your address and your contact details, and Gmail, from which your confirmation and invitation are sent.",
      ],
    },
    {
      title: "Outside Quebec",
      body: [
        "The site, the database and the Google services are hosted in the United States. Your information therefore leaves Quebec to be kept there, and is subject to the law of the host country — which may, in certain cases, allow its authorities to reach it.",
        "We chose providers contractually bound to protection comparable to what is required here, and we entrust them with nothing beyond what is necessary. By booking or writing to us through the site, you consent to this communication outside Quebec. If that troubles you, call us and we will arrange the appointment by voice.",
      ],
    },
    {
      title: "How long we keep it",
      body: [],
      list: [
        "A booking and everything attached to it: three years after the session. That is the civil limitation period in Quebec — the window during which a session can still be disputed, either way.",
        "A message from the contact form: two years, or until you ask us to delete it.",
        "The technical log: twelve months.",
      ],
    },
    {
      title: "How it is protected",
      body: [],
      list: [
        "The site is served over HTTPS only: what you write is encrypted in transit.",
        "The token that links the site to the artisan's Google account is encrypted with AES-256-GCM before it reaches the database.",
        "The artisan's area requires a Google sign-in, and the very first sign-in also requires a setup code.",
        "The “Manage my booking” link carries a random token belonging to your appointment alone. It opens that one, and nothing else.",
      ],
    },
    {
      title: "Cookies",
      body: [
        "This site drops no advertising cookie, no analytics cookie, no social network button. An ordinary visitor receives none at all.",
        "Two cookies exist, and they concern the artisan only: the one that keeps his session open in his own area, and a temporary one that protects his Google sign-in against fraud. Both expire on their own.",
        "Typefaces are served from our own domain: displaying this page calls no third-party server.",
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
        "NIVEX is an at-home ironing service operated by Styve, in Longueuil, Quebec. These terms govern the use of {site}, online booking, and the sessions that follow from it.",
        "By booking, you confirm that you are at least eighteen years old and entitled to have the pieces you present to us treated.",
      ],
    },
    {
      title: "The service",
      body: [
        "An artisan comes to your home with his professional equipment: active table, steam generator, pressing cloths and hangers. He irons the pieces you present to him on the spot, then returns them on hangers or folded.",
        "Your clothes do not leave your home, unless a pickup has been agreed beforehand.",
      ],
    },
    {
      title: "Where we go",
      body: [
        "{zone}.",
        "The postal code you enter while booking tells you at once whether you are inside the area. Outside it, booking remains possible: we call you back to confirm, or to tell you plainly that we cannot make the trip.",
      ],
    },
    {
      title: "Booking",
      body: [],
      list: [
        "The slots on display are the ones genuinely free in the artisan's calendar. What you see exists.",
        "A session lasts {min} at the least.",
        "A booking is made at least {lead} ahead, and up to {horizon} out.",
        "Confirmation goes out by email within the minute, with the invitation for your calendar and a personal link for managing the appointment.",
      ],
    },
    {
      title: "The price",
      body: [
        "Pricing is by time spent, at {rate} an hour, for a minimum of {min}. Applicable taxes, if any, are added to that amount.",
        "The estimate shown while booking is indicative: it follows from what you declared. The final amount is set by the time actually spent, and it is confirmed to you on site before the session begins. You are never committed to an amount you have not seen.",
        "If the work asked for goes beyond what was foreseen, we say so before carrying on. Whether to extend or to stop there is your call.",
      ],
    },
    {
      title: "The first hour, on us",
      body: [
        "On a first booking, the first hour of ironing is offered and deducted from the estimate automatically. Once per email address. It cannot be exchanged for money, and it does not stack with any other offer.",
      ],
    },
    {
      title: "Payment",
      body: [
        "At the end of the session, on site: cash, Interac e-transfer or card. No prepayment is asked for when booking, and the site collects no banking information.",
      ],
    },
    {
      title: "Cancelling or moving",
      body: [
        "Freely, up to {cancel} before the appointment, from the personal link you received by email. Nothing to pay, nothing to justify.",
        "Past that, call us at {phone}: we will do our best.",
        "Should we have to cancel on our side — illness, equipment failure, an impassable road — you are told as soon as we know, and you owe nothing.",
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
    title: "NIVEX — Prestige In-Home Ironing | Longueuil & the South Shore",
    description:
      "A master presser comes to your home with professional equipment. Shirts, delicate garments, suits, household linen. Longueuil and the South Shore. First hour on the house.",
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
    phone: "+1 450 943 1217",
    phoneHref: "tel:+14509431217",
    email: "styve1885@gmail.com",
    emailHref: "mailto:styve1885@gmail.com",
    region: "Longueuil · South Shore · Montérégie",
  },
  hero: {
    eyebrow: "In-home service · Longueuil",
    titleTop: "Give your wardrobe",
    titleBottom: "the care it deserves.",
    lede:
      "A craftsman comes to you, press and high-precision steam in hand. You carry nothing, you fold nothing. You open your closet, and everything hangs straight.",
    ctaPrimary: "Book a session",
    ctaSecondary: "Read the story",
    offer: "Your first hour of ironing is on the house, with any booking.",
    scroll: "Scroll",
  },
  marquee: [
    "Flawless shirts",
    "Dresses & delicates",
    "Fine household linen",
    "Suits & jackets, sharp",
    "School & work uniforms",
    "Flexible pickup & delivery",
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
      "Luxury isn't owning many clothes. It's that every one of them is ready to wear.",
  },
  services: {
    eyebrow: "Services",
    title: "Every fabric has its temperature.",
    lede:
      "We don't press silk the way we press uniform cotton. Each piece gets the setting, the pressure and the steam it calls for.",
    items: [
      {
        icon: "shirt",
        name: "Flawless shirts",
        body: "Collar, yoke, cuffs, body, sleeves. In that order, always. Finished on wooden hangers, ready to wear.",
        detail: "≈ 8 to 12 shirts per hour",
      },
      {
        icon: "dress",
        name: "Dresses & delicates",
        body: "Silk, viscose, lace, pleats. Contactless steam when the fibre demands it, a pressing cloth when it earns one.",
        detail: "Fibre test every time",
      },
      {
        icon: "linen",
        name: "Household linen",
        body: "Sheets, tablecloths, towels, covers. Hotel folding, sharp edges, stacked and ready for the shelf.",
        detail: "Hotel folding included",
      },
      {
        icon: "suit",
        name: "Suits & jackets",
        body: "Steam relaxing, shoulder reshaping, trouser crease set. Never a shine mark. Not once.",
        detail: "Structural reshaping",
      },
      {
        icon: "badge",
        name: "Uniforms",
        body: "School and professional. The full week's batch, handled in one pass, returned on numbered hangers.",
        detail: "Weekly plan available",
      },
      {
        icon: "clock",
        name: "Pickup & delivery",
        body: "Not home? We collect and return on whatever schedule suits you, within the service area.",
        detail: "Longueuil & the South Shore",
      },
    ],
  },
  how: {
    eyebrow: "How it works",
    title: "Three steps. That's all.",
    steps: [
      {
        n: "1",
        title: "Schedule",
        body: "Pick your slot online. The availability you see is real — it comes straight out of your craftsman's calendar.",
      },
      {
        n: "2",
        title: "Prepare",
        body: "Before we arrive, gather the pieces you want handled. A basket, a bed, the back of a chair: anything works. We take it from there.",
      },
      {
        n: "3",
        title: "Meet",
        body: "Your specialist arrives with the full kit at the agreed time. You get back a wardrobe that's ready to wear, on hangers.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "By the hour. Nothing hidden.",
    lede: "No per-piece price list, no surprise add-ons. You book hours, we fill them.",
    firstFree: "First hour free",
    firstFreeBody:
      "On your first booking, the first hour of ironing is on us. It's deducted from your estimate automatically.",
    perHour: "/ hour",
    minimum: "Minimum duration",
    note: "The estimate shown is indicative. The final amount is confirmed on site, before we start.",
    seeAll: "See the full price list",
  },
  testimonials: {
    eyebrow: "Word of mouth",
    title: "Closets, transformed.",
  },
  faq: {
    eyebrow: "Questions",
    title: "What people ask us.",
    items: [
      {
        q: "Do I need to provide a board and iron?",
        a: "No. Your craftsman arrives with the full professional kit: active pressing table, steam generator, pressing cloths, hangers. All we need is a power outlet and roughly two square metres.",
      },
      {
        q: "How much time should I plan for?",
        a: "Figure 8 to 12 shirts per hour, or 6 to 8 mixed pieces. During booking, the estimator suggests a duration based on what you select — you can always adjust it.",
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
        a: "Longueuil and its boroughs — Vieux-Longueuil, Saint-Hubert, Greenfield Park — plus the surrounding South Shore: Brossard, Saint-Lambert, Boucherville, Saint-Bruno. Enter your postal code when booking: if you're outside the zone, we'll tell you right away.",
      },
      {
        q: "How does payment work?",
        a: "On site, at the end of the session: cash, Interac e-transfer or card. No prepayment is required to book online.",
      },
      {
        q: "Can I cancel or reschedule?",
        a: `Yes, freely up to ${CANCEL_WINDOW_HOURS} hours before the appointment. Your confirmation email holds a personal link that lets you manage everything without calling us.`,
      },
    ],
  },
  cta: {
    title: "Your first hour is on us.",
    body: "Pick a slot. Confirmation lands within the minute, and the invitation goes straight into your calendar.",
    button: "Book now",
    or: "or call",
  },
  booking: {
    title: "Book a session",
    lede: "Four steps, two minutes. The slots you see are the ones genuinely open in your craftsman's calendar.",
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
      outOfZone: "This address looks outside our zone. Book anyway — we'll confirm by phone.",
      inZone: "Good news, you're inside the service area.",
    },
    step3: {
      title: "When suits you?",
      hint: "Greyed-out times are already taken. Timezone: Eastern (Montreal).",
      loading: "Reading the calendar…",
      noSlots: "Nothing open that day. Try another date.",
      morning: "Morning",
      afternoon: "Afternoon",
      evening: "Evening",
      selected: "Slot selected",
      nextAvailable: "Next opening",
    },
    step4: {
      title: "Everything correct?",
      when: "Appointment",
      where: "Address",
      what: "Services",
      who: "Contact",
      total: "Estimate",
      consent:
        "I understand the estimate is indicative and the final amount will be confirmed on site before the session begins.",
      submit: "Confirm booking",
      submitting: "Confirming…",
    },
    back: "Back",
    next: "Continue",
    success: {
      title: "You're booked.",
      body: "A confirmation email just went out, with the calendar invitation attached. Your craftsman has been notified.",
      ref: "Reference",
      manage: "Manage my booking",
      addCalendar: "Add to my calendar",
      home: "Back to home",
    },
    errors: {
      taken: "That slot was just taken. Please pick another.",
      notConnected:
        "Online booking isn't live yet. Call us at +1 450 943 1217 and we'll find you a slot right away.",
      generic: "Something went wrong. Try again, or call us directly.",
      required: "This field is required",
      email: "Invalid email",
      phone: "Invalid number",
      postal: "Invalid postal code (e.g. J4K 1A1)",
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
    tooLate: `This appointment is less than ${CANCEL_WINDOW_HOURS} h away. Please call +1 450 943 1217.`,
    notFound: "Booking not found. Check the link from your email.",
    rebook: "Book a new appointment",
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
    hoursValue: "7 a.m. – 10 p.m., Monday to Saturday",
    errors: {
      required: "This field is required",
      email: "Invalid email",
      short: "A few more words, please",
      rate: "You just wrote to us. Give us a few minutes to reply.",
      unavailable:
        "Sending isn't working right now. Call +1 450 943 1217 — we pick up.",
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
    title: "What an hour at your place amounts to.",
    lede:
      "We don't sell “ironing”: we sell a measured pace, the same from one session to the next. Here is what it costs, what it covers, and what separates it from a helping hand.",
    perHourNote: "minimum {min} per visit · travel included",
    cadence: {
      title: "What we handle in one hour",
      lede:
        "These figures aren't a sales promise: they are the ones our booking engine uses to work out how long your session will take. What you read here is what the form will calculate.",
      colType: "Type of piece",
      colQty: "In 1 h",
      note: "A mixed basket runs at about 7 to 8 pieces an hour. That average is what sets the ranges quoted on each package.",
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
      title: "Hourly blocks",
      lede: "You book hours; we fill them.",
      minimum:
        "Minimum {min} per visit. Add-ons and single pieces attach to a block already booked — on their own they don't warrant a trip.",
    },
    bundles: {
      title: "Set packages",
      lede: "A typical basket, already costed, at the same hourly rate.",
    },
    addons: {
      title: "Add-ons to your session",
      lede: "Alongside a block already booked, with no second trip.",
    },
    units: {
      title: "Single pieces",
      lede: "For one piece added to a session already booked.",
      linen: "Bedding & household linen",
      garments: "Clothes & outfits",
      note: "These prices are fixed and don't follow the hourly rate: they apply to an isolated piece. Beyond a few pieces, an hourly block costs less.",
    },
    plans: {
      title: "Monthly plans",
      lede: "A regular service, and an hourly rate that comes down.",
      perMonth: "/ month",
      full: "At the standard rate",
      save: "You save",
      perks: [
        "First call on the time slots you want.",
        "Flexible rescheduling when you travel or take holidays.",
        "Light starch on collars and cuffs, included at no extra cost.",
        "Rate guaranteed twelve months from sign-up.",
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
    },
    firstFreeLabel: "First session",
    cta: {
      title: "Put your session together.",
      body: "The booking flow uses exactly these figures: you tick your services, it works out the duration and the amount, and offers you the slots that are genuinely free.",
    },
  },
  days: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
  daysShort: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
  months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  closed: "Closed",
};

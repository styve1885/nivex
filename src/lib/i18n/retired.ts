import { INSTALL_MINUTES } from "../brand";

/**
 * Ce que la vitrine a retiré le 23 octobre 2026, gardé pour pouvoir le
 * remettre.
 *
 * Ces textes vivent ici, et non dans les dictionnaires : un dictionnaire part
 * en entier vers les composants clients qui le reçoivent tel quel (les
 * tunnels, les pages personnelles), et tout ce qui y dort se lirait dans la
 * source de la page. Un assistant qui lit le HTML brut y aurait trouvé des
 * formules qui n'existent plus. Seuls des composants serveur les lisent
 * (RetiredSections, Marquee, Protocol, Gallery), et seulement quand on les
 * rallume.
 *
 * Le français fait foi ; l'anglais en épouse la forme.
 */
export const retiredFr = {
  /* Le héros : la phrase longue de l'artisan. */
  heroLede:
    "Un artisan se déplace chez vous, avec sa presse et sa vapeur de haute précision. Vous ne déplacez rien, vous ne pliez rien. Vous ouvrez votre penderie, et tout y est droit.",
  /* Le ruban défilant des prestations (Marquee). */
  marquee: [
    "Chemises impeccables",
    "Robes & vêtements délicats",
    "Linge de maison haut de gamme",
    "Costumes & vestes parfaits",
    "Uniformes scolaires & professionnels",
    "Tout se fait chez vous",
  ],
  /* L'histoire, version longue : les quatre chapitres. */
  storyChapters: [
    {
      num: "I",
      title: "Un geste qu'on a oublié",
      body:
        "Il fut un temps où l'on repassait le dimanche soir. Le fer chuintait, la vapeur montait, et la semaine entière prenait forme sur une planche de bois. Ce geste-là n'a pas disparu parce qu'il était inutile. Il a disparu parce que le temps, lui, s'est effacé.",
    },
    {
      num: "II",
      title: "Ce que le pli raconte",
      body:
        "Un vêtement froissé ne trahit pas votre négligence — il trahit votre agenda. Mais celui qui vous fait face ne le sait pas. Le col qui tombe droit, l'épaule qui tient, le revers qui marque\u00a0: voilà ce qui parle avant vous, à l'entretien d'embauche comme au premier rendez-vous.",
    },
    {
      num: "III",
      title: "Le nom",
      body:
        "NIVEX vient du latin nix, nivis — la neige. Ce blanc-là ne se négocie pas\u00a0: il est net, franc, sans mémoire du jour précédent. C'est l'état que nous rendons à vos tissus, l'un après l'autre.",
    },
    {
      num: "IV",
      title: "Chez vous, pas ailleurs",
      body:
        "Nous ne prenons pas vos vêtements en otage dans un camion. L'atelier vient à vous\u00a0: presse professionnelle, vapeur calibrée, pattemouilles, cintres. Vous restez chez vous. Vos vêtements aussi. Et quand nous repartons, la penderie est en ordre.",
    },
  ],
  /* Les prestations : l'introduction et les six cartes d'avant. */
  servicesLede:
    "Nous ne repassons pas une soie comme un coton d'uniforme. Chaque pièce reçoit le réglage, la pression et la vapeur qui lui conviennent.",
  servicesCards: [
    {
      icon: "shirt",
      serviceKey: "shirt",
      name: "Chemises impeccables",
      body: "Col, empiècement, poignets, manches, corps. Dans cet ordre, toujours. Repassées sur cintre de bois, prêtes à porter.",
      detail: "Sur cintre de bois",
    },
    {
      icon: "dress",
      serviceKey: "delicate",
      name: "Robes & vêtements délicats",
      body: "Soie, viscose, dentelle, plissés. Vapeur sans contact quand la fibre l'exige, pattemouille quand elle le mérite.",
      detail: "Vapeur sans contact",
    },
    {
      icon: "linen",
      serviceKey: "linen",
      name: "Draps & linge de maison",
      body: "Simple, deux places, queen, trois places. Les grandes tailles demandent plus de temps, et c'est compté séparément. Pliage hôtelier, arêtes vives.",
      detail: "Pliage hôtelier",
    },
    {
      icon: "suit",
      serviceKey: "suit",
      name: "Costumes & vestes",
      body: "Défroissage vapeur, remise en forme des épaules, marquage du pli de pantalon. Sans lustrage, jamais.",
      detail: "Sans lustrage",
    },
    {
      icon: "badge",
      serviceKey: "uniform",
      name: "Uniformes",
      body: "Scolaires et professionnels. Le lot complet de la semaine, traité d'un coup, rendu sur cintres numérotés.",
      detail: "Cintres numérotés",
    },
    {
      icon: "clock",
      serviceKey: "trousers",
      name: "Tout se fait chez vous",
      body: "Rien ne quitte votre domicile. Votre artisan vient avec sa vapeur, son fer et ses cintres, travaille devant vous, et range avant de partir.",
      detail: "{zone}",
    },
  ],
  /* Les tarifs de l'accueil : l'introduction et les trois offres d'avant. */
  pricing: {
    lede:
      "Vous choisissez les pièces et prévoyez la planche, nous apportons tout le reste. Le montant est confirmé sur place avant de commencer.",
    offers: [
      {
        name: "Séance semaine",
        /* Le nombre de pièces vient de `capacityPieces`, pour la durée affichée. */
        volume: "la garde-robe complète de votre semaine",
        note: "Le format le plus demandé, et la durée minimale d'un déplacement.",
      },
      {
        name: "Séance famille",
        volume: "chemises, pantalons, uniformes scolaires",
        note: "Pour une maisonnée, ou deux semaines d'un coup.",
      },
      {
        name: "Abonnement",
        volume: "Visites régulières, créneaux réservés",
        note: "Tarif garanti douze mois.",
      },
    ],
    planFrom: "à partir de {price} par cycle",
    note: "L'estimation affichée est indicative. Le montant final est confirmé sur place, avant de commencer.",
  },
  /* Les trois questions retirées. La première décrit l'ancien panier : à
     réécrire avant de la remettre. */
  faq: [
    {
      q: "Combien de temps prévoir\u202f?",
      a: "Lors de la réservation, l'estimateur calcule la durée d'après les quantités choisies, installation et rangement compris\u202f; pour la modifier, changez les quantités.",
    },
    {
      q: "L'installation est-elle comprise dans la séance\u202f?",
      a: "Oui. {setup} Votre artisan arrive à l'heure du début de la séance.",
    },
    {
      q: "Et les pièces fragiles\u202f?",
      a: "Chaque fibre est identifiée avant traitement. Soie, dentelle, cachemire et plissés sont travaillés à la vapeur sans contact ou sous pattemouille. En cas de doute sur une pièce, nous vous consultons avant d'y toucher.",
    },
  ],
  /* Les paires « avant, après » retirées : le pantalon de velours (le
     23 octobre 2026), le t-shirt en coton et la veste doublée. */
  beforeAfter: [
    { key: "velours", name: "Pantalon de velours",
      altBefore: "Pantalon de velours avant repassage",
      altAfter: "Pantalon de velours après repassage" },
    { key: "t-shirt", name: "T-shirt en coton",
      altBefore: "T-shirt en coton avant repassage",
      altAfter: "T-shirt en coton après repassage" },
    { key: "veste", name: "Veste doublée",
      altBefore: "Veste doublée avant repassage",
      altAfter: "Veste doublée après repassage" },
  ],
  /* Le protocole en sept temps (Protocol). */
  protocol: {
    eyebrow: "Le protocole",
    title: "L'ordre ne s'improvise pas.",
    lede:
      "Une chemise mal repassée n'est pas une chemise mal chauffée\u00a0: c'est une chemise repassée dans le désordre. Chaque pièce déjà finie serait refroissée par la suivante. Voici la marche à suivre, celle qu'on ne change jamais.",
    steps: [
      { n: "01", title: "Le col",        body: "À l'envers d'abord, de la pointe vers le centre. Jamais l'inverse\u00a0: c'est ainsi qu'on évite le faux pli qui ne part plus." },
      { n: "02", title: "L'empiècement", body: "Le haut du dos, posé sur la pointe de la planche. Une épaule, puis l'autre, sans jamais écraser la couture." },
      { n: "03", title: "Les poignets",  body: "Ouverts à plat, envers puis endroit. Le fer contourne les boutons — il ne passe jamais dessus." },
      { n: "04", title: "Les manches",   body: "On suit l'arête existante, on n'en crée pas une nouvelle. Une manche a une seule mémoire\u202f; on la respecte." },
      { n: "05", title: "Le corps",      body: "Devant boutonné, puis le dos, en faisant tourner la pièce autour de la planche plutôt qu'en la retournant." },
      { n: "06", title: "La vapeur",     body: "Passage final sans contact. La fibre se détend, la tenue se fixe, le lustre ne vient jamais." },
      { n: "07", title: "Le cintre",     body: "Bois, immédiatement. Le tissu refroidit en forme — c'est là que le travail tient, ou qu'il se perd." },
    ],
  },
  /* La galerie en section (Gallery) : ses titres et ses légendes. Les
     photos et leur texte de remplacement restent dans le dictionnaire. */
  gallery: {
    eyebrow: "Les pièces",
    title: "Ce qui passe entre nos mains.",
    lede:
      "Un complet de laine ne se traite pas comme une surchemise de coton, ni une jupe plissée comme un smoking. Voici le genre de pièces que nous recevons, et le soin que chacune réclame.",
    photos: {
      gilet: {
        name: "Gilets & complets",
        detail: "Laine à carreaux, revers à cran. Épaules remises en forme, vapeur sans contact, aucun lustrage.",
      },
      veston: {
        name: "Vestons de tailleur",
        detail: "Le revers se marque au bord, jamais à plat. Une laine noire ne doit prendre aucune brillance.",
      },
      chemises: {
        name: "Chemises & surchemises",
        detail: "Col, empiècement, poignets, manches, corps — dans cet ordre, pour que rien ne se refroisse.",
      },
      ceremonie: {
        name: "Tenues de cérémonie",
        detail: "Passepoil satiné contourné au fer, pli du pantalon repris sous pattemouille.",
      },
      uniformes: {
        name: "Uniformes scolaires",
        detail: "Les jupes plissées se reprennent pli par pli. Rendus sur cintres numérotés par enfant.",
      },
    },
  },
  /* La page Tarifs : l'ancienne introduction, le titre chiffré, le contenu
     d'une séance, la comparaison, les séances, les forfaits, les ajouts, et
     l'ancienne liste « Ce qui vaut pour toutes les séances ». */
  tarifs: {
    lede:
      "Nous ne vendons pas «\u00a0du repassage\u00a0»\u00a0: nous vendons une cadence mesurée, la même d'une séance à l'autre. Voici ce qu'elle vaut, ce qu'elle traite, et ce qui la sépare d'un coup de main.",
    /* {min} : la plus courte séance proposée, celle que coûte {price}. */
    headline: "La séance de {min} — {price}",
    /* {travel} : inclus seulement si aucune zone desservie n'a de frais. */
    visitNote: "minimum {min} par déplacement · {travel}",
    travelIncluded: "déplacement inclus",
    travelVaries: "frais de déplacement selon le secteur",
    cadence: {
      title: "Ce que contient une séance",
      colType: "Ce que nous traitons, et comment",
    },
    versus: {
      title: "Ce n'est pas du repassage de ménage.",
      lede: "Cinq différences, et elles se voient sur le vêtement.",
      elsewhere: "Ailleurs",
      here: "Chez NIVEX",
      rows: [
        {
          title: "Le volume",
          them: "On repasse «\u00a0ce qu'on peut\u00a0» dans le temps payé. Vous découvrez le résultat à la fin.",
          us: "Une capacité annoncée avant de commencer, et un temps réservé qui vous revient entièrement. S'il est écourté de notre fait, le temps manquant ne vous est pas facturé.",
        },
        {
          title: "Le matériel",
          them: "Votre fer, votre vapeur, vos cintres. Le résultat dépend de ce que vous possédez.",
          us: "Générateur de vapeur professionnel, fer, pattemouilles et cintres de bois apportés. Vous fournissez la planche, une prise et deux mètres carrés.",
        },
        {
          title: "L'ordre de travail",
          them: "Pièce après pièce, dans l'ordre du panier. Ce qui est fini se refroisse sous la suivante.",
          us: "Un protocole en sept temps par chemise, et un ordre de passage qui empêche le refroissage.",
        },
        {
          title: "Les pièces fragiles",
          them: "Même réglage pour tout. Une soie, un plissé ou un cachemire y laissent parfois une marque.",
          us: "Test de fibre systématique, étiquette d'entretien respectée, vapeur sans contact. En cas de doute, nous vous consultons avant de toucher la pièce.",
        },
        {
          title: "Ce qui vous reste",
          them: "Une pile sur le lit, et un arrangement verbal.",
          us: "Une penderie en ordre, une facture, un lien pour gérer votre rendez-vous, et notre responsabilité écrite en cas de dommage.",
        },
      ],
    },
    blocks: {
      title: "Les séances",
      lede: "Une durée, un volume, un montant. Rien à calculer.",
      minimum:
        "Minimum {min} par déplacement. Les ajouts et les pièces à l'unité se greffent à une séance déjà réservée — seuls, ils ne justifient pas un déplacement.",
    },
    bundles: {
      title: "Forfaits composés",
      lede: "Un panier type, déjà chiffré.",
    },
    addons: {
      title: "Ajouts à votre séance",
      lede: "En complément d'une séance déjà réservée, sans second déplacement.",
    },
    terms: {
      title: "Ce qui vaut pour toutes les séances",
      items: [
        { dt: "Temps tenu", dd: `Chaque séance inclut l'installation et le rangement de notre matériel, ${INSTALL_MINUTES} minutes chacun\u00a0; le reste du temps réservé est du repassage. S'il est écourté de notre fait, le temps manquant ne vous est pas facturé.` },
        { dt: "Estimation et montant final", dd: "L'estimation est indicative. Le montant final suit le temps réellement passé et vous est confirmé sur place, avant de commencer." },
        { dt: "Paiement", dd: "Sur place, à la fin de la séance\u00a0: comptant, virement Interac ou carte. Aucun prépaiement à la réservation." },
        { dt: "Ce qu'il nous faut chez vous", dd: "Votre planche à repasser, une prise électrique et environ deux mètres carrés dégagés. Le reste du matériel arrive avec l'artisan." },
      ],
    },
  },
};

export type Retired = typeof retiredFr;

export const retiredEn: Retired = {
  /* Le héros : la phrase longue de l'artisan. */
  heroLede:
    "A craftsman comes to you, press and high-precision steam in hand. You carry nothing, you fold nothing. You open your closet, and everything hangs straight.",
  /* Le ruban défilant des prestations (Marquee). */
  marquee: [
    "Flawless shirts",
    "Dresses & delicates",
    "Fine household linen",
    "Suits & jackets, sharp",
    "School & work uniforms",
    "Everything happens at your home",
  ],
  /* L'histoire, version longue : les quatre chapitres. */
  storyChapters: [
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
  /* Les prestations : l'introduction et les six cartes d'avant. */
  servicesLede:
    "We don't press silk the way we press uniform cotton. Each piece gets the setting, the pressure and the steam it calls for.",
  servicesCards: [
    {
      icon: "shirt",
      serviceKey: "shirt",
      name: "Immaculate shirts",
      body: "Collar, yoke, cuffs, sleeves, body. In that order, always. Pressed on a wooden hanger, ready to wear.",
      detail: "On wooden hangers",
    },
    {
      icon: "dress",
      serviceKey: "delicate",
      name: "Dresses & delicates",
      body: "Silk, viscose, lace, pleats. Contactless steam when the fibre demands it, a pressing cloth when it deserves one.",
      detail: "Contactless steam",
    },
    {
      icon: "linen",
      serviceKey: "linen",
      name: "Sheets & household linen",
      body: "Single, double, queen, king. The larger sizes take longer, and they are counted separately. Hotel folding, sharp edges.",
      detail: "Hotel folding",
    },
    {
      icon: "suit",
      serviceKey: "suit",
      name: "Suits & jackets",
      body: "Steam relaxing, shoulders reshaped, trouser crease marked. Never any shine.",
      detail: "Never any shine",
    },
    {
      icon: "badge",
      serviceKey: "uniform",
      name: "Uniforms",
      body: "School and professional. The whole week's set, handled in one go, returned on numbered hangers.",
      detail: "Numbered hangers",
    },
    {
      icon: "clock",
      serviceKey: "trousers",
      name: "Everything happens at your home",
      body: "Nothing leaves your home. Your craftsman arrives with his steam, his iron and his hangers, works in front of you, and tidies up before leaving.",
      detail: "{zone}",
    },
  ],
  /* Les tarifs de l'accueil : l'introduction et les trois offres d'avant. */
  pricing: {
    lede:
      "You choose the pieces and have the ironing board ready; we bring everything else. The amount is confirmed on site before we begin.",
    offers: [
      {
        name: "Week session",
        volume: "your whole week's wardrobe",
        note: "The most requested format, and the shortest visit we make.",
      },
      {
        name: "Family session",
        volume: "shirts, trousers, school uniforms",
        note: "For a household, or a fortnight in one go.",
      },
      {
        name: "Subscription",
        volume: "Regular visits, reserved time slots",
        note: "Rate guaranteed twelve months.",
      },
    ],
    planFrom: "from {price} per cycle",
    note: "The estimate shown is indicative. The final amount is confirmed on site, before we start.",
  },
  /* Les trois questions retirées. La première décrit l'ancien panier : à
     réécrire avant de la remettre. */
  faq: [
    {
      q: "How much time should I plan for?",
      a: "During booking, the estimator works out the duration from the quantities you choose, setting up and packing away included; to change it, change the quantities.",
    },
    {
      q: "Is setting up included in the session?",
      a: "Yes. {setup} Your craftsman arrives at the start time of the session.",
    },
    {
      q: "What about fragile pieces?",
      a: "Every fibre is identified before treatment. Silk, lace, cashmere and pleats are worked with contactless steam or under a pressing cloth. If we have any doubt about a piece, we ask you before touching it.",
    },
  ],
  /* Les paires « avant, après » retirées : le pantalon de velours (le
     23 octobre 2026), le t-shirt en coton et la veste doublée. */
  beforeAfter: [
    { key: "velours", name: "Corduroy trousers",
      altBefore: "Corduroy trousers before pressing",
      altAfter: "Corduroy trousers after pressing" },
    { key: "t-shirt", name: "Cotton t-shirt",
      altBefore: "Cotton t-shirt before pressing",
      altAfter: "Cotton t-shirt after pressing" },
    { key: "veste", name: "Lined jacket",
      altBefore: "Lined jacket before pressing",
      altAfter: "Lined jacket after pressing" },
  ],
  /* Le protocole en sept temps (Protocol). */
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
  /* La galerie en section (Gallery) : ses titres et ses légendes. Les
     photos et leur texte de remplacement restent dans le dictionnaire. */
  gallery: {
    eyebrow: "The pieces",
    title: "What passes through our hands.",
    lede:
      "A wool suit is not handled like a cotton overshirt, nor a pleated skirt like a dinner jacket. Here is the kind of piece we receive, and the care each one calls for.",
    photos: {
      gilet: {
        name: "Waistcoats & suits",
        detail: "Checked wool, notched lapels. Shoulders reshaped, contactless steam, never any shine.",
      },
      veston: {
        name: "Tailored blazers",
        detail: "The lapel is creased at its edge, never flattened. Black wool must take on no sheen.",
      },
      chemises: {
        name: "Shirts & overshirts",
        detail: "Collar, yoke, cuffs, sleeves, body — in that order, so nothing creases again.",
      },
      ceremonie: {
        name: "Ceremony wear",
        detail: "Satin piping worked around, never over; trouser crease set under a pressing cloth.",
      },
      uniformes: {
        name: "School uniforms",
        detail: "Pleated skirts are taken pleat by pleat. Returned on hangers numbered per child.",
      },
    },
  },
  /* La page Tarifs : l'ancienne introduction, le titre chiffré, le contenu
     d'une séance, la comparaison, les séances, les forfaits, les ajouts, et
     l'ancienne liste « Ce qui vaut pour toutes les séances ». */
  tarifs: {
    lede:
      "We don't sell “ironing”: we sell a measured pace, the same from one session to the next. Here is what it costs, what it covers, and what separates it from a helping hand.",
    headline: "A session of {min} — {price}",
    visitNote: "minimum {min} per visit · {travel}",
    travelIncluded: "travel included",
    travelVaries: "travel fee depends on your area",
    cadence: {
      title: "What a session holds",
      colType: "What we handle, and how",
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
          us: "A capacity stated before we start, and booked time that is entirely yours. If it is cut short through our own doing, the missing time isn't billed.",
        },
        {
          title: "The equipment",
          them: "Your iron, your steam, your hangers. The result depends on what you happen to own.",
          us: "Professional steam generator, iron, pressing cloths and wooden hangers brought along. You provide the board, an outlet and two square metres.",
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
    terms: {
      title: "What holds for every session",
      items: [
        { dt: "Time honoured", dd: `Every session includes setting up and packing away our equipment, ${INSTALL_MINUTES} minutes each; the rest of the booked time is ironing. If it is cut short through our own doing, the missing time isn't billed.` },
        { dt: "Estimate and final amount", dd: "The estimate is indicative. The final amount follows the time actually spent and is confirmed to you on site, before we begin." },
        { dt: "Payment", dd: "On site, at the end of the session: cash, Interac e-transfer or card. No prepayment when booking." },
        { dt: "What we need at your place", dd: "Your ironing board, one power outlet and about two square metres of clear floor. The rest of the equipment arrives with the artisan." },
      ],
    },
  },
};

/** Les textes retirés, dans la langue demandée. */
export function getRetired(locale: string | undefined): Retired {
  return locale === "en" ? retiredEn : retiredFr;
}

import { CANCEL_WINDOW_HOURS } from "../brand";

/** Un document légal : des sections de prose, chacune pouvant se clore sur une liste. */
export type LegalSection = { title: string; body: string[]; list?: string[] };
export type LegalDoc = { eyebrow: string; title: string; lede: string; sections: LegalSection[] };

/*
 * Politique de confidentialité et conditions d'utilisation.
 *
 * Les accolades sont des substitutions, remplies à l'affichage par
 * `LegalDocument` à partir des réglages en vigueur : {email}, {phone},
 * {site}, {zone}, {rate}, {min}, {lead}, {horizon}. Écrire un taux
 * ou un délai en toutes lettres ici, c'est écrire un texte qui mentira le jour
 * où Styve le changera depuis son espace.
 */
const privacy: LegalDoc = {
  eyebrow: "Vie privée",
  title: "Ce que nous savons de vous.",
  lede:
    "NIVEX recueille de quoi vous joindre et de quoi vous trouver. Rien d'autre. Aucune de ces informations ne se revend, ne se loue, ni ne se troque. Voici le détail, sans détour.",
  sections: [
    {
      title: "Qui répond de vos renseignements",
      body: [
        "NIVEX est un service de repassage à domicile exploité par Styve, à Longueuil, au Québec, immatriculé au registre des entreprises du Québec sous le numéro {neq}. C'est aussi la personne responsable de la protection des renseignements personnels au sens de la loi québécoise, et la seule à avoir accès à ce que ce site recueille.",
        "Pour une question, une demande d'accès ou une plainte, écrivez à {email} ou appelez le {phone}.",
      ],
    },
    {
      title: "Ce que nous recueillons",
      body: [
        "Uniquement ce que vous nous donnez vous-même, au moment où vous le donnez. Ce site ne suit personne à la trace et n'achète aucune donnée à qui que ce soit.",
      ],
      list: [
        "Demande de créneau — votre nom, votre téléphone, l'adresse de la séance (rue, ville, code postal), votre courriel si vous le donnez, les prestations et quantités choisies, le moment souhaité, et les précisions que vous écrivez vous-même.",
        "Formulaire de contact — votre nom, votre courriel, votre téléphone si vous le donnez, l'objet et le contenu de votre message.",
        "Journal technique — la nature et l'heure des opérations du site : une demande reçue, un courriel parti, une erreur survenue. Sans adresse IP, sans identifiant de navigateur, sans empreinte d'appareil.",
      ],
    },
    {
      title: "À quoi cela sert",
      body: [
        "À chaque renseignement correspond une raison d'être. Si la raison disparaît, le renseignement aussi.",
      ],
      list: [
        "Votre adresse sert à venir chez vous, et à vérifier que vous êtes dans la zone desservie.",
        "Votre téléphone sert à vous rappeler pour confirmer le rendez-vous, à prévenir d'un retard. Votre courriel, si vous le donnez, sert à vous répondre et à accuser réception.",
        "Les prestations choisies servent à prévoir la bonne durée et à préparer le matériel.",
        "Vos précisions servent à ne pas abîmer une pièce fragile et à savoir comment entrer chez vous.",
        "Le carnet de rendez-vous sert à tenir la comptabilité de l'entreprise et à retrouver une séance passée si elle est contestée.",
      ],
    },
    {
      title: "Ce que nous ne faisons pas",
      body: [],
      list: [
        "Nous ne vendons, ne louons et n'échangeons aucun renseignement, à personne, à aucun prix.",
        "Nous ne faisons aucune publicité ciblée, et ce site n'héberge aucun pisteur publicitaire.",
        "Nous ne dressons aucun profil et ne prenons aucune décision automatisée à votre sujet.",
        "Nous ne recueillons aucune donnée bancaire : le paiement se fait sur place, jamais sur le site.",
      ],
    },
    {
      title: "Qui d'autre y a accès",
      body: [
        "Trois fournisseurs, chacun pour une tâche précise, et aucun n'a le droit de s'en servir à ses propres fins.",
      ],
      list: [
        "Vercel — héberge le site et le sert à votre navigateur.",
        "Neon — la base de données où vivent les rendez-vous et les messages.",
        "Google — Gmail, par lequel votre demande arrive jusqu'à votre artisan et par lequel part l'accusé de réception, et l'agenda de votre artisan, où il inscrit le rendez-vous une fois confirmé avec vous au téléphone.",
      ],
    },
    {
      title: "Hors du Québec",
      body: [
        "Le site, la base de données et les services Google sont hébergés aux États-Unis. Vos renseignements sortent donc du Québec pour y être conservés, et ils y sont soumis au droit du pays d'accueil — lequel peut, dans certains cas, permettre à ses autorités d'y accéder.",
        "Nous avons retenu des fournisseurs tenus contractuellement à des mesures de protection comparables à celles exigées ici, et nous ne leur confions que ce qui est nécessaire. En réservant ou en nous écrivant par le site, vous consentez à cette communication hors Québec. Si elle vous gêne, appelez-nous : nous conviendrons du rendez-vous de vive voix.",
      ],
    },
    {
      title: "Combien de temps nous les gardons",
      body: [],
      list: [
        "Un rendez-vous et ce qui l'accompagne : trois ans après la séance. C'est le délai de prescription civile au Québec — celui pendant lequel une séance peut encore être contestée de part et d'autre.",
        "Un message du formulaire de contact : deux ans, ou jusqu'à ce que vous en demandiez la suppression.",
        "Le journal technique : douze mois.",
      ],
    },
    {
      title: "Comment c'est protégé",
      body: [],
      list: [
        "Le site n'est servi qu'en HTTPS : ce que vous écrivez est chiffré en transit.",
        "Le jeton qui relie le site au compte Google de l'artisan est chiffré en AES-256-GCM avant d'entrer en base.",
        "L'espace artisan exige une authentification Google, et la toute première connexion exige en plus un code d'installation.",
        "Le lien « Gérer ma réservation » contient un jeton aléatoire propre à votre rendez-vous. Il ne donne accès qu'à celui-là, et à rien d'autre.",
      ],
    },
    {
      title: "Témoins de connexion",
      body: [
        "Ce site ne dépose aucun témoin publicitaire, aucun témoin de mesure d'audience, aucun bouton de réseau social. Un visiteur ordinaire n'en reçoit aucun.",
        "Deux témoins existent, et ils ne concernent que l'artisan : celui qui maintient sa session ouverte dans son espace, et un témoin temporaire qui protège sa connexion Google contre la fraude. Tous deux expirent d'eux-mêmes.",
        "Les polices de caractères sont servies depuis notre propre domaine : afficher cette page n'appelle aucun serveur tiers.",
      ],
    },
    {
      title: "Vos droits",
      body: [
        "La loi québécoise vous en reconnaît plusieurs, et nous les honorons sans frais, dans les trente jours.",
      ],
      list: [
        "Savoir quels renseignements nous détenons à votre sujet, et en obtenir copie.",
        "Faire corriger ce qui est inexact, incomplet ou équivoque.",
        "Retirer votre consentement, et demander la suppression de ce qui n'est plus nécessaire.",
        "Recevoir dans un format technologique structuré et couramment utilisé les renseignements que vous nous avez fournis.",
        "Porter plainte auprès de la Commission d'accès à l'information du Québec (cai.gouv.qc.ca) si notre réponse ne vous satisfait pas.",
      ],
    },
    {
      title: "En cas d'incident",
      body: [
        "Si un incident de confidentialité présentait un risque de préjudice sérieux, nous en aviserions sans délai les personnes concernées ainsi que la Commission d'accès à l'information, et l'incident serait consigné au registre prévu par la loi.",
      ],
    },
    {
      title: "Si cette page change",
      body: [
        "La date inscrite en haut fait foi. Un changement de fond vous sera signalé à votre prochaine réservation, plutôt que glissé en silence.",
      ],
    },
  ],
};

const terms: LegalDoc = {
  eyebrow: "Conditions",
  title: "Ce sur quoi nous nous engageons.",
  lede:
    "Réserver une séance NIVEX, c'est accepter ce qui suit. C'est court, c'est écrit en français clair, et cela vaut autant pour nous que pour vous.",
  sections: [
    {
      title: "Qui vous accueille",
      body: [
        "NIVEX est un service de repassage à domicile exploité par Styve, à Longueuil, au Québec, immatriculé au registre des entreprises du Québec sous le numéro {neq}. Ces conditions régissent l'usage du site {site}, la réservation en ligne et les séances qui en découlent.",
        "En réservant, vous confirmez avoir au moins dix-huit ans et être en droit de faire traiter les pièces que vous nous présentez.",
      ],
    },
    {
      title: "Le service",
      body: [
        "Un artisan se déplace chez vous avec son matériel professionnel : table active, générateur de vapeur, pattemouilles et cintres. Il repasse sur place les pièces que vous lui présentez, puis les remet sur cintres ou pliées.",
        "Vos vêtements ne quittent pas votre domicile, sauf si une collecte a été convenue à l'avance.",
      ],
    },
    {
      title: "Où nous allons",
      body: [
        "{zone}.",
        "Le code postal saisi pendant la réservation vous dit immédiatement si vous êtes dans la zone. Hors zone, la réservation reste possible : nous vous rappelons pour confirmer, ou pour vous dire franchement que nous ne pouvons pas nous y rendre.",
      ],
    },
    {
      title: "Réserver",
      body: [],
      list: [
        "Le formulaire du site transmet une demande de créneau : il n'engage aucune des deux parties tant que le rendez-vous n'a pas été confirmé de vive voix.",
        "Une séance dure au minimum {min}.",
        "Une demande se fait au moins {lead} à l'avance, et jusqu'à {horizon} devant.",
        "Votre demande est transmise dès l'envoi ; le rendez-vous est confirmé par téléphone, au {phone}. C'est cet appel qui fixe l'heure.",
      ],
    },
    {
      title: "Le prix",
      body: [
        "Une séance d'une heure est facturée {rate}, une séance de deux heures {rate2}, et ainsi de suite, pour une durée minimale de {min}. Les taxes applicables, s'il y a lieu, s'ajoutent à ce montant.",
        "L'estimation affichée pendant la réservation est indicative : elle découle de ce que vous avez déclaré. Le montant final est établi selon le temps réellement passé, et il vous est confirmé sur place avant que la séance commence. Vous n'êtes jamais engagé sur un montant que vous n'avez pas vu.",
        "Si le travail demandé dépasse ce qui était prévu, nous vous le disons avant de continuer. C'est vous qui décidez de prolonger ou d'en rester là.",
      ],
    },
    {
      title: "La première heure offerte",
      body: [
        "Pour une première réservation, la première heure de repassage est offerte et déduite automatiquement de l'estimation. Une seule fois par adresse courriel. Elle ne s'échange pas contre de l'argent et ne se cumule avec aucune autre offre.",
      ],
    },
    {
      title: "Le paiement",
      body: [
        "À la fin de la séance, sur place : comptant, virement Interac ou carte. Aucun prépaiement n'est demandé au moment de réserver, et le site ne recueille aucune donnée bancaire.",
      ],
    },
    {
      title: "Annuler ou déplacer",
      body: [
        "Librement, jusqu'à {cancel} avant le rendez-vous, par téléphone au {phone} ou par courriel à {email}. Rien à payer, rien à justifier.",
        "Passé ce délai, appelez-nous au {phone} : nous ferons au mieux.",
        "S'il nous faut annuler de notre côté — maladie, panne de matériel, route impraticable —, vous êtes prévenu dès que nous le savons et vous ne devez rien.",
      ],
    },
    {
      title: "Ce dont nous avons besoin chez vous",
      body: [],
      list: [
        "Environ deux mètres carrés dégagés et une prise électrique libre.",
        "Un accès convenu : code d'immeuble, stationnement, ascenseur, et l'animal de la maison signalé d'avance.",
        "Les pièces rassemblées, propres et sèches. Nous repassons, nous ne lavons pas.",
        "Une personne majeure présente à l'arrivée et au départ de l'artisan.",
      ],
    },
    {
      title: "Les pièces délicates",
      body: [
        "Chaque fibre est identifiée avant traitement, et les étiquettes d'entretien font foi. Soie, dentelle, cachemire et plissés sont travaillés à la vapeur sans contact ou sous pattemouille.",
        "En cas de doute, nous vous consultons avant de toucher la pièce. Nous pouvons refuser d'en traiter une dont l'étiquette interdit le repassage, dont l'état laisse craindre un dommage, ou qui exige un traitement que nous ne pratiquons pas. Ce refus est dit sur place, et cette pièce ne vous est pas facturée.",
      ],
    },
    {
      title: "Si quelque chose est abîmé",
      body: [
        "Nous prenons soin de ce que vous nous confiez, et nous répondons des dommages causés par notre faute. Signalez-nous tout dommage sans tarder — idéalement avant notre départ, au plus tard dans les quarante-huit heures — et conservez la pièce en l'état : nous devons pouvoir la voir.",
        "Nous ne pouvons pas répondre d'un défaut préexistant, d'une pièce dont l'étiquette d'entretien manque ou induit en erreur, ni d'un dommage résultant d'un traitement que vous avez demandé malgré notre avis contraire.",
        "Rien dans ces conditions n'écarte les droits que la Loi sur la protection du consommateur vous accorde.",
      ],
    },
    {
      title: "Le site",
      body: [
        "Les textes, les images et le dessin de ce site appartiennent à NIVEX. Les consulter et les partager, volontiers ; les reprendre à votre compte, non.",
        "Nous faisons en sorte que le site reste disponible et exact, sans pouvoir le garantir à chaque instant. Une interruption du site n'annule jamais un rendez-vous déjà confirmé.",
        "Les fausses réservations, l'envoi massif de messages et la collecte automatisée ne sont pas permis.",
      ],
    },
    {
      title: "Vos renseignements",
      body: [
        "Ce que nous recueillons, pourquoi, et combien de temps nous le gardons : tout est détaillé dans la politique de confidentialité.",
      ],
    },
    {
      title: "Le droit applicable",
      body: [
        "Ces conditions sont régies par les lois du Québec et par les lois du Canada qui s'y appliquent, et les tribunaux du Québec sont compétents.",
        "Avant d'en arriver là, appelez-nous au {phone}. La plupart des différends se règlent en une conversation.",
      ],
    },
    {
      title: "Si ces conditions changent",
      body: [
        "La date inscrite en haut fait foi. Les conditions en vigueur au moment de votre réservation sont celles qui s'appliquent à cette réservation-là.",
      ],
    },
  ],
};

export const fr = {
  code: "fr",
  htmlLang: "fr-CA",
  meta: {
    title: "NIVEX — Repassage à domicile de prestige | Longueuil & Rive-Sud",
    description:
      "Un artisan du repassage se déplace chez vous, avec son matériel professionnel. Chemises, robes délicates, costumes, linge de maison. Longueuil et la Rive-Sud. Première heure offerte.",
    ogAlt: "NIVEX — Repassage à domicile de prestige",
  },
  nav: {
    home: "Accueil",
    story: "L'histoire",
    services: "Prestations",
    how: "Déroulement",
    faq: "Questions",
    pricing: "Tarifs",
    book: "Réserver",
    contact: "Contact",
  },
  brand: {
    name: "NIVEX",
    tagline: "Repassage à domicile de prestige",
    values: "Doux, délicat et élégant",
    phone: "+1 450 943 1217",
    phoneHref: "tel:+14509431217",
    email: "styve1885@gmail.com",
    emailHref: "mailto:styve1885@gmail.com",
    region: "Longueuil · Rive-Sud · Montérégie",
  },
  hero: {
    eyebrow: "Service à domicile · Longueuil",
    titleTop: "Offrez à votre garde-robe",
    titleBottom: "le soin qu'elle mérite.",
    lede:
      "Un artisan se déplace chez vous, avec sa presse et sa vapeur de haute précision. Vous ne déplacez rien, vous ne pliez rien. Vous ouvrez votre penderie, et tout y est droit.",
    ctaPrimary: "Réserver une séance",
    ctaSecondary: "Découvrir l'histoire",
    offer: "Votre première heure de repassage offerte.",
    scroll: "Faites défiler",
  },
  marquee: [
    "Chemises impeccables",
    "Robes & vêtements délicats",
    "Linge de maison haut de gamme",
    "Costumes & vestes parfaits",
    "Uniformes scolaires & professionnels",
    "Collecte & livraison flexibles",
  ],
  story: {
    eyebrow: "L'histoire",
    title: "Le blanc, comme au premier jour.",
    chapters: [
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
          "Un vêtement froissé ne trahit pas votre négligence — il trahit votre agenda. Mais celui qui vous fait face ne le sait pas. Le col qui tombe droit, l'épaule qui tient, le revers qui marque : voilà ce qui parle avant vous, à l'entretien d'embauche comme au premier rendez-vous.",
      },
      {
        num: "III",
        title: "Le nom",
        body:
          "NIVEX vient du latin nix, nivis — la neige. Ce blanc-là ne se négocie pas : il est net, franc, sans mémoire du jour précédent. C'est l'état que nous rendons à vos tissus, l'un après l'autre.",
      },
      {
        num: "IV",
        title: "Chez vous, pas ailleurs",
        body:
          "Nous ne prenons pas vos vêtements en otage dans un camion. L'atelier vient à vous : presse professionnelle, vapeur calibrée, pattemouilles, cintres. Vous restez chez vous. Vos vêtements aussi. Et quand nous repartons, la penderie est en ordre.",
      },
    ],
    signature: "Styve",
    signatureRole: "Artisan du repassage, fondateur de NIVEX",
    quote:
      "Le luxe, ce n'est pas d'avoir beaucoup de vêtements. C'est que chacun soit prêt à être porté.",
  },
  services: {
    eyebrow: "Les prestations",
    title: "Chaque tissu a sa température.",
    lede:
      "Nous ne repassons pas une soie comme un coton d'uniforme. Chaque pièce reçoit le réglage, la pression et la vapeur qui lui conviennent.",
    items: [
      {
        icon: "shirt",
        name: "Chemises impeccables",
        body: "Col, empiècement, poignets, corps, manches. Dans cet ordre, toujours. Repassées sur cintre de bois, prêtes à porter.",
        detail: "≈ 8 à 12 chemises par heure",
      },
      {
        icon: "dress",
        name: "Robes & vêtements délicats",
        body: "Soie, viscose, dentelle, plissés. Vapeur sans contact quand la fibre l'exige, pattemouille quand elle le mérite.",
        detail: "Test de fibre systématique",
      },
      {
        icon: "linen",
        name: "Linge de maison",
        body: "Draps, nappes, serviettes, housses. Pliage hôtelier, arêtes vives, empilage prêt pour l'armoire.",
        detail: "Pliage hôtelier inclus",
      },
      {
        icon: "suit",
        name: "Costumes & vestes",
        body: "Défroissage vapeur, remise en forme des épaules, marquage du pli de pantalon. Sans lustrage, jamais.",
        detail: "Remise en forme structurelle",
      },
      {
        icon: "badge",
        name: "Uniformes",
        body: "Scolaires et professionnels. Le lot complet de la semaine, traité d'un coup, rendu sur cintres numérotés.",
        detail: "Forfait hebdomadaire possible",
      },
      {
        icon: "clock",
        name: "Collecte & livraison",
        body: "Vous n'êtes pas là ? Nous récupérons et rapportons selon l'horaire qui vous arrange, dans la zone desservie.",
        detail: "Longueuil & la Rive-Sud",
      },
    ],
  },
  how: {
    eyebrow: "Le déroulement",
    title: "Trois étapes, rien de plus.",
    steps: [
      {
        n: "1",
        title: "Planifiez",
        body: "Indiquez en ligne le moment qui vous arrange. Votre artisan vous rappelle dans les heures qui suivent pour fixer l'heure exacte.",
      },
      {
        n: "2",
        title: "Préparez",
        body: "Avant l'arrivée, rassemblez les pièces à traiter. Un panier, un lit, un dossier de chaise : tout convient. Nous nous occupons du reste.",
      },
      {
        n: "3",
        title: "Rencontrez",
        body: "Votre spécialiste arrive avec l'équipement complet au moment convenu. Vous récupérez une garde-robe prête à porter, sur cintres.",
      },
    ],
  },
  pricing: {
    eyebrow: "Tarification",
    title: "Au résultat, pas à la minute.",
    lede:
      "Vous choisissez les pièces à traiter, nous venons avec tout le matériel. Le montant est confirmé sur place avant de commencer.",
    offers: [
      {
        name: "Séance découverte",
        duration: "une heure",
        volume: "8 à 12 chemises, ou 6 à 8 pièces mixtes",
        note: "Pour une première visite ou un complément le même jour.",
      },
      {
        name: "Séance semaine",
        duration: "deux heures",
        volume: "14 à 18 pièces — la garde-robe complète de votre semaine",
        note: "Format standard.",
      },
      {
        name: "Abonnement mensuel",
        duration: "",
        volume: "Visites régulières, créneaux prioritaires",
        note: "Tarif garanti douze mois.",
      },
    ],
    planFrom: "à partir de {price} par mois",
    button: "Composer ma séance",
    seeAll: "Voir la grille complète",
    firstFree: "Première heure offerte",
    firstFreeConditions:
      "Sur toute première réservation de deux heures ou plus. Une seule utilisation par client. Non applicable aux abonnements ni aux pièces à l'unité.",
    note: "L'estimation affichée est indicative. Le montant final est confirmé sur place, avant de commencer.",
  },
  testimonials: {
    eyebrow: "Ce qu'on en dit",
    title: "Des penderies transformées.",
  },
  faq: {
    eyebrow: "Questions",
    title: "Ce qu'on nous demande.",
    items: [
      {
        q: "Faut-il fournir la planche et le fer ?",
        a: "Non. Votre artisan arrive avec l'ensemble du matériel professionnel : table active, générateur de vapeur, pattemouilles, cintres. Nous avons seulement besoin d'une prise électrique et d'environ deux mètres carrés.",
      },
      {
        q: "Combien de temps prévoir ?",
        a: "Comptez environ 8 à 12 chemises par heure, ou 6 à 8 pièces mixtes. Lors de la réservation, l'estimateur vous propose une durée selon ce que vous sélectionnez — vous pouvez toujours l'ajuster.",
      },
      {
        q: "Dois-je être présent pendant la séance ?",
        a: "Idéalement pour l'accueil et le départ. Entre les deux, vous vaquez à vos occupations. Certains clients partent travailler après nous avoir ouvert : cela se convient d'avance.",
      },
      {
        q: "Et les pièces fragiles ?",
        a: "Chaque fibre est identifiée avant traitement. Soie, dentelle, cachemire et plissés sont travaillés à la vapeur sans contact ou sous pattemouille. En cas de doute sur une pièce, nous vous consultons avant d'y toucher.",
      },
      {
        q: "Quelles zones desservez-vous ?",
        a: "Longueuil et ses arrondissements — Vieux-Longueuil, Saint-Hubert, Greenfield Park — ainsi que la Rive-Sud environnante : Brossard, Saint-Lambert, Boucherville, Saint-Bruno. Indiquez votre code postal lors de la réservation : si vous êtes hors zone, nous vous le disons immédiatement.",
      },
      {
        q: "Comment se fait le paiement ?",
        a: "Sur place, à la fin de la séance : comptant, virement Interac ou carte. Aucun prépaiement n'est demandé lors de la réservation en ligne.",
      },
      {
        q: "Puis-je annuler ou déplacer mon rendez-vous ?",
        a: `Oui, librement jusqu'à ${CANCEL_WINDOW_HOURS} heures avant le rendez-vous. Un appel ou un courriel suffit — rien à payer, rien à justifier.`,
      },
    ],
  },
  cta: {
    title: "Votre première heure est offerte.",
    body: "Dites-nous quel moment vous arrange. Nous vous rappelons pour confirmer le rendez-vous, de vive voix.",
    button: "Réserver maintenant",
    or: "ou appelez le",
  },
  booking: {
    title: "Réserver une séance",
    lede: "Quatre étapes, deux minutes. Vous indiquez vos préférences, votre artisan vous rappelle pour fixer l'heure.",
    steps: ["Prestations", "Adresse", "Créneau", "Confirmation"],
    step1: {
      title: "Que devons-nous traiter ?",
      hint: "Sélectionnez ce qui vous concerne, ajustez les quantités. L'estimation se met à jour toute seule.",
      qty: "Quantité",
      estimate: "Estimation",
      duration: "Durée estimée",
      price: "Montant estimé",
      hours: "h",
      minutes: "min",
      empty: "Sélectionnez au moins une prestation pour continuer.",
      firstFreeApplied: "Première heure offerte appliquée",
      notes: "Précisions (optionnel)",
      notesPlaceholder: "Pièces fragiles, accès à l'immeuble, animal à la maison, stationnement…",
    },
    step2: {
      title: "Où vous rejoignons-nous ?",
      name: "Nom complet",
      email: "Courriel (facultatif)",
      phone: "Téléphone",
      address: "Adresse",
      addressPlaceholder: "123 rue Principale, app. 4",
      city: "Ville",
      postal: "Code postal",
      postalPlaceholder: "J4K 1A1",
      outOfZone: "Cette adresse semble hors de notre zone. Envoyez tout de même votre demande — nous vous répondrons par téléphone.",
      inZone: "Parfait, vous êtes dans la zone desservie.",
    },
    step3: {
      title: "Quand vous conviendrait-il ?",
      hint: "Indiquez vos préférences, je vous confirme par téléphone dans les heures qui suivent.",
      day: "Jour souhaité",
      moment: "Moment de la journée",
      second: "Deuxième choix (facultatif)",
      secondHint: "Si le premier ne fonctionne pas de notre côté, c'est celui-ci que nous essaierons.",
      none: "Pas de deuxième choix",
      days: {
        weekday: "Soir de semaine",
        saturday: "Samedi",
        sunday: "Dimanche",
        any: "Indifférent",
      },
      moments: {
        morning: "Matin",
        afternoon: "Après-midi",
        evening: "Soirée",
      },
      comment: "Commentaire libre (facultatif)",
      commentPlaceholder: "Une date précise en tête, une contrainte d'horaire, une heure à éviter…",
      wanted: "Créneau souhaité",
    },
    step4: {
      title: "Tout est exact ?",
      when: "Rendez-vous",
      where: "Adresse",
      what: "Prestations",
      who: "Coordonnées",
      total: "Estimation",
      consent:
        "Je comprends qu'il s'agit d'une demande : le rendez-vous n'est fixé qu'une fois confirmé par téléphone, et l'estimation reste indicative jusqu'au montant final confirmé sur place.",
      submit: "Demander ce créneau",
      submitting: "Envoi de la demande…",
    },
    back: "Retour",
    next: "Continuer",
    success: {
      title: "Demande reçue.",
      body: "Je vous appelle pour confirmer.",
      urgent: "Pour une réponse immédiate :",
      wanted: "Créneau souhaité",
      ref: "Référence",
      home: "Retour à l'accueil",
    },
    errors: {
      unavailable:
        "Votre demande n'a pas pu partir. Appelez-nous au +1 450 943 1217, nous vous trouvons une place tout de suite.",
      generic: "Une erreur est survenue. Réessayez, ou appelez-nous directement.",
      required: "Ce champ est requis",
      email: "Courriel invalide",
      phone: "Numéro invalide",
      postal: "Code postal invalide (ex. J4K 1A1)",
    },
  },
  manage: {
    title: "Votre réservation",
    status: {
      confirmed: "Confirmée",
      cancelled: "Annulée",
      completed: "Terminée",
      pending: "En attente",
    },
    cancel: "Annuler la réservation",
    cancelConfirm: "Annuler définitivement ce rendez-vous ?",
    cancelled: "Votre réservation a été annulée. Votre artisan en a été informé.",
    tooLate: `Ce rendez-vous a lieu dans moins de ${CANCEL_WINDOW_HOURS} h. Appelez-nous au +1 450 943 1217.`,
    notFound: "Réservation introuvable. Vérifiez le lien reçu par courriel.",
    rebook: "Prendre un nouveau rendez-vous",
  },
  footer: {
    tagline: "Repassage à domicile de prestige",
    rights: "Tous droits réservés",
    zone: "Zone desservie",
    hours: "Horaire",
    legal: "Confidentialité",
    terms: "Conditions d'utilisation",
    admin: "Espace artisan",
    craft: "Fait avec soin sur la Rive-Sud",
  },
  protocol: {
    eyebrow: "Le protocole",
    title: "L'ordre ne s'improvise pas.",
    lede:
      "Une chemise mal repassée n'est pas une chemise mal chauffée : c'est une chemise repassée dans le désordre. Chaque pièce déjà finie serait refroissée par la suivante. Voici la marche à suivre, celle qu'on ne change jamais.",
    steps: [
      { n: "01", title: "Le col",        body: "À l'envers d'abord, de la pointe vers le centre. Jamais l'inverse : c'est ainsi qu'on évite le faux pli qui ne part plus." },
      { n: "02", title: "L'empiècement", body: "Le haut du dos, posé sur la pointe de la planche. Une épaule, puis l'autre, sans jamais écraser la couture." },
      { n: "03", title: "Les poignets",  body: "Ouverts à plat, envers puis endroit. Le fer contourne les boutons — il ne passe jamais dessus." },
      { n: "04", title: "Les manches",   body: "On suit l'arête existante, on n'en crée pas une nouvelle. Une manche a une seule mémoire ; on la respecte." },
      { n: "05", title: "Le corps",      body: "Devant boutonné, puis le dos, en faisant tourner la pièce autour de la planche plutôt qu'en la retournant." },
      { n: "06", title: "La vapeur",     body: "Passage final sans contact. La fibre se détend, la tenue se fixe, le lustre ne vient jamais." },
      { n: "07", title: "Le cintre",     body: "Bois, immédiatement. Le tissu refroidit en forme — c'est là que le travail tient, ou qu'il se perd." },
    ],
  },
  contact: {
    eyebrow: "Nous écrire",
    title: "Une question avant de réserver ?",
    lede:
      "Une pièce dont vous n'êtes pas sûr, un horaire particulier, un devis pour un lot important : écrivez-nous. Vous recevez une réponse le jour même, et un accusé de réception dans la minute.",
    name: "Votre nom",
    email: "Votre courriel",
    phone: "Téléphone (optionnel)",
    subject: "Objet (optionnel)",
    subjectPlaceholder: "Devis pour un lot de chemises",
    message: "Votre message",
    messagePlaceholder: "Dites-nous ce dont vous avez besoin…",
    submit: "Envoyer le message",
    submitting: "Envoi en cours…",
    successTitle: "Message envoyé.",
    successBody:
      "Un accusé de réception vient de partir vers votre boîte. Nous vous répondons en général dans la journée.",
    another: "Écrire un autre message",
    orCall: "Ou parlez-nous directement",
    phoneLabel: "Téléphone",
    emailLabel: "Courriel",
    hoursLabel: "Disponible",
    hoursValue: "7 h – 22 h, du lundi au samedi",
    errors: {
      required: "Ce champ est requis",
      email: "Courriel invalide",
      short: "Quelques mots de plus, s'il vous plaît",
      rate: "Vous venez de nous écrire. Laissez-nous quelques minutes pour vous répondre.",
      unavailable:
        "L'envoi ne fonctionne pas pour l'instant. Appelez-nous au +1 450 943 1217 — nous décrochons.",
      generic: "L'envoi a échoué. Réessayez, ou appelez-nous directement.",
    },
  },
  legal: {
    updatedLabel: "Dernière mise à jour",
    summary: "Sommaire",
    readAlso: "À lire aussi",
    privacy,
    terms,
  },
  tarifs: {
    eyebrow: "Tarification",
    title: "Ce qu'une séance chez vous représente.",
    lede:
      "Nous ne vendons pas « du repassage » : nous vendons une cadence mesurée, la même d'une séance à l'autre. Voici ce qu'elle vaut, ce qu'elle traite, et ce qui la sépare d'un coup de main.",
    headline: "La séance d'une heure — {price}",
    visitNote: "minimum {min} par déplacement · déplacement inclus",
    cadence: {
      title: "Ce que nous traitons en une heure",
      lede:
        "Ces chiffres ne sont pas une promesse commerciale : ce sont ceux que notre moteur de réservation utilise pour calculer la durée de votre séance. Ce que vous lisez ici est ce que le formulaire calculera.",
      colType: "Type de pièce",
      colQty: "En 1 h",
      note: "Un panier mixte tourne autour de 7 à 8 pièces à l'heure. C'est cette moyenne qui donne les fourchettes annoncées sur chaque forfait.",
    },
    versus: {
      title: "Ce n'est pas du repassage de ménage.",
      lede: "Cinq différences, et elles se voient sur le vêtement.",
      elsewhere: "Ailleurs",
      here: "Chez NIVEX",
      rows: [
        {
          title: "Le volume",
          them: "On repasse « ce qu'on peut » dans le temps payé. Vous découvrez le résultat à la fin.",
          us: "Un nombre de pièces annoncé avant de commencer. S'il n'est pas atteint de notre fait, le temps manquant ne vous est pas facturé.",
        },
        {
          title: "Le matériel",
          them: "Votre fer, votre planche, votre électricité. Le résultat dépend de ce que vous possédez.",
          us: "Table active, générateur de vapeur, pattemouilles et cintres de bois apportés. Vous fournissez une prise et deux mètres carrés.",
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
    units: {
      title: "Pièces à l'unité",
      lede: "Pour une pièce ajoutée ponctuellement à une séance réservée.",
      linen: "Literie & linge de maison",
      garments: "Vêtements & tenues",
      note: "Ces prix valent pour une pièce isolée, ajoutée à une séance déjà réservée. Au-delà de quelques pièces, une séance revient moins cher.",
    },
    plans: {
      title: "Abonnements mensuels",
      lede: "Un service régulier, et un montant qui baisse à mesure que les séances s'ajoutent.",
      perMonth: "/ mois",
      full: "Séances à l'unité",
      save: "Vous économisez",
      perks: [
        "Priorité absolue sur vos plages horaires.",
        "Report flexible en cas de déplacement ou de vacances.",
        "Amidon léger sur cols et poignets, inclus sans supplément.",
        "Tarif garanti douze mois à compter de la souscription.",
      ],
    },
    terms: {
      title: "Ce qui vaut pour toutes les séances",
      items: [
        { dt: "Volume tenu", dd: "Le nombre de pièces annoncé sur chaque forfait est un engagement. S'il n'est pas atteint de notre fait, le temps manquant ne vous est pas facturé." },
        { dt: "Estimation et montant final", dd: "L'estimation est indicative. Le montant final suit le temps réellement passé et vous est confirmé sur place, avant de commencer." },
        { dt: "Paiement", dd: "Sur place, à la fin de la séance : comptant, virement Interac ou carte. Aucun prépaiement à la réservation." },
        { dt: "Ce qu'il nous faut chez vous", dd: "Une prise électrique et environ deux mètres carrés dégagés. Rien d'autre : le matériel professionnel arrive avec l'artisan." },
      ],
    },
    firstFreeLabel: "Première séance",
    cta: {
      title: "Composez votre séance.",
      body: "Le tunnel de réservation reprend exactement ces chiffres : vous cochez vos prestations, il calcule la durée et le montant, et transmet le moment qui vous arrange.",
    },
  },
  gallery: {
    eyebrow: "Les pièces",
    title: "Ce qui passe entre nos mains.",
    lede:
      "Un complet de laine ne se traite pas comme une surchemise de coton, ni une jupe plissée comme un smoking. Voici le genre de pièces que nous recevons, et le soin que chacune réclame.",
    photos: {
      gilet: {
        name: "Gilets & complets",
        detail: "Laine à carreaux, revers à cran. Épaules remises en forme, vapeur sans contact, aucun lustrage.",
        alt: "Gilet de complet en laine à carreaux, suspendu à un cintre de bois",
      },
      veston: {
        name: "Vestons de tailleur",
        detail: "Le revers se marque au bord, jamais à plat. Une laine noire ne doit prendre aucune brillance.",
        alt: "Veston de tailleur noir présenté sur un mannequin",
      },
      chemises: {
        name: "Chemises & surchemises",
        detail: "Col, empiècement, poignets, manches, corps — dans cet ordre, pour que rien ne se refroisse.",
        alt: "Deux surchemises de coton beige suspendues côte à côte",
      },
      ceremonie: {
        name: "Tenues de cérémonie",
        detail: "Passepoil satiné contourné au fer, pli du pantalon repris sous pattemouille.",
        alt: "Smoking bleu nuit à passepoil satiné, sur cintre",
      },
      uniformes: {
        name: "Uniformes scolaires",
        detail: "Les jupes plissées se reprennent pli par pli. Rendus sur cintres numérotés par enfant.",
        alt: "Uniformes scolaires bleus suspendus à une tringle",
      },
    },
  },
  photos: {
    portrait: "Styve, fondateur de NIVEX, en tablier, fer professionnel à la main",
    poste:
      "Le poste de travail NIVEX : centrale vapeur, fer, jeannette et cintres de bois, installés chez le client",
    travail: "Finition à la vapeur d'une chemise blanche sur cintre de bois",
    portraitAlt: "Styve, artisan du repassage, Longueuil",
  },
  days: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  daysShort: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
  months: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
  closed: "Fermé",
};

/** Le dictionnaire français fait foi : la version anglaise doit en épouser la forme. */
export type Dict = typeof fr;

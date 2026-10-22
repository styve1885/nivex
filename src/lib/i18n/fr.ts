import {
  CANCEL_WINDOW_HOURS, CYCLE_MAX_WEEKS, FIRST_FREE_MIN_MINUTES, PHONE, PHONE_HREF, SERIES_CYCLES,
  INSTALL_MINUTES, SERIES_NOTICE_DAYS, SUBSCRIBER_HOURLY_DISCOUNT_CENTS, SUBSCRIBER_TRAVEL_DISCOUNT_CENTS, TERM_SERIES,
} from "../brand";
import { formatMoney, minutesToText } from "../time";

/* La réduction des abonnés sur les frais de route, écrite depuis la constante. */
const DISCOUNT = formatMoney(SUBSCRIBER_TRAVEL_DISCOUNT_CENTS, "CAD", "fr");
/* Ce qu'un abonné paie de moins par heure, depuis la constante. */
const HOURLY_DISCOUNT = formatMoney(SUBSCRIBER_HOURLY_DISCOUNT_CENTS, "CAD", "fr");
/* La durée qui ouvre droit à la première heure offerte, depuis la constante
   que le moteur applique. */
const FIRST_FREE_MIN = minutesToText(FIRST_FREE_MIN_MINUTES, "fr");

/**
 * Un document légal : des sections de prose, chacune pouvant se clore sur une liste.
 * `offer` marque une section qui ne vaut que tant que la première heure est
 * offerte : elle disparaît avec l'offre.
 */
export type LegalSection = { title: string; body: string[]; list?: string[]; offer?: boolean };
export type LegalDoc = { eyebrow: string; title: string; lede: string; sections: LegalSection[] };

/*
 * Politique de confidentialité et conditions d'utilisation.
 *
 * Les accolades sont des substitutions, remplies à l'affichage par
 * `LegalDocument` à partir des réglages en vigueur : {email}, {phone}, {neq},
 * {site}, {zone}, {rate}, {entry}, {min}, {step}, {lead}, {cancel}, {horizon}. Leur
 * nom ne porte que des lettres. Écrire un taux ou un délai en toutes lettres
 * ici, c'est écrire un texte qui mentira le jour où Styve le changera depuis
 * son espace.
 */
const privacy: LegalDoc = {
  eyebrow: "Vie privée",
  title: "Ce que nous savons de vous.",
  lede:
    "NIVEX recueille de quoi vous joindre, de quoi vous trouver et de quoi préparer votre séance, ainsi que quelques mesures techniques décrites plus bas. Aucune de ces informations ne se revend, ne se loue, ni ne se troque. Voici le détail, sans détour.",
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
        "Ce que vous nous donnez vous-même, au moment où vous le donnez, et quelques mesures techniques, décrites une à une ci-dessous. Ce site ne suit personne à la trace et n'achète aucune donnée à qui que ce soit.",
      ],
      list: [
        "Réservation — votre nom, votre courriel, votre téléphone, l'adresse de la séance (rue, ville, code postal), les prestations et quantités choisies, le créneau retenu, et les précisions que vous écrivez vous-même.",
        "Abonnement — les mêmes renseignements qu'une réservation, plus la formule choisie, le jour et l'heure de vos visites, les visites effectuées et les cycles réglés.",
        "Formulaire de contact — votre nom, votre courriel, votre téléphone si vous le donnez, l'objet et le contenu de votre message.",
        "Journal technique — la nature et l'heure des opérations du site\u00a0: une réservation créée, un courriel parti, une erreur survenue. Sans adresse IP, sans identifiant de navigateur, sans empreinte d'appareil.",
        "Mesure de fréquentation — le nombre de pages vues, la page regardée, le site d'où vous arrivez, votre pays et le type d'appareil. Ces données sont agrégées\u00a0: elles disent combien de personnes sont passées, jamais lesquelles. Aucun témoin n'est déposé et aucun identifiant ne vous suit d'une visite à l'autre.",
        "Journal des visites — pour chaque page affichée\u00a0: la date et l'heure, la page et sa langue, le site ou la campagne d'où vous êtes arrivé au début de votre visite, avec l'adresse de provenance telle que votre navigateur la transmet, le prénom inscrit dans le lien de recommandation si vous en avez suivi un, le type d'appareil, et la ville approximative, avec sa région et son pays, que notre hébergeur déduit du réseau. Votre adresse IP n'y est jamais inscrite\u00a0: elle sert à deviner la ville, puis elle est oubliée avec la requête. Pour écarter les robots, le serveur regarde aussi le nom que se donne votre navigateur, s'il est piloté par un programme et le fuseau de son horloge\u202f; il n'en garde rien, sinon la mention «\u00a0robot\u00a0» quand c'en est un. Aucun identifiant ne relie deux lignes entre elles — deux de vos visites y figurent comme deux inconnus. Les pages de l'espace réservé à l'artisan ne sont jamais comptées, ni les liens personnels «\u00a0Gérer ma réservation\u00a0» et «\u00a0Gérer mes visites\u00a0», ni les visites de l'artisan lui-même.",
        "Provenance d'une réservation — à votre première visite, votre navigateur retient pour lui seul l'étiquette de campagne du lien suivi, le prénom inscrit dans un lien de recommandation, le site d'où vous veniez, la page d'arrivée, la date de cette première visite et le nombre de fois que vous êtes revenu. Ces informations restent dans votre navigateur et n'en sortent que si vous réservez\u00a0: elles accompagnent alors votre réservation, pour que nous sachions quel moyen vous a fait connaître la maison. Si vous ne réservez pas, nous n'en savons rien, et vider les données de votre navigateur les efface.",
        "Comment vous nous avez connus — la réponse que vous donnez, si vous le souhaitez, à la question facultative du formulaire de réservation, et le nom de la personne qui vous a recommandé si vous choisissez de l'écrire. Une visite à votre porte ou une carte remise en main propre ne laissent aucune trace technique\u00a0: cette réponse est le seul moyen de le savoir. Elle est proposée d'avance quand vous arrivez par un lien de recommandation ou par le code d'une carte, et vous restez libre de la changer ou de l'effacer.",
      ],
    },
    {
      title: "À quoi cela sert",
      body: [
        "À chaque renseignement correspond une raison d'être. Si la raison disparaît, le renseignement aussi.",
      ],
      list: [
        "Votre adresse sert à venir chez vous, et à vérifier que vous êtes dans la zone desservie.",
        "Votre courriel et votre téléphone servent à confirmer, à prévenir d'un retard, à vous répondre, et à vous rappeler chaque visite la veille. Le lendemain de votre première séance, votre courriel peut aussi recevoir, une seule fois, un mot de remerciement qui vous invite à laisser un avis sur Google\u202f; répondre à ce courriel suffit pour ne plus en recevoir de ce genre. Si votre numéro est canadien, il reçoit aussi, par texto, la confirmation, le rappel de la veille, un mot deux heures avant l'arrivée de l'artisan et tout changement de rendez-vous\u202f; répondez STOP à l'un de ces textos pour ne plus en recevoir. Toute réponse, STOP compris, est transmise en texte au cellulaire de l'artisan\u202f; le site ne la conserve pas.",
        "Les prestations choisies servent à réserver la bonne durée dans l'agenda et à préparer le matériel.",
        "Vos précisions servent à ne pas abîmer une pièce fragile et à savoir comment entrer chez vous.",
        "Le carnet de rendez-vous sert à tenir la comptabilité de l'entreprise et à retrouver une séance passée si elle est contestée.",
        "Le journal des visites et la provenance servent à savoir quel moyen de se faire connaître fonctionne — une carte distribuée dans un quartier, une recommandation, une publication, une recherche — afin de ne pas dépenser au hasard. Ils ne servent jamais à vous démarcher, ni à vous recontacter, ni à vous classer.",
      ],
    },
    {
      title: "Ce que nous ne faisons pas",
      body: [],
      list: [
        "Nous ne vendons, ne louons et n'échangeons aucun renseignement, à personne, à aucun prix.",
        "Nous ne faisons aucune publicité ciblée, et ce site n'héberge aucun pisteur publicitaire.",
        "Nous ne dressons aucun profil et ne prenons aucune décision automatisée à votre sujet.",
        "Nous ne recueillons aucune donnée bancaire\u00a0: le paiement se fait sur place, jamais sur le site.",
      ],
    },
    {
      title: "Qui d'autre y a accès",
      body: [
        "Cinq fournisseurs, chacun pour une tâche précise, et aucun n'a le droit de s'en servir à ses propres fins.",
      ],
      list: [
        "Vercel — héberge le site, le sert à votre navigateur, et en compte la fréquentation de façon agrégée.",
        "Neon — la base de données où vivent les rendez-vous et les messages.",
        "Google — l'agenda de votre artisan, où votre rendez-vous est inscrit avec votre nom, votre adresse et vos coordonnées, et Gmail, d'où partent la confirmation et l'invitation que vous recevez.",
        "Twilio — achemine les textos que vous recevez (confirmation, rappel, mot de deux heures avant, annulation ou changement de rendez-vous) et les avis envoyés à l'artisan, qui portent votre nom, la date du rendez-vous et, selon le cas, la ville ou la formule. Le mot de deux heures avant lui est confié à l'avance, et part à l'heure dite. Il transmet aussi à l'artisan le texte de vos réponses\u202f; les photos que vous y joindriez restent chez Twilio, où l'artisan les consulte. Twilio garde une copie des messages qu'il achemine.",
        "ImprovMX — fait suivre vers la boîte de votre artisan les courriels que vous écrivez à notre adresse du domaine.",
      ],
    },
    {
      title: "Hors du Québec",
      body: [
        "Le site, la base de données, les services Google et Twilio sont hébergés aux États-Unis, et ImprovMX fait suivre les courriels depuis l'étranger. Vos renseignements sortent donc du Québec pour y être conservés, et ils y sont soumis au droit du pays d'accueil — lequel peut, dans certains cas, permettre à ses autorités d'y accéder.",
        "Nous avons retenu des fournisseurs tenus contractuellement à des mesures de protection comparables à celles exigées ici, et nous ne leur confions que ce qui est nécessaire. En réservant ou en nous écrivant par le site, vous consentez à cette communication hors Québec. Si elle vous gêne, appelez-nous\u00a0: nous conviendrons du rendez-vous de vive voix.",
      ],
    },
    {
      title: "Combien de temps nous les gardons",
      body: [],
      list: [
        "Un rendez-vous et ce qui l'accompagne\u00a0: trois ans après la séance. C'est le délai de prescription civile au Québec — celui pendant lequel une séance peut encore être contestée de part et d'autre. Il est ensuite anonymisé\u00a0: votre nom, votre téléphone, votre adresse et vos précisions sont effacés\u202f; restent la date, la durée, les prestations, le montant et la zone, pour la comptabilité. De votre courriel ne reste qu'une empreinte chiffrée, qui ne se relit pas et sert seulement à ne pas offrir deux fois la première heure.",
        "Un abonnement\u00a0: trois ans après sa dernière visite, pour la même raison, puis il est anonymisé de la même façon.",
        "Un message du formulaire de contact\u00a0: deux ans, après quoi il est supprimé de lui-même, ou plus tôt si vous en demandez la suppression.",
        "Les copies\u00a0: l'événement d'un rendez-vous dans l'agenda de la maison s'efface quand le rendez-vous est anonymisé. Les courriels échangés avec vous — confirmations, rappels, copie de vos messages — restent dans la boîte de courriel de la maison\u202f; nous les supprimons selon les mêmes durées, ou plus tôt si vous le demandez.",
        "Le journal technique\u00a0: douze mois, après quoi ses entrées sont supprimées d'elles-mêmes.",
        "Le journal des visites\u00a0: douze mois, après quoi les entrées sont supprimées d'elles-mêmes.",
        "La provenance jointe à une réservation\u00a0: elle suit le sort de cette réservation. Une réservation anonymisée n'en garde que la famille — l'étiquette de campagne, votre réponse à «\u00a0Comment avez-vous connu NIVEX\u202f?\u00a0», le prénom inscrit dans un lien de recommandation et le nom du site d'où vous veniez —, de quoi compter les sources sans désigner personne.",
      ],
    },
    {
      title: "Comment c'est protégé",
      body: [],
      list: [
        "Le site n'est servi qu'en HTTPS\u00a0: ce que vous écrivez est chiffré en transit.",
        "Le jeton qui relie le site au compte Google de l'artisan est chiffré en AES-256-GCM avant d'entrer en base.",
        "L'espace artisan exige une authentification Google, et la toute première connexion exige en plus un code d'installation.",
        "Le lien «\u00a0Gérer ma réservation\u00a0» contient un jeton aléatoire propre à votre rendez-vous. Il ne donne accès qu'à celui-là, et à rien d'autre. Le lien «\u00a0Gérer mes visites\u00a0» d'un abonnement fonctionne de la même manière, pour les seules visites de cet abonnement.",
      ],
    },
    {
      title: "Témoins de connexion",
      body: [
        "Ce site ne dépose aucun témoin publicitaire, aucun témoin de mesure d'audience, aucun bouton de réseau social. Un visiteur ordinaire n'en reçoit aucun. Le comptage des visites se fait sans témoin ni identifiant\u00a0: le journal envoyé au serveur ne permet pas de reconnaître un visiteur d'un passage à l'autre. Ce que votre navigateur garde pour lui-même est décrit plus bas.",
        "Deux témoins existent, et ils ne concernent que l'artisan\u00a0: celui qui maintient sa session ouverte dans son espace, et un témoin temporaire qui protège sa connexion Google contre la fraude. Tous deux expirent d'eux-mêmes.",
        "Les polices de caractères sont servies depuis notre propre domaine\u00a0: afficher cette page n'appelle aucun serveur tiers.",
        "Votre navigateur retient en revanche deux choses pour lui-même, dans son espace de stockage local\u00a0: la provenance décrite plus haut, qui ne nous parvient que si vous réservez, et, le temps de votre session, la provenance de votre arrivée, qui sert à rapporter chaque page lue à la même source et à ne compter qu'une visite pour plusieurs pages lues\u202f; celle-ci s'efface quand l'onglet se ferme. Ni l'une ni l'autre n'est un identifiant, aucune n'est lisible par un autre site, et vider les données de navigation les efface.",
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
        "Un artisan se déplace chez vous avec son matériel professionnel\u00a0: table active, générateur de vapeur, pattemouilles et cintres. Il repasse sur place les pièces que vous lui présentez, puis les remet sur cintres ou pliées.",
        `L'artisan arrive à l'heure du début de la séance. L'installation et le rangement de son matériel, ${INSTALL_MINUTES} minutes chacun, font partie du temps réservé\u00a0; le reste est du repassage.`,
        "Vos vêtements ne quittent jamais votre domicile\u00a0: tout se fait sur place, devant vous.",
      ],
    },
    {
      title: "Où nous allons",
      body: [
        "{zone}",
        "Le code postal saisi pendant la réservation vous dit immédiatement si vous êtes dans la zone, et ce que coûte le déplacement s'il y a lieu. Hors zone, la réservation en ligne n'est pas possible\u00a0: appelez-nous au {phone}, nous vous dirons franchement si nous pouvons nous y rendre.",
      ],
    },
    {
      title: "Réserver",
      body: [],
      list: [
        "Les créneaux proposés tiennent compte de l'horaire de la maison et des rendez-vous déjà pris. Ce que vous voyez est réservable.",
        "Une séance dure au minimum {min}.",
        "Une réservation se prend au moins {lead} à l'avance, et jusqu'à {horizon} devant.",
        "La confirmation part par courriel dès la réservation, avec l'invitation pour votre agenda et un lien personnel pour gérer le rendez-vous. Si votre numéro est canadien, un texto la double, un autre vous rappelle le rendez-vous la veille, et un dernier vous prévient deux heures avant l'arrivée de l'artisan.",
      ],
    },
    {
      title: "Le prix",
      body: [
        "Une séance dure au minimum {min} et se facture {entry}. Au-delà, le temps s'ajoute par tranche de {step}, au même taux de {rate} l'heure. Les taxes applicables, s'il y a lieu, s'ajoutent à ce montant.",
        "L'estimation affichée pendant la réservation est indicative\u00a0: elle découle de ce que vous avez déclaré. Le montant final est établi selon le temps réellement passé, et il vous est confirmé sur place avant que la séance commence. Vous n'êtes jamais engagé sur un montant que vous n'avez pas vu.",
        "Si le travail demandé dépasse ce qui était prévu, nous vous le disons avant de continuer. C'est vous qui décidez de prolonger ou d'en rester là.",
      ],
    },
    {
      title: "La première heure offerte",
      offer: true,
      body: [
        `Pour une première réservation de ${FIRST_FREE_MIN} ou plus, la première heure de repassage est offerte et déduite automatiquement de l'estimation. Une seule fois par adresse courriel. Elle ne s'échange pas contre de l'argent et ne se cumule avec aucune autre offre.`,
      ],
    },
    {
      title: "Le paiement",
      body: [
        "À la fin de la séance, sur place\u00a0: comptant, virement Interac ou carte. Aucun prépaiement n'est demandé au moment de réserver, et le site ne recueille aucune donnée bancaire.",
        "Un abonnement fait exception sur un seul point\u00a0: chaque cycle se règle à sa première visite, sur place, par les mêmes moyens. Rien n'est jamais payé en ligne.",
      ],
    },
    {
      title: "Annuler ou déplacer",
      body: [
        "Une séance s'annule librement jusqu'à {cancel} avant le rendez-vous, depuis le lien personnel reçu par courriel ou par téléphone au {phone}. Pour la déplacer, appelez-nous dans le même délai\u00a0: nous convenons ensemble d'une autre heure. Rien à payer, rien à justifier.",
        "Une visite d'abonnement s'annule ou se déplace sans frais jusqu'à 23 h 59 la veille, depuis le lien personnel ou par téléphone, sans toucher au reste de la série.",
        "Passé ce délai, appelez-nous au {phone}\u00a0: nous ferons au mieux.",
        "S'il nous faut annuler de notre côté — maladie, panne de matériel, route impraticable —, vous êtes prévenu dès que nous le savons et vous ne devez rien.",
      ],
    },
    {
      title: "Les abonnements",
      body: [
        "Un abonnement réserve vos visites au même jour et à la même heure, au rythme de la formule\u00a0: chaque semaine, aux deux semaines ou toutes les quatre semaines. Ces créneaux ne sont proposés à personne d'autre.",
        `Un cycle correspond au nombre de visites de la formule réellement effectuées — quatre, deux ou une. Une visite annulée, de votre côté ou du nôtre, ne compte pas\u00a0: le cycle se prolonge jusqu'à la visite suivante, et une visite de remplacement est ajoutée en fin de série. Un cycle qui n'est pas terminé ${CYCLE_MAX_WEEKS} semaines après sa première visite nous amène à vous appeler pour convenir de la suite.`,
        `Le montant d'un cycle est fixé à la souscription et garanti douze mois, soit ${TERM_SERIES} séries de ${SERIES_CYCLES} cycles. Il se règle à la première visite du cycle, sur place. Nous vous appelons ${SERIES_NOTICE_DAYS} jours avant la fin d'une série pour confirmer la suivante.`,
        `Les frais de déplacement de votre zone, s'il y en a, sont réduits de ${DISCOUNT} par visite pour un abonné, sans jamais descendre sous zéro, et se règlent avec le cycle.{suboffer}`,
      ],
    },
    {
      title: "Ce dont nous avons besoin chez vous",
      body: [],
      list: [
        "Environ deux mètres carrés dégagés et une prise électrique libre.",
        "Un accès convenu\u00a0: code d'immeuble, stationnement, ascenseur, et l'animal de la maison signalé d'avance.",
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
        "Nous prenons soin de ce que vous nous confiez, et nous répondons des dommages causés par notre faute. Signalez-nous tout dommage sans tarder — idéalement avant notre départ, au plus tard dans les quarante-huit heures — et conservez la pièce en l'état\u00a0: nous devons pouvoir la voir.",
        "Nous ne pouvons pas répondre d'un défaut préexistant, d'une pièce dont l'étiquette d'entretien manque ou induit en erreur, ni d'un dommage résultant d'un traitement que vous avez demandé malgré notre avis contraire.",
        "Rien dans ces conditions n'écarte les droits que la Loi sur la protection du consommateur vous accorde.",
      ],
    },
    {
      title: "Le site",
      body: [
        "Les textes, les images et le dessin de ce site appartiennent à NIVEX. Les consulter et les partager, volontiers\u202f; les reprendre à votre compte, non.",
        "Nous faisons en sorte que le site reste disponible et exact, sans pouvoir le garantir à chaque instant. Une interruption du site n'annule jamais un rendez-vous déjà confirmé.",
        "Les fausses réservations, l'envoi massif de messages et la collecte automatisée ne sont pas permis.",
      ],
    },
    {
      title: "Vos renseignements",
      body: [
        "Ce que nous recueillons, pourquoi, et combien de temps nous le gardons\u00a0: tout est détaillé dans la politique de confidentialité.",
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
    service: "Repassage à domicile",
    title: "Repassage à domicile à Saint-Lambert et Longueuil — NIVEX",
    /* {places} : les premiers secteurs de la Rive-Sud, dans l'ordre de
       l'onglet « Zones et frais », puis Montréal s'il est desservi. L'offre
       ne s'y ajoute que tant que l'artisan la propose. */
    description:
      "Repassage à domicile à {places}. Nous repassons vos vêtements et votre literie sur place, chez vous\u00a0: pas de collecte, pas de livraison.",
    offer: "Première heure offerte.",
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
    phone: PHONE,
    phoneHref: PHONE_HREF,
    email: "contact@nivexrepassage.ca",
    emailHref: "mailto:contact@nivexrepassage.ca",
  },
  hero: {
    eyebrow: "Repassage à domicile · Saint-Lambert · Longueuil",
    titleTop: "Offrez à votre garde-robe",
    titleBottom: "le soin qu'elle mérite.",
    onSite:
      "Nous repassons vos vêtements et votre literie sur place, chez vous. Pas de collecte, pas de livraison\u00a0: rien ne quitte votre domicile.",
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
    "Tout se fait chez vous",
  ],
  /* Le ruban défile sans fin : un bouton doit pouvoir l'arrêter. */
  marqueeControl: { pause: "Arrêter le défilement", play: "Reprendre le défilement" },
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
    signature: "Styve",
    signatureRole: "Artisan du repassage, fondateur de NIVEX",
    /* Les guillemets font partie de la citation : chaque langue a les siens. */
    quote:
      "«\u00a0Le luxe, ce n'est pas d'avoir beaucoup de vêtements. C'est que chacun soit prêt à être porté.\u00a0»",
  },
  services: {
    eyebrow: "Les prestations",
    title: "Chaque tissu a sa température.",
    lede:
      "Nous ne repassons pas une soie comme un coton d'uniforme. Chaque pièce reçoit le réglage, la pression et la vapeur qui lui conviennent.",
    items: [
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
        body: "Rien ne quitte votre domicile. Votre artisan vient avec sa table, sa vapeur et ses cintres, travaille devant vous, et range avant de partir.",
        detail: "{zone}",
      },
    ],
    /* {zone} : les régions qui ont au moins un secteur actif, dans l'ordre
       de la maison — la Rive-Sud, puis Montréal. */
    regions: { south: "Rive-Sud", montreal: "Montréal" },
  },
  how: {
    eyebrow: "Le déroulement",
    title: "Trois étapes, rien de plus.",
    steps: [
      {
        n: "1",
        title: "Planifiez",
        body: "Choisissez votre créneau en ligne. La confirmation part aussitôt par courriel, et le rendez-vous s'inscrit dans l'agenda de votre artisan.",
      },
      {
        n: "2",
        title: "Préparez",
        body: "Avant l'arrivée, rassemblez les pièces à traiter. Un panier, un lit, un dossier de chaise\u00a0: tout convient. Nous nous occupons du reste.",
      },
      {
        n: "3",
        title: "Rencontrez",
        body: `Votre artisan arrive à l'heure convenue. Il s'installe et range en ${INSTALL_MINUTES} minutes chacun, compris dans la séance, et repasse tout le reste du temps. Vous récupérez une garde-robe prête à porter, sur cintres.`,
      },
    ],
  },
  pricing: {
    eyebrow: "Tarification",
    title: "Au résultat, pas à la minute.",
    lede:
      "Vous choisissez les pièces à traiter, nous venons avec tout le matériel. Le montant est confirmé sur place avant de commencer.",
    /* Les durées des deux séances ne s'écrivent pas ici : elles suivent la
       durée minimale réglée, comme leurs montants (voir Pricing). */
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
    button: "Composer ma séance",
    seeAll: "Voir la grille complète",
    firstFree: "Première heure offerte",
    firstFreeConditions:
      `Sur toute première réservation de ${FIRST_FREE_MIN} ou plus. Une seule utilisation par client. Non applicable aux abonnements ni aux pièces à l'unité.`,
    note: "L'estimation affichée est indicative. Le montant final est confirmé sur place, avant de commencer.",
  },
  /* La capacité d'une séance, le seul chiffre de quantité du site, et ce que
     contient une séance. {n}, {a}, {b} : des pièces, tirées de
     `capacityPieces` ; {da}, {db}, {min}, {ironing} : des durées. */
  capacity: {
    upTo: "Jusqu'à {n} pièces",
    perCycle: "Jusqu'à {n} pièces par cycle",
    caveat: "Le nombre de pièces varie selon la taille, le type et la matière des vêtements.",
    sentence: "Jusqu'à {a} pièces en {da}, et jusqu'à {b} en {db}, selon la taille, le type et la matière des vêtements.",
    setup: `Chaque séance inclut l'installation et le rangement de notre matériel, ${INSTALL_MINUTES} minutes chacun. Une séance de {min} comprend donc {ironing} de repassage.`,
  },
  testimonials: {
    eyebrow: "Ce qu'on en dit",
    title: "Des penderies transformées.",
  },
  faq: {
    eyebrow: "Questions",
    title: "Ce qu'on nous demande.",
    /* {capacity} et {setup} : les phrases de `capacity`, remplies depuis la
       durée minimale réglée. */
    items: [
      {
        q: "Est-ce que vous ramassez les vêtements\u202f?",
        a: "Non. Tout est repassé sur place, chez vous, avec notre matériel professionnel.",
      },
      {
        q: "Faut-il fournir la planche et le fer\u202f?",
        a: "Non. Votre artisan arrive avec l'ensemble du matériel professionnel\u00a0: table active, générateur de vapeur, pattemouilles, cintres. Nous avons seulement besoin d'une prise électrique et d'environ deux mètres carrés.",
      },
      {
        q: "Combien de temps prévoir\u202f?",
        a: "Lors de la réservation, l'estimateur calcule la durée d'après les quantités choisies, installation et rangement compris\u202f; pour la modifier, changez les quantités.",
      },
      {
        q: "Combien de vêtements repassez-vous en une séance\u202f?",
        a: "{capacity}",
      },
      {
        q: "L'installation est-elle comprise dans la séance\u202f?",
        a: "Oui. {setup} Votre artisan arrive à l'heure du début de la séance.",
      },
      {
        q: "Dois-je être présent pendant la séance\u202f?",
        a: "Idéalement pour l'accueil et le départ. Entre les deux, vous vaquez à vos occupations. Certains clients partent travailler après nous avoir ouvert\u00a0: il suffit d'en convenir d'avance.",
      },
      {
        q: "Et les pièces fragiles\u202f?",
        a: "Chaque fibre est identifiée avant traitement. Soie, dentelle, cachemire et plissés sont travaillés à la vapeur sans contact ou sous pattemouille. En cas de doute sur une pièce, nous vous consultons avant d'y toucher.",
      },
      {
        q: "Quelles zones desservez-vous\u202f?",
        a: "{zone} Les frais de déplacement dépendent de la zone et de la durée de la séance\u202f; la grille complète est sur la page Tarifs. Entrez votre code postal sur l'accueil ou sur la page Tarifs\u00a0: vous saurez tout de suite si votre adresse est desservie, et ce que le déplacement coûte s'il y a lieu.",
      },
      {
        q: "Comment se fait le paiement\u202f?",
        a: "Sur place, à la fin de la séance\u00a0: comptant, virement Interac ou carte. Aucun prépaiement n'est demandé lors de la réservation en ligne.",
      },
      {
        q: "Puis-je annuler ou déplacer mon rendez-vous\u202f?",
        a: `Oui. Une séance s'annule librement jusqu'à ${CANCEL_WINDOW_HOURS} heures avant le rendez-vous, depuis le lien personnel du courriel de confirmation, sans nous appeler. Pour la déplacer, appelez-nous au ${PHONE} dans le même délai. Pour un abonné, chaque visite s'annule ou se déplace en ligne jusqu'à 23 h 59 la veille.`,
      },
    ],
  },
  cta: {
    title: "Votre première heure est offerte.",
    /* Le même bandeau, quand l'artisan ne propose pas l'offre. */
    titlePlain: "Réservez votre séance.",
    body: "Choisissez un créneau. La confirmation part par courriel, avec l'invitation pour votre agenda.",
    button: "Réserver maintenant",
    or: "ou appelez le",
  },
  /* La phrase de la zone desservie, remplie depuis les secteurs actifs. */
  zoneText: {
    served: "Secteurs desservis\u00a0: {list}.",
    montreal: "À Montréal\u00a0: {list}.",
    none: "La réservation en ligne est fermée pour tous les secteurs en ce moment. Appelez-nous.",
  },
  /* La page Montréal. Les montants, la durée minimale et les délais y sont
     remplis depuis les réglages, comme sur la page Tarifs. */
  montreal: {
    metaTitle: "Repassage à domicile à Montréal — NIVEX",
    eyebrow: "Montréal",
    title: "Repassage à domicile à Montréal",
    lede:
      "NIVEX repasse vos vêtements et votre literie sur place, chez vous, à Montréal. Pas de collecte, pas de livraison\u00a0: rien ne quitte votre domicile.",
    areasTitle: "Quartiers desservis",
    areasLede: "L'artisan se déplace dans ces quartiers avec tout son matériel. Entrez votre code postal pour vérifier votre adresse et connaître les frais.",
    none: `Aucun quartier de Montréal n'est ouvert à la réservation en ligne pour le moment. Appelez-nous au ${PHONE}.`,
    conditionsTitle: "Conditions à Montréal",
    conditionsLede: "Les mêmes que sur la page {link}, tirées des mêmes réglages.",
    rate: "Tarif",
    rateValue: "{rate} de l'heure, soit {entry} pour une séance de {min}.",
    minimum: "Durée minimale",
    /* {setup} : la phrase `capacity.setup`, remplie depuis la durée minimale. */
    minimumValue: "Une séance dure au moins {min}. {setup}",
    travel: "Frais de déplacement",
    travelNote: "Par visite, en plus du prix de la séance.",
    /* Ajoutée seulement quand l'artisan propose l'offre. */
    travelNoteOffer: "L'offre «\u00a0première heure offerte\u00a0» ne les couvre pas et ne les réduit pas.",
    /* {offer} de la réponse sur les frais, même condition. */
    feesOffer: "La première heure offerte ne les couvre jamais.",
    /* La réponse sur les frais ({fees}), quand aucun quartier desservi n'en a. */
    feesFree: "Rien\u00a0: les quartiers de Montréal desservis n'ont pas de frais de déplacement.",
    faqTitle: "Questions sur Montréal",
    faq: [
      {
        q: "Dans quel délai puis-je obtenir un rendez-vous\u202f?",
        a: "Les créneaux en ligne s'ouvrent à partir de {lead} à l'avance, et jusqu'à {horizon}. Vous choisissez votre heure dans le formulaire, et la confirmation part aussitôt par courriel.",
      },
      {
        q: "Combien coûtent les frais de déplacement à Montréal\u202f?",
        a: "{fees} Ils s'appliquent à chaque visite et s'ajoutent au prix de la séance.{offer}",
      },
      {
        q: "Que dois-je fournir\u202f?",
        a: "Une prise électrique et environ deux mètres carrés dégagés. Rien d'autre\u00a0: table active, générateur de vapeur, pattemouilles et cintres arrivent avec l'artisan. Précisez dans la réservation l'accès à l'immeuble et le stationnement.",
      },
    ],
    link: "Repassage à domicile à Montréal\u00a0: quartiers desservis et conditions",
    cta: "Réserver une séance",
  },
  zoneCheck: {
    label: "Votre code postal",
    placeholder: "J4K 1A1",
    check: "Vérifier",
    checking: "Vérification…",
    served: "Votre adresse est desservie.",
    servedWithFee: "Desservie, avec des frais de déplacement de {fee} par visite ({long} pour une séance de {hours} ou plus).",
    servedWithFlatFee: "Desservie, avec des frais de déplacement de {fee} par visite.",
    tooFar: "Hors zone pour la réservation en ligne, appelez-nous au {phone}.",
    error: "La vérification n'a pas abouti. Réessayez, ou appelez-nous au",
  },
  booking: {
    title: "Réserver une séance",
    lede: "Quatre étapes, deux minutes. Vous choisissez votre heure, la confirmation part aussitôt.",
    steps: ["Prestations", "Adresse", "Créneau", "Confirmation"],
    progress: "Progression",
    step1: {
      title: "Que devons-nous traiter\u202f?",
      hint: "Sélectionnez ce qui vous concerne, ajustez les quantités. L'estimation se met à jour toute seule.",
      qty: "Quantité",
      less: "Diminuer la quantité",
      more: "Augmenter la quantité",
      estimate: "Estimation",
      duration: "Durée estimée",
      /* {ironing} : la durée, moins l'installation et le rangement. */
      ironing: "dont {ironing} de repassage",
      price: "Montant estimé",
      hours: "h",
      minutes: "min",
      empty: "Sélectionnez au moins une prestation pour continuer.",
      firstFreeApplied: "Première heure offerte appliquée",
      /* Le navigateur ne sait pas si le client a déjà réservé : seul le
         serveur le lit. Le montant offert reste donc une éventualité. */
      firstFreeIfFirst: "Première réservation\u00a0: {amount}, première heure offerte",
      notes: "Précisions (optionnel)",
      notesPlaceholder: "Pièces fragiles, accès à l'immeuble, animal à la maison, stationnement…",
    },
    step2: {
      title: "Où vous rejoignons-nous\u202f?",
      name: "Nom complet",
      email: "Courriel",
      phone: "Téléphone",
      address: "Adresse",
      addressPlaceholder: "123 rue Principale, app. 4",
      city: "Ville",
      postal: "Code postal",
      postalPlaceholder: "J4K 1A1",
      outOfZone:
        "Cette adresse se trouve hors de notre zone pour la réservation en ligne. Appelez-nous, nous verrons volontiers ensemble ce qui est possible\u00a0:",
      checking: "Vérification de la zone…",
      travelFree: "Votre adresse est desservie, déplacement compris.",
      inZone: "Parfait, vous êtes dans la zone desservie.",
      travelFee: "Frais de déplacement",
      travelNote: "Ces frais s'ajoutent au prix de la séance.",
      travelNoteOffer: "L'offre «\u00a0première heure offerte\u00a0» ne les couvre pas et ne les réduit pas.",
      heardFrom: "Comment avez-vous connu NIVEX\u202f? (facultatif)",
      heardFromEmpty: "Je préfère ne pas le dire",
      heardFromOptions: {
        "porte-a-porte": "Une visite à ma porte ou une carte de NIVEX",
        "recommandation": "La recommandation d'un proche",
        "facebook": "Facebook",
        "instagram": "Instagram",
        "linkedin": "LinkedIn",
        "google": "Une recherche Google",
        "assistant-ia": "Un assistant IA (ChatGPT ou autre)",
        "autre": "Autre",
      },
      referredBy: "Qui vous a recommandé\u202f? (facultatif)",
    },
    step3: {
      title: "Quand vous conviendrait-il\u202f?",
      hint: "Seules les heures libres sont proposées\u202f; un jour grisé est complet ou fermé.",
      loading: "Lecture de l'horaire…",
      noneInRange: "Aucune heure libre sur ces deux semaines. Essayez d'autres dates, ou appelez-nous\u00a0:",
      horizon: "La réservation en ligne porte sur les {n} prochains jours. Pour une date plus lointaine, appelez-nous\u00a0:",
      prevDays: "Quinzaine précédente",
      nextDays: "Quinzaine suivante",
      morning: "Matin",
      afternoon: "Après-midi",
      evening: "Soirée",
      timezone: "Fuseau\u00a0: heure de l'Est (Montréal).",
      durationLine: "Durée estimée\u00a0: {duration}",
      /* {duration} et {ironing} : la séance estimée, et son temps de repassage. */
      setup:
        `Votre artisan arrive à l'heure du début. Votre séance de {duration} inclut l'installation et le rangement de notre matériel, ${INSTALL_MINUTES} minutes chacun\u00a0: {ironing} de repassage.`,
      comment: "Commentaire libre (facultatif)",
      commentPlaceholder: "Une contrainte d'horaire, une heure à éviter, un accès particulier…",
    },
    step4: {
      title: "Tout est exact\u202f?",
      when: "Rendez-vous",
      where: "Adresse",
      what: "Prestations",
      who: "Coordonnées",
      total: "Estimation",
      travelFee: "Frais de déplacement",
      travelHint: "Non couverts par la première heure offerte",
      grandTotal: "Total estimé",
      consent:
        "Je comprends que l'estimation est indicative et que le montant final sera confirmé sur place avant le début de la séance.",
      submit: "Confirmer la réservation",
      submitting: "Confirmation en cours…",
    },
    /* Ce que la politique de confidentialité et les conditions annoncent
       « en réservant » : dit ici, au moment où les coordonnées sont données,
       avec la date de leur dernière révision. Commun aux deux tunnels. */
    legal: {
      data: "Vos coordonnées servent à vos rendez-vous\u00a0: la confirmation, les rappels et tout changement vous parviennent par courriel ou par texto. Elles sont conservées hors du Québec, chez les fournisseurs nommés dans la politique de confidentialité.",
      accept: "J'accepte les {terms} et la {privacy}, révisées le {date}.",
      terms: "conditions d'utilisation",
      privacy: "politique de confidentialité",
      newTab: "nouvel onglet",
    },
    back: "Retour",
    next: "Continuer",
    success: {
      title: "C'est confirmé.",
      body: "Votre rendez-vous est pris. Un courriel de confirmation vient de partir, avec l'invitation pour votre agenda\u202f; votre artisan a été prévenu.",
      bodyNoEmail: "Votre rendez-vous est pris et votre artisan a été prévenu. Le courriel de confirmation n'a pas pu partir — notez votre référence, elle suffit.",
      wanted: "Rendez-vous",
      ref: "Référence",
      manage: "Gérer ma réservation",
      home: "Retour à l'accueil",
    },
    errors: {
      taken: "Ce créneau vient d'être pris. Choisissez-en un autre.",
      stale: "Cette heure n'est plus disponible. Choisissez-en une autre.",
      paused: `La prise de rendez-vous est momentanément suspendue. Appelez-nous au ${PHONE}, nous vous trouvons une place.`,
      tooMany: `Cette réservation ne peut pas être prise en ligne pour l'instant. Appelez-nous au ${PHONE}\u00a0: nous la poserons avec vous.`,
      generic: "Une erreur est survenue. Réessayez, ou appelez-nous directement.",
      required: "Ce champ est requis",
      email: "Courriel invalide",
      phone: "Numéro invalide",
      postal: "Code postal invalide (ex. J4K 1A1)",
      outOfArea: `Cette adresse est hors de notre zone de déplacement. Appelez-nous au ${PHONE}, nous verrons ensemble ce qui est possible.`,
      fields: "Vérifiez ces renseignements\u00a0: {fields}.",
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
    cancelConfirm: "Annuler définitivement ce rendez-vous\u202f?",
    cancelled: "Votre réservation a été annulée. Votre artisan en a été informé.",
    tooLate: `Ce rendez-vous a lieu dans moins de ${CANCEL_WINDOW_HOURS} h. Appelez-nous au ${PHONE}.`,
    notFound: "Réservation introuvable. Vérifiez le lien reçu par courriel.",
    rebook: "Prendre un nouveau rendez-vous",
  },
  optOut: {
    title: "Ne pas compter ce navigateur",
    done: "Ce navigateur n'est plus compté.",
    body: "Vos passages sur le site depuis ce navigateur ne sont plus envoyés, ni au journal des visites, ni à la mesure de fréquentation de l'hébergeur. Ouvrez ce même lien une fois dans chaque autre navigateur que vous utilisez\u00a0: Safari, Chrome, le navigateur intégré de Facebook ou d'Instagram, l'ordinateur.",
    refused: "Ce navigateur refuse de garder le marqueur, sans doute parce qu'il est en navigation privée. Ouvrez le lien dans une fenêtre ordinaire.",
    back: "Retour à l'accueil",
  },
  /* La page d'une adresse qui ne mène nulle part : faute de frappe, vieux
     lien partagé, code QR mal recopié. */
  notFound: {
    metaTitle: "Page introuvable",
    title: "Cette page a pris le pli.",
    body: "Elle n'existe pas, ou plus. Revenons à quelque chose de bien repassé.",
    home: "Retour à l'accueil",
  },
  subscribe: {
    title: "S'abonner",
    lede: "Vous choisissez une seule fois votre formule, votre jour et votre heure. Les visites se suivent ensuite au rythme de la formule, et chaque créneau vous est réservé.",
    steps: ["Formule", "Adresse", "Créneau", "Confirmation"],
    plan: {
      title: "Quelle formule\u202f?",
      hint: "Un cycle correspond aux visites de la formule réellement effectuées. Il se règle à sa première visite, sur place.",
      perCycle: "/ cycle",
      /* Lu seulement par les lecteurs d'écran, devant le prix barré. */
      insteadOf: "au lieu de",
      visits: "{n} × {duration}",
      noFirstHour: "L'offre «\u00a0première heure offerte\u00a0» ne s'applique pas aux abonnements.",
    },
    address: {
      title: "Où vous rejoignons-nous\u202f?",
      travelReduced: "Frais de déplacement, tarif abonné\u00a0: {fee} par visite, au lieu de {full}.",
      travelZero: "Pour un abonné, les frais de déplacement de votre zone tombent à zéro.",
      cycleTotal: "Total d'un cycle, frais compris\u00a0: {total}.",
    },
    slot: {
      title: "Votre première visite",
      hint: "Choisissez la date et l'heure de la première visite. Les suivantes tomberont le même jour, à la même heure, {rhythm}.",
      checking: "Vérification des {n} dates de la série…",
      free: "Les {n} dates de la série sont libres.",
      showDates: "Voir les dates",
      hideDates: "Masquer les dates",
      conflicts: "Ce créneau ne tient pas sur toute la série. Ces dates posent problème\u00a0:",
      reasons: { busy: "déjà réservée", closed: "hors de notre horaire", lead: "trop proche", invalid: "date invalide" },
      alternatives: "Ces créneaux sont libres sur toute la série\u00a0:",
      noAlternative: `Aucun autre créneau des deux semaines suivantes ne tient sur toute la série. Choisissez une autre heure, ou appelez-nous au ${PHONE}.`,
      failed: "La vérification n'a pas abouti. Réessayez dans un instant.",
    },
    confirm: {
      title: "Tout est exact\u202f?",
      plan: "Formule",
      rhythm: "Rythme",
      first: "Première visite",
      series: "Visites réservées",
      seriesValue: "{n} visites, jusqu'au {last}",
      cycle: "Formule, par cycle",
      travel: "Frais de déplacement du cycle",
      total: "Total d'un cycle",
      payment: "Le cycle se règle à sa première visite, sur place\u00a0: comptant, virement Interac ou carte. Rien n'est payé en ligne.",
      rule: "Chaque visite s'annule ou se déplace sans frais jusqu'à 23 h 59 la veille, depuis le lien reçu par courriel. Une visite annulée ne compte pas\u00a0: elle est ajoutée en fin de série.",
      consent: "J'ai lu ces modalités. Je comprends qu'un cycle correspond aux visites effectuées, et qu'il se règle à sa première visite.",
      submit: "Confirmer l'abonnement",
      submitting: "Confirmation en cours…",
    },
    success: {
      title: "Votre abonnement est en place.",
      body: "Vos visites sont réservées. La confirmation vient de partir par courriel, avec le lien pour gérer chaque visite.",
      bodyNoEmail: "Vos visites sont réservées. Le courriel de confirmation n'a pas pu partir\u00a0: notez votre référence et gardez le lien ci-dessous.",
      first: "Première visite",
      ref: "Référence",
      manage: "Gérer mes visites",
    },
    errors: {
      conflicts: "Une date de la série vient d'être prise. Choisissez un autre créneau.",
      tooMany: `Cet abonnement ne peut pas être pris en ligne. Appelez-nous au ${PHONE}\u00a0: nous le poserons avec vous.`,
    },
  },
  subManage: {
    title: "Votre abonnement",
    status: { active: "En cours", ended: "Terminé" },
    cycleLabel: "Cycle en cours",
    cycleNow: "Cycle {c} — {d}/{n} visites faites",
    amount: "Montant d'un cycle",
    payment: "Le cycle se règle à sa première visite, sur place.",
    rhythm: "Rythme",
    upcoming: "Vos prochaines visites",
    rank: "Visite {i}/{n} · cycle {c}",
    makeup: "Remplacement",
    cancelledTag: "Annulée",
    move: "Déplacer",
    cancel: "Annuler",
    cancelConfirm: "Annuler cette visite\u202f? Elle ne comptera pas dans votre cycle, et une visite sera ajoutée en fin de série.",
    moveTitle: "Choisissez la nouvelle heure",
    moveConfirm: "Déplacer cette visite au {when}\u202f?",
    keep: "Garder",
    confirmMove: "Déplacer",
    tooLate: "Le délai en ligne est passé (23 h 59 la veille). Pour cette visite, appelez-nous\u00a0:",
    rule: "Chaque visite s'annule ou se déplace sans frais jusqu'à 23 h 59 la veille.",
    ended: "Cet abonnement a pris fin.",
    notFound: "Abonnement introuvable. Vérifiez le lien reçu par courriel.",
    replaced: "Visite annulée. Elle est remplacée le {when}.",
    replacedNone: "Visite annulée. Nous vous appellerons pour la replacer en fin de série.",
    moved: "Visite déplacée.",
    done: "{n} visites déjà effectuées.",
    doneOne: "Une visite déjà effectuée.",
    errors: {
      tooLate: "Le délai est passé. Appelez-nous pour toute modification.",
      taken: "Ce créneau vient d'être pris. Choisissez-en un autre.",
      tooMany: `Plusieurs changements ont déjà été faits aujourd'hui. Pour un autre, appelez-nous au ${PHONE}.`,
    },
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
  contact: {
    eyebrow: "Nous écrire",
    title: "Une question avant de réserver\u202f?",
    lede:
      "Une pièce dont vous n'êtes pas sûr, un horaire particulier, un devis pour un lot important\u00a0: écrivez-nous. Vous recevez une réponse le jour même.",
    name: "Votre nom",
    email: "Votre courriel",
    phone: "Téléphone (optionnel)",
    subject: "Objet (optionnel)",
    subjectPlaceholder: "Devis pour un lot de chemises",
    message: "Votre message",
    messagePlaceholder: "Dites-nous ce dont vous avez besoin…",
    submit: "Envoyer le message",
    submitting: "Envoi en cours…",
    /* Ce que la politique annonce « en nous écrivant par le site » : dit au moment d'écrire. */
    privacyNote: "Votre message et vos coordonnées servent seulement à vous répondre, comme le décrit notre {privacy}.",
    privacyLink: "politique de confidentialité",
    successTitle: "Message envoyé.",
    successBody:
      "Un accusé de réception vient de partir vers votre boîte. Nous vous répondons en général dans la journée.",
    /* Quand l'accusé n'a pas pu partir : le message est là, rien d'autre à attendre. */
    successBodyNoEmail:
      "Votre message est bien enregistré. Nous vous répondons en général dans la journée.",
    another: "Écrire un autre message",
    orCall: "Ou parlez-nous directement",
    phoneLabel: "Téléphone",
    emailLabel: "Courriel",
    hoursLabel: "Disponible",
    hoursValue: "{hours}",
    from: "du",
    to: "au",
    errors: {
      required: "Ce champ est requis",
      email: "Courriel invalide",
      short: "Quelques mots de plus, s'il vous plaît",
      rate: "Vous venez de nous écrire. Laissez-nous quelques minutes pour vous répondre.",
      unavailable:
        `L'envoi ne fonctionne pas pour l'instant. Appelez-nous au ${PHONE} — nous décrochons.`,
      generic: "L'envoi a échoué. Réessayez, ou appelez-nous directement.",
    },
  },
  legal: {
    updatedLabel: "Dernière mise à jour",
    summary: "Sommaire",
    readAlso: "À lire aussi",
    /* {suboffer} des conditions : seulement quand l'artisan propose l'offre. */
    subOffer: "L'offre «\u00a0première heure offerte\u00a0» ne s'applique pas aux abonnements.",
    privacy,
    terms,
  },
  tarifs: {
    eyebrow: "Tarification",
    title: "Ce qu'une séance chez vous représente.",
    lede:
      "Nous ne vendons pas «\u00a0du repassage\u00a0»\u00a0: nous vendons une cadence mesurée, la même d'une séance à l'autre. Voici ce qu'elle vaut, ce qu'elle traite, et ce qui la sépare d'un coup de main.",
    /* {min} : la plus courte séance proposée, celle que coûte {price}. */
    headline: "La séance de {min} — {price}",
    /* {travel} : inclus seulement si aucune zone desservie n'a de frais. */
    visitNote: "minimum {min} par déplacement · {travel}",
    travelIncluded: "déplacement inclus",
    travelVaries: "frais de déplacement selon le secteur",
    /* Ce que contient une séance : sa capacité et son déroulement, écrits
       depuis `capacity`, puis les pièces que nous traitons. */
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
      title: "Abonnements",
      lede: "Un service régulier, et un montant qui baisse à mesure que les séances s'ajoutent.",
      perMonth: "/ cycle",
      cycleNote: "Un cycle correspond aux visites de la formule réellement effectuées, soit environ quatre semaines. Il se règle à sa première visite, sur place.",
      cta: "S'abonner",
      /* Devant le prix à la carte, barré. */
      insteadOf: "au lieu de",
      perks: [
        `L'heure à ${HOURLY_DISCOUNT} de moins qu'une séance à la carte, garantie à la souscription.`,
        "Vos créneaux vous sont réservés\u00a0: le même jour, à la même heure, toute l'année.",
        "Une visite s'annule ou se déplace sans frais jusqu'à 23 h 59 la veille. Elle ne compte pas, et s'ajoute en fin de série.",
        "Amidon léger sur cols et poignets, inclus sans supplément.",
        `Frais de déplacement réduits de ${DISCOUNT} par visite.`,
        `Tarif garanti douze mois, soit ${TERM_SERIES} séries de ${SERIES_CYCLES} cycles.`,
      ],
    },
    terms: {
      title: "Ce qui vaut pour toutes les séances",
      items: [
        { dt: "Temps tenu", dd: `Chaque séance inclut l'installation et le rangement de notre matériel, ${INSTALL_MINUTES} minutes chacun\u00a0; le reste du temps réservé est du repassage. S'il est écourté de notre fait, le temps manquant ne vous est pas facturé.` },
        { dt: "Estimation et montant final", dd: "L'estimation est indicative. Le montant final suit le temps réellement passé et vous est confirmé sur place, avant de commencer." },
        { dt: "Paiement", dd: "Sur place, à la fin de la séance\u00a0: comptant, virement Interac ou carte. Aucun prépaiement à la réservation." },
        { dt: "Ce qu'il nous faut chez vous", dd: "Une prise électrique et environ deux mètres carrés dégagés. Rien d'autre\u00a0: le matériel professionnel arrive avec l'artisan." },
      ],
      travel: "Frais de déplacement",
      travelFree: "Sans frais de déplacement",
      travelFlat: "{fee} par visite",
      travelShort: "{fee} pour une séance de moins de {hours}",
      travelLong: "{fee} pour une séance de {hours} ou plus",
      travelNote: `Les frais dépendent de la zone et de la durée de la séance. Ils s'ajoutent au prix et s'appliquent à chaque visite\u202f; pour un abonné, ils sont réduits de ${DISCOUNT} par visite, sans descendre sous zéro, et se règlent avec le cycle.`,
      travelNoteOffer: "L'offre «\u00a0première heure offerte\u00a0» ne les couvre pas et ne les réduit jamais.",
    },
    firstFreeLabel: "Première séance",
    /* Lu seulement par les lecteurs d'écran, devant le prix barré. */
    insteadOf: "au lieu de",
    cta: {
      title: "Composez votre séance.",
      body: "Le tunnel de réservation reprend exactement ces chiffres\u00a0: vous cochez vos prestations, il calcule la durée et le montant, et confirme l'heure que vous choisissez.",
    },
  },
  beforeAfter: {
    eyebrow: "Le résultat",
    title: "Avant, après",
    lede: "Repassé sur place, remis sur cintre de bois.",
    labels: { before: "Avant", after: "Après" },
    banner: "Vos vêtements, prêts à porter.",
    bannerAlt: "Vêtements repassés par NIVEX, suspendus sur des cintres de bois",
    items: [
      { key: "chemise", name: "Chemise blanche",
        altBefore: "Chemise blanche avant repassage",
        altAfter: "Chemise blanche après repassage" },
      { key: "pantalon", name: "Pantalon de complet",
        altBefore: "Pantalon de complet avant repassage",
        altAfter: "Pantalon de complet après repassage" },
      { key: "t-shirt", name: "T-shirt en coton",
        altBefore: "T-shirt en coton avant repassage",
        altAfter: "T-shirt en coton après repassage" },
      { key: "veste", name: "Veste doublée",
        altBefore: "Veste doublée avant repassage",
        altAfter: "Veste doublée après repassage" },
      { key: "velours", name: "Pantalon de velours",
        altBefore: "Pantalon de velours avant repassage",
        altAfter: "Pantalon de velours après repassage" },
    ],
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
      "Le poste de travail NIVEX\u00a0: centrale vapeur, fer, jeannette et cintres de bois, installés chez le client",
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

@AGENTS.md

# La maison NIVEX

Repassage à domicile de prestige, à Longueuil et sur la Rive-Sud. Site en
production sur `www.nivexrepassage.ca` (le domaine sans www y redirige en
308, réglage de domaine chez Vercel), déployé depuis la branche `main` par
Vercel. Base Neon, compte Google de l'artisan branché pour l'agenda et les
courriels.

Ce qui suit est la charte réelle, relevée dans le code. Elle ne ressemble
pas forcément à ce qu'on imagine pour une marque de prestige — n'inventez
ni couleur ni police, même de bonne foi.

## Couleurs et polices

Tout vient de `@theme` dans `src/app/globals.css`. Les classes Tailwind
existent déjà : `bg-linen-100`, `text-ink-800`, `border-gold-300`.

| Rôle | Jeton | Valeur |
|---|---|---|
| Fond de page | `linen-100` | `#FBF8F2` |
| Papier, cartes | `linen-50` | `#FEFDFB` |
| Or, graphiques et filets | `gold-500` | `#A7864B` |
| Or, texte (≥ 4,5:1) | `gold-600` | `#866836` |
| Encre, titres et corps | `ink-800` | `#1F1B16` |

L'encre est un **noir chaud**, jamais bleuté : aucun marine nulle part.

Titres : **Cormorant Garamond** (`font-display`). Texte : **Jost**
(`font-sans`). Les deux sont servies depuis le domaine, via
`src/lib/fonts.ts` — n'ajoutez pas de police Google à la volée.

Le site est en lumière seulement : `color-scheme: only light`. C'est la
seule formulation qui empêche Chrome d'inverser les couleurs tout seul ;
`light` ne suffit pas.

## Le ton

Calme, sobre, sans esbroufe. **Aucun émoji, aucun point d'exclamation.**
On vend une cadence tenue, pas de l'enthousiasme.

Tout est bilingue. Le français fait foi — `Dict = typeof fr` —, l'anglais
le suit. Une clé ajoutée d'un côté doit l'être de l'autre, sinon la
compilation échoue.

## Ce qui ne s'écrit jamais en dur

Les chiffres visibles par le client se déduisent des réglages, jamais
d'une constante dans un texte. La règle s'est payée plusieurs fois : une
page qui récite de mémoire finit par contredire le moteur.

- **Prix** : depuis `settings.hourlyRate`, via `src/lib/pricing.ts` — un
  cycle d'abonnement par `planCents`, la séance d'essai par
  `sessionLength` et `sessionPriceCents`. Seuls les prix à la pièce
  (`UNIT_PRICES`) sont des constantes : ils ne suivent pas le taux.
- **Capacité** (pièces par séance) : `capacityPieces(minutes)`, depuis
  `PIECES_PER_HOUR`, mis en phrases par `lib/capacity.ts`. C'est le **seul**
  chiffre de quantité affiché : aucune page ne cite plus de pièces à l'heure
  par prestation. Il s'accompagne toujours de « selon la taille, le type et
  la matière des vêtements » (`capacity.caveat`).
- **Horaire d'ouverture** : déduit de `settings.hours`, jours ouverts
  compris.
- **Délais** : `CANCEL_WINDOW_HOURS`, `FIRST_FREE_MIN_MINUTES`,
  `INSTALL_MINUTES`, `PACKUP_MINUTES`, `EARLY_ARRIVAL_MINUTES`,
  `SOON_TEXT_MINUTES` dans `src/lib/brand.ts`.

Les prestations et les réglages vivent **en base**, et la base l'emporte
sur les valeurs par défaut du code. Changer `DEFAULT_SERVICES` ne suffit
donc pas en production : il faut aussi enregistrer depuis `/admin`.

L'artisan peut **ajouter des prestations** depuis Réglages (clé `p-…`) et les
retirer. Celles du code, elles, ne se retirent pas : `mergeServices` les
ramènerait au prochain chargement ; elles se désactivent.

## Quelques faits que le texte doit respecter

- Une séance dure **au minimum deux heures**. Il n'existe pas de séance
  d'une heure, et la vitrine ne doit pas en proposer. Les réglages ne
  descendent pas sous `MIN_SESSION_MINUTES`, ni à l'enregistrement ni à la
  lecture.
- L'artisan arrive **à l'heure du début**. L'installation et le rangement
  du matériel, cinq minutes chacun (`INSTALL_MINUTES`, `PACKUP_MINUTES`), se
  font **dans** la séance : 2 h réservées, 1 h 50 de repassage. La durée
  calculée ajoute ces dix minutes au temps de repassage du panier
  (`sessionMinutes`). Décidé le 22 octobre 2026 ; avant, l'artisan arrivait
  quinze minutes avant et le bloc était entièrement du repassage. Les
  rendez-vous pris avant gardent l'ancien déroulement (`setup_minutes`,
  plus bas).
- Une séance traite **jusqu'à 18 pièces en 2 h, 27 en 3 h**, selon la
  taille, le type et la matière des vêtements. Aucune autre estimation de
  quantité ne s'écrit.
- **Rien ne quitte le domicile** : pas de collecte, pas de livraison.
- **Le client prévoit la planche à repasser**, une prise et environ deux
  mètres carrés ; l'artisan apporte tout le reste (générateur de vapeur,
  fer, pattemouilles, cintres). Le texto de confirmation le rappelle.
- La première heure est offerte à partir de deux heures réservées, une
  fois par client, jamais sur les abonnements.
- **Le site ne vend que trois choses** (depuis le 23 octobre 2026) : les
  quatre abonnements, la séance d'essai de deux heures et les pièces à
  l'unité. Une heure de plus se décide sur place, au taux horaire. Les
  anciennes séances de trois et quatre heures, les forfaits et les ajouts
  ne paraissent plus nulle part.

## Comment le site est fait

Next.js 16 (App Router), Tailwind v4, Postgres chez Neon par HTTP, le tout
sur Vercel. Pas de framework de composants, pas d'ORM : les requêtes sont
écrites à la main, et c'est voulu.

Deux langues sous `src/app/[locale]/` — `fr` et `en`, le français par
défaut. Tout texte visible passe par `src/lib/i18n/`.

**Deux racines, pas de layout au sommet** : `app/[locale]/layout.tsx` pour la
vitrine, `app/admin/layout.tsx` pour l'espace artisan. `<html lang>` se déduit
du segment de langue. Les pages publiques (accueil, Tarifs, Montréal,
conditions, confidentialité) sont préparées à la construction et se
régénèrent toutes les cinq minutes (`revalidate = 300`) ; les routes qui
enregistrent les réglages et les zones appellent `revalidatePath` pour que
le changement paraisse tout de suite. **Un `headers()` ou un `cookies()`
dans l'arbre de `[locale]`, ou dans un composant serveur qu'il rend, remet
tout le site en rendu dynamique** — c'était le cas jusqu'au 19 octobre 2026.
Un `useSearchParams` dans une page préparée doit vivre sous `<Suspense>`.
Conséquence à connaître : `next build` lit les réglages et pose le schéma
(`bootstrap()`) au moment de la construction, contre la base de
l'environnement construit.

Ces pages lisent les réglages par `getSettingsStrict`, jamais par la lecture
tolérante : une régénération qui échoue laisse servir la dernière page
réussie, alors qu'une lecture tolérante y figerait les tarifs et l'horaire
du code. Une base injoignable pendant `next build` fait donc échouer la
construction, et la production reste telle quelle. La lecture se fait une
fois par rendu (`cache` de React) : la racine et la page partagent la même
ligne, ou la même panne.

Une adresse inconnue sous `/fr` ou `/en` tombe sur `[locale]/[...missing]`,
qui rend la page 404 de la maison, traduite (son HTML serveur est la coquille
d'erreur de Next ; le texte paraît avec le JavaScript, le statut est bien
404). Toute autre « langue » — `/foo.png`, `/api` — est refusée par
`dynamicParams = false` dans la racine, sans rendu ni cache. En local,
`next start` inscrit alors une `NoFallbackError` interne au journal pour
chacune : c'est ce 404 attendu, pas une panne.

### Les modules qui décident

| Fichier | Ce qu'il tranche |
|---|---|
| `lib/settings.ts` | Les réglages, lus en base, avec les valeurs par défaut du code |
| `lib/availability.ts` | Les créneaux libres, la durée et le prix d'une séance |
| `lib/bookings.ts` | La création d'un rendez-vous — c'est **lui** qui engage la maison |
| `lib/travel.ts` | Les secteurs et les zones, les frais de déplacement, le texte de la zone desservie, les conflits de préfixes |
| `lib/pricing.ts` | La grille publiée : blocs, forfaits, abonnements |
| `lib/cycles.ts` | Le calendrier d'un abonnement, en fonctions pures : dates, rang des visites, montant d'un cycle, délai de la veille |
| `lib/subscriptions.ts` | Les abonnements en base, dans l'agenda et par courriel ; la tâche quotidienne |
| `lib/attribution.ts` | D'où vient un client, la question qu'on lui pose, les familles de sources, les robots |
| `lib/visits.ts` | Le journal anonyme des pages vues |
| `lib/google.ts` | OAuth, agenda et Gmail, en `fetch` pur |
| `lib/sms.ts` | Les textos par Twilio, et leurs messages |
| `lib/seo.ts` | Ce que lisent les moteurs et les assistants : en-tête de chaque page (titre, description, canonique, hreflang), fiche LocalBusiness, site, FAQ structurée |
| `lib/i18n/seo.ts` | Le titre et la description de chaque page, dans les deux langues, hors des dictionnaires |
| `lib/pages.ts` | Les pages publiques et la date de leur dernière modification : plan du site et IndexNow |
| `lib/indexnow.ts` | Ce qui est signalé à IndexNow (Bing et les autres), et quand |
| `lib/brand.ts` | Les constantes de la maison, sans aucune dépendance (dont le courriel public `CONTACT_EMAIL`) |
| `lib/services.ts` | Les prestations par défaut et leurs types, sans dépendance : l'admin les importe sans tirer le pilote de base dans le navigateur |
| `lib/retention.ts` | Les durées de conservation promises par la politique, tenues par la tâche quotidienne |
| `lib/items.ts` | Les lignes d'une réservation (séance, pièces à l'unité, ancien panier) et l'estimation en fourchette, sans dépendance |
| `lib/llms.ts` | Les fichiers `/llms.txt` (court) et `/llms-full.txt` (détaillé), écrits depuis les réglages et les dictionnaires |

Les tables : `nivex_settings` (une seule ligne), `nivex_bookings`,
`nivex_subscriptions`, `nivex_messages`, `nivex_visits`, `nivex_events`,
`nivex_zone_history`, `nivex_migrations`, `nivex_indexnow`. Le schéma se pose tout
seul au démarrage, dans `bootstrap()` de `lib/db.ts`, et doit rester
**idempotent** : il s'exécute à chaque instance froide.

Une migration de données qui ne doit passer qu'**une fois** s'inscrit dans
`nivex_migrations` : le nom s'insère et la mise à jour se fait dans la même
instruction (CTE `INSERT … ON CONFLICT DO NOTHING RETURNING`), si bien
qu'une seconde instance froide ne la rejoue jamais, même si l'artisan a
remis l'ancienne valeur entre-temps. `tarif-2026-55` a porté le taux de
50 $ à 55 $, seulement s'il valait encore 50 $. `zones-2026-ab` a ramené
la grille à deux zones (plus bas, « Zones et frais de déplacement »).

### La vitrine, et ce qui en a été retiré

L'accueil suit l'ordre du 23 octobre 2026, deux fois plus court qu'avant :
héros, déroulement, prestations (cinq cartes d'une phrase, puis les photos
de la galerie sans légende), avant/après (la chemise blanche et le pantalon
de complet), tarifs (les quatre abonnements et
la séance d'essai en une ligne), l'histoire en version courte, sept
questions, puis Nous écrire et le bandeau de la première heure. Le menu suit
les sections de la page, « Tarifs » compris (`#tarifs`) ; la grille complète
reste à un clic, et au pied de chaque page.

La page Tarifs tient dans cet ordre : abonnements, séance d'essai, pièces à
l'unité, frais de déplacement par zone (avec la vérification du code
postal, puis, pour chaque zone payante, le coût d'un cycle de chaque
abonnement : « Exécutif : 400 $ + 60 $ de déplacement, soit 4 visites ×
15 $ », `cycleTravel`), première heure offerte, cinq conditions au plus.

**Rien de retiré n'est effacé : c'est masqué, pour pouvoir le remettre.**
- Les séances, les forfaits, les ajouts, le contenu d'une séance et la
  comparaison avec le repassage de ménage : drapeaux de `PUBLISHED`
  (`lib/pricing.ts`), rendus par `RetiredSections` quand on les rallume.
- Le ruban (`Marquee`), le protocole (`Protocol`) et la galerie en section
  (`Gallery`) : composants gardés, simplement plus rendus par
  `app/[locale]/page.tsx`.
- Leurs textes, et tous les autres textes retirés (les trois questions, les
  six anciennes cartes, les chapitres de l'histoire, les paires avant/après
  du pantalon de velours, du t-shirt et de la veste doublée, les anciennes
  offres), vivent dans `lib/i18n/retired.ts`, **jamais dans
  les dictionnaires** : un dictionnaire part en entier vers les composants
  clients de la page (questions, contact, tunnels), et ce qui y dort se lit
  dans la source HTML — là où un assistant le trouverait. Un test y veille.
- Le pantalon de velours paraissait aussi sur la photo du bandeau et sur
  l'image de partage : `bandeau-chemises-16x9.jpg` et
  `app/opengraph-image.jpg` sont recadrés sur les pièces blanches, la photo
  d'origine reste dans `public/images/avant-apres/`.

### L'espace artisan

`/admin`, derrière une session Google. Sept onglets : Rendez-vous,
Abonnés, Messages, Visites, Réglages, Zones et frais, Connexion. Presque
tout ce qui est commercial s'y règle — tarifs, horaire, prestations,
secteurs, zones et frais.

### Les adresses courriel

Le site affiche partout `contact@nivexrepassage.ca` (`CONTACT_EMAIL`) : pied
de page, Contact, documents légaux, fiche LocalBusiness, adresse de réponse
des courriels aux clients. Cette adresse ne reçoit rien elle-même : ImprovMX
la renvoie vers le Gmail de l'artisan (enregistrements MX et SPF dans la zone
DNS d'OVH, où le domaine est acheté). Les courriels partent toujours du compte
Google branché ; les avis internes vont à `REQUEST_INBOX`.

L'accusé de réception du formulaire de contact est un **texte fixe** — ni le
nom ni le message de l'expéditeur — et il est plafonné à `ACK_DAILY_CAP` par
jour : sans cela, le formulaire servait à envoyer n'importe quel texte,
depuis le Gmail de l'artisan, à n'importe quelle adresse. Le nom d'un
destinataire passe par `displayName`, qui l'encode : une virgule ou des
chevrons ne peuvent plus ajouter d'adresse. Un message se supprime depuis
l'onglet Messages, sur demande de son auteur.

## Le tunnel de réservation

Quatre étapes : formule, adresse, créneau, confirmation. La première ne
propose que la séance d'essai et les quatre abonnements ; un abonnement
passe la main à `/abonnement?formule=…`. La séance dure la durée minimale
réglée (`sessionLength`), sans panier : le client ne choisit jamais une
durée. Les pièces à l'unité s'y ajoutent en option, à leur prix de grille,
sans l'allonger.

**Le navigateur ne décide de rien.** Il calcule une estimation pour
l'afficher, mais `createBooking` recalcule tout — durée, prix, pièces
(`bookedUnits`, qui relit chaque clé contre la grille), zone, frais — à
partir des réglages en base. Un panier trafiqué ne donne pas un prix
trafiqué.

Une réservation garde ses lignes dans `items` : `session`, puis
`unit:<clé>` avec le prix figé. `estimate_cents` garde le bas de la
fourchette (heure offerte déduite de la séance seulement) ; le haut se
déduit des pièces au prix variable (`estimateRange`). Les rendez-vous d'avant
gardent les lignes de l'ancien panier (« Chemises × 13 ») et s'affichent
comme avant. Les prestations de Réglages ne servent plus au tunnel ; elles
restent, avec leurs durées, pour pouvoir les remettre.

Les gardes posées là, et pourquoi :

- La zone est **vérifiée à la création**, pas seulement affichée. Elle ne
  l'a pas toujours été : `inServiceArea` a passé des mois importée,
  ré-exportée, et jamais appelée. Une adresse de Gatineau s'inscrivait
  dans l'agenda comme une autre.
- Une contrainte d'exclusion Postgres interdit deux séances qui se
  chevauchent, temps hors séance compris. Elle passe par la fonction
  `IMMUTABLE` `nivex_occupied(starts_at, ends_at, setup_minutes)` : une
  contrainte d'exclusion indexe son expression, et un index refuse tout ce
  qui ne l'est pas.
- Seule la **mise en pause** ferme vraiment les réservations. Un compte
  Google injoignable ne doit pas fermer la maison : le rendez-vous
  s'écrit en base, l'agenda et les courriels suivent dès qu'ils peuvent.
  En pause, les pages `/reserver` et `/abonnement` montrent un avis et le
  téléphone au lieu du tunnel.
- **Le temps passé hors séance se lit rendez-vous par rendez-vous**
  (`setup_minutes`) : 0 pour toute réservation nouvelle, 15
  (`EARLY_ARRIVAL_MINUTES`) pour les rendez-vous d'avant le 22 octobre 2026
  et pour les abonnés à « arrivée 15 min avant ». Ces minutes s'ajoutent
  avant et après la ligne, dans le calcul des créneaux comme à l'écriture,
  et l'événement d'agenda commence à l'heure d'arrivée. La colonne vaut 15
  par défaut : une ancienne version encore servie pendant un déploiement
  n'écrit que des rendez-vous à l'ancien régime, jamais trop serrés.
  L'invitation et le courriel disent ce que contient la séance
  (`setupLine`) ou, à l'ancien régime, l'arrivée anticipée. L'onglet
  Rendez-vous montre les trois temps (`sessionPhases`) et le repassage
  effectif.
- **L'horizon et la grille sont tenus par le serveur**, pas seulement par
  le navigateur : pas de réservation au-delà de `horizonDays`.
- **La facturation suit le pas des créneaux** (`slotStep`, 30 min par
  défaut) : au-delà du minimum, la durée et le prix s'arrondissent à cette
  tranche, et les conditions le disent (`{step}`). Décidé par l'artisan le
  19 octobre 2026 ; ne pas revenir à « chaque heure entamée ».
- **Limites, sans adresse IP** : 3 réservations par courriel et par heure,
  3 séances à venir par numéro de téléphone, 12 nouvelles séances par heure
  pour tout le site. Au-delà, le client est invité à appeler. Les réglages
  sensibles (connexion Google, écriture des réglages, création d'un
  rendez-vous) se lisent par `getSettingsStrict` : une base muette les
  refuse au lieu de les croire aux valeurs du code.
- **Le pot de miel** des formulaires s'appelle `nivex_hp`. Ne lui donnez
  jamais un nom que le remplissage automatique des navigateurs connaît
  (`company`, `website`…) : un vrai client le remplirait sans le voir. Un
  champ rempli reçoit le refus « appelez-nous », jamais une fausse
  confirmation, et s'inscrit au journal (`honeypot`, sans aucune donnée).

## Les abonnements

Un « mois » d'abonnement n'est pas un mois civil : c'est un **cycle de
visites effectuées** — 4 (Exécutif, Grande Famille), 2 (Confort) ou 1
(Essentiel). Le client choisit une seule fois la formule, puis la date et
l'heure de la première visite ; les suivantes tombent le même jour, à la même
heure, au rythme de la formule (`everyWeeks` dans `PLANS`).

- **Une série = six cycles, douze mois = deux séries.** La première est posée
  d'un coup, toutes ses dates vérifiées avant la confirmation. La seconde est
  posée par l'artisan depuis l'onglet Abonnés, après le courriel qu'il reçoit
  `SERIES_NOTICE_DAYS` jours avant la dernière visite de la première.
- **Chaque visite est une ligne de `nivex_bookings`**, reliée par
  `subscription_id`. La contrainte d'exclusion la protège comme une séance.
  Rien de ce qui se calcule n'est stocké : rang, cycle en cours, fin des
  douze mois sortent de `viewSubscription`.
- **Le compteur avance par le bouton « visite effectuée »** (`done_at`), pas
  par l'heure. Une visite annulée ne compte pas : le cycle se prolonge, les
  rangs suivants se recalculent, et une visite de remplacement est posée sur
  la grille après la toute dernière date de la série.
- **Le montant d'un cycle** : les heures du cycle au taux horaire moins
  `SUBSCRIBER_HOURLY_DISCOUNT_CENTS` (5 $), arrondi à 5 $ (`planCents`). Le
  prix barré « au lieu de » est le même temps à la carte. Aucun pourcentage
  de remise ne s'écrit.
- **Le montant d'un cycle et les frais sont figés à la souscription** (tarif
  garanti douze mois). L'artisan peut corriger le montant d'un abonné
  (« Prix garanti », `setGuaranteedPrice`) et cocher « Arrivée 15 min
  avant » (`setEarlyArrival`) : ses visites à venir reprennent l'ancien
  déroulement, agenda et texto de deux heures avant décalés, ou rien ne
  change si une séance déjà posée y touche (`slot_taken`). Les frais : ceux
  de la zone pour la durée d'une visite, comme pour une séance, multipliés
  par les visites du cycle — en zone B, 15 $ par visite de 2 h (Confort,
  Exécutif), 10 $ par visite de 3 h (Essentiel, Grande Famille). Jusqu'au
  23 octobre 2026, un abonné payait 5 $ de moins par visite ; ceux d'avant
  gardent leurs frais figés. Le tout se paie à la première visite du cycle.
  Une visite d'abonné vaut `estimate_cents = 0` ; jamais de première heure
  offerte. L'artisan peut changer à la main les frais par visite d'un abonné
  (0 $, un autre montant, ou retour aux frais de sa zone) depuis l'onglet
  Abonnés : `setTravelFee`.
- **Délai : 23 h 59 la veille** (`changeDeadline`), lu en heure de Montréal.
  Les séances ponctuelles gardent `CANCEL_WINDOW_HOURS`, s'annulent en ligne
  et se déplacent par téléphone.
- **Limites** : un client déplace ou annule au plus
  `CLIENT_CHANGES_PER_VISIT` fois une visite et
  `CLIENT_CHANGES_PER_SUBSCRIPTION` fois par jour en tout. Le changement se
  réserve avant de se faire (`claimClientChange`) : des requêtes lancées
  d'un coup ne passent pas toutes. En ligne, un seul abonnement en cours (une
  visite encore à venir) par téléphone et par adresse, et
  `ONLINE_SUBSCRIPTIONS_PER_DAY` par jour pour tout le site. L'artisan n'a
  pas de limite. Pour déplacer, la page de l'abonné lit ses créneaux sur
  `/api/subscriptions/[token]/slots`, qui lève l'horizon pour une visite
  existante ; `moveVisit` revérifie cet horizon et la grille pour le client,
  et refuse une date passée à l'artisan. Un remplacement automatique ne
  tombe jamais avant le délai de prévenance.
- **Un cycle réglé garde son montant** (`paid_amounts`) : changer les frais
  d'un abonné ne réécrit pas ce qu'il a déjà payé.
- **Agenda** : un événement récurrent par série (RRULE), sans invité ; chaque
  occurrence est retouchée pour porter son rang (« 3/4 »). Une visite annulée
  supprime son occurrence ; un remplacement est un événement simple.
- **Tâche quotidienne** (`/api/cron/daily`, `vercel.json`, `CRON_SECRET`) :
  rappel de la veille, qui annonce le paiement à la première visite d'un
  cycle et donne l'heure d'arrivée, programmation des textos de deux heures
  avant, et courriel de fin de série à l'artisan. Chaque envoi est réservé
  en base avant de partir : un second passage, ou le bouton de l'onglet
  Abonnés pendant la tâche, ne renvoie rien. La même tâche tient les durées
  de conservation (`purgeExpired`, `lib/retention.ts`) : journal technique
  effacé à douze mois, messages à deux ans, rendez-vous et abonnements
  anonymisés trois ans après la dernière séance, journal des visites à
  douze mois. Du courriel ne reste qu'une empreinte salée, qui tient la
  première heure offerte à une fois par client. L'événement d'agenda d'un
  rendez-vous anonymisé s'efface ensuite (`purgeCalendarCopies`), sans avis
  à personne ; sans Google, il attend le passage suivant. Les copies dans la
  boîte de courriel, elles, se suppriment à la main (la politique le dit).
- **Remerciement et avis Google** : la même tâche envoie `reviewRequest`, une
  fois par client (`review_asked_at`), le lendemain d'une séance terminée ou
  d'une visite d'abonné cochée, seulement si le lien d'avis de la fiche Google
  est collé dans Réglages (`reviewUrl`). Fenêtre de trois jours : un lien collé
  ne relance pas les anciens clients. L'invitation reste neutre (« quel qu'il
  soit ») : Google interdit de ne solliciter que les clients contents, et
  n'admet aucune contrepartie.

## Les textos

Par Twilio, en `fetch` pur (`lib/sms.ts`). Le client reçoit la confirmation
(séance ou abonnement), le rappel de la veille, et toute annulation ou tout
déplacement ; l'artisan, chaque nouvelle réservation et ce que le client
annule ou déplace lui-même, sur `SMS_OWNER_TO` ou, à défaut, `PHONE`.

Un texto **double** le courriel, il ne le remplace pas : il ne fait jamais
échouer une réservation, et un compte Google débranché ne l'empêche pas de
partir. Le rappel par texto se note dans `sms_reminded_at`, à part du
courriel (`reminder_sent_at`). Une séance ponctuelle n'a que le texto.

Les trois textos du client suivent les modèles de l'artisan, signés
`SMS_SIGNATURE` : la confirmation (jour, date, début et fin, « Vous n'avez
que la planche à prévoir »), le rappel de la veille (« demain …, j'arrive
à … ») et, `SOON_TEXT_MINUTES` avant l'arrivée, « Je serai chez vous à … ».
L'heure dite est toujours l'**arrivée** : le début de la séance, ou un quart
d'heure plus tôt à l'ancien régime. Le texto de deux heures avant est
**programmé chez Twilio** (`ScheduleType=fixed`), ce qui demande un service
de messagerie (`TWILIO_MESSAGING_SERVICE_SID`) ; sans lui, il ne part pas,
et rien d'autre ne change. Twilio accepte une échéance de quinze minutes à
trente-cinq jours ; on s'en tient à 36 heures : le texto se programme à la
réservation si son heure d'envoi tombe dans ce délai, sinon par la tâche
quotidienne, qui repasse avant. L'envoi est réservé en
base avant d'être demandé (`sms_soon_at`, `sms_soon_sid`), et il est
décommandé chez Twilio quand la séance s'annule ou se déplace.

**Seuls les numéros canadiens reçoivent des textos** (`isCanadianNumber`) :
un autre numéro est sauté et noté `sms_skipped`, sans jamais refuser la
réservation. C'est la parade aux textos vers des destinations surtaxées ;
chez Twilio, les permissions géographiques limitées au Canada la doublent.
La confirmation dit comment arrêter (« Répondez STOP ») ; un client qui
écrit « ARRÊT » reçoit l'indication de répondre STOP, seul mot que Twilio
honore. Pas de tiret cadratin dans les textos : il fait passer le message
en Unicode, payé deux tranches. Les textos de l'artisan sont ramenés à
l'alphabet des textos (`toGsm7` : « août » devient « aout ») ; ceux du
client gardent leur orthographe.

Les **réponses des clients** arrivent sur `/api/sms/incoming` (réglage « A
message comes in » du numéro chez Twilio). La signature `X-Twilio-Signature`
est vérifiée, le nom du client retrouvé par son numéro, et une instruction
TwiML fait suivre le message au cellulaire de l'artisan. Rien n'est
conservé : ni le texte, ni le numéro.

## Zones et frais de déplacement

Deux étages, dans `lib/travel.ts`. Des **secteurs** (Saint-Lambert, Verdun,
Candiac… une vingtaine, ceux du profil Google), chacun reconnu aux trois premiers
caractères du code postal, rattachés à des **zones** qui portent les deux
tarifs et leur propre seuil. Un code hors de tout secteur actif ne peut pas
réserver en ligne : le client est invité à appeler.

**Deux zones depuis le 23 octobre 2026.** La zone A, sans frais, réunit
l'ancienne A et l'ancienne B : la Rive-Sud proche, Chambly, Candiac, La
Prairie et tous les quartiers de Montréal. La zone B est l'ancienne C :
Saint-Jean-sur-Richelieu, à 15 $ sous trois heures et 10 $ à partir de trois
heures. Il n'y a plus de zone C. La production y est passée par la
migration unique `zones-2026-ab` (`mergeZonesAB`, dans `bootstrap()`), qui
ne transforme la grille que si elle porte encore les zones a, b et c, et
seulement si personne ne l'a enregistrée entre la lecture et l'écriture ;
elle note chaque secteur déplacé dans `nivex_zone_history`. Les
réservations et les abonnements déjà pris gardent les frais et le nom de
zone qu'ils portent.

- Tout se règle dans l'onglet « Zones et frais », et s'écrit dans
  `travel_policy` (forme `version: 2`) par `saveZonePolicy`, **seulement
  là** : l'onglet Réglages n'y touche plus, pour qu'il ne ramène jamais une
  grille lue avant qu'on la modifie. Chaque changement s'inscrit dans
  `nivex_zone_history`.
- **Un préfixe, une zone.** Deux secteurs de la même zone peuvent partager
  un préfixe (J5R, La Prairie et Candiac) ; deux zones, jamais.
  `policyProblems` le refuse, à la saisie comme au serveur, en nommant les
  deux secteurs. On ne tranche pas à la place de l'artisan.
- Le texte de la zone desservie (accueil, Tarifs, tunnel, pied de page,
  conditions, FAQ, données structurées), le tableau des frais et la liste
  « Copier pour Google » s'écrivent depuis les secteurs actifs. Aucune
  phrase de zone ne s'écrit à la main.
- **La Rive-Sud d'abord, Montréal ensuite.** Un secteur dont tous les
  préfixes commencent par H (sauf H7, Laval) est un quartier de Montréal
  (`isMontrealSector`), quelle que soit sa zone. Partout où les secteurs
  sont nommés — texte de zone, `areaServed`,
  liste pour Google —, les autres viennent en premier, dans l'ordre de
  l'onglet, puis ceux de l'île. Saint-Lambert ouvre la liste : c'est le
  secteur que la maison met en avant, et l'ordre se tient depuis l'onglet.
- La page `/montreal` liste les quartiers de l'île et leurs frais
  (`montrealFees`), avec la durée minimale et le tarif de la page Tarifs.
  Rien n'y est écrit à la main. Tant qu'aucun quartier de l'île ne paie de
  déplacement (`montrealTravelFree`), « Aucuns frais de déplacement à
  Montréal » paraît en tête de la page, dans ses conditions, dans sa
  question sur les frais, en tête de la dernière phrase de la réponse sur
  les zones de l'accueil (`{check}`, qui garde ainsi ses trois phrases) et
  dans `/llms.txt` ; la phrase s'efface d'elle-même si
  l'onglet remet un quartier dans une zone payante.
- L'ancienne colonne `service_area` n'est plus lue du tout. Elle reste en
  base, sans effet.
- La bascule vers les secteurs est écrite une fois par `bootstrap()` : toute
  grille qui n'est pas à la forme 2 est remplacée, et une grille déjà
  migrée n'est jamais touchée. `saveConnection` suit la même règle.

Deux règles tiennent ensemble dans une seule décision — les frais vivent
dans **leur propre colonne**, jamais fondus dans l'estimation :

- L'offre « première heure offerte » escompte des heures de travail. Elle
  n'a aucune prise sur la route, ni pour l'effacer ni pour la réduire.
- Les frais se calculent sur la **durée réservée**, jamais sur le temps
  facturé. Sans cela, une heure offerte ferait repasser une séance de
  trois heures du côté du tarif plein.

Le seuil du tarif réduit est **atteint, non dépassé** : trois heures tout
rond paient déjà le tarif réduit.

## Moteurs de recherche et assistants

**Le domaine canonique est `https://www.nivexrepassage.ca`** (`SITE_URL`,
`lib/brand.ts`), depuis le 25 octobre 2026. En production, `siteOrigin()` le
rend quoi que dise `NEXT_PUBLIC_SITE_URL` : liens canoniques, hreflang, plan
du site, robots.txt, données structurées, IndexNow, liens des courriels et
adresse de retour de Google en dépendent. Le domaine sans www redirige en
308 chez Vercel, avant le code : un réglage tiers resté sur l'ancien domaine
ne joint plus le site. L'URI de retour OAuth
(`https://www.nivexrepassage.ca/api/auth/google/callback`, console Google
Cloud) et le webhook « A message comes in » de Twilio
(`https://www.nivexrepassage.ca/api/sms/incoming` ; Twilio ne suit pas un
308) doivent porter le www.

**L'en-tête de chaque page** se déclare dans la page, jamais dans la racine :
la fusion des métadonnées de Next est superficielle, et un `alternates` posé
dans la racine passait aux pages qui n'en déclaraient pas. Une page publique
appelle `pageMeta` (titre complet, description, canonique, hreflang `fr-CA`,
`en-CA` et `x-default` vers le français, carte de partage) ; une page
personnelle ou de retrait, `privateMeta` (`noindex`, ni canonique ni
hreflang) ; une page introuvable, `notFoundMeta`. Les titres et les
descriptions vivent dans `lib/i18n/seo.ts`, hors des dictionnaires : chaque
titre commence par « NIVEX Repassage » (« NIVEX In-Home Ironing ») et
n'appartient qu'à sa page ; chaque description tient en 150 à 160
caractères et nomme le repassage à domicile, Montréal et la Rive-Sud. Les
montants s'y remplissent depuis les réglages (`pageDescription`). Un test
tient ces trois règles, à 50, 55 et 60 $ de l'heure.

**La fiche de la maison** (`localBusinessJsonLd`) est posée par la racine
`app/[locale]/layout.tsx`, la même sur toutes les pages, avec le même `@id`
(`…/#nivex`). Un `DryCleaningOrLaundry`, le sous-type de LocalBusiness le
plus proche : nom « NIVEX Repassage à domicile », nom court « NIVEX »,
téléphone, `CONTACT_EMAIL`, fondateur (`FOUNDER`), logo, image, fourchette
de prix (de la séance d'essai au plus haut cycle), horaire, secteurs dans
`areaServed` (Rive-Sud, puis Montréal, un quartier de l'île portant Montréal
comme localité), `sameAs` depuis `SOCIAL_PROFILES` (vide : rien n'est
publié). Google exige une adresse : elle s'arrête à la ville (Longueuil),
sans rue, puisque l'artisan se déplace. Le catalogue (`hasOfferCatalog`)
porte les quatre abonnements et la séance d'essai, puis les pièces à
l'unité ; `makesOffer`, l'heure de plus, les cinq prestations et les frais
de chaque zone (zéro en zone A, un prix chiffré par durée en zone B).
**Chaque offre porte un `Service`, jamais un `Product`** : un produit ferait
chercher à Google des avis, un stock et une livraison. Une fourchette donne
aussi son prix plancher (`price`), que Google exige. Les blocs passent par
`jsonLdHtml`, qui échappe les chevrons.

L'accueil ajoute le `WebSite` (le nom que Google peut afficher à la place du
domaine), et l'accueil comme la page Montréal leur `FAQPage`, avec les
questions qu'elles affichent, une par page. Google n'affiche plus de
résultat enrichi de FAQ depuis 2026, mais le balisage reste valide et lu par
les assistants.

**Le plan du site** liste les pages de `lib/pages.ts`, dans les deux
langues, avec leur date. **Modifier une page, c'est avancer sa date** dans
`PUBLIC_PAGES` (contenu, titre, description ou données structurées ; pas une
virgule) : le plan du site l'écrit dans `<lastmod>` et IndexNow la compare à
ce qu'il a envoyé. Une date qui bouge sans raison fait perdre la confiance
de Google ; on ne la calcule jamais par `git log` (le clone de Vercel n'a
que dix commits). Les tunnels `/reserver` et `/abonnement` n'y sont pas : ils
ne servent qu'à réserver. robots.txt ne les bloque pas (seuls les liens à
jeton, `/fr/abonnement/` avec la barre finale, le sont), et il ne faut pas
les y ajouter. Toute page publique ajoutée va dans `PUBLIC_PAGES`.

**IndexNow** prévient Bing (donc ChatGPT et Copilot), Yandex, Naver et
Seznam ; Google n'y participe pas. La clé est `INDEXNOW_KEY`, publiée dans
`public/<clé>.txt`. Seules partent les pages dont la date a avancé depuis le
dernier envoi réussi (`nivex_indexnow`), et seulement si le fichier de clé
est servi tel quel sur le www. Deux déclencheurs, après la mise en ligne,
jamais pendant `next build` (qui s'exécute avant que le déploiement reçoive
le domaine) : le workflow GitHub `.github/workflows/indexnow.yml`, sur
l'événement de Vercel qui suit un déploiement de production, appelle `POST
/api/indexnow` avec `CRON_SECRET` (secret du dépôt) et le commit déployé —
la route répond 409 tant que le domaine sert la version précédente ; et, en
filet, la tâche quotidienne.

`/llms.txt` (`lib/llms.ts`) résume la maison pour les assistants, en
français puis en anglais : le service, les zones et leurs frais, les quatre
abonnements et la séance d'essai avec leurs prix, le contact et les pages
principales. `/llms-full.txt` en donne le détail : pièces à l'unité, coût
d'un cycle en zone payante, conditions, les sept questions et leurs
réponses. Rien n'y est écrit à la main, et ils se régénèrent comme les
pages.

La balise de validation de Google Search Console sort de
`GOOGLE_SITE_VERIFICATION` (`lib/brand.ts`, la valeur `content=` seule), sur
toutes les pages de la vitrine : la racine `/` redirige vers `/fr` ou `/en`,
et Google lit la page d'arrivée.

`robots.txt` nomme Googlebot, Bingbot, OAI-SearchBot, PerplexityBot et
Claude-SearchBot. Un robot qui trouve son nom ignore le groupe `*` : chaque
groupe répète donc les mêmes interdits (espace artisan, API, liens
personnels de réservation et d'abonnement).

## Mesure d'audience, et la Loi 25

La frontière à tenir, et elle court dans tout le code :

- Le **journal des visites** est anonyme. Date, page, source, type
  d'appareil, ville approximative. Aucune adresse IP n'entre en base —
  l'en-tête de l'hébergeur est lu puis jeté. Aucun identifiant ne relie
  deux lignes : deux visites du même navigateur y sont deux inconnus.
  Oubli automatique à douze mois.
- La **provenance** finit attachée à une réservation, donc à une
  personne. Elle reste donc dans le `localStorage` du visiteur et n'en
  sort qu'au moment où il réserve.

L'artisan ne compte jamais, quel que soit l'appareil :

- `/api/visit` écarte toute visite qui porte sa session (`getSession`) ;
- chaque navigateur où il ouvre `/admin` reçoit le marqueur de retrait
  (`nivex.optout`), que lisent le journal **et** `beforeSend`, la mesure de
  l'hébergeur ;
- les navigateurs où il ne se connecte jamais (ceux de Facebook et
  d'Instagram en tête) s'ouvrent une fois sur son lien personnel
  `/fr/ne-pas-compter?cle=…`, affiché dans l'onglet Visites. La clé se
  déduit de `SESSION_SECRET` (`optOutKey`) ; sans elle, la page est un 404.
  Elle n'est jamais comptée (`isPrivatePath`), ni indexée, et `robots.txt`
  l'écarte.

Les **familles de sources** (`groupOfSource`) rangent la colonne `source`,
étiquette `utm_source` ou domaine référent : Facebook, Instagram, LinkedIn,
IA, Google, Porte-à-porte, Recommandation, Direct pour tout le reste. Un
lien `?ref=prénom` l'emporte sur tout (`refName` le met au propre). La
provenance de l'arrivée vaut pour toute la session (`nivex.arrival`, dans
`sessionStorage`) : la deuxième page a perdu son `?utm_source=`. Une
réservation se range d'abord au lien de recommandation, puis à la réponse
« Comment avez-vous connu NIVEX ? », puis au navigateur (`bookingGroup`).

Les **liens courts** des imprimés — `/carte`, `/depliant`, `/lettre` —
sont des redirections temporaires de `next.config.ts` vers `/fr` avec
`utm_source=porte-a-porte`. Les codes QR imprimés pointent dessus : ne les
renommez jamais.

`/avis`, celui de la carte de remerciement laissée en fin de séance, est une
route (`app/avis/route.ts`) : il renvoie vers le lien d'avis collé dans
Réglages, ou vers l'accueil s'il n'y en a pas. Si Google change son lien, on
colle le nouveau, et les cartes distribuées suivent. Le middleware le laisse
passer tel quel ; sans cette exception, il devenait `/fr/avis`, une page
introuvable. Même règle : ne le renommez jamais.

Les **robots** restent en base, marqués dans `robot`, et l'onglet les écarte
par défaut. `robotReason` lit l'agent, `navigator.webdriver` et le fuseau
de l'horloge, puis les oublie ; le centre de données se reconnaît aux
colonnes gardées (américain, direct, ordinateur, ville de
`DATACENTER_CITIES`). `bootstrap()` marque aussi les anciennes visites qui
répondent à cette dernière règle.

Les **liens personnels** (`/fr/reservation/<jeton>`, `/fr/abonnement/<jeton>`)
ne se comptent pas non plus (`isPrivatePath`) : leur jeton ouvre la
réservation, et il n'a rien à faire dans le journal ni chez l'hébergeur.
`bootstrap()` efface ceux qu'un journal plus ancien aurait gardés.

**Rien de ce qui touche à la provenance ne doit pouvoir faire échouer une
réservation.** Un référent à rallonge, un compteur abîmé par une
extension : tout est accepté puis nettoyé champ par champ. Perdre une
séance pour un renseignement de marketing serait absurde.

La politique de confidentialité (`i18n/*.ts`, clé `legal.privacy`) décrit
tout cela. **Elle et le code doivent rester d'accord** : si vous changez
ce qui est collecté ou la durée de conservation, changez-la aussi, et la
date dans `LEGAL_UPDATED`.

## Quatre pièges qui ont déjà coûté cher

1. **`saveConnection` préserve les colonnes jsonb par `COALESCE`.** Une
   valeur enregistrée ne bouge plus d'elle-même. Changer une valeur par
   défaut dans le code ne change donc **rien** en production. Selon ce
   qu'on ajoute, il faut une fusion à la lecture (`mergeServices`) ou une
   relecture stricte (`readZonePolicy`, qui n'accepte que la forme 2).
2. **Le serveur vit en UTC.** Un dimanche soir à Montréal y est déjà
   lundi. Tout jour de semaine se lit avec `timeZone: "America/Toronto"`.
3. **Le mode démonstration** (`NIVEX_DEMO=1`) a un double verrou : la
   variable **et** `VERCEL_ENV !== "production"`. Gardez ce verrou sur
   toute variable d'essai que vous ajouteriez.
4. **Les déploiements d'essai de Vercel ont longtemps écrit dans la base
   de production.** Une branche poussée était construite avec la même
   `DATABASE_URL`, et son `bootstrap()` s'exécutait contre la vraie base,
   avant toute fusion. Le 17 octobre 2026, la bascule des zones s'est ainsi
   faite depuis la première version de la branche, et la correction poussée
   ensuite n'a rien changé, puisqu'une grille migrée n'est plus touchée.
   Depuis le 18 octobre, l'intégration Neon de Vercel crée une branche de
   base par déploiement d'essai (« Create Database Branch For Deployment » :
   Preview coché, Production décoché). Chaque version d'essai travaille sur
   une copie prise au déploiement ; la production ne reçoit que ce qui est
   fusionné. La copie garde la connexion Google et les clés Twilio : une
   réservation faite en essai peut encore écrire dans l'agenda, envoyer un
   courriel ou un texto. Une migration de données doit toujours être juste
   dès la fusion, ou se rattraper depuis `/admin`.

## Variables d'environnement

`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`ENCRYPTION_KEY` (32 octets, chiffre le jeton Google en AES-256-GCM),
`SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL` (ignorée en production, qui prend
toujours `SITE_URL`), `CRON_SECRET` (ouvre la tâche quotidienne et
`/api/indexnow` ; la même valeur, en secret du dépôt GitHub, sert au
workflow IndexNow), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM` (les textos). Facultatives : `SMS_OWNER_TO`,
`TWILIO_MESSAGING_SERVICE_SID` (le texto de deux heures avant),
`ADMIN_SETUP_CODE`, `NIVEX_DEMO`. Le modèle complet est dans
`.env.example`.

## Avant de pousser

`npm test` puis `npm run build`. `npx eslint src` sort **deux erreurs
anciennes** (deux règles React sur des composants d'avant : `SiteHeader` et
la page de gestion d'une réservation) : comptez-les avant et après votre
travail, et n'en ajoutez pas une troisième. Un `<a>` vers `/api/auth/google`
est voulu (le détour OAuth quitte l'application) : il porte un
`eslint-disable-next-line` commenté. Ne lisez pas sa sortie avec `| tail -1` — la
dernière ligne est vide, et on croit le lint propre alors qu'il ne l'est
pas.

Six fichiers de tests, en `tsx` sans cadre : `availability` (créneaux,
chevauchements, temps hors séance), `booking` (courriels, durées, trois
temps, séance d'essai, pièces à l'unité, foire aux questions),
`sms` (modèles, numéros canadiens, alphabet), `provenance` (zone
desservie, journal, provenance, familles de sources, robots, bilan),
`travel` (secteurs, zones, frais,
conflits de préfixes, historique, Montréal, titres et descriptions de chaque
page, hreflang, fiche LocalBusiness, llms.txt, robots, plan du site, origine
www, IndexNow), `subscription`
(grille des dates, rang des visites, montants, délai de la veille). Plus un
contrôle de contraste en Python, qui doit rester à 27/27.

Ce que les tests ne couvrent pas, et qu'il faut éprouver autrement :

- **Le schéma.** `bootstrap()` ne s'exécute qu'en production. Extrayez
  ses instructions et passez-les sur un vrai PostgreSQL, **deux fois**
  pour l'idempotence. Une contrainte mal écrite a déjà fait tomber le
  site : elle levait une erreur hors de la liste `EXCEPTION`, et les
  réglages se lisaient comme un compte Google absent.
- **Le rendu.** Chromium est là, sous
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, avec
  `playwright-core`. Lancez `next start` et regardez vraiment la page, au
  téléphone comme à l'écran.

La production se déploie depuis `main` : **demandez avant de fusionner.**

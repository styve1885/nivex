@AGENTS.md

# La maison NIVEX

Repassage à domicile de prestige, à Longueuil et sur la Rive-Sud. Site en
production sur `nivexrepassage.ca`, déployé depuis la branche `main` par
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

- **Prix** : depuis `settings.hourlyRate`, via `src/lib/pricing.ts`.
- **Cadence** (pièces à l'heure) : `perHour(minutesPerUnit)`, lu des
  prestations enregistrées.
- **Horaire d'ouverture** : déduit de `settings.hours`, jours ouverts
  compris.
- **Délais** : `CANCEL_WINDOW_HOURS`, `FIRST_FREE_MIN_MINUTES`,
  `SETUP_MINUTES` dans `src/lib/brand.ts`.

Les prestations et les réglages vivent **en base**, et la base l'emporte
sur les valeurs par défaut du code. Changer `DEFAULT_SERVICES` ne suffit
donc pas en production : il faut aussi enregistrer depuis `/admin`.

L'artisan peut **ajouter des prestations** depuis Réglages (clé `p-…`) et les
retirer. Celles du code, elles, ne se retirent pas : `mergeServices` les
ramènerait au prochain chargement ; elles se désactivent.

## Quelques faits que le texte doit respecter

- Une séance dure **au minimum deux heures**. Il n'existe pas de séance
  d'une heure, et la vitrine ne doit pas en proposer.
- L'artisan arrive **quinze minutes avant** pour s'installer, sans frais.
  Le bloc réservé est entièrement du repassage.
- **Rien ne quitte le domicile** : pas de collecte, pas de livraison.
- La première heure est offerte à partir de deux heures réservées, une
  fois par client, jamais sur les abonnements.

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

Une adresse inconnue sous `/fr` ou `/en` tombe sur `[locale]/[...missing]`,
qui rend la page 404 de la maison, traduite.

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
| `lib/seo.ts` | Ce que lisent les moteurs et les assistants : description de l'accueil, fiche LocalBusiness, FAQ structurée |
| `lib/brand.ts` | Les constantes de la maison, sans aucune dépendance (dont le courriel public `CONTACT_EMAIL`) |
| `lib/services.ts` | Les prestations par défaut et leurs types, sans dépendance : l'admin les importe sans tirer le pilote de base dans le navigateur |
| `lib/retention.ts` | Les durées de conservation promises par la politique, tenues par la tâche quotidienne |

Les tables : `nivex_settings` (une seule ligne), `nivex_bookings`,
`nivex_subscriptions`, `nivex_messages`, `nivex_visits`, `nivex_events`,
`nivex_zone_history`. Le schéma se pose tout
seul au démarrage, dans `bootstrap()` de `lib/db.ts`, et doit rester
**idempotent** : il s'exécute à chaque instance froide.

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

Quatre étapes : prestations, adresse, créneau, confirmation. La durée se
déduit du panier ; le client ne choisit jamais une durée directement.

**Le navigateur ne décide de rien.** Il calcule une estimation pour
l'afficher, mais `createBooking` recalcule tout — durée, prix, zone,
frais — à partir des réglages en base. Un panier trafiqué ne donne pas un
prix trafiqué.

Les gardes posées là, et pourquoi :

- La zone est **vérifiée à la création**, pas seulement affichée. Elle ne
  l'a pas toujours été : `inServiceArea` a passé des mois importée,
  ré-exportée, et jamais appelée. Une adresse de Gatineau s'inscrivait
  dans l'agenda comme une autre.
- Une contrainte d'exclusion Postgres interdit deux séances qui se
  chevauchent, installation comprise. Elle passe par une fonction
  `IMMUTABLE` : une contrainte d'exclusion indexe son expression, et un
  index refuse tout ce qui ne l'est pas.
- Seule la **mise en pause** ferme vraiment les réservations. Un compte
  Google injoignable ne doit pas fermer la maison : le rendez-vous
  s'écrit en base, l'agenda et les courriels suivent dès qu'ils peuvent.
  En pause, les pages `/reserver` et `/abonnement` montrent un avis et le
  téléphone au lieu du tunnel.
- **L'installation compte des deux côtés** : `SETUP_MINUTES` s'ajoute
  avant et après chaque rendez-vous en base comme autour des événements de
  l'agenda, dans le calcul des créneaux comme à l'écriture. L'invitation
  envoyée au client porte les heures réservées, et dit l'arrivée anticipée.
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
  (`company`, `website`…) : un vrai client le remplirait sans le voir et
  recevrait une fausse confirmation.

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
- **Le montant d'un cycle et les frais sont figés à la souscription** (tarif
  garanti douze mois). Les frais : ceux de la zone pour la durée d'une visite,
  moins `SUBSCRIBER_TRAVEL_DISCOUNT_CENTS`, jamais sous zéro, multipliés par
  les visites du cycle. Le tout se paie à la première visite du cycle.
  Une visite d'abonné vaut `estimate_cents = 0` ; jamais de première heure
  offerte. L'artisan peut changer à la main les frais par visite d'un abonné
  (0 $, un autre montant, ou retour aux frais de sa zone) depuis l'onglet
  Abonnés : `setTravelFee`.
- **Délai : 23 h 59 la veille** (`changeDeadline`), lu en heure de Montréal.
  Les séances ponctuelles gardent `CANCEL_WINDOW_HOURS`, s'annulent en ligne
  et se déplacent par téléphone.
- **Limites** : un client déplace ou annule au plus
  `CLIENT_CHANGES_PER_VISIT` fois une visite et
  `CLIENT_CHANGES_PER_SUBSCRIPTION` fois par jour en tout ; en ligne, un seul
  abonnement en cours par téléphone et par adresse, et
  `ONLINE_SUBSCRIPTIONS_PER_DAY` par jour pour tout le site. L'artisan n'a
  pas de limite. Pour déplacer, la page de l'abonné lit ses créneaux sur
  `/api/subscriptions/[token]/slots`, qui lève l'horizon pour une visite
  existante.
- **Un cycle réglé garde son montant** (`paid_amounts`) : changer les frais
  d'un abonné ne réécrit pas ce qu'il a déjà payé.
- **Agenda** : un événement récurrent par série (RRULE), sans invité ; chaque
  occurrence est retouchée pour porter son rang (« 3/4 »). Une visite annulée
  supprime son occurrence ; un remplacement est un événement simple.
- **Tâche quotidienne** (`/api/cron/daily`, `vercel.json`, `CRON_SECRET`) :
  rappel de la veille, qui annonce le paiement à la première visite d'un
  cycle, et courriel de fin de série à l'artisan. Chaque envoi est réservé
  en base avant de partir : un second passage, ou le bouton de l'onglet
  Abonnés pendant la tâche, ne renvoie rien. La même tâche tient les durées
  de conservation (`purgeExpired`, `lib/retention.ts`) : journal technique
  effacé à douze mois, messages à deux ans, rendez-vous et abonnements
  anonymisés trois ans après la dernière séance. Du courriel ne reste
  qu'une empreinte salée, qui tient la première heure offerte à une fois
  par client.

## Les textos

Par Twilio, en `fetch` pur (`lib/sms.ts`). Le client reçoit la confirmation
(séance ou abonnement), le rappel de la veille, et toute annulation ou tout
déplacement ; l'artisan, chaque nouvelle réservation et ce que le client
annule ou déplace lui-même, sur `SMS_OWNER_TO` ou, à défaut, `PHONE`.

Un texto **double** le courriel, il ne le remplace pas : il ne fait jamais
échouer une réservation, et un compte Google débranché ne l'empêche pas de
partir. Le rappel par texto se note dans `sms_reminded_at`, à part du
courriel (`reminder_sent_at`). Une séance ponctuelle n'a que le texto.

**Seuls les numéros canadiens reçoivent des textos** (`isCanadianNumber`) :
un autre numéro est sauté et noté `sms_skipped`, sans jamais refuser la
réservation. C'est la parade aux textos vers des destinations surtaxées ;
chez Twilio, les permissions géographiques limitées au Canada la doublent.
La confirmation dit comment arrêter (« Répondez STOP ») ; un client qui
écrit « ARRÊT » reçoit l'indication de répondre STOP, seul mot que Twilio
honore. Pas de tiret cadratin dans les textos : il fait passer le message
en Unicode, payé deux tranches.

Les **réponses des clients** arrivent sur `/api/sms/incoming` (réglage « A
message comes in » du numéro chez Twilio). La signature `X-Twilio-Signature`
est vérifiée, le nom du client retrouvé par son numéro, et une instruction
TwiML fait suivre le message au cellulaire de l'artisan. Rien n'est
conservé : ni le texte, ni le numéro.

## Zones et frais de déplacement

Deux étages, dans `lib/travel.ts`. Des **secteurs** (Saint-Lambert, Verdun,
Candiac… une vingtaine, ceux du profil Google), chacun reconnu aux trois premiers
caractères du code postal, rattachés à des **zones** (A, B, C) qui portent
les deux tarifs et leur propre seuil. Un code hors de tout secteur actif ne
peut pas réserver en ligne : le client est invité à appeler.

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
  sont nommés — texte de zone, description de l'accueil, `areaServed`,
  liste pour Google —, les autres viennent en premier, dans l'ordre de
  l'onglet, puis ceux de l'île. Saint-Lambert ouvre la liste : c'est le
  secteur que la maison met en avant, et l'ordre se tient depuis l'onglet.
- La page `/montreal` liste les quartiers de l'île et leurs frais
  (`montrealFees`), avec la durée minimale et le tarif de la page Tarifs.
  Rien n'y est écrit à la main.
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

La fiche `LocalBusiness` (`lib/seo.ts`) est la même sur l'accueil et sur la
page Montréal : nom, téléphone, site, taux horaire et durée minimale lus des
réglages, secteurs dans `areaServed` (Rive-Sud, puis Montréal, un quartier
de l'île portant Montréal comme localité). La description de l'accueil
nomme les cinq premiers secteurs de la Rive-Sud, puis Montréal.

`robots.txt` nomme Googlebot, Bingbot, OAI-SearchBot, PerplexityBot et
Claude-SearchBot. Un robot qui trouve son nom ignore le groupe `*` : chaque
groupe répète donc les mêmes interdits (espace artisan, API, liens
personnels de réservation et d'abonnement). Toute page publique ajoutée va
dans `sitemap.ts`.

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
`SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` (ouvre la tâche
quotidienne des abonnements), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM` (les textos). Facultatives : `SMS_OWNER_TO`,
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

Cinq fichiers de tests, en `tsx` sans cadre : `availability` (créneaux,
chevauchements), `booking` (courriels, durées), `provenance` (zone
desservie, journal, provenance, familles de sources, robots, bilan),
`travel` (secteurs, zones, frais,
conflits de préfixes, historique, Montréal, fiche LocalBusiness, robots,
plan du site), `subscription`
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

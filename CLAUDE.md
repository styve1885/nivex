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

### Les modules qui décident

| Fichier | Ce qu'il tranche |
|---|---|
| `lib/settings.ts` | Les réglages, lus en base, avec les valeurs par défaut du code |
| `lib/availability.ts` | Les créneaux libres, la durée et le prix d'une séance |
| `lib/bookings.ts` | La création d'un rendez-vous — c'est **lui** qui engage la maison |
| `lib/travel.ts` | Les zones desservies et les frais de déplacement |
| `lib/pricing.ts` | La grille publiée : blocs, forfaits, abonnements |
| `lib/attribution.ts` | D'où vient un client, et la question qu'on lui pose |
| `lib/visits.ts` | Le journal anonyme des pages vues |
| `lib/google.ts` | OAuth, agenda et Gmail, en `fetch` pur |
| `lib/brand.ts` | Les constantes de la maison, sans aucune dépendance |

Les tables : `nivex_settings` (une seule ligne), `nivex_bookings`,
`nivex_messages`, `nivex_visits`, `nivex_events`. Le schéma se pose tout
seul au démarrage, dans `bootstrap()` de `lib/db.ts`, et doit rester
**idempotent** : il s'exécute à chaque instance froide.

### L'espace artisan

`/admin`, derrière une session Google. Cinq onglets : Rendez-vous,
Messages, Visites, Réglages, Connexion. Presque tout ce qui est
commercial s'y règle — tarifs, horaire, prestations, zones et frais,
texte de la zone desservie.

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

## Zones et frais de déplacement

Trois zones, reconnues aux trois premiers caractères du code postal, dans
`lib/travel.ts` et réglables depuis `/admin`. Un code hors zone ne peut
pas réserver en ligne.

Deux règles tiennent ensemble dans une seule décision — les frais vivent
dans **leur propre colonne**, jamais fondus dans l'estimation :

- L'offre « première heure offerte » escompte des heures de travail. Elle
  n'a aucune prise sur la route, ni pour l'effacer ni pour la réduire.
- Les frais se calculent sur la **durée réservée**, jamais sur le temps
  facturé. Sans cela, une heure offerte ferait repasser une séance de
  trois heures du côté du tarif plein.

Le seuil du tarif réduit est **atteint, non dépassé** : trois heures tout
rond paient déjà le tarif réduit.

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

Trois exclusions : les pages `/admin` ne se comptent jamais, un appareil
porteur du marqueur de retrait n'envoie plus rien, et `beforeSend` filtre
aussi la mesure de l'hébergeur.

**Rien de ce qui touche à la provenance ne doit pouvoir faire échouer une
réservation.** Un référent à rallonge, un compteur abîmé par une
extension : tout est accepté puis nettoyé champ par champ. Perdre une
séance pour un renseignement de marketing serait absurde.

La politique de confidentialité (`i18n/*.ts`, clé `legal.privacy`) décrit
tout cela. **Elle et le code doivent rester d'accord** : si vous changez
ce qui est collecté ou la durée de conservation, changez-la aussi, et la
date dans `LEGAL_UPDATED`.

## Trois pièges qui ont déjà coûté cher

1. **`saveConnection` préserve les colonnes jsonb par `COALESCE`.** Une
   valeur enregistrée ne bouge plus d'elle-même. Changer une valeur par
   défaut dans le code ne change donc **rien** en production. Selon ce
   qu'on ajoute, il faut une fusion à la lecture (`mergeServices`,
   `mergeArea`) ou une relecture stricte (`readZonePolicy`).
2. **Le serveur vit en UTC.** Un dimanche soir à Montréal y est déjà
   lundi. Tout jour de semaine se lit avec `timeZone: "America/Toronto"`.
3. **Le mode démonstration** (`NIVEX_DEMO=1`) a un double verrou : la
   variable **et** `VERCEL_ENV !== "production"`. Gardez ce verrou sur
   toute variable d'essai que vous ajouteriez.

## Variables d'environnement

`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`ENCRYPTION_KEY` (32 octets, chiffre le jeton Google en AES-256-GCM),
`SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`. Facultatives :
`ADMIN_SETUP_CODE`, `NIVEX_DEMO`. Le modèle complet est dans
`.env.example`.

## Avant de pousser

`npm test` puis `npm run build`. `npx eslint src` sort **huit erreurs
anciennes** (des `<a>` vers des routes internes, deux règles React sur des
composants d'avant) : comptez-les avant et après votre travail, et n'en
ajoutez pas une neuvième. Ne lisez pas sa sortie avec `| tail -1` — la
dernière ligne est vide, et on croit le lint propre alors qu'il ne l'est
pas.

Quatre fichiers de tests, en `tsx` sans cadre : `availability` (créneaux,
chevauchements), `booking` (courriels, durées), `provenance` (zone
desservie, journal, provenance), `travel` (zones et frais). Plus un
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

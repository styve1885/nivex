# NIVEX — passation

Pour une session qui reprend le site sans avoir suivi les précédentes.
`CLAUDE.md` fait foi pour la charte, les règles et l'architecture ; ce
document dit le reste : avec qui on travaille et comment, les comptes, la
façon de livrer, le banc d'essai, ce qui reste en suspens. À jour au
6 novembre 2026.

**Le dépôt est public.** Rien de secret ni de personnel ne s'écrit dans un
fichier suivi : ni clé, ni adresse de domicile, ni courriel personnel.

---

## 1. En bref

| | |
|---|---|
| Site | https://www.nivexrepassage.ca (`/fr`, `/en`) ; le domaine sans www redirige en 308 |
| Espace artisan | https://www.nivexrepassage.ca/admin, derrière la session Google de l'artisan |
| Diagnostic | `/api/health` : base, Google, textos ; le détail du schéma n'apparaît qu'une fois connecté |
| Dépôt | https://github.com/styve1885/nivex, branche `main` |
| Production | Vercel, projet `nivex`, déployée à chaque fusion dans `main`, en une à deux minutes |
| Base | Postgres chez Neon ; chaque version d'essai a sa copie (CLAUDE.md, piège 4) |
| Tâche quotidienne | `/api/cron/daily`, 14 h UTC (`vercel.json`) : 9 h à Montréal l'hiver, 10 h l'été |

L'artisan, c'est **Styve**, fondateur de la maison (`FOUNDER`) et celui
qui signe les textos (`SMS_SIGNATURE`, `lib/brand.ts`). Il fait lui-même
ses réglages depuis `/admin`, tient lui-même les consoles (Vercel, Twilio,
Google, OVH) et passe par une session Claude Code pour tout ce qui touche
au code.

---

## 2. Travailler avec Styve

- **En français, en le tutoyant.** Réponses courtes et concrètes ; pas de
  jargon quand une phrase simple suffit.
- **Ses demandes arrivent en brief numéroté** : ce qu'il veut, où, ce qu'il
  ne faut pas toucher, puis un dernier point « AVANT DE DÉPLOYER : … puis
  déploie ». Chaque point se traite, et la réponse finale rend compte de
  chacun, dans l'ordre.
- **Déployer.** La règle de `CLAUDE.md` tient : on demande avant de
  fusionner. Quand sa demande dit « puis déploie », c'est l'accord pour
  cette demande-là, une fois faites et montrées les vérifications de son
  point « AVANT DE DÉPLOYER ». Un accord ne vaut pas pour la demande
  suivante.
- **Il veut voir** : captures au téléphone (390 px) et à l'écran (1280 px),
  la liste des endroits modifiés avec le texte exact, en français et en
  anglais, et les chiffres avant/après quand il y en a (poids de page,
  temps, nombre de créneaux).
- **Jamais de secret.** Ne jamais lui demander, ni accepter qu'il colle,
  `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `TWILIO_AUTH_TOKEN`,
  `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`. Il pose lui-même les
  variables chez Vercel : on lui donne le nom, la valeur quand elle n'est
  pas secrète (un identifiant `MG…`), l'environnement, et on lui rappelle
  de redéployer (une variable n'est lue que par un nouveau déploiement). Une
  capture qu'il envoie ne doit montrer ni clé ni jeton.
- **Sa vie privée.** Son adresse de domicile ne s'écrit nulle part : ni
  code, ni document, ni réponse. La fiche de la maison s'arrête à la ville.
  Ses courriels personnels servent à l'identifier, jamais à les envoyer à
  un service.
- **Dire ce qu'on n'a pas pu vérifier**, et pourquoi, avec le lien pour
  qu'il le fasse lui-même (section 3, étape 8 ; section 9).
- **Les étapes qu'on lui donne** sont numérotées, avec le nom exact des
  menus, l'ordre quand il compte, et ce qu'il doit voir à la fin pour savoir
  que c'est réussi.
- **Les fichiers qu'il joint** (vidéo, photos) arrivent dans le conteneur,
  au chemin cité dans son message. Une vidéo ne se recompresse pas ; une
  photo passe par l'optimiseur de Next. Pour monter une vidéo filmée à
  l'iPhone, la compétence `nivex-montage` de son compte existe, si elle
  figure dans la liste des compétences de la session.

---

## 3. Livrer un changement

1. **Branche** : celle que la session désigne. Après chaque fusion, repartir
   de `main` :
   `git fetch origin main && git checkout -B <branche> origin/main`, puis
   `git push -u origin <branche>` (avec `--force-with-lease` si la branche
   ne porte que de l'historique déjà fusionné).
2. **Écrire le code** selon `CLAUDE.md` : chiffres tirés des réglages,
   textes dans les deux langues, retraits masqués et non effacés, date
   avancée dans `PUBLIC_PAGES` pour toute page publique modifiée (jour de
   Montréal), politique de confidentialité et `LEGAL_UPDATED` si la collecte
   change, `CLAUDE.md` tenu à jour.
3. **Vérifier**, sans exception :
   - `npm test` : six fichiers, puis le contraste à 27/27 ;
   - `npx eslint src` : exactement **deux** erreurs anciennes (`SiteHeader`,
     `reservation/[token]`) ; lire la sortie entière ;
   - la construction : `bash tools/local/build.sh` (section 4), qui
     construit contre la base locale et pose le schéma comme en
     production ;
   - sur le banc : regarder la page au téléphone et à l'écran, éprouver le
     tunnel jusqu'à l'étape de confirmation sans créer de rendez-vous (dans
     Playwright, intercepter les `POST` vers `/api/bookings` et
     `/api/subscriptions`), captures.
4. **Commit** en français : un titre qui dit le changement (« Horaire :
   samedi soir, une seule source, « et le samedi » »), un corps qui dit
   pourquoi et comment c'est vérifié, puis les lignes de fin que la session
   impose. Aucun identifiant de modèle dans un commit, une PR ou le code.
5. **PR vers `main`** par les outils GitHub de la session (MCP) ; il n'y a
   pas de `gh`. Le corps : ce qui change, où, ce qui a été vérifié, ce qui
   reste à faire de son côté.
6. **Version d'essai** : Vercel en construit une par PR, sur une copie de la
   base, mais avec la vraie connexion Google et les vraies clés Twilio. On
   n'y fait **jamais** de vraie réservation : elle écrirait dans l'agenda et
   partirait par courriel et par texto.
7. **Fusion** par commit de fusion (merge), seulement avec l'accord de la
   section 2.
8. **Confirmer la mise en ligne.** La production n'est pas joignable depuis
   le conteneur. Après chaque déploiement de production, le workflow
   IndexNow (`.github/workflows/indexnow.yml`) appelle
   `/api/indexnow?sha=<commit>`, qui répond 409 tant que le domaine sert une
   autre version. Un 200 prouve donc que le commit fusionné est en ligne.
   Lire le journal : `actions_list` (`list_workflow_runs`, `indexnow.yml`),
   puis `list_workflow_jobs`, puis `get_job_logs` avec `return_content`.
   Vercel prévient de deux façons, et certaines exécutions sortent
   « skipped » par la condition du workflow : c'est attendu. Parmi celles
   qui tournent, l'une envoie
   (`{"ok":true,"submitted":[…],"status":200}`), l'autre trouve tout déjà
   envoyé (`"skipped":"unchanged"`). Les deux réponses `ok:true` viennent
   d'une route qui a reconnu le commit.
9. **Repartir de `main`** (étape 1), puis rendre compte à Styve : ce qui est
   en ligne, les endroits modifiés, les vérifications faites, ce qu'il doit
   faire lui-même.

---

## 4. Le banc d'essai local

Tout est dans `tools/local/` (mode d'emploi : `tools/local/README.md`). Le
site construit tourne contre un PostgreSQL du conteneur ; un petit relais
imite le protocole HTTP de Neon. Secrets factices, aucune connexion à la
production.

```bash
bash tools/local/setup.sh            # une fois par conteneur
node tools/local/neon-relay.mjs &    # le relais, sur https://localhost
bash tools/local/build.sh            # schéma, ligne de réglages, next build
bash tools/local/start.sh &          # http://localhost:3000
node tools/local/session.mjs         # jeton du cookie nivex_session (espace artisan)
node tools/local/shots.cjs http://localhost:3000/fr /dossier "#presentation"
```

Éprouvé le 3 novembre 2026 sur une base vide : construction, pages
publiques, espace artisan, captures. Les surprises connues (redémarrage
après un enregistrement depuis `/admin`, régénération à cinq minutes,
Chromium sans H.264) sont listées dans le README.

---

## 5. Les comptes et les services

La session n'a accès qu'au dépôt GitHub. Tout le reste se fait par Styve,
avec des étapes qu'on lui donne.

| Service | À quoi il sert | Ce qu'il faut savoir |
|---|---|---|
| GitHub `styve1885/nivex` | Code, PR, workflow IndexNow | Public. Secret de dépôt `CRON_SECRET` pour le workflow (même valeur que chez Vercel) |
| Vercel, projet `nivex` | Construction, hébergement, tâche quotidienne | Les variables : `CLAUDE.md` et `.env.example`. Domaine www ; l'apex redirige en 308 |
| Neon | La base | Par l'intégration Vercel : une branche de base par version d'essai (Preview coché, Production décoché) |
| Google Cloud (OAuth) | La connexion de l'espace artisan | URI de retour : `https://www.nivexrepassage.ca/api/auth/google/callback` |
| Compte Google de l'artisan | Agenda des rendez-vous, envoi des courriels | Branché depuis `/admin`, onglet Connexion ; les avis internes vont à `REQUEST_INBOX` |
| ImprovMX et OVH | `contact@nivexrepassage.ca` (`CONTACT_EMAIL`), renvoyé vers le Gmail de l'artisan | Domaine acheté chez OVH ; MX et SPF dans sa zone DNS. L'adresse ne reçoit rien elle-même |
| Twilio | Les textos et les appels du +1 450 367 6231 | Webhook « A message comes in » sur le www (Twilio ne suit pas un 308). Appels renvoyés au cellulaire par le TwiML Bin « NIVEX - transfert ». Service de messagerie « NIVEX » pour le texto de deux heures avant. Permissions géographiques : textos au Canada seulement, appels « United States and Canada » (`CLAUDE.md`, « Les textos ») |
| Search Console, Bing Webmaster Tools | Indexation | Propriété www validée (`GOOGLE_SITE_VERIFICATION`) ; plans du site lus |
| Fiche Google (Business Profile) | La fiche de la maison, les avis | `GOOGLE_MAPS_URL` (identifiant `cid`). Le lien d'avis se colle dans `/admin`, Réglages. L'horaire de la fiche se recopie à la main |
| Bing Places | La fiche de la maison chez Bing (Bing Maps) | Importée de la fiche Google. On corrige la fiche Google, puis on touche « Synchronisation » dans Bing Places. Adresse masquée |
| Facebook, Instagram, LinkedIn | Profils | `SOCIAL_PROFILES` (la maison), `FOUNDER_PROFILES` (le fondateur) |
| IndexNow | Bing, donc ChatGPT et Copilot | Clé `INDEXNOW_KEY`, publiée dans `public/<clé>.txt` |

---

## 6. Ce que Styve règle seul, depuis `/admin`

- **Réglages** : taux horaire, durée minimale, pas des créneaux, préavis,
  horizon, première heure offerte, horaire jour par jour, pause des
  réservations, prestations, lien d'avis Google.
- **Zones et frais** : secteurs, zones, frais.
- **Abonnés** : visite effectuée, seconde série, prix garanti, « arrivée
  15 min avant », frais par visite, déplacer ou annuler une visite.
- **Rendez-vous, Messages** (suppression sur demande de l'auteur),
  **Visites** (son lien « ne pas compter »), **Connexion** (Google, état du
  système).

D'où la règle : un prix, un horaire ou une zone faux sur le site est
presque toujours un réglage, et la base l'emporte sur les valeurs par
défaut du code. Changer une constante ne change rien en production
(`CLAUDE.md`, piège 1).

---

## 7. En suspens

### Côté Styve

À lui rappeler s'il en parle, sans insister.

- **Vidéo de présentation** : essai sur iPhone ; test des résultats enrichis,
  https://search.google.com/test/rich-results?url=https%3A%2F%2Fwww.nivexrepassage.ca%2Ffr%2Fpresentation.
- **Variables mortes** : `NIVEX_HOME_ADDRESS` et `GOOGLE_MAPS_API_KEY` ne
  sont plus lues par le code. S'il les a encore chez Vercel, il peut les
  supprimer.

### Indexation, au 4 novembre 2026

Vérifiée par Styve sur son téléphone, en captures : recherches
`site:nivexrepassage.ca`, inspection d'URL dans les deux consoles. Le
conteneur n'atteint ni Google ni Bing (section 9).

- **Google** : le 3 novembre, 9 des 12 adresses du plan du site étaient
  indexées (les deux accueils, Montréal en français et en anglais, Tarifs
  en français, les quatre documents légaux), plus la page d'abonnement, ce
  qui est voulu. Manquaient la présentation, dans les deux langues, et
  Tarifs en anglais. Google montrait encore l'ancien titre des documents
  légaux (« · NIVEX ») et, pour Tarifs, l'ancien prix (« de 150 $ à
  600 $ ») : des lectures d'avant le 26 octobre et le 1er novembre.
  Indexation demandée le 3 novembre pour `/fr/tarifs`, `/fr/presentation`,
  `/en/tarifs` et `/en/presentation` ; plan du site renvoyé.
- **Le nom du site chez Google** est encore « nivexrepassage.ca », au lieu
  du nom de la maison. À revoir vers le 24 novembre. Piste, si rien ne
  bouge : aligner `og:site_name` (« NIVEX ») sur le nom du `WebSite`
  (« NIVEX Repassage à domicile »), dans `lib/seo.ts`.
- **Bing** : aucune page indexée le 3 novembre. L'inspection de `/fr`
  disait « Découverte mais pas analysée » depuis le 26 octobre, jour du
  premier envoi IndexNow ; le test en direct la disait indexable, sans
  problème SEO. Rien ne bloque : Bing tarde avec un domaine neuf.
  Indexation demandée le 3 novembre pour `/fr`, `/en`, `/fr/tarifs`,
  `/fr/montreal` et `/fr/presentation`.
- **Bing Places** : la fiche, importée de Google fin octobre, est vérifiée
  et attend sa publication (7 à 12 jours). Resynchronisée le 4 novembre,
  horaire du samedi compris ; adresse masquée ; `contact@nivexrepassage.ca`
  ajouté.
- **Fiche Google** : l'horaire du samedi y est depuis le 4 novembre.
- **À refaire vers le 10 novembre** : `site:nivexrepassage.ca` sur Google
  et sur Bing, en captures. Si Bing n'a toujours rien : ses « Plans de
  site » dans Bing Webmaster Tools, puis des liens vers le site depuis la
  fiche Google, Facebook, Instagram et des annuaires.

### Questions ouvertes

Décisions de Styve : ne rien changer sans lui.

- **L'heure en anglais** s'écrit « 6 pm » dans l'horaire et « 11:59 p.m. »
  dans le délai des abonnés. Harmoniser, et dans quel sens ?
- **Abonnés « arrivée 15 min avant »** : le temps hors séance n'entre pas
  dans l'horaire, si bien qu'une visite qui finit à 22 h se range jusqu'à
  22 h 15. À garder, ou à refuser ?

---

## 8. Historique récent

Toutes fusionnées dans `main` depuis la branche de travail. Dates de
fusion, au jour de Montréal.

| PR | Date | Objet |
|---|---|---|
| #27 | 2 nov. 2026 | Passation : banc d'essai local et ce document |
| #26 | 2 nov. 2026 | Vidéo de présentation : accueil, page `/presentation`, VideoObject, lectures comptées |
| #25 | 1er nov. 2026 | Horaire : samedi soir, une seule source, « et le samedi » ; note du tunnel d'abonnement réparée |
| #24 | 1er nov. 2026 | Cinq formules, l'Essentiel à 2 h, noms du 1er novembre |
| #23 | 27 oct. 2026 | Accueil plus léger : la FAQ et le bloc Contact ne reçoivent que ce qu'ils affichent |
| #20 à #22 | 26-27 oct. 2026 | Favicon ; Facebook, Instagram et LinkedIn ; fiche Google par son identifiant |
| #17 à #19 | 26 oct. 2026 | Domaine www et référencement ; rappel par courriel la veille ; balise Search Console |
| #14 à #16 | 23 oct. 2026 | Site plus court (trois offres) ; avant/après ; deux zones, Montréal sans frais |
| #12, #13 | 21-22 oct. 2026 | Lien court `/avis` ; prix 2026, installation dans la séance, capacité unique |
| #1 à #11 | 17-21 oct. 2026 | Abonnements, textos, zones et frais, page Montréal, mesure d'audience, analyse complète, remerciement et avis |

`git log --merges origin/main` donne le reste ; chaque PR décrit ce qu'elle
a changé et vérifié.

---

## 9. Ce que l'expérience a appris

- **Hôtes injoignables** depuis le conteneur (réglages réseau de
  l'environnement) : `www.nivexrepassage.ca`, `search.google.com`,
  `validator.schema.org`, `www.google.com`, `www.bing.com`. La mise en
  ligne se confirme par le workflow IndexNow (section 3, étape 8) ; pour
  les validateurs, on éprouve en local selon les règles publiées, puis on
  donne le lien à Styve. L'indexation, c'est Styve qui la regarde, en
  captures : la recherche `site:nivexrepassage.ca`, puis l'inspection d'URL
  de la Search Console et de Bing Webmaster Tools, qui dit pourquoi une
  page manque.
- **Espaces insécables** : le site en met avant les unités et la
  ponctuation double. Dans le source, les écrire en échappements
  (`\u00a0`, `\u202f`) : un outil d'écriture les change en caractères
  invisibles, impossibles à relire. Dans les tests, comparer à travers
  `flat()` (`tests/booking.test.mjs`), qui les ramène à des espaces.
- **Dates de `PUBLIC_PAGES`** au jour de Montréal : un changement fait à
  22 h l'est déjà le lendemain en UTC.
- **Une table neuve** se crée dans un bloc `DO … EXCEPTION` (`CLAUDE.md`) ;
  sur une base entièrement vide, même les anciennes tables se disputent
  entre les trois processus de `next build`. La production n'est pas
  concernée ; le banc pose donc le schéma en un seul processus avant de
  construire (`tools/local/schema.mjs`).
- **Un fichier statique d'une extension nouvelle** doit entrer dans
  `PUBLIC_FILE` du middleware, sinon il part vers `/fr/…` et rend une page
  introuvable (vu avec `.mp4`).
- **Les versions d'essai gardent Google et Twilio** : jamais de vraie
  réservation dessus.
- **Un appel renvoyé qui échoue en 0 seconde** (ligne « Outgoing Dial »,
  « Failed », dans les journaux d'appels de Twilio), le client entendant
  « la communication n'a pas pu être établie » : les permissions
  géographiques Voice n'autorisaient pas « United States and Canada »
  (réglé le 6 novembre 2026). Les journaux d'appels et d'erreurs de la
  console Twilio disent où un appel s'arrête ; Styve les envoie en
  captures.
- **Un texte à trous montre ses accolades** si un remplacement est oublié :
  `{duration}` est resté visible dans le tunnel d'abonnement du 22 octobre
  au 2 novembre 2026. Un test garde maintenant cette note dans les deux
  tunnels ; tout nouveau texte à trous mérite le sien.

# NIVEX — reprise du projet

Ce document est autonome : il ne suppose aucune conversation préalable.
Il décrit ce qui tourne, ce qui manque, et comment finir.

---

## 1. Ce qui existe

| | |
|---|---|
| Site en production | https://nivex-repassage.vercel.app |
| Dépôt | https://github.com/ReneMarcellin007/nivex (public) |
| Hébergement | Vercel, projet `nivex` — déploiement automatique à chaque `push` sur `main` |
| Diagnostic | https://nivex-repassage.vercel.app/api/health |

Le site est **complet et en ligne** : page d'accueil bilingue FR/EN, tunnel de
réservation en quatre étapes, formulaire de contact, espace artisan sur
`/admin`. `npm test` passe (26 cas du moteur de créneaux, 27 paires de
contraste WCAG AA).

**L'entreprise** : NIVEX, repassage à domicile de prestige, Longueuil et la
Rive-Sud. Propriétaire : Styve. Téléphone `+1 450 943 1217`. Il possède deux
adresses Gmail, `styve1885@gmail.com` et `Styve1884@gmail.com` — le site
s'aligne automatiquement sur celle du compte Google qu'il branche, il n'y a
donc rien à choisir.

---

## 2. Ce qui manque — deux branchements

`GET /api/health` répond aujourd'hui `database: false, google: false`.
Tant que c'est le cas, le site reste présentable mais dégradé : le formulaire
de réservation affiche le numéro de téléphone au lieu du calendrier, et le
formulaire de contact invite à appeler. **Rien ne casse.**

### A. Base de données (≈ 2 min, clics humains)

Dans le tableau de bord Vercel du projet `nivex` :

1. Onglet **Storage** → **Create Database** → choisir **Neon** (Serverless Postgres)
2. Accepter les conditions du fournisseur → **Continue**
3. Région : **Washington, D.C. (iad1)** — la plus proche de Montréal
4. **Create**

Vercel injecte `DATABASE_URL` tout seul. Le schéma (tables `nivex_settings`,
`nivex_bookings`, `nivex_messages`, `nivex_events`) se crée au premier appel,
via `ensureSchema()` dans `src/lib/db.ts`. Rien à migrer à la main.

> L'acceptation des conditions doit venir d'un humain — un agent ne signe pas
> à la place de quelqu'un.

### B. Identifiants Google (≈ 6 min, clics humains)

Le but : permettre à Styve de brancher **son propre** compte Google depuis
`/admin`, sans que personne touche au code.

1. **Créer le projet** — https://console.cloud.google.com/projectcreate
   Nom : `NIVEX`.
2. **Activer les deux API** (bien vérifier que le projet NIVEX est sélectionné) :
   - https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   - https://console.cloud.google.com/apis/library/gmail.googleapis.com
3. **Écran de consentement OAuth** — https://console.cloud.google.com/auth/branding
   - Type : **Externe**
   - Nom de l'application : `NIVEX`
   - Courriel d'assistance et de contact : l'adresse de Styve
   - Laisser l'application en mode **Test**, et ajouter les adresses de Styve
     comme **utilisateurs de test**.
4. **Créer le client OAuth** — https://console.cloud.google.com/auth/clients
   - Type : **Application Web**
   - Nom : `NIVEX — site`
   - **URI de redirection autorisés** (les deux, exactement) :
     ```
     https://nivex-repassage.vercel.app/api/auth/google/callback
     http://localhost:3000/api/auth/google/callback
     ```
5. Copier le **Client ID** et le **Client secret**, puis :
   ```bash
   vercel env add GOOGLE_CLIENT_ID production
   vercel env add GOOGLE_CLIENT_SECRET production
   vercel deploy --prod
   ```

> **Le mode Test suffit indéfiniment.** Seul Styve s'authentifie avec Google ;
> les clients remplissent un simple formulaire. Publier l'application
> déclencherait une vérification Google de plusieurs semaines, inutile ici.

---

## 3. Vérifier que tout marche

```bash
curl -s https://nivex-repassage.vercel.app/api/health | python3 -m json.tool
```

Attendu : `database: true`, `google: true`.

Puis, dans un navigateur :

1. `/admin` → **Continuer avec Google** → se connecter avec le compte de Styve.
   Un **code d'installation** est demandé à la toute première connexion : il est
   dans la variable Vercel `ADMIN_SETUP_CODE` (production). Il garantit qu'un
   inconnu ne revendique pas l'espace artisan avant lui. Une fois le compte
   revendiqué, le code ne sert plus.
2. Accorder les deux autorisations : **Google Agenda** et **envoi Gmail**.
   Si l'une est refusée, `/admin` l'affiche en rouge avec un lien pour
   réautoriser.
3. `/fr/reserver` → réserver un créneau de test.
   Vérifier : l'événement apparaît dans l'agenda de Styve, le client reçoit la
   confirmation, Styve reçoit la fiche de mission.
4. Ouvrir le lien « Gérer ma réservation » du courriel → annuler.
   Vérifier : l'événement disparaît de l'agenda, les deux sont prévenus.

---

## 4. Développer en local

```bash
git clone https://github.com/ReneMarcellin007/nivex.git
cd nivex
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` contient déjà `NIVEX_DEMO=1` : le tunnel de réservation et le
formulaire de contact tournent alors sur un **agenda fictif**, sans base de
données ni compte Google. Le garde-fou refuse d'activer ce mode si
`VERCEL_ENV` vaut `production` — aucun risque de le laisser traîner.

```bash
npm test        # 26 cas du moteur de créneaux + 27 paires de contraste
npm run typecheck
npm run build
```

---

## 5. Repères dans le code

```
src/lib/
├── availability.ts   moteur de créneaux (heures d'ouverture, tampon, préavis)
├── time.ts           fuseaux horaires via Intl, bascules d'heure comprises
├── bookings.ts       création, annulation, statistiques
├── messages.ts       formulaire de contact
├── google.ts         OAuth + Calendar + Gmail, en fetch pur
├── email.ts          gabarits de courriel
├── db.ts             schéma Postgres, créé au premier appel
└── settings.ts       réglages modifiables depuis /admin
```

Quelques décisions à connaître avant de toucher au code :

- **Les durées et les prix sont recalculés côté serveur.** Le navigateur ne
  fait que proposer ; `createBooking` refait le calcul à partir du catalogue
  de prestations.
- **Le chevauchement est impossible au niveau de la base.** Une contrainte
  d'exclusion GiST sur `tstzrange(starts_at, ends_at)` ferme la course entre
  deux réservations simultanées. Un index unique seul ne suffisait pas :
  10 h–13 h et 11 h–12 h commencent à des heures différentes mais se
  chevauchent.
- **Le jeton Google est chiffré en AES-256-GCM** avant d'entrer en base.
- **Les messages de contact sont enregistrés avant toute tentative d'envoi.**
  Un courriel qui échoue ne doit jamais faire disparaître ce que quelqu'un a
  pris la peine d'écrire.
- **Les classes CSS maison vivent dans `@layer components`**, sinon elles
  écrasent les utilitaires Tailwind.

---

## 6. Ce que Styve pourra régler seul, sans code

Depuis `/admin`, onglet **Réglages** : heures d'ouverture jour par jour
(actuellement 7 h – 22 h, dimanche fermé), taux horaire, durée minimale,
durée par prestation, tampon de déplacement, délai de prévenance, horizon de
réservation, zone desservie, première heure offerte, et une pause pour les
vacances.

Pour bloquer du temps personnel, il lui suffit de le mettre dans son Google
Agenda : le créneau disparaît du site tout seul.

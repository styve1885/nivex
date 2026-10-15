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

## Avant de pousser

`npm test` puis `npm run build`. Les tests couvrent le moteur de créneaux,
les courriels et les contrastes. La production se déploie depuis `main` :
demandez avant de fusionner.

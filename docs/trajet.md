# Le temps de trajet — mise en place

Le site ne décide plus d'après une liste de codes postaux, mais d'après le
temps qu'il faut pour se rendre chez le client en transport en commun, le
jour de sa séance. Il lui faut donc deux choses : votre adresse de départ,
et une clé pour interroger Google.

Comptez un quart d'heure. Rien de ce qui suit n'est visible par vos clients.

---

## 1. Créer la clé Google

1. Ouvrez **console.cloud.google.com** et connectez-vous avec le compte
   Google que le site utilise déjà.
2. En haut à gauche, dans le sélecteur de projet, choisissez le projet qui
   porte déjà vos identifiants OAuth. Ne créez pas un nouveau projet : vous
   repartiriez de zéro pour la facturation.
3. Menu de gauche → **API et services** → **Bibliothèque**.
4. Cherchez **Routes API**. Ouvrez-la, puis cliquez **Activer**.
   C'est bien « Routes API », au pluriel, et non « Directions API » qui est
   l'ancienne génération.
5. Menu de gauche → **API et services** → **Identifiants**.
6. **+ Créer des identifiants** → **Clé API**. Google l'affiche aussitôt :
   copiez-la, elle commence par `AIza`.

### Restreindre la clé — ne sautez pas cette étape

Une clé sans restriction, si elle fuit, se fait utiliser par n'importe qui à
vos frais.

7. Sur la clé qui vient d'être créée, cliquez **Modifier la clé API**.
8. **Restrictions relatives aux applications** : laissez **Aucune**.
   Les appels partent des serveurs de Vercel, dont les adresses changent ;
   une restriction par adresse IP bloquerait votre propre site.
9. **Restrictions relatives aux API** : choisissez **Restreindre la clé**,
   puis cochez **Routes API** seule. C'est la protection qui compte : même
   récupérée, la clé ne servira qu'à demander des itinéraires.
10. **Enregistrer**.

### La facturation

Google exige un compte de facturation pour la Routes API, même en deçà du
crédit mensuel offert.

11. Menu de gauche → **Facturation**. Si le projet n'a pas de compte lié,
    suivez l'assistant.
12. Depuis 2025, Google n'offre plus un crédit mensuel global : chaque
    service a son propre quota gratuit. Pour la Routes API, il se compte en
    milliers d'appels par mois. Le site met chaque mesure en cache un mois,
    par quartier et par jour de la semaine — il en fera donc quelques
    dizaines, très loin du quota. En pratique : rien à payer, mais le compte
    de facturation reste exigé pour activer le service.
13. Par prudence, posez une alerte : **Facturation** → **Budgets et
    alertes** → **Créer un budget**, par exemple 5 $ par mois, avec un
    courriel à 50 % et 100 %. Cela ne coupe rien, cela vous prévient.

---

## 2. Poser les deux variables dans Vercel

1. Ouvrez **vercel.com**, projet **nivex** → onglet **Settings** →
   **Environment Variables**.
2. Ajoutez la première :
   - **Key** : `NIVEX_HOME_ADDRESS`
   - **Value** : votre adresse de départ, telle que vous la diriez à un
     chauffeur — numéro, rue, ville, province. Par exemple
     `1234 rue Saint-Charles Ouest, Longueuil, QC`.
   - **Environments** : cochez **Production**, **Preview** et
     **Development**.
3. Ajoutez la seconde :
   - **Key** : `GOOGLE_MAPS_API_KEY`
   - **Value** : la clé copiée à l'étape 6.
   - **Environments** : les trois, comme ci-dessus.
4. **Save** pour chacune.
5. Onglet **Deployments** → sur le déploiement le plus récent, menu `…` →
   **Redeploy**. Les variables ne sont lues qu'au démarrage : sans ce
   redéploiement, le site continuera de fonctionner avec l'ancienne
   configuration.

> Votre adresse ne sera jamais affichée sur le site, jamais envoyée au
> navigateur d'un visiteur, jamais écrite en base de données. Elle ne sert
> qu'à poser la question à Google, depuis le serveur.

---

## 3. Vérifier que cela fonctionne

1. Ouvrez votre site, page d'accueil, section **Contact**.
2. Dans « Votre code postal », tapez un code que vous connaissez bien —
   le vôtre, par exemple — et cliquez **Vérifier**.
3. Vous devez lire « Votre adresse est desservie » suivi d'une estimation en
   minutes. Si les minutes apparaissent, la clé fonctionne.
4. Essayez ensuite un code lointain, par exemple `G1A 1A1` (Québec) :
   vous devez lire « Hors zone pour la réservation en ligne ».

Si vous ne voyez aucune estimation en minutes mais que l'adresse est quand
même acceptée, c'est la **liste de secours** qui a répondu : l'appel à
Google n'a pas abouti. Ouvrez `/api/health`, la ligne `transit` donne la
raison exacte. Les deux causes les plus fréquentes sont une clé non
restreinte à la bonne API, et une Routes API restée désactivée.

---

## 4. Ce que vous pouvez régler ensuite

Tout se trouve dans **/admin → Réglages → Déplacement**, sans passer par
moi :

| Réglage | Valeur de départ | Ce qu'il décide |
|---|---|---|
| Gratuit en deçà de | 60 min | En dessous, aucun frais |
| Séance longue exigée au-delà de | 75 min | Plus loin, la séance dure au minimum trois heures |
| Réservation fermée au-delà de | 105 min | Plus loin, le client doit téléphoner |
| Ce qu'on appelle une séance longue | 180 min | Le seuil entre les deux tarifs |
| Séance de moins de 3 h | 25 $ | Frais d'une visite courte |
| Séance de 3 h ou plus | 15 $ | Frais d'une visite longue |
| Garder une mesure | 30 jours | Durée de vie du cache |
| Liste de secours | 26 préfixes | Adresses acceptées quand Google ne répond pas |

Les trois premiers seuils doivent aller du plus court au plus long ;
l'écran le signale et refuse d'enregistrer une suite incohérente.

**Videz les mesures en cache** (même écran) si vous déménagez, ou si un
horaire de transport change pour de bon. Sans cela, le site continuerait un
mois durant à facturer selon une carte périmée.

---

## 5. Si Google ne répond plus un jour

Le site ne ferme pas. Il bascule sur la liste de secours : les adresses qui
y figurent sont acceptées, **sans frais** — on ne facture pas une route
qu'on n'a pas mesurée —, et la réservation vous est signalée dans /admin
par une étiquette **« Trajet ? »**, avec un encadré qui vous dit de vérifier
le déplacement avant de vous engager. Les adresses hors de cette liste sont
refusées et invitées à téléphoner.

Gardez cette liste courte. Elle n'est pas la zone que vous annoncez : c'est
ce que vous acceptez les yeux fermés.

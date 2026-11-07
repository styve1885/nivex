# Banc d'essai local

Faire tourner le site construit, contre une base PostgreSQL du conteneur,
pour voir une page, éprouver un tunnel ou l'espace artisan avant de pousser.
Rien de tout cela ne touche la production : la base est locale, les
secrets sont factices (`env.sh`).

Le site parle à Neon par HTTP (`@neondatabase/serverless`). Le relais
`neon-relay.mjs` imite ce protocole sur `https://localhost/sql` et rejoue
chaque requête sur le PostgreSQL du conteneur.

## Une fois par conteneur

```bash
bash tools/local/setup.sh
```

PostgreSQL 16, ffmpeg, Playwright et son Chromium sont déjà dans l'image.
Le script démarre PostgreSQL, crée le rôle et la base `nivex`, un
certificat pour `localhost` (dans `certs/`, ignoré par git) et installe le
pilote `pg` du relais.

## À chaque essai

```bash
node tools/local/neon-relay.mjs &        # le relais (port 443)
bash tools/local/build.sh                # schéma, ligne de réglages, puis next build
bash tools/local/start.sh &              # http://localhost:3000
```

`build.sh` pose d'abord le schéma en un seul processus
(`npx tsx tools/local/schema.mjs`) : sur une base vide, les trois processus
de `next build` créeraient les mêmes tables en même temps et la
construction échouerait. Le même script éprouve un changement de schéma :
deux passages de suite, sur une base vide puis sur la même, doivent finir
par « schéma posé » sans avertissement `[nivex]`.

Pour un outil qui lance des commandes en arrière-plan, lancer le relais et
`start.sh` chacun comme tâche de fond, avec un long délai.

- **Espace artisan** : `node tools/local/session.mjs > /tmp/s.txt`, puis le
  cookie `nivex_session` (domaine `localhost`) dans Playwright, ou
  `-H "cookie: nivex_session=…"` avec curl. La route PATCH
  `/api/admin/settings` enregistre des réglages comme l'onglet le ferait.
- **Captures** : `node tools/local/shots.cjs http://localhost:3000/fr /tmp/captures "#presentation"`
  (390 px et 1280 px).
- **Déplacer des visites d'abonné, par le vrai code** :
  `bash -c 'source tools/local/env.sh && npx tsx tools/local/scenario-deplacement.mjs'`
  (relais lancé, pas besoin de construire). Google et Twilio sont simulés
  (`tests/tools/fake-google.mjs`) : rien ne sort du conteneur. Le scénario
  pose un abonné VIP, déplace sa 3/4 au mardi puis sa 4/4 au vendredi
  libéré, éprouve chaque refus et les replis quand Google refuse, puis
  efface ce qu'il a écrit.
- **Une autre base** : `NIVEX_DB=essai` pour `setup.sh`, le relais, `build.sh` et `start.sh`.

## Ce qui surprend

- **Après un enregistrement depuis `/admin`**, `next start` sert l'accueil
  en 404 et le reste en 500 : redémarrer `start.sh`. Vercel n'a pas ce
  défaut.
- **Les pages préparées se régénèrent toutes les cinq minutes.** Un réglage
  changé directement en base paraît sur les pages rendues à la visite
  (`/fr/reserver`) tout de suite, sur les autres après cinq minutes et deux
  visites, ou après une nouvelle construction.
- **Le Chromium du conteneur ne lit ni H.264 ni AAC.** Pour éprouver le
  lecteur de la vidéo, servir une copie WebM à la même adresse :
  `ffmpeg -i public/videos/nivex-presentation.mp4 -t 20 -c:v libvpx-vp9 -b:v 600k -c:a libopus /tmp/essai.webm`,
  puis `context.route(/nivex-presentation\.mp4/, r => r.fulfill({ contentType: "video/webm", body }))`.
  Le fichier réel se vérifie avec `ffprobe` et `ffmpeg -v error -i … -f null -`.
- **Le bouton lecture du lecteur natif** est dessiné par le navigateur, hors
  de la page : viser son emplacement (en bas à gauche) ou la touche Espace
  sur l'élément `video`.
- **Playwright se déclare « HeadlessChrome »** : ses visites et ses lectures
  s'inscrivent marquées robot, donc hors des comptes de l'onglet Visites.
- **La production n'est pas joignable** depuis le conteneur (réglages réseau
  de la session) : on la confirme par le journal du workflow IndexNow
  (voir HANDOFF.md).

#!/usr/bin/env bash
# Construit le site contre la base locale. Le relais doit tourner.
# `next build` lit les réglages et pose le schéma (bootstrap), comme chez Vercel.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$(dirname "$0")/../.."

# 1. Le schéma d'abord, en un seul processus. Sur une base neuve, les trois
#    processus de `next build` créeraient les mêmes tables en même temps, et
#    le second buterait sur le catalogue (seules les tables récentes sont
#    protégées par un bloc DO) : la construction échouerait. La production
#    n'est pas concernée, ses tables existent déjà. Sur une base déjà posée,
#    cette étape ne change rien.
npx tsx tools/local/schema.mjs

# 2. Une ligne de réglages, comme en production : sans elle, un enregistrement
#    depuis /admin n'aurait rien à mettre à jour. Sans propriétaire : n'importe
#    quelle session d'essai ouvre l'espace artisan (tools/local/session.mjs).
PGPASSWORD=nivex psql -h 127.0.0.1 -U nivex -d "${NIVEX_DB:-nivex}" -qc \
  "INSERT INTO nivex_settings (id) VALUES (1) ON CONFLICT DO NOTHING"

# 3. La construction.
npx next build

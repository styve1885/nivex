#!/usr/bin/env bash
# Prépare le banc d'essai local, une fois par conteneur. Peut se relancer sans
# rien casser. PostgreSQL 16 fait partie de l'image du conteneur.
#
#   bash tools/local/setup.sh
#
# Base : NIVEX_DB (par défaut « nivex »), rôle nivex / nivex, sur 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
DB="${NIVEX_DB:-nivex}"

# 1. PostgreSQL et la base. Le schéma, lui, se pose tout seul à la
#    construction (bootstrap() de src/lib/db.ts).
pg_isready -q || service postgresql start >/dev/null
for i in $(seq 1 20); do pg_isready -q && break; sleep 0.5; done
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname = 'nivex'\"" | grep -q 1 \
  || su postgres -c "psql -qc \"CREATE ROLE nivex LOGIN PASSWORD 'nivex' CREATEDB\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname = '$DB'\"" | grep -q 1 \
  || su postgres -c "createdb -O nivex $DB"

# 2. Le pilote Neon parle en HTTPS à https://localhost/sql : un certificat
#    local, ajouté aux autorités que Node connaît déjà (celles du proxy du
#    conteneur comprises, sinon les appels sortants échoueraient).
mkdir -p certs
if [ ! -f certs/cert.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout certs/key.pem -out certs/cert.pem 2>/dev/null
fi
BASE_CA="${NIVEX_BASE_CA:-${NODE_EXTRA_CA_CERTS:-}}"
[ "$BASE_CA" = "$HERE/certs/bundle.pem" ] && BASE_CA=""
[ -z "$BASE_CA" ] && [ -f /root/.ccr/ca-bundle.crt ] && BASE_CA=/root/.ccr/ca-bundle.crt
{ if [ -n "$BASE_CA" ] && [ -f "$BASE_CA" ]; then cat "$BASE_CA"; fi; cat certs/cert.pem; } > certs/bundle.pem

# 3. Le pilote PostgreSQL du relais.
[ -d node_modules/pg ] || npm install --silent --no-audit --no-fund >/dev/null

echo "Banc prêt (base « $DB »). Ensuite :"
echo "  node tools/local/neon-relay.mjs &     # le relais, sur https://localhost:443"
echo "  bash tools/local/build.sh             # construit contre la base locale"
echo "  bash tools/local/start.sh &           # http://localhost:3000"

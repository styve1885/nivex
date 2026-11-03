#!/usr/bin/env bash
# Sert la dernière construction sur http://localhost:${PORT:-3000}.
# Après un enregistrement depuis /admin (réglages ou zones), redémarrer :
# `next start` sert sinon l'accueil en 404 et le reste en 500 (voir CLAUDE.md).
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$(dirname "$0")/../.."
exec npx next start -p "${PORT:-3000}"

# Variables du banc local, à sourcer : aucune n'est un vrai secret, et aucune
# ne mène à la production. Ne jamais y mettre une valeur de Vercel.
HERE_LOCAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DATABASE_URL="postgresql://nivex:nivex@localhost/${NIVEX_DB:-nivex}"
export NODE_EXTRA_CA_CERTS="$HERE_LOCAL/certs/bundle.pem"
export ENCRYPTION_KEY=essai-cle-locale-pour-le-scenario-fictif
export SESSION_SECRET=essai-session-locale
export GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y
# L'origine canonique de production : les liens, le plan du site et les
# données structurées se lisent comme en ligne.
export NEXT_PUBLIC_SITE_URL=https://www.nivexrepassage.ca
export CRON_SECRET=essai-cron
# Des clés Twilio factices : le code des textos s'exécute, Twilio refuse.
export TWILIO_ACCOUNT_SID=ACessai TWILIO_AUTH_TOKEN=jeton TWILIO_FROM=+14385550000

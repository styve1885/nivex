// Une session d'essai pour l'espace artisan, signée avec le secret local
// d'env.sh. Le cookie s'appelle nivex_session.
//
//   node tools/local/session.mjs [courriel] > /tmp/session.txt
//   curl -H "cookie: nivex_session=$(cat /tmp/session.txt)" http://localhost:3000/api/admin/visits
//
// Une base neuve n'a pas de propriétaire : n'importe quel courriel ouvre
// l'espace. Si la ligne de réglages en porte un, passer celui-là.
import { SignJWT } from "jose";

const email = process.argv[2] ?? "artisan@example.com";
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "essai-session-locale");
const token = await new SignJWT({ email, name: "Essai", picture: null })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setIssuer("nivex")
  .setAudience("nivex-admin")
  .setExpirationTime("12h")
  .sign(secret);
console.log(token);

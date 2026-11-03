// Pose le schéma de la base locale en un seul processus, avant `next build`
// (voir build.sh). Lancé par tsx, qui lit le TypeScript du site :
//
//   npx tsx tools/local/schema.mjs
const { ensureSchema } = await import("../../src/lib/db.ts");
await ensureSchema();
console.log("schéma posé");

// Le relais du banc local : il parle le protocole HTTP de Neon (POST /sql,
// requête seule ou lot en transaction) et le rejoue sur le PostgreSQL du
// conteneur. Pour les essais seulement, jamais devant la production.
//
//   node tools/local/neon-relay.mjs &
//
// Écoute sur https://localhost:443 (le pilote Neon n'appelle qu'en HTTPS, sur
// le port par défaut). Base : PG_URL, ou celle de NIVEX_DB.
import https from "node:https";
import fs from "node:fs";
import pg from "pg";

const dir = new URL(".", import.meta.url).pathname;
const url = process.env.PG_URL ?? `postgresql://nivex:nivex@127.0.0.1/${process.env.NIVEX_DB ?? "nivex"}`;
const pool = new pg.Pool({ connectionString: url, max: 8 });
/* Une connexion au repos coupée par le serveur (PostgreSQL redémarré, base
   recréée) ne doit pas faire tomber le relais : la suivante la remplace. */
pool.on("error", (e) => console.warn("connexion perdue :", e.message));
/* Les valeurs repartent en texte, comme Neon les rend : le pilote les décode. */
const raw = { getTypeParser: () => (v) => v };

async function run(client, q) {
  const r = await client.query({ text: q.query, values: q.params, rowMode: "array", types: raw });
  return {
    fields: (r.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: r.rows ?? [], command: r.command, rowCount: r.rowCount,
  };
}

https.createServer({ key: fs.readFileSync(dir + "certs/key.pem"), cert: fs.readFileSync(dir + "certs/cert.pem") }, async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  let client;
  try {
    client = await pool.connect();
    const j = JSON.parse(body);
    let out;
    if (Array.isArray(j.queries)) {
      await client.query("BEGIN");
      try {
        const results = [];
        for (const q of j.queries) results.push(await run(client, q));
        await client.query("COMMIT");
        out = { results };
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    } else {
      out = await run(client, j);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: e.message, code: e.code, constraint: e.constraint, detail: e.detail }));
  } finally {
    client?.release();
  }
}).listen(443, "127.0.0.1", () => console.log(`relais Neon prêt sur https://localhost/sql → ${url.replace(/:[^:@/]*@/, ":***@")}`));

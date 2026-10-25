import { ensureSchema, logEvent, sql } from "./db";
import { INDEXNOW_KEY, SITE_URL } from "./brand";
import { publicUrls } from "./pages";

/**
 * IndexNow : prévenir Bing, et les autres moteurs du protocole, qu'une page
 * publique est nouvelle ou a changé, sans attendre leur prochain passage.
 * Google n'y participe pas : pour lui, c'est le plan du site et la Search
 * Console.
 *
 * Le moteur vérifie que le site nous appartient en lisant
 * public/<clé>.txt, qui ne contient que la clé (brand.ts). On n'envoie que
 * ce qui a bougé : chaque page porte sa date de modification (lib/pages.ts),
 * et la table `nivex_indexnow` garde, adresse par adresse, la date déjà
 * envoyée. Une page dont la date n'a pas avancé n'est pas renvoyée : les
 * moteurs demandent de ne signaler que les adresses changées.
 *
 * Deux déclencheurs, en production seulement, et tous deux après la mise en
 * ligne : la route /api/indexnow, que le workflow GitHub « IndexNow » appelle
 * dès qu'un déploiement de production a réussi, et, en filet, la tâche
 * quotidienne. Jamais pendant `next build` : la construction s'exécute avant
 * que le déploiement reçoive le domaine, si bien que le moteur aurait relu
 * l'ancienne page, ou pas encore trouvé le fichier de clé.
 *
 * Un envoi raté ne s'inscrit pas : le suivant reprend les mêmes adresses.
 * Rien ici ne doit faire échouer une page, un déploiement ni la tâche du
 * matin.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** L'adresse publique du fichier de clé, sur l'hôte des adresses envoyées. */
export const keyLocation = (origin = SITE_URL) => `${origin}/${INDEXNOW_KEY}.txt`;

export type PageStamp = { url: string; updated: string };

/** Les pages publiques à cette date, dans les deux langues. */
export function currentStamps(origin = SITE_URL): PageStamp[] {
  return publicUrls(origin).map(({ url, page }) => ({ url, updated: page.updated }));
}

/** Ce qui est nouveau, ou dont la date a avancé depuis le dernier envoi. */
export function changedStamps(current: PageStamp[], sent: Map<string, string>): PageStamp[] {
  return current.filter((p) => sent.get(p.url) !== p.updated);
}

/**
 * Le corps de la requête : l'hôte, la clé, l'adresse du fichier de clé, les
 * adresses. Un seul hôte par envoi, celui du www : une adresse sans www
 * serait refusée (422), et son fichier de clé n'est plus servi qu'après une
 * redirection.
 */
export function indexNowBody(urls: string[], origin = SITE_URL) {
  return {
    host: new URL(origin).host,
    key: INDEXNOW_KEY,
    keyLocation: keyLocation(origin),
    urlList: urls,
  };
}

/* 200 : reçu. 202 : reçu, la clé sera vérifiée plus tard — le cas du tout
   premier envoi. 400, 403 et 422 disent une erreur de réglage ; 429 et 5xx,
   un moteur pressé : dans tous ces cas rien ne s'inscrit, et le passage
   suivant réessaie. */
const ACCEPTED = new Set([200, 202]);

export type IndexNowResult = { submitted: string[]; status: number | null; skipped?: string };

/**
 * Le fichier de clé est-il servi tel quel, sur le www, sans redirection ?
 * Sinon le moteur répondrait 403 : on ne gaspille pas l'envoi, et le journal
 * le dit. C'est aussi la preuve que le domaine www répond.
 */
async function keyIsServed(fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(keyLocation(), { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return res.status === 200 && (await res.text()).trim() === INDEXNOW_KEY;
  } catch {
    return false;
  }
}

/**
 * Envoie les pages nouvelles ou modifiées, puis inscrit leur date. `fetchImpl`
 * remplace l'appel réseau dans les tests.
 */
export async function submitChangedPages(fetchImpl: typeof fetch = fetch): Promise<IndexNowResult> {
  await ensureSchema();
  const rows = (await sql()`SELECT url, updated FROM nivex_indexnow`) as { url: string; updated: string }[];
  const changed = changedStamps(currentStamps(), new Map(rows.map((r) => [r.url, r.updated])));
  if (changed.length === 0) return { submitted: [], status: null, skipped: "unchanged" };

  if (!(await keyIsServed(fetchImpl))) {
    await logEvent("indexnow_key_unreachable", { keyLocation: keyLocation() });
    return { submitted: [], status: null, skipped: "key_unreachable" };
  }

  const urls = changed.map((p) => p.url);
  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowBody(urls)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!ACCEPTED.has(res.status)) {
    await logEvent("indexnow_refused", { status: res.status, urls: urls.length });
    return { submitted: [], status: res.status };
  }
  await sql()`
    INSERT INTO nivex_indexnow (url, updated, submitted_at)
    SELECT value->>'url', value->>'updated', now()
    FROM jsonb_array_elements(${JSON.stringify(changed)}::jsonb)
    ON CONFLICT (url) DO UPDATE SET updated = EXCLUDED.updated, submitted_at = now()`;
  await logEvent("indexnow_sent", { status: res.status, urls });
  return { submitted: urls, status: res.status };
}

/** L'envoi des deux déclencheurs : en production seulement, et jamais en erreur. */
export async function submitIfProduction(fetchImpl: typeof fetch = fetch): Promise<IndexNowResult> {
  if (process.env.VERCEL_ENV !== "production") return { submitted: [], status: null, skipped: "not_production" };
  try {
    return await submitChangedPages(fetchImpl);
  } catch (e) {
    await logEvent("indexnow_failed", { message: e instanceof Error ? e.message : String(e) });
    return { submitted: [], status: null, skipped: "error" };
  }
}

import { getSettingsStrict } from "@/lib/settings";
import { llmsText } from "@/lib/llms";

/**
 * /llms.txt : la maison résumée pour les assistants qui le cherchent — le
 * service, les zones, les abonnements et la séance d'essai, le contact, les
 * pages —, écrit depuis les réglages comme les pages (voir lib/llms.ts). Le
 * détail est dans /llms-full.txt.
 *
 * Préparé à la construction et relu toutes les cinq minutes, comme l'accueil
 * et Tarifs, et par la lecture stricte : une relecture qui échoue laisse
 * servir la dernière version réussie, jamais des tarifs par défaut. Le
 * middleware laisse passer les fichiers en .txt sans les renvoyer vers /fr.
 */
export const revalidate = 300;

export async function GET() {
  const s = await getSettingsStrict();
  return new Response(llmsText(s), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

import { getSettingsStrict } from "@/lib/settings";
import { llmsFullText } from "@/lib/llms";

/**
 * /llms-full.txt : le détail que /llms.txt résume — pièces à l'unité, frais
 * par zone, conditions, questions et réponses —, écrit depuis les réglages
 * comme les pages (voir lib/llms.ts). Mêmes règles que /llms.txt : préparé à
 * la construction, relu toutes les cinq minutes, lecture stricte.
 */
export const revalidate = 300;

export async function GET() {
  const s = await getSettingsStrict();
  return new Response(llmsFullText(s), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

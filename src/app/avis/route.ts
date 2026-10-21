import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le lien court de la carte de remerciement : nivexrepassage.ca/avis.
 *
 * Il mène au lien d'avis de la fiche Google enregistré dans Réglages. Le
 * code QR imprimé porte cette adresse-ci, jamais celle de Google : si Google
 * change son lien, on colle le nouveau dans Réglages et les cartes déjà
 * distribuées restent bonnes. Sans lien enregistré, ou sur une base muette,
 * la personne arrive à l'accueil plutôt que sur une erreur.
 *
 * Le middleware le laisse passer tel quel : sans cela, il devenait
 * /fr/avis, une page introuvable.
 */
export async function GET(req: NextRequest) {
  const { reviewUrl } = await getSettings();
  /* Réglages n'enregistre qu'un lien https ; on ne suit rien d'autre. */
  return NextResponse.redirect(reviewUrl?.startsWith("https://") ? reviewUrl : new URL("/fr", req.url));
}

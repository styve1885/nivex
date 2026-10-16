import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { judgeZone } from "@/lib/zone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTAL = /^[A-Za-z]\d[A-Za-z]\s?-?\d[A-Za-z]\d$/;

/**
 * Le vérificateur de code postal, ouvert à tous.
 *
 * Ce que cette route ne dit jamais : l'adresse de départ de l'artisan. Elle
 * ne sort pas du serveur, ni ici ni ailleurs. La réponse se limite à un
 * verdict, un montant et un nombre de minutes.
 *
 * Elle coûte de l'argent, puisque chaque mesure non mise en cache appelle
 * Google. Trois garde-fous : un code postal doit être bien formé pour être
 * mesuré, les mesures se gardent un mois, et un quota par instance empêche
 * qu'un robot ne vide le compte en une nuit. Au-delà du quota la route
 * répond quand même — avec ce qu'elle a en cache, sinon en invitant à
 * appeler. Une mesure refusée vaut mieux qu'une facture inattendue.
 */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const brut = (sp.get("postal") ?? "").trim();

  if (!POSTAL.test(brut)) {
    return NextResponse.json({ ok: false, error: "invalid_postal" }, { status: 400 });
  }

  /* La durée sert à choisir entre le tarif court et le tarif long. Le
     vérificateur des pages publiques n'en a pas : on répond alors pour la
     séance la plus courte possible, c'est-à-dire le tarif le moins
     avantageux. Annoncer le meilleur cas serait une promesse à tenir. */
  const s = await getSettings();
  const demandee = Number(sp.get("minutes"));
  const durationMinutes = Number.isFinite(demandee) && demandee > 0
    ? Math.min(Math.round(demandee), 960)
    : s.minMinutes;

  if (!autorise()) {
    return NextResponse.json({ ok: false, error: "busy" }, { status: 429 });
  }

  const v = await judgeZone({ postalCode: brut, durationMinutes, settings: s });

  return NextResponse.json({
    ok: true,
    status: v.status,
    minutes: v.minutes,
    verified: v.verified,
    feeCents: v.feeCents,
    requiredSessionMinutes: v.requiredSessionMinutes,
    currency: s.currency,
  });
}

/* ====================== Quota ======================
 *
 * Un compteur en mémoire, remis à zéro chaque heure. Il ne survit pas au
 * recyclage d'une instance serverless et ne prétend pas être exact : il
 * n'est pas là pour compter juste, mais pour qu'une boucle lancée sur la
 * route ne puisse pas appeler Google des milliers de fois d'affilée. Les
 * mesures déjà en cache ne lui coûtent rien, puisqu'elles ne sortent pas.
 */
const PAR_HEURE = 120;
let fenetre = 0;
let compte = 0;

function autorise(): boolean {
  const heure = Math.floor(Date.now() / 3600_000);
  if (heure !== fenetre) { fenetre = heure; compte = 0; }
  compte += 1;
  return compte <= PAR_HEURE;
}

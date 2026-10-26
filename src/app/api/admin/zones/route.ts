import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getSettings, saveZonePolicy, zoneHistory } from "@/lib/settings";
import { notePublicContent } from "@/lib/freshness";
import { submitIfProduction } from "@/lib/indexnow";
import { POLICY_LIMITS, POLICY_VERSION, policyProblems, type ZonePolicy } from "@/lib/travel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * L'onglet « Zones et frais ».
 *
 * La forme est vérifiée par zod, le sens par `policyProblems` — le même
 * contrôle que l'interface affiche pendant la saisie. Ce que l'interface
 * signale, le serveur le refuse : un préfixe dans deux zones, une zone qui
 * n'existe plus, un préfixe mal formé, une borne dépassée. Le navigateur ne
 * décide de rien ici non plus.
 */

const L = POLICY_LIMITS;
const Key = z.string().trim().min(1).max(60);

const Policy = z.object({
  zones: z.array(z.object({
    key: Key,
    nameFr: z.string().trim().min(1).max(L.nameLength),
    nameEn: z.string().trim().max(L.nameLength),
    shortFeeCents: z.number().int().min(0).max(L.feeCents),
    longFeeCents: z.number().int().min(0).max(L.feeCents),
    thresholdMinutes: z.number().int().min(30).max(960),
  })).min(1).max(L.zones),
  sectors: z.array(z.object({
    key: Key,
    nameFr: z.string().trim().min(1).max(L.nameLength),
    nameEn: z.string().trim().max(L.nameLength),
    prefixes: z.array(z.string().trim().toUpperCase()).max(L.prefixesPerSector),
    zoneKey: Key,
    enabled: z.boolean(),
  })).max(L.sectors),
});

/* Ce que zod refuse, dit en clair. L'onglet signale déjà ces bornes pendant
   la saisie : on n'arrive ici qu'avec une requête qu'il n'aurait pas
   envoyée. On nomme quand même la zone ou le secteur, et le champ. */
const FIELDS: Record<string, string> = {
  key: "la clé", nameFr: "le nom français", nameEn: "le nom anglais", zoneKey: "la zone",
  shortFeeCents: "les frais sous le seuil", longFeeCents: "les frais à partir du seuil",
  thresholdMinutes: "le seuil", prefixes: "les préfixes", enabled: "l'état actif",
};

function refusals(issues: { path: PropertyKey[]; code: string }[], raw: unknown): string[] {
  const lines = issues.slice(0, 6).map(({ path, code }) => {
    const [list, index, field] = path;
    if (list !== "zones" && list !== "sectors") return "La grille envoyée est illisible.";
    if (typeof index !== "number") {
      if (code === "too_small") return "Il faut au moins une zone.";
      if (code === "too_big") return list === "zones" ? `${L.zones} zones au plus.` : `${L.sectors} secteurs au plus.`;
      return "La grille envoyée est illisible.";
    }
    const item = (raw as Record<string, unknown[]> | null)?.[list]?.[index] as { nameFr?: unknown } | undefined;
    const nom = typeof item?.nameFr === "string" && item.nameFr.trim() ? `« ${item.nameFr.trim().slice(0, 40)} »` : `n° ${index + 1}`;
    return `${list === "zones" ? "Zone" : "Secteur"} ${nom} : valeur refusée pour ${FIELDS[String(field)] ?? "une des valeurs"}.`;
  });
  return [...new Set(lines)];
}

export async function GET() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const [s, history] = await Promise.all([getSettings(), zoneHistory().catch(() => [])]);
  return NextResponse.json({ ok: true, policy: s.zonePolicy, history });
}

export async function PUT(req: NextRequest) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ ok: false }, { status: 401 });

  const raw = (await req.json().catch(() => null))?.policy;
  const parsed = Policy.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input", problems: refusals(parsed.error.issues, raw) }, { status: 400 });
  }

  /* Un nom anglais vide le reste : la lecture le remplace par le français, et
     il suit ainsi chaque correction du nom français. Le recopier ici le
     figeait, faute de frappe comprise. Un préfixe saisi deux fois dans le
     même secteur ne compte qu'une fois. */
  const policy: ZonePolicy = {
    version: POLICY_VERSION,
    zones: parsed.data.zones,
    sectors: parsed.data.sectors.map((x) => ({ ...x, prefixes: [...new Set(x.prefixes)] })),
  };

  const problems = policyProblems(policy);
  if (problems.length) return NextResponse.json({ ok: false, error: "invalid_policy", problems }, { status: 400 });

  await notePublicContent();
  const changes = await saveZonePolicy(policy, owner.email);
  /* Texte de zone, frais, page Montréal : la vitrine se sert depuis le cache,
     elle se refait dès la prochaine visite. */
  revalidatePath("/[locale]", "layout");
  const [s, history] = await Promise.all([getSettings(), zoneHistory().catch(() => [])]);
  /* Les pages prennent la date du jour, dans le plan du site et pour
     IndexNow, prévenu après la réponse. */
  await notePublicContent();
  revalidatePath("/sitemap.xml");
  after(() => submitIfProduction());
  return NextResponse.json({ ok: true, changes, policy: s.zonePolicy, history });
}

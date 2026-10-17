import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getSettings, saveZonePolicy, zoneHistory } from "@/lib/settings";
import { POLICY_VERSION, policyProblems, type ZonePolicy } from "@/lib/travel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * L'onglet « Zones et frais ».
 *
 * La forme est vérifiée par zod, le sens par `policyProblems` — le même
 * contrôle que l'interface affiche pendant la saisie. Ce que l'interface
 * signale, le serveur le refuse : un préfixe dans deux zones, une zone qui
 * n'existe plus, un préfixe mal formé. Le navigateur ne décide de rien ici
 * non plus.
 */

const Key = z.string().trim().min(1).max(60);

const Policy = z.object({
  zones: z.array(z.object({
    key: Key,
    nameFr: z.string().trim().min(1).max(80),
    nameEn: z.string().trim().max(80),
    shortFeeCents: z.number().int().min(0).max(50_000),
    longFeeCents: z.number().int().min(0).max(50_000),
    thresholdMinutes: z.number().int().min(30).max(960),
  })).min(1).max(30),
  sectors: z.array(z.object({
    key: Key,
    nameFr: z.string().trim().min(1).max(80),
    nameEn: z.string().trim().max(80),
    prefixes: z.array(z.string().trim().toUpperCase()).max(60),
    zoneKey: Key,
    enabled: z.boolean(),
  })).max(200),
});

export async function GET() {
  if (!(await requireOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const [s, history] = await Promise.all([getSettings(), zoneHistory().catch(() => [])]);
  return NextResponse.json({ ok: true, policy: s.zonePolicy, history });
}

export async function PUT(req: NextRequest) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = Policy.safeParse((await req.json().catch(() => null))?.policy);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input", problems: ["Certaines valeurs sont invalides : vérifiez les noms, les montants et les seuils."] }, { status: 400 });
  }

  /* Un nom anglais vide reprend le français ; un préfixe saisi deux fois
     dans le même secteur ne compte qu'une fois. */
  const policy: ZonePolicy = {
    version: POLICY_VERSION,
    zones: parsed.data.zones.map((x) => ({ ...x, nameEn: x.nameEn || x.nameFr })),
    sectors: parsed.data.sectors.map((x) => ({ ...x, nameEn: x.nameEn || x.nameFr, prefixes: [...new Set(x.prefixes)] })),
  };

  const problems = policyProblems(policy);
  if (problems.length) return NextResponse.json({ ok: false, error: "invalid_policy", problems }, { status: 400 });

  const changes = await saveZonePolicy(policy, owner.email);
  const [s, history] = await Promise.all([getSettings(), zoneHistory().catch(() => [])]);
  return NextResponse.json({ ok: true, changes, policy: s.zonePolicy, history });
}

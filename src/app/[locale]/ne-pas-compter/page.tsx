import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDict, isLocale } from "@/lib/i18n";
import { isOptOutKey } from "@/lib/session";
import { Mark } from "@/components/Logo";
import { OptOutNow } from "@/components/OptOutNow";
import { privateMeta } from "@/lib/seo";

/*
 * Le lien personnel de l'artisan, qui retire un navigateur du décompte.
 *
 * Il s'ouvre une fois dans chaque navigateur où l'artisan ne se connecte pas
 * à son espace : le navigateur intégré de Facebook ou d'Instagram, un autre
 * téléphone. Sans la bonne clé, la page n'existe pas. Elle n'est jamais
 * comptée, jamais indexée, et `robots.txt` la tient à l'écart.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return privateMeta((await params).locale, "optOut");
}

export default async function OptOutPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cle?: string | string[] }>;
}) {
  const { locale } = await params;
  const { cle } = await searchParams;
  if (!isLocale(locale) || !isOptOutKey(cle)) notFound();

  const t = getDict(locale);
  return (
    <div className="mx-auto max-w-lg px-7 py-40 text-center">
      <Mark className="mx-auto h-12 w-auto" />
      <h1 className="mt-8 font-display text-3xl font-light text-ink-800">{t.optOut.title}</h1>
      <OptOutNow t={t} />
      <Link href={`/${locale}`} className="btn mt-10">{t.optOut.back}</Link>
    </div>
  );
}

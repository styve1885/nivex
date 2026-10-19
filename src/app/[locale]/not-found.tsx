import type { Metadata } from "next";
import Link from "next/link";
import { locale as rootLocale } from "next/root-params";
import { Mark } from "@/components/Logo";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { notFoundMeta } from "@/lib/seo";

/*
 * La page d'une adresse qui ne mène nulle part, dans la langue de l'adresse.
 *
 * Elle ne reçoit aucun paramètre : la langue se lit au segment de la racine,
 * que `next/root-params` rend lisible de partout. Les adresses inconnues sous
 * /fr et /en y arrivent par [...missing], qui ne fait rien d'autre.
 */

async function currentLocale(): Promise<Locale> {
  const raw: string | undefined = await rootLocale();
  return isLocale(raw) ? raw : "fr";
}

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMeta(getDict(await currentLocale()));
}

export default async function NotFound() {
  const locale = await currentLocale();
  const t = getDict(locale);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 py-32 text-center">
      <Mark className="h-14 w-auto" />
      <p className="mt-8 font-display text-6xl font-light text-gold-500">404</p>
      <h1 className="mt-4 font-display text-3xl font-light text-ink-800">{t.notFound.title}</h1>
      <p className="mt-3 max-w-sm text-[0.92rem] font-light leading-relaxed text-ink-500">{t.notFound.body}</p>
      <Link href={`/${locale}`} className="btn mt-9">{t.notFound.home}</Link>
    </div>
  );
}

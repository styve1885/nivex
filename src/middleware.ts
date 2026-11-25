import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n";

/* Les fichiers de public/ passent tels quels. Sans `mp4`, la vidéo de
   présentation était renvoyée vers /fr/videos/…, une page introuvable. */
const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|html|pdf|webmanifest|woff2?|mp4)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /* `/_vercel` porte la mesure de l'hébergeur : son script et ses envois
     (`/_vercel/insights/view`, sans extension). Le middleware les redirigeait
     vers /fr/_vercel/…, une page introuvable. Le `matcher` du bas les écarte
     déjà ; ce test-ci tient si on le retouche.

     `/avis`, le lien court de la carte de remerciement, est une route à part
     (app/avis/route.ts) : envoyé vers /fr/avis, il tombait sur la page
     introuvable, et le code QR imprimé avec lui. */
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_vercel") ||
    pathname === "/avis" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  /* Une adresse déjà en /fr ou /en passe telle quelle. La langue de la page,
     `<html lang>` compris, se lit dans ce segment : la racine
     app/[locale]/layout.tsx le reçoit en paramètre. */
  const seg = pathname.split("/")[1];
  if (locales.includes(seg as (typeof locales)[number])) {
    return NextResponse.next();
  }

  /* La racine : redirection permanente (308) vers le français, la langue par
     défaut, quelle que soit celle du navigateur (25 novembre 2026). En 307,
     et selon la langue, Bing tenait « / » pour une page à part, double de
     /fr : même titre, même description. Une redirection permanente ne varie
     pas d'un visiteur à l'autre : le lien de langue est en haut de chaque
     page. Le domaine sans www y arrive par celle de Vercel (308, avant le
     code). Le reste de l'adresse (?utm_source=…) suit. */
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = `/${defaultLocale}`;
    return NextResponse.redirect(url, 308);
  }

  // Négociation de langue : le français reste la valeur par défaut au Québec.
  const accept = req.headers.get("accept-language") ?? "";
  const prefersEnglish = /^\s*en\b/i.test(accept) && !/\bfr\b/i.test(accept.split(",")[0] ?? "");
  const locale = prefersEnglish ? "en" : defaultLocale;

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico).*)"],
};

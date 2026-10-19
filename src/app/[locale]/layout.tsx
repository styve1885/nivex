import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMeasurement } from "@/components/SiteMeasurement";
import { cormorant, jost } from "@/lib/fonts";
import { getDict, isLocale, locales } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { TITLE_TEMPLATE, metaDescription, pageMeta, siteMetadata, siteViewport } from "@/lib/seo";
import "../globals.css";

/*
 * La racine de la vitrine.
 *
 * Le site a deux racines : celle-ci, sous le segment de langue, et celle de
 * l'espace artisan (app/admin/layout.tsx). Il n'y a plus de layout commun au
 * sommet, et c'est voulu. L'ancien lisait la langue dans un en-tête posé par
 * le middleware ; or lire un en-tête de requête rend dynamique tout ce qui est
 * dessous. Aucune page ne se servait donc depuis le cache de l'hébergeur, et
 * `revalidate = 300` ne faisait rien : chaque visite, chaque préchargement de
 * lien réveillait une fonction et la base.
 *
 * `<html lang>` se déduit maintenant du segment. Passer de /fr à /en re-rend
 * cette racine avec l'autre paramètre, et la langue de la page suit : avec
 * l'en-tête, elle restait celle du premier chargement, et un lecteur d'écran
 * lisait tout le site anglais avec la voix française.
 *
 * Un changement fait depuis /admin doit paraître tout de suite : les routes
 * qui enregistrent les réglages et les zones appellent `revalidatePath`.
 */

export const viewport: Viewport = siteViewport;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/* Deux langues, rien d'autre. Sans ce verrou, /foo.png ou /api, que le
   middleware laisse passer, tombaient ici avec une « langue » inconnue, et
   chaque adresse essayée par un robot laissait une page 404 dans le cache. */
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return siteMetadata;
  const t = getDict(locale);
  /* La description nomme les premiers secteurs de la Rive-Sud, puis
     Montréal : une phrase écrite à la main finirait par nommer un secteur
     fermé. L'offre n'y figure que si l'artisan la propose. */
  const s = await getSettings();
  const description = metaDescription(t, s.zonePolicy, locale === "en" ? "en" : "fr", s.firstHourFree);

  return {
    ...siteMetadata,
    ...pageMeta(t, locale, "", { absolute: t.meta.title }, description),
    title: { default: t.meta.title, template: TITLE_TEMPLATE },
  };
}

export default async function LocaleLayout({
  children, params,
}: {
  children: React.ReactNode; params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  /* /favicon.png, /api, /admin/… : le middleware laisse passer ces adresses,
     qui tombent ici avec une « langue » inconnue. Rien ne lit la base avant
     ce contrôle, ni ici, ni dans les pages, ni dans les métadonnées. */
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettings();

  return (
    <html lang={t.htmlLang} className={`${cormorant.variable} ${jost.variable}`}>
      <body>
        {/* Les sections se révèlent au défilement, par un script. Sans
            JavaScript, elles restaient invisibles : l'accueil s'arrêtait
            au bandeau. */}
        <noscript>
          <style>{".reveal{opacity:1;transform:none}"}</style>
        </noscript>
        <a href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink-800 focus:px-5 focus:py-3 focus:text-xs focus:uppercase focus:tracking-widest focus:text-linen-100">
          {locale === "en" ? "Skip to content" : "Aller au contenu"}
        </a>
        {/* Un composant client ne reçoit que ce qu'il lit : le dictionnaire
            entier, textes légaux compris, partait sinon dans chaque page. */}
        <SiteHeader t={{ nav: t.nav, brand: t.brand }} locale={locale} />
        <main id="contenu">{children}</main>
        <SiteFooter t={t} locale={locale} settings={settings} />
        {/*
          Mesure de fréquentation, chez l'hébergeur qui sert déjà le site :
          pas de témoin déposé, pas d'identifiant de navigateur conservé,
          donc rien à demander au visiteur et aucun quatrième fournisseur à
          déclarer. Ce qui remonte est agrégé — des nombres, des pages, des
          provenances —, jamais une personne. La politique de
          confidentialité le dit dans ces termes ; les deux doivent rester
          d'accord.

          Le composant porte aussi le journal anonyme de l'espace artisan et
          les deux exclusions qui vont avec : les pages /admin ne se comptent
          jamais, et un appareil marqué « ne pas compter » n'envoie plus
          rien. La racine de l'espace artisan le pose elle aussi ; le filtre
          vit dans le composant, là où le chemin est connu.
        */}
        <SiteMeasurement />
      </body>
    </html>
  );
}

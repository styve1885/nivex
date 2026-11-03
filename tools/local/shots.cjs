// Captures d'une page au téléphone (390 px, densité 3) et à l'écran
// (1280 px, densité 2), en-tête masqué et sections déjà révélées.
//
//   node tools/local/shots.cjs http://localhost:3000/fr /dossier/de/sortie ["#presentation"]
//
// Avec un sélecteur, seule cette partie est capturée ; sans, la page entière.
// Playwright et son Chromium sont déjà dans le conteneur : rien à installer.
// Il s'y trouve en module global, que `require` trouve et `import` non.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");

const [url, out, selector] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage : node tools/local/shots.cjs <adresse> <dossier> [sélecteur]");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: width < 600 ? 3 : 2, isMobile: width < 600,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.addStyleTag({ content: "header{display:none!important}.reveal{opacity:1!important;transform:none!important;transition:none!important}" });
    await page.waitForTimeout(800);
    const name = `${out}/${new URL(url).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "racine"}-${width}.png`;
    if (selector) await page.locator(selector).first().screenshot({ path: name });
    else await page.screenshot({ path: name, fullPage: true });
    console.log(`${name}${errors.length ? "  — erreurs : " + errors.join(" | ") : ""}`);
    await ctx.close();
  }
  await browser.close();
})();

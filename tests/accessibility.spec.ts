import AxeBuilder from '@axe-core/playwright';
import { test } from '../src/fixtures/stealth';
import { LiverpoolSearchPage } from '../src/pages/liverpool-search.page';

// Bonus: reporte informativo. No bloquea CI por deuda de accesibilidad ajena a esta suite.
test('@optional accessibility | resultados de búsqueda', async ({ page }, testInfo) => {
  const shop = new LiverpoolSearchPage(page);
  await shop.gotoHome();
  await shop.search(process.env.SEARCH_TERM ?? 'playstation 5');

  const results = await new AxeBuilder({ page }).analyze();
  console.log(`Violaciones de accesibilidad: ${results.violations.length}`);

  await testInfo.attach('axe-results.json', {
    body: Buffer.from(JSON.stringify(results.violations, null, 2)),
    contentType: 'application/json',
  });
});

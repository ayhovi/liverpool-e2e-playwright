import { expect, test } from '../src/fixtures/stealth';
import { LiverpoolSearchPage } from '../src/pages/liverpool-search.page';

// Bonus opcional: el presupuesto puede ajustarse por entorno sin modificar código.
test('@optional performance | resultados disponibles dentro del presupuesto', async ({ page }) => {
  const shop = new LiverpoolSearchPage(page);
  const budgetMs = Number(process.env.PERF_BUDGET_MS ?? 20_000);

  await shop.gotoHome();
  const startedAt = Date.now();
  await shop.search(process.env.SEARCH_TERM ?? 'playstation 5');
  const elapsedMs = Date.now() - startedAt;

  console.log(`Tiempo hasta resultados visibles: ${elapsedMs} ms (presupuesto ${budgetMs} ms)`);
  expect(elapsedMs).toBeLessThan(budgetMs);
});

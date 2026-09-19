import { expect, test } from '@playwright/test';
import { LiverpoolSearchPage } from '../src/pages/liverpool-search.page';

const visualSearchTerm = process.env.VISUAL_SEARCH_TERM ?? 'playstation 5';
const visualColor = process.env.VISUAL_FILTER_COLOR ?? 'Blanco';

test.describe('Visual regression', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });

  test('@optional @visual | layout de resultados filtrados y ordenados', async ({ page }) => {
    const shop = new LiverpoolSearchPage(page);

    await shop.gotoHome();
    await shop.search(visualSearchTerm);
    await shop.filterByColor(visualColor);
    await shop.sortByLowestPrice();

    // Confirma que el estado que se va a comparar visualmente ya contiene resultados reales.
    await shop.getFirstProducts(5);

    const firstProduct = page.locator('a[href*="/tienda/pdp/"]:visible').first();
    await firstProduct.scrollIntoViewIfNeeded();

    // Incluye los controles de filtro/ordenamiento y el inicio del grid en un viewport estable.
    await page.evaluate(() => window.scrollBy(0, -220));
    await page.evaluate(async () => {
      if ('fonts' in document) await document.fonts.ready;
    });

    // El catálogo es dinámico. Enmascaramos el contenido variable de las tarjetas
    // (producto/precio/imagen), pero conservamos su geometría para detectar cambios
    // reales de layout en la página de resultados.
    const dynamicProductCards = page.locator('a[href*="/tienda/pdp/"]:visible');
    const dynamicImages = page.locator('img:visible');

    await expect(page).toHaveScreenshot('search-results-layout.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      mask: [dynamicProductCards, dynamicImages],
      maxDiffPixelRatio: 0.02,
      scale: 'css',
    });
  });
});

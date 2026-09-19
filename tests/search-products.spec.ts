import { expect, test } from '../src/fixtures/stealth';
import { getSearchCases } from '../src/data/search-data';
import { LiverpoolSearchPage } from '../src/pages/liverpool-search.page';
import { NetworkProductCollector } from '../src/services/network-product-collector';
import { compareProducts } from '../src/utils/product-utils';

function assertAscendingPrices(prices: number[]): void {
  for (let index = 1; index < prices.length; index += 1) {
    expect(
      prices[index],
      `El resultado #${index + 1} (${prices[index]}) debe ser >= al resultado #${index} (${prices[index - 1]}).`,
    ).toBeGreaterThanOrEqual(prices[index - 1]);
  }
}

for (const searchCase of getSearchCases()) {
  test(`Liverpool | ${searchCase.term} | color ${searchCase.color} | UI vs network`, async ({ page }, testInfo) => {
    const shop = new LiverpoolSearchPage(page);
    const network = new NetworkProductCollector(page);
    network.start();

    try {
      await test.step('Navegar a Liverpool y buscar el producto', async () => {
        await shop.gotoHome();
        await shop.search(searchCase.term);
      });

      await test.step(`Filtrar por color ${searchCase.color}`, async () => {
        await shop.filterByColor(searchCase.color);
      });

      // A partir de aquí solo nos interesan requests pertenecientes al estado final.
      // El collector también ignora responses tardías de requests anteriores.
      network.clear();

      await test.step('Ordenar por precio de menor a mayor', async () => {
        await shop.sortByLowestPrice();
      });

      await test.step('Interceptar la respuesta de red del estado final', async () => {
        await network.waitForCandidate(3);
        await network.settle();
      });

      const uiProducts = await test.step('Extraer e imprimir los primeros 5 resultados visibles', async () => {
        const products = await shop.getFirstProducts(5);

        console.log('\nPrimeros 5 productos visibles del estado final:');
        console.table(
          products.map(({ id, skuId, name, price }) => ({ id, skuId, name, price })),
        );

        const prices = products.map((product) => {
          expect(product.price, `El producto "${product.name}" debe tener precio visible`).toBeDefined();
          return product.price as number;
        });

        // Esta aserción evita el falso positivo que existía antes: si el click en
        // "Menor precio" no se aplicó, el test falla aunque existan 3 coincidencias API.
        assertAscendingPrices(prices);

        return products;
      });

      const snapshot = network.selectBestSnapshot(uiProducts);
      const comparisons = compareProducts(uiProducts, snapshot.products);
      const matched = comparisons.filter((comparison) => comparison.matched).length;
      const discrepancies = comparisons.filter((comparison) => comparison.notes.length > 0);

      console.log(`\nRespuesta usada para validación: ${snapshot.responseUrl}`);
      console.log(`Coincidencias UI/API: ${matched}/${uiProducts.length}`);

      if (discrepancies.length) {
        console.warn('\nDiscrepancias UI/API detectadas:');
        for (const discrepancy of discrepancies) {
          const identity = discrepancy.ui.skuId
            ? `productId=${discrepancy.ui.id ?? 'N/A'}, skuId=${discrepancy.ui.skuId}`
            : `productId=${discrepancy.ui.id ?? 'N/A'}`;
          console.warn(`- ${identity} | ${discrepancy.ui.name}: ${discrepancy.notes.join(' | ')}`);
        }
      } else {
        console.log('Sin discrepancias de nombre/precio en los productos comparados.');
      }

      await testInfo.attach('ui-products.json', {
        body: Buffer.from(JSON.stringify(uiProducts, null, 2)),
        contentType: 'application/json',
      });
      await testInfo.attach('network-products.json', {
        body: Buffer.from(
          JSON.stringify(
            { responseUrl: snapshot.responseUrl, products: snapshot.products },
            null,
            2,
          ),
        ),
        contentType: 'application/json',
      });
      await testInfo.attach('ui-vs-network-comparison.json', {
        body: Buffer.from(JSON.stringify(comparisons, null, 2)),
        contentType: 'application/json',
      });

      expect(
        matched,
        'Al menos 3 de los 5 productos UI deben existir en la respuesta de red del mismo estado final',
      ).toBeGreaterThanOrEqual(3);
    } finally {
      network.stop();
    }
  });
}

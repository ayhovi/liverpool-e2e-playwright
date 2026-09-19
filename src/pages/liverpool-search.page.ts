import { expect, type Locator, type Page } from '@playwright/test';
import type { Product } from '../models/product';

function parseMoney(value: string): number | undefined {
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractIdentity(urlValue: string): { id?: string; skuId?: string } {
  try {
    const url = new URL(urlValue);
    const id = url.pathname.match(/\/(\d{6,})\/?$/)?.[1];
    const skuId = url.searchParams.get('skuid') ?? undefined;
    return { id, skuId };
  } catch {
    return {
      id: urlValue.match(/\/(\d{6,})(?:\?|\/|$)/)?.[1],
      skuId: urlValue.match(/[?&]skuid=(\d{6,})/i)?.[1],
    };
  }
}

function cleanProductName(text: string): string {
  return text
    .replace(/^Patrocinado\s*/i, '')
    // Corrige concatenaciones típicas del DOM: PLAYSTATIONConsola -> PLAYSTATION Consola.
    .replace(/([A-ZÁÉÍÓÚÑ0-9]{2,})([A-ZÁÉÍÓÚÑ][a-záéíóúñ])/g, '$1 $2')
    .replace(/(\d)([A-ZÁÉÍÓÚÑ][a-záéíóúñ])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export class LiverpoolSearchPage {
  constructor(private readonly page: Page) {}

  private get searchInput(): Locator {
    return this.page.getByPlaceholder(/Buscar por producto/i).first();
  }

  async gotoHome(): Promise<void> {
    await this.page.goto('/tienda/home', { waitUntil: 'domcontentloaded' });
    await expect(this.searchInput, 'No se encontró el buscador de Liverpool').toBeVisible({
      timeout: 15_000,
    });
    await this.dismissOptionalOverlays();
  }

  async search(term: string): Promise<void> {
    await expect(this.searchInput, 'No se encontró el campo de búsqueda').toBeVisible({
      timeout: 15_000,
    });

    await this.searchInput.clear();
    await this.searchInput.fill(term);
    await expect(this.searchInput).toHaveValue(term);
    await this.searchInput.press('Enter');

    const navigated = await this.page
      .waitForURL(
        (url) => url.pathname.includes('/tienda') && url.searchParams.has('s'),
        { timeout: 12_000 },
      )
      .then(() => true)
      .catch(() => false);

    if (!navigated) {
      const searchButton = this.page
        .getByRole('button', { name: /buscar|search/i })
        .filter({ visible: true })
        .first();

      if (await searchButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchButton.click();
      } else {
        await this.page.goto(`/tienda?s=${encodeURIComponent(term)}`, {
          waitUntil: 'domcontentloaded',
        });
      }
    }

    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForProducts();
    await this.waitForProductListToStabilize();
  }

  async filterByColor(color: string): Promise<void> {
    await this.openFiltersIfNeeded();

    const escapedColor = escapeRegExp(color);
    const colorPattern = new RegExp(escapedColor, 'i');
    const exactColorPattern = new RegExp(`^${escapedColor}(?:\\s*\\(\\d+\\))?$`, 'i');

    // En Liverpool el input MUI puede estar oculto aun cuando la opción visual
    // está desplegada. Por eso comprobamos primero el label/texto visible del color
    // y solo abrimos el acordeón "Color" cuando esa opción no está disponible.
    const visibleColorLabel = this.page
      .locator('label')
      .filter({ hasText: colorPattern })
      .filter({ visible: true })
      .first();

    const visibleColorText = this.page
      .getByText(exactColorPattern)
      .filter({ visible: true })
      .first();

    const colorOptionAlreadyVisible =
      (await visibleColorLabel.isVisible({ timeout: 2_000 }).catch(() => false)) ||
      (await visibleColorText.isVisible({ timeout: 2_000 }).catch(() => false));

    if (!colorOptionAlreadyVisible) {
      const colorHeading = this.page
        .getByText(/^Color$/i)
        .filter({ visible: true })
        .first();

      if (await colorHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await colorHeading.click();
      }
    }

    // Los filtros de Liverpool usan componentes MUI (PrivateSwitchBase-input) donde
    // el <input type="checkbox"> está oculto bajo el componente visual. Usar .check()
    // sobre el input no cambia el estado porque el handler lo gestiona el label/span
    // padre. La estrategia correcta es hacer clic en el label que envuelve el checkbox.
    const checkbox = this.page
      .getByRole('checkbox', { name: colorPattern })
      .first();

    if (await checkbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const isChecked = await checkbox.isChecked().catch(() => false);
      if (!isChecked) {
        // Intenta clic en el label que envuelve al input (patrón MUI)
        const label = this.page
          .locator('label')
          .filter({ has: checkbox })
          .first();

        if (await label.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await label.click();
        } else {
          // Fallback: clic en el span visual hermano del input
          await checkbox.locator('..').click().catch(() => undefined);
        }
      }
    } else {
      const labelOption = this.page
        .locator('label')
        .filter({ hasText: colorPattern })
        .filter({ visible: true })
        .first();

      if (await labelOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await labelOption.click();
      } else {
        const colorOption = this.page
          .getByText(colorPattern)
          .filter({ visible: true })
          .first();

        await expect(
          colorOption,
          `No se encontró el filtro de color "${color}"`,
        ).toBeVisible({ timeout: 15_000 });

        await colorOption.click();
      }
    }

    const applyButton = this.page
      .getByRole('button', { name: /Aplicar|Ver .*productos|Listo/i })
      .filter({ visible: true })
      .first();

    if (await applyButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await applyButton.click();
    }

    await this.waitForProducts();
    await this.waitForProductListToStabilize();
  }

  async sortByLowestPrice(): Promise<void> {
    const nativeSort = this.page
      .locator('select')
      .filter({ has: this.page.locator('option', { hasText: /Menor precio/i }) })
      .filter({ visible: true })
      .first();

    if (await nativeSort.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const option = nativeSort.locator('option').filter({ hasText: /^Menor precio$/i }).first();
      const value = await option.getAttribute('value');
      if (value) {
        await nativeSort.selectOption(value);
        await this.waitForProducts();
        await this.waitForProductListToStabilize();
        return;
      }
    }

    const lowestPrice = this.page
      .getByRole('button', { name: /^Menor precio$/i })
      .filter({ visible: true })
      .first();

    if (await lowestPrice.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await lowestPrice.click();
      await this.waitForProducts();
      await this.waitForProductListToStabilize();
      return;
    }

    const sortControl = this.page
      .getByText(/Ordenar por|^Ordenar$/i)
      .filter({ visible: true })
      .first();

    await expect(sortControl, 'No se encontró el control de ordenamiento').toBeVisible({
      timeout: 10_000,
    });
    await sortControl.click();

    const optionButton = this.page
      .getByRole('button', { name: /^Menor precio$/i })
      .filter({ visible: true })
      .first();

    if (await optionButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await optionButton.click();
    } else {
      const optionText = this.page
        .getByText(/^Menor precio$/i)
        .filter({ visible: true })
        .first();

      await expect(optionText, 'No se encontró la opción "Menor precio"').toBeVisible({
        timeout: 10_000,
      });
      await optionText.click();
    }

    await this.waitForProducts();
    await this.waitForProductListToStabilize();
  }

  async getFirstProducts(limit = 5): Promise<Product[]> {
    await this.waitForProducts();
    await this.waitForProductListToStabilize();

    const raw = await this.page
      .locator('a[href*="/tienda/pdp/"]:visible')
      .evaluateAll((anchors) =>
        anchors.map((anchor) => {
          const link = anchor as HTMLAnchorElement;
          let text = (link.innerText || link.textContent || '').replace(/\s+/g, ' ').trim();
          let node: HTMLElement | null = link.parentElement;

          // Busca el contenedor más cercano que siga representando un solo producto.
          // Esto cubre tarjetas donde nombre y precio están en enlaces hermanos.
          for (let depth = 0; depth < 5 && node; depth += 1) {
            const links = [...node.querySelectorAll<HTMLAnchorElement>('a[href*="/tienda/pdp/"]')];
            const uniqueProducts = new Set(
              links.map((item) => {
                try {
                  const url = new URL(item.href);
                  return `${url.pathname}?${url.searchParams.get('skuid') ?? ''}`;
                } catch {
                  return item.href;
                }
              }),
            );

            const candidateText = (node.innerText || node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();

            if (uniqueProducts.size > 1) break;
            if (candidateText.includes('$') && candidateText.length >= text.length) {
              text = candidateText;
            }

            node = node.parentElement;
          }

          return { href: link.href, text };
        }),
      );

    const byUrl = new Map<string, { href: string; text: string }>();

    for (const item of raw) {
      if (!item.href || !item.text.includes('$')) continue;

      const identity = extractIdentity(item.href);
      const key = `${identity.id ?? item.href}|${identity.skuId ?? ''}`;
      const previous = byUrl.get(key);

      if (!previous || item.text.length > previous.text.length) {
        byUrl.set(key, item);
      }
    }

    const products: Product[] = [];

    for (const item of byUrl.values()) {
      const priceMatches = [...item.text.matchAll(/\$\s*[\d,]+(?:\.\d{2})?/g)].map(
        (match) => match[0],
      );
      if (!priceMatches.length) continue;

      const prices = priceMatches
        .map(parseMoney)
        .filter((price): price is number => price != null && price >= 0);
      if (!prices.length) continue;

      const firstPriceIndex = item.text.indexOf('$');
      const name = cleanProductName(item.text.slice(0, firstPriceIndex));
      if (!name) continue;

      const { id, skuId } = extractIdentity(item.href);

      products.push({
        id,
        skuId,
        name,
        price: Math.min(...prices),
        url: item.href,
      });

      if (products.length === limit) break;
    }

    expect(
      products.length,
      `Se esperaban ${limit} productos visibles con nombre y precio`,
    ).toBe(limit);

    return products;
  }

  async waitForProducts(): Promise<void> {
    const productLinks = this.page.locator('a[href*="/tienda/pdp/"]:visible');
    await expect(productLinks.first(), 'No se cargaron resultados de productos').toBeVisible({
      timeout: 20_000,
    });
  }

  private async openFiltersIfNeeded(): Promise<void> {
    const colorSection = this.page
      .getByText(/^Color$/i)
      .filter({ visible: true })
      .first();

    if (await colorSection.isVisible({ timeout: 2_000 }).catch(() => false)) return;

    const filterButton = this.page
      .getByRole('button', { name: /Filtrar/i })
      .filter({ visible: true })
      .first();

    if (await filterButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await filterButton.click();
      return;
    }

    const filterText = this.page
      .getByText(/Filtrar/i)
      .filter({ visible: true })
      .first();

    await expect(filterText, 'No se encontró el control "Filtrar"').toBeVisible({
      timeout: 10_000,
    });
    await filterText.click();
  }

  private async waitForProductListToStabilize(timeoutMs = 12_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let previousSignature = '';
    let stableSamples = 0;

    while (Date.now() < deadline) {
      const signature = await this.page
        .locator('a[href*="/tienda/pdp/"]:visible')
        .evaluateAll((anchors) =>
          anchors
            .slice(0, 30)
            .map((anchor) => {
              const link = anchor as HTMLAnchorElement;
              return `${link.href}|${(link.textContent ?? '').replace(/\s+/g, ' ').trim()}`;
            })
            .join('||'),
        );

      if (signature && signature === previousSignature) {
        stableSamples += 1;
        if (stableSamples >= 2) return;
      } else {
        previousSignature = signature;
        stableSamples = 0;
      }

      await this.page.waitForTimeout(250);
    }
  }

  private async dismissOptionalOverlays(): Promise<void> {
    const possibleButtons = [/Aceptar/i, /Entendido/i, /^Cerrar$/i, /Continuar/i, /No gracias/i];

    for (const label of possibleButtons) {
      const button = this.page
        .getByRole('button', { name: label })
        .filter({ visible: true })
        .first();

      if (await button.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await button.click({ timeout: 2_000 }).catch(() => undefined);
      }
    }
  }
}

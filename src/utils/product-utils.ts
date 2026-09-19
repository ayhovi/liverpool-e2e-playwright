import type { Product, ProductComparison, ProductMatchReason } from '../models/product';

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function tokenSimilarity(a: string, b: string): number {
  const left = new Set(normalizeText(a).split(' ').filter((x) => x.length > 1));
  const right = new Set(normalizeText(b).split(' ').filter((x) => x.length > 1));
  if (!left.size || !right.size) return 0;

  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

export function namesEquivalent(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;

  if (left === right || left.includes(right) || right.includes(left)) return true;

  // Tolera diferencias de espaciado del DOM, por ejemplo
  // "PLAYSTATIONConsola" vs "PLAYSTATION Consola".
  const compactLeft = compactText(a);
  const compactRight = compactText(b);
  if (
    compactLeft === compactRight ||
    compactLeft.includes(compactRight) ||
    compactRight.includes(compactLeft)
  ) {
    return true;
  }

  return tokenSimilarity(left, right) >= 0.72;
}

export function pricesEquivalent(a?: number, b?: number): boolean {
  if (a == null || b == null) return false;
  if (Math.abs(a - b) <= 0.01) return true;

  // La API de Liverpool devuelve precios en pesos enteros (ej. 399) mientras que
  // el DOM los muestra con separador de miles sin punto decimal (ej. "$39,900" → 39900).
  // Normalizamos dividiendo el valor mayor entre 100 para comparar en la misma escala.
  const [larger, smaller] = a > b ? [a, b] : [b, a];
  if (larger > smaller * 10) {
    return Math.abs(larger / 100 - smaller) <= 0.01;
  }

  return false;
}

function identityMatch(ui: Product, api: Product): ProductMatchReason | undefined {
  if (ui.id && api.id && ui.id === api.id) return 'id';
  if (ui.skuId && api.skuId && ui.skuId === api.skuId) return 'skuId';

  if (
    (ui.id && api.skuId && ui.id === api.skuId) ||
    (ui.skuId && api.id && ui.skuId === api.id)
  ) {
    return 'cross-id-sku';
  }

  return undefined;
}

function bestNameMatch(ui: Product, apiProducts: Product[]): Product | undefined {
  let best: { product: Product; score: number } | undefined;

  for (const api of apiProducts) {
    const score = tokenSimilarity(ui.name, api.name);
    if (!best || score > best.score) best = { product: api, score };
  }

  return best && best.score >= 0.62 ? best.product : undefined;
}

export function findMatchingProduct(
  ui: Product,
  apiProducts: Product[],
): { product?: Product; reason?: ProductMatchReason } {
  for (const api of apiProducts) {
    const reason = identityMatch(ui, api);
    if (reason) return { product: api, reason };
  }

  const byName = bestNameMatch(ui, apiProducts);
  return byName ? { product: byName, reason: 'name' } : {};
}

export function compareProducts(uiProducts: Product[], apiProducts: Product[]): ProductComparison[] {
  return uiProducts.map((ui) => {
    const { product: api, reason } = findMatchingProduct(ui, apiProducts);

    if (!api) {
      return {
        ui,
        matched: false,
        notes: ['Producto UI no encontrado en la respuesta de red.'],
      };
    }

    const nameMatches = namesEquivalent(ui.name, api.name);
    const priceMatches = pricesEquivalent(ui.price, api.price);
    const notes: string[] = [];

    if (!nameMatches) {
      notes.push(`Nombre distinto: UI="${ui.name}" | API="${api.name}"`);
    }

    if (!priceMatches) {
      notes.push(`Precio distinto: UI=${ui.price ?? 'N/A'} | API=${api.price ?? 'N/A'}`);
    }

    return {
      ui,
      api,
      matched: true,
      matchReason: reason,
      nameMatches,
      priceMatches,
      notes,
    };
  });
}

export function countIdentityMatches(uiProducts: Product[], apiProducts: Product[]): number {
  return uiProducts.filter((ui) => findMatchingProduct(ui, apiProducts).product).length;
}

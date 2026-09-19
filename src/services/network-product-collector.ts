import type { Page, Request, Response } from '@playwright/test';
import type { NetworkSnapshot, Product } from '../models/product';
import { countIdentityMatches, normalizeText } from '../utils/product-utils';

const PRICE_KEYS = [
  'sort_price',
  'sortPrice',
  'promo_price',
  'promoPrice',
  'sale_price',
  'salePrice',
  'current_price',
  'currentPrice',
  'price',
  'minimum_promo_price',
  'minimumPromoPrice',
  'minimum_list_price',
  'minimumListPrice',
  'list_price',
  'listPrice',
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  return String(value).match(/\d{6,}/)?.[0];
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstPrice(record?: Record<string, unknown>): number | undefined {
  if (!record) return undefined;

  for (const key of PRICE_KEYS) {
    const value = numberFrom(record[key]);
    if (value != null && value >= 0) return value;
  }

  return undefined;
}

function priceFromObject(record: Record<string, unknown>): number | undefined {
  const direct = firstPrice(record);
  if (direct != null) return direct;

  for (const nestedKey of ['prices', 'priceInfo', 'price_info']) {
    const nested = firstPrice(asRecord(record[nestedKey]));
    if (nested != null) return nested;
  }

  const variants = Array.isArray(record.variants) ? record.variants : [];
  const variantPrices = variants
    .map(asRecord)
    .filter((value): value is Record<string, unknown> => !!value)
    .map(
      (variant) =>
        firstPrice(asRecord(variant.prices)) ??
        firstPrice(asRecord(variant.priceInfo)) ??
        firstPrice(variant),
    )
    .filter((value): value is number => value != null && value >= 0);

  return variantPrices.length ? Math.min(...variantPrices) : undefined;
}

function idFromObject(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.id,
    record.product_id,
    record.productId,
    record.primary_product_id,
    record.primaryProductId,
  ];

  for (const candidate of candidates) {
    const value = stringId(candidate);
    if (value) return value;
  }

  for (const candidate of [record.uri, record.url]) {
    if (typeof candidate !== 'string') continue;
    const match = candidate.match(/\/(\d{6,})(?:\?|\/|$)/);
    if (match) return match[1];
  }

  return undefined;
}

function skuIdFromObject(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.skuId,
    record.sku_id,
    record.skuid,
    record.sku,
    record.variantId,
    record.variant_id,
  ];

  for (const candidate of candidates) {
    const value = stringId(candidate);
    if (value) return value;
  }

  for (const candidate of [record.uri, record.url]) {
    if (typeof candidate !== 'string') continue;
    const match = candidate.match(/[?&]skuid=(\d{6,})/i);
    if (match) return match[1];
  }

  return undefined;
}

function titleFromObject(record: Record<string, unknown>): string | undefined {
  for (const key of [
    'title',
    'productName',
    'product_name',
    'displayName',
    'display_name',
    'titulo_sin_marca',
  ]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 2) return value.trim();
  }

  return undefined;
}

function productFromObject(record: Record<string, unknown>): Product | undefined {
  if (String(record.type ?? '').toUpperCase() === 'VARIANT') return undefined;

  const title = titleFromObject(record);
  const id = idFromObject(record);
  const skuId = skuIdFromObject(record);
  const price = priceFromObject(record);

  if (!title || (!id && !skuId && price == null)) return undefined;

  const brand = typeof record.brand === 'string' ? record.brand.trim() : '';
  const fullName =
    brand && !normalizeText(title).startsWith(normalizeText(brand))
      ? `${brand} ${title}`
      : title;

  const url =
    typeof record.uri === 'string'
      ? record.uri
      : typeof record.url === 'string'
        ? record.url
        : undefined;

  return { id, skuId, name: fullName, price, url };
}

function extractProducts(payload: unknown): Product[] {
  const products: Product[] = [];
  const seenObjects = new Set<unknown>();

  const visit = (value: unknown, depth: number): void => {
    if (depth > 9 || value == null || seenObjects.has(value)) return;
    if (typeof value !== 'object') return;

    seenObjects.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    const record = value as Record<string, unknown>;
    const candidate = productFromObject(record);
    if (candidate) products.push(candidate);

    for (const child of Object.values(record)) visit(child, depth + 1);
  };

  visit(payload, 0);

  const deduped = new Map<string, Product>();

  for (const product of products) {
    const key = product.id
      ? `id:${product.id}|sku:${product.skuId ?? ''}`
      : product.skuId
        ? `sku:${product.skuId}`
        : `name:${normalizeText(product.name)}`;

    const existing = deduped.get(key);
    if (!existing || (existing.price == null && product.price != null)) {
      deduped.set(key, product);
    }
  }

  return [...deduped.values()];
}

function isPreferredPlpResponse(url: string): boolean {
  return /\/api\/plp\/search(?:\?|$)/i.test(url);
}

export class NetworkProductCollector {
  private readonly snapshots: NetworkSnapshot[] = [];
  private readonly pending = new Set<Promise<void>>();
  private readonly requestGeneration = new WeakMap<Request, number>();
  private started = false;
  private generation = 0;

  constructor(private readonly page: Page) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.page.on('request', this.handleRequest);
    this.page.on('response', this.handleResponse);
  }

  stop(): void {
    if (!this.started) return;
    this.page.off('request', this.handleRequest);
    this.page.off('response', this.handleResponse);
    this.started = false;
  }

  /**
   * Inicia una nueva ventana de captura.
   * Las requests disparadas antes de este punto se ignoran aunque su response llegue después.
   */
  clear(): void {
    this.generation += 1;
    this.snapshots.length = 0;
  }

  private handleRequest = (request: Request): void => {
    this.requestGeneration.set(request, this.generation);
  };

  private handleResponse = (response: Response): void => {
    const generation = this.requestGeneration.get(response.request()) ?? this.generation;
    const task = this.capture(response, generation).finally(() => this.pending.delete(task));
    this.pending.add(task);
  };

  private async capture(response: Response, generation: number): Promise<void> {
    if (response.status() < 200 || response.status() >= 300) return;

    const headers = response.headers();
    const contentType = headers['content-type'] ?? '';
    const requestType = response.request().resourceType();
    const likelyJson = contentType.includes('json') || ['xhr', 'fetch'].includes(requestType);
    if (!likelyJson) return;

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return;
    }

    // Evita que una respuesta perteneciente a búsqueda/filtro anterior contamine
    // la ventana final iniciada antes del ordenamiento.
    if (generation !== this.generation) return;

    const products = extractProducts(payload);

    if (products.length >= 3) {
      this.snapshots.push({
        responseUrl: response.url(),
        products,
        capturedAt: Date.now(),
      });
    }
  }

  async waitForCandidate(minProducts = 3, timeoutMs = 20_000): Promise<void> {
    const startedAt = Date.now();
    const preferredDeadline = startedAt + Math.min(12_000, timeoutMs);
    const finalDeadline = startedAt + timeoutMs;

    // Primero esperamos específicamente el endpoint PLP observado en Liverpool.
    // Si el sitio lo cambia, después hacemos fallback a cualquier response JSON con productos.
    while (Date.now() < preferredDeadline) {
      if (
        this.snapshots.some(
          (snapshot) =>
            isPreferredPlpResponse(snapshot.responseUrl) &&
            snapshot.products.length >= minProducts,
        )
      ) {
        return;
      }
      await this.page.waitForTimeout(100);
    }

    while (Date.now() < finalDeadline) {
      if (this.snapshots.some((snapshot) => snapshot.products.length >= minProducts)) return;
      await this.page.waitForTimeout(100);
    }

    throw new Error(
      `No se interceptó una respuesta JSON del estado final con al menos ${minProducts} productos.`,
    );
  }

  async settle(quietMs = 500, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastSnapshotCount = this.snapshots.length;
    let quietSince = Date.now();

    while (Date.now() < deadline) {
      await Promise.allSettled([...this.pending]);

      if (this.snapshots.length !== lastSnapshotCount) {
        lastSnapshotCount = this.snapshots.length;
        quietSince = Date.now();
      }

      if (this.pending.size === 0 && Date.now() - quietSince >= quietMs) return;
      await this.page.waitForTimeout(100);
    }
  }

  selectBestSnapshot(uiProducts: Product[]): NetworkSnapshot {
    if (!this.snapshots.length) {
      throw new Error('No hay respuestas de red candidatas con productos.');
    }

    // Liverpool usa actualmente /api/plp/search para el listado. Se prioriza ese
    // endpoint, pero se conserva fallback genérico para no acoplar totalmente el test.
    const preferred = this.snapshots.filter((snapshot) =>
      isPreferredPlpResponse(snapshot.responseUrl),
    );
    const candidates = preferred.length ? preferred : this.snapshots;

    return [...candidates].sort((a, b) => {
      const matchDiff =
        countIdentityMatches(uiProducts, b.products) -
        countIdentityMatches(uiProducts, a.products);
      if (matchDiff !== 0) return matchDiff;

      // Si empatan en identidad, preferimos la respuesta más reciente del estado final.
      return b.capturedAt - a.capturedAt;
    })[0];
  }
}

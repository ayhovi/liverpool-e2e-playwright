export interface Product {
  id?: string;
  skuId?: string;
  name: string;
  price?: number;
  url?: string;
}

export interface NetworkSnapshot {
  responseUrl: string;
  products: Product[];
  capturedAt: number;
}

export type ProductMatchReason = 'id' | 'skuId' | 'cross-id-sku' | 'name';

export interface ProductComparison {
  ui: Product;
  api?: Product;
  matched: boolean;
  matchReason?: ProductMatchReason;
  nameMatches?: boolean;
  priceMatches?: boolean;
  notes: string[];
}

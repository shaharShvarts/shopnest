import type {
  InventoryAvailability,
  InventoryStatus,
} from "@/lib/inventory/core";

export const DEFAULT_SEARCH_RESULT_LIMIT = 24;
export const MAX_SEARCH_RESULT_LIMIT = 40;
export const MAX_SEARCH_QUERY_LENGTH = 100;

export type SearchCatalogProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string;
  categoryName: string;
  subcategoryName: string | null;
};

export type StorefrontSearchResult = SearchCatalogProduct & {
  quantity: number;
  physical: number;
  reserved: number;
  available: number;
  inventoryStatus: InventoryStatus;
};

export interface StorefrontSearchStore {
  searchVisibleProducts(
    normalizedQuery: string,
    limit: number
  ): Promise<SearchCatalogProduct[]>;
}

export interface SearchInventoryReader {
  getAvailabilityBatch(
    productIds: number[]
  ): Promise<Map<number, InventoryAvailability>>;
}

export type StorefrontSearchResponse = {
  query: string;
  results: StorefrontSearchResult[];
  limit: number;
};

export class SearchQueryError extends Error {
  readonly code = "query_too_long";
  readonly maxLength = MAX_SEARCH_QUERY_LENGTH;

  constructor() {
    super(`Search query cannot exceed ${MAX_SEARCH_QUERY_LENGTH} characters.`);
    this.name = "SearchQueryError";
  }
}

export function normalizeSearchQuery(rawQuery: string | null | undefined) {
  const query = (rawQuery ?? "").trim();
  if (query.length > MAX_SEARCH_QUERY_LENGTH) throw new SearchQueryError();
  return query;
}

export function normalizeSearchLimit(limit = DEFAULT_SEARCH_RESULT_LIMIT) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULT_LIMIT) {
    throw new RangeError(
      `Search result limit must be between 1 and ${MAX_SEARCH_RESULT_LIMIT}.`
    );
  }
  return limit;
}

export async function searchStorefrontProducts(
  store: StorefrontSearchStore,
  inventory: SearchInventoryReader,
  rawQuery: string | null | undefined,
  limit = DEFAULT_SEARCH_RESULT_LIMIT
): Promise<StorefrontSearchResponse> {
  const query = normalizeSearchQuery(rawQuery);
  const normalizedLimit = normalizeSearchLimit(limit);
  if (!query) return { query, results: [], limit: normalizedLimit };

  const catalogProducts = await store.searchVisibleProducts(
    query,
    normalizedLimit
  );
  const availability = await inventory.getAvailabilityBatch(
    catalogProducts.map((product) => product.id)
  );

  return {
    query,
    limit: normalizedLimit,
    results: catalogProducts.map((product) => {
      const stock = availability.get(product.id);
      if (!stock) {
        throw new Error(`Inventory is missing for search product ${product.id}.`);
      }
      return {
        ...product,
        quantity: stock.available,
        physical: stock.physical,
        reserved: stock.reserved,
        available: stock.available,
        inventoryStatus: stock.status,
      };
    }),
  };
}

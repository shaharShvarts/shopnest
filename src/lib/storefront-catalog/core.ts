import type {
  InventoryAvailability,
  InventoryStatus,
} from "@/lib/inventory/core";

export type StorefrontCategory = {
  id: number;
  name: string;
  imageUrl: string;
};

export type StorefrontSubcategory = StorefrontCategory & {
  categoryId: number;
};

export type StorefrontCatalogProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string;
};

export type StorefrontProductPreview = StorefrontCatalogProduct & {
  quantity: number;
  physical: number;
  reserved: number;
  available: number;
  inventoryStatus: InventoryStatus;
};

export interface StorefrontCatalogStore {
  findVisibleCategory(categoryId: number): Promise<StorefrontCategory | null>;
  listVisibleSubcategories(
    categoryId: number
  ): Promise<StorefrontSubcategory[]>;
  listVisibleDirectProducts(
    categoryId: number
  ): Promise<StorefrontCatalogProduct[]>;
  findVisibleSubcategory(
    categoryId: number,
    subcategoryId: number
  ): Promise<StorefrontSubcategory | null>;
  listVisibleSubcategoryProducts(
    categoryId: number,
    subcategoryId: number
  ): Promise<StorefrontCatalogProduct[]>;
}

export interface CatalogInventoryReader {
  getAvailabilityBatch(
    productIds: number[]
  ): Promise<Map<number, InventoryAvailability>>;
}

export type CategoryCatalog = {
  category: StorefrontCategory;
  subcategories: StorefrontSubcategory[];
  directProducts: StorefrontProductPreview[];
};

export type SubcategoryCatalog = {
  category: StorefrontCategory;
  subcategory: StorefrontSubcategory;
  products: StorefrontProductPreview[];
};

export async function getCategoryCatalog(
  store: StorefrontCatalogStore,
  inventory: CatalogInventoryReader,
  categoryId: number
): Promise<CategoryCatalog | null> {
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) return null;

  const category = await store.findVisibleCategory(categoryId);
  if (!category) return null;

  const [subcategories, directProducts] = await Promise.all([
    store.listVisibleSubcategories(categoryId),
    store.listVisibleDirectProducts(categoryId),
  ]);

  return {
    category,
    subcategories,
    directProducts: await enrichAvailability(directProducts, inventory),
  };
}

export async function getSubcategoryCatalog(
  store: StorefrontCatalogStore,
  inventory: CatalogInventoryReader,
  categoryId: number,
  subcategoryId: number
): Promise<SubcategoryCatalog | null> {
  if (
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0 ||
    !Number.isSafeInteger(subcategoryId) ||
    subcategoryId <= 0
  ) {
    return null;
  }

  const category = await store.findVisibleCategory(categoryId);
  if (!category) return null;

  const subcategory = await store.findVisibleSubcategory(
    categoryId,
    subcategoryId
  );
  if (!subcategory) return null;

  const products = await store.listVisibleSubcategoryProducts(
    categoryId,
    subcategoryId
  );

  return {
    category,
    subcategory,
    products: await enrichAvailability(products, inventory),
  };
}

async function enrichAvailability(
  products: StorefrontCatalogProduct[],
  inventory: CatalogInventoryReader
) {
  const availability = await inventory.getAvailabilityBatch(
    products.map((product) => product.id)
  );

  return products.map((product) => {
    const stock = availability.get(product.id);
    if (!stock) {
      throw new Error(`Inventory is missing for catalog product ${product.id}.`);
    }

    return {
      ...product,
      quantity: stock.available,
      physical: stock.physical,
      reserved: stock.reserved,
      available: stock.available,
      inventoryStatus: stock.status,
    };
  });
}

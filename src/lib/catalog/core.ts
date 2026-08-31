export type CatalogCategoryRecord = {
  id: number;
};

export type CatalogSubcategoryRecord = {
  id: number;
  categoryId: number;
};

export type NewCatalogCategory = {
  name: string;
  imageUrl: string;
};

export type NewCatalogSubcategory = NewCatalogCategory & {
  categoryId: number;
};

export type NewCatalogProduct = {
  name: string;
  description?: string;
  price: number;
  quantity: number;
  lowStockThreshold: number;
  criticalStockThreshold: number;
  imageUrl: string;
  categoryId: number;
  subcategoryId: number | null;
};

export interface CatalogStore {
  findCategory(id: number): Promise<CatalogCategoryRecord | null>;
  findSubcategory(id: number): Promise<CatalogSubcategoryRecord | null>;
  createCategory(input: NewCatalogCategory): Promise<void>;
  createSubcategory(input: NewCatalogSubcategory): Promise<void>;
  createProduct(input: NewCatalogProduct): Promise<number>;
}

export type CatalogValidationErrorCode =
  | "invalid_category"
  | "invalid_subcategory"
  | "category_subcategory_mismatch";

export class CatalogValidationError extends Error {
  readonly code: CatalogValidationErrorCode;
  readonly field: "categoryId" | "subcategoryId";

  constructor(
    code: CatalogValidationErrorCode,
    field: "categoryId" | "subcategoryId",
    message: string
  ) {
    super(message);
    this.name = "CatalogValidationError";
    this.code = code;
    this.field = field;
  }
}

export async function validateCategory(
  store: Pick<CatalogStore, "findCategory">,
  categoryId: number
) {
  const category = await store.findCategory(categoryId);
  if (!category) {
    throw new CatalogValidationError(
      "invalid_category",
      "categoryId",
      "The selected category does not exist."
    );
  }
  return category;
}

export async function validateProductPlacement(
  store: Pick<CatalogStore, "findCategory" | "findSubcategory">,
  categoryId: number,
  subcategoryId: number | null
) {
  await validateCategory(store, categoryId);
  if (subcategoryId === null) return;

  const subcategory = await store.findSubcategory(subcategoryId);
  if (!subcategory) {
    throw new CatalogValidationError(
      "invalid_subcategory",
      "subcategoryId",
      "The selected subcategory does not exist."
    );
  }
  if (subcategory.categoryId !== categoryId) {
    throw new CatalogValidationError(
      "category_subcategory_mismatch",
      "subcategoryId",
      "The selected subcategory does not belong to the selected category."
    );
  }
}

export async function createCatalogCategory(
  store: CatalogStore,
  input: NewCatalogCategory
) {
  await store.createCategory(input);
}

export async function createCatalogSubcategory(
  store: CatalogStore,
  input: NewCatalogSubcategory
) {
  await validateCategory(store, input.categoryId);
  await store.createSubcategory(input);
}

export async function createCatalogProduct(
  store: CatalogStore,
  input: NewCatalogProduct
) {
  await validateProductPlacement(
    store,
    input.categoryId,
    input.subcategoryId
  );
  return store.createProduct(input);
}

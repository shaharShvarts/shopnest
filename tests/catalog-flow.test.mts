import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CatalogValidationError,
  createCatalogCategory,
  createCatalogProduct,
  createCatalogSubcategory,
  type CatalogCategoryRecord,
  type CatalogStore,
  type CatalogSubcategoryRecord,
  type NewCatalogCategory,
  type NewCatalogProduct,
  type NewCatalogSubcategory,
} from "../src/lib/catalog/core.ts";
import {
  countProductsByCategory,
  countProductsBySubcategory,
  countSubcategoriesByCategory,
} from "../src/lib/catalog/counts.ts";
import {
  authorizeTenantAdmin,
  type AdminPrincipal,
  type TenantControlRecord,
} from "../src/lib/admin-auth/core.ts";

const imageUrl = "/products/test.jpg";

test("category can be created in the current tenant catalog", async () => {
  const store = new FakeCatalogStore("panda_pop");

  await createCatalogCategory(store, {
    name: "Clothing",
    imageUrl: "/categories/clothing.jpg",
  });

  assert.equal(store.categories[0].name, "Clothing");
});

test("subcategory can be created under an existing category", async () => {
  const store = catalogWithClothing();

  await createCatalogSubcategory(store, {
    name: "Shirts",
    imageUrl: "/subcategories/shirts.jpg",
    categoryId: 1,
  });

  assert.equal(store.subcategories[0].categoryId, 1);
});

test("subcategory cannot be created under a missing category", async () => {
  const store = new FakeCatalogStore("panda_pop");

  await assert.rejects(
    createCatalogSubcategory(store, {
      name: "Orphan",
      imageUrl,
      categoryId: 99,
    }),
    (error) =>
      error instanceof CatalogValidationError &&
      error.code === "invalid_category"
  );
  assert.equal(store.subcategories.length, 0);
});

test("product can be created directly under a category", async () => {
  const store = catalogWithClothing();

  await createCatalogProduct(store, productInput({ subcategoryId: null }));

  assert.equal(store.products[0].categoryId, 1);
  assert.equal(store.products[0].subcategoryId, null);
});

test("product can be created under a valid subcategory", async () => {
  const store = catalogWithClothingAndShirts();

  await createCatalogProduct(store, productInput({ subcategoryId: 1 }));

  assert.equal(store.products[0].subcategoryId, 1);
});

test("product with a category/subcategory mismatch is rejected", async () => {
  const store = catalogWithClothingAndShirts();
  store.categories.push({ id: 2, name: "Electronics", imageUrl });

  await assert.rejects(
    createCatalogProduct(
      store,
      productInput({ categoryId: 2, subcategoryId: 1 })
    ),
    (error) =>
      error instanceof CatalogValidationError &&
      error.code === "category_subcategory_mismatch"
  );
  assert.equal(store.products.length, 0);
});

test("product with a missing subcategory is rejected", async () => {
  const store = catalogWithClothing();

  await assert.rejects(
    createCatalogProduct(store, productInput({ subcategoryId: 99 })),
    (error) =>
      error instanceof CatalogValidationError &&
      error.code === "invalid_subcategory"
  );
  assert.equal(store.products.length, 0);
});

test("subcategory product counts use subcategoryId, not categoryId", () => {
  const products = [
    { categoryId: 1, subcategoryId: 8 },
    { categoryId: 8, subcategoryId: null },
    { categoryId: 1, subcategoryId: 8 },
  ];

  assert.equal(countProductsBySubcategory(products).get(8), 2);
  assert.equal(countProductsByCategory(products).get(8), 1);
});

test("category, subcategory, and product mutations stay in the selected tenant store", async () => {
  const panda = new FakeCatalogStore("panda_pop");
  const gift = new FakeCatalogStore("gift_shop");

  await createCatalogCategory(panda, {
    name: "Tenant-only category",
    imageUrl,
  });
  await createCatalogSubcategory(panda, {
    name: "Tenant-only subcategory",
    imageUrl,
    categoryId: 1,
  });
  await createCatalogProduct(panda, productInput({ subcategoryId: 1 }));

  assert.equal(panda.categories.length, 1);
  assert.equal(panda.subcategories.length, 1);
  assert.equal(panda.products.length, 1);
  assert.equal(gift.categories.length, 0);
  assert.equal(gift.subcategories.length, 0);
  assert.equal(gift.products.length, 0);
});

test("tenant admin authorization blocks mutation of another tenant catalog", () => {
  const principal: AdminPrincipal = {
    id: 1,
    email: "manager@example.com",
    role: "tenant_admin",
    isActive: true,
    tenantSlugs: ["panda-pop"],
  };
  const giftTenant: TenantControlRecord = {
    slug: "gift-shop",
    schemaName: "gift_shop",
    displayName: "Gift Shop",
    status: "active",
  };
  const gift = new FakeCatalogStore("gift_shop");

  assert.equal(authorizeTenantAdmin(principal, giftTenant), "forbidden");
  assert.equal(gift.products.length, 0);
});

test("all catalog mutation modules require the tenant-authorized database", async () => {
  for (const file of ["categories.ts", "subcategories.ts", "products.ts"]) {
    const source = await readFile(`src/app/admin/_actions/${file}`, "utf8");
    assert.match(source, /requireTenantAdminDb\(\)/);
    assert.doesNotMatch(source, /\bgetDb\s*\(/);
    assert.doesNotMatch(source, /getDbForTenant\s*\(/);
  }
});

test("separate count indexes avoid multiplicative category joins", () => {
  const products = [
    { categoryId: 1, subcategoryId: 10 },
    { categoryId: 1, subcategoryId: 11 },
  ];
  const subcategories = [{ categoryId: 1 }, { categoryId: 1 }];

  assert.equal(countProductsByCategory(products).get(1), 2);
  assert.equal(countSubcategoriesByCategory(subcategories).get(1), 2);
});

type StoredCategory = NewCatalogCategory & CatalogCategoryRecord;
type StoredSubcategory = NewCatalogSubcategory & CatalogSubcategoryRecord;
type StoredProduct = NewCatalogProduct & { id: number };

class FakeCatalogStore implements CatalogStore {
  readonly tenantSchema: string;
  categories: StoredCategory[] = [];
  subcategories: StoredSubcategory[] = [];
  products: StoredProduct[] = [];

  constructor(tenantSchema: string) {
    this.tenantSchema = tenantSchema;
  }

  async findCategory(id: number) {
    return this.categories.find((category) => category.id === id) ?? null;
  }

  async findSubcategory(id: number) {
    return (
      this.subcategories.find((subcategory) => subcategory.id === id) ?? null
    );
  }

  async createCategory(input: NewCatalogCategory) {
    this.categories.push({ ...input, id: this.categories.length + 1 });
  }

  async createSubcategory(input: NewCatalogSubcategory) {
    this.subcategories.push({
      ...input,
      id: this.subcategories.length + 1,
    });
  }

  async createProduct(input: NewCatalogProduct) {
    const id = this.products.length + 1;
    this.products.push({ ...input, id });
    return id;
  }
}

function catalogWithClothing() {
  const store = new FakeCatalogStore("panda_pop");
  store.categories.push({ id: 1, name: "Clothing", imageUrl });
  return store;
}

function catalogWithClothingAndShirts() {
  const store = catalogWithClothing();
  store.subcategories.push({
    id: 1,
    name: "Shirts",
    imageUrl,
    categoryId: 1,
  });
  return store;
}

function productInput(
  overrides: Partial<NewCatalogProduct> = {}
): NewCatalogProduct {
  return {
    name: "Product",
    description: "Description",
    price: 1000,
    quantity: 5,
    lowStockThreshold: 10,
    criticalStockThreshold: 4,
    imageUrl,
    categoryId: 1,
    subcategoryId: null,
    ...overrides,
  };
}

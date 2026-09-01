import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  getCategoryCatalog,
  getSubcategoryCatalog,
  type StorefrontCatalogProduct,
  type StorefrontCatalogStore,
  type StorefrontCategory,
  type StorefrontSubcategory,
} from "../src/lib/storefront-catalog/core.ts";
import {
  calculateInventoryAvailability,
  type InventoryAvailability,
  type InventoryProductRecord,
} from "../src/lib/inventory/core.ts";

type CategoryRow = StorefrontCategory & {
  active: boolean;
  deleted: boolean;
};

type SubcategoryRow = StorefrontSubcategory & {
  active: boolean;
  deleted: boolean;
};

type ProductRow = StorefrontCatalogProduct & {
  categoryId: number;
  subcategoryId: number | null;
  active: boolean;
  availableForSale: boolean;
  deleted: boolean;
};

test("category page separates direct products from subcategory products", async () => {
  const store = catalogStore({
    categories: [category()],
    subcategories: [subcategory()],
    products: [
      product({ id: 1, name: "Product A", subcategoryId: null }),
      product({ id: 2, name: "Product B", subcategoryId: 10 }),
    ],
  });
  const result = await getCategoryCatalog(store, inventory([[1, 5, 0]]), 1);

  assert.deepEqual(result?.subcategories.map((item) => item.name), [
    "Birthday Gifts",
  ]);
  assert.deepEqual(result?.directProducts.map((item) => item.name), [
    "Product A",
  ]);
  assert.ok(!result?.directProducts.some((item) => item.name === "Product B"));
});

test("subcategory page returns only products matching both IDs", async () => {
  const store = catalogStore({
    categories: [category()],
    subcategories: [
      subcategory({ id: 10, name: "Birthday Gifts" }),
      subcategory({ id: 11, name: "Home Gifts" }),
    ],
    products: [
      product({ id: 1, name: "Direct", subcategoryId: null }),
      product({ id: 2, name: "Birthday", subcategoryId: 10 }),
      product({ id: 3, name: "Sibling", subcategoryId: 11 }),
    ],
  });
  const result = await getSubcategoryCatalog(
    store,
    inventory([[2, 5, 0]]),
    1,
    10
  );

  assert.deepEqual(result?.products.map((item) => item.name), ["Birthday"]);
});

test("cross-category subcategory combination returns null for 404 handling", async () => {
  const store = catalogStore({
    categories: [category({ id: 1 }), category({ id: 2 })],
    subcategories: [subcategory({ id: 10, categoryId: 1 })],
    products: [],
  });
  assert.equal(
    await getSubcategoryCatalog(store, inventory([]), 2, 10),
    null
  );
});

test("inactive and deleted categories return null", async () => {
  for (const row of [
    category({ active: false }),
    category({ deleted: true }),
  ]) {
    const store = catalogStore({
      categories: [row],
      subcategories: [],
      products: [],
    });
    assert.equal(await getCategoryCatalog(store, inventory([]), 1), null);
  }
});

test("inactive and deleted subcategories are excluded", async () => {
  const store = catalogStore({
    categories: [category()],
    subcategories: [
      subcategory({ id: 10, active: false }),
      subcategory({ id: 11, deleted: true }),
      subcategory({ id: 12, name: "Visible" }),
    ],
    products: [],
  });
  const result = await getCategoryCatalog(store, inventory([]), 1);
  assert.deepEqual(result?.subcategories.map((item) => item.name), ["Visible"]);
  assert.equal(await getSubcategoryCatalog(store, inventory([]), 1, 10), null);
  assert.equal(await getSubcategoryCatalog(store, inventory([]), 1, 11), null);
});

test("inactive, deleted, and merchant-disabled products are excluded", async () => {
  const store = catalogStore({
    categories: [category()],
    subcategories: [],
    products: [
      product({ id: 1, name: "Visible" }),
      product({ id: 2, name: "Inactive", active: false }),
      product({ id: 3, name: "Deleted", deleted: true }),
      product({ id: 4, name: "Disabled", availableForSale: false }),
    ],
  });
  const result = await getCategoryCatalog(store, inventory([[1, 5, 0]]), 1);
  assert.deepEqual(result?.directProducts.map((item) => item.name), ["Visible"]);
});

test("out-of-stock products remain visible but use inventory availability", async () => {
  const store = catalogStore({
    categories: [category()],
    subcategories: [],
    products: [product({ id: 1, name: "Sold Out" })],
  });
  const result = await getCategoryCatalog(store, inventory([[1, 2, 2]]), 1);
  assert.equal(result?.directProducts.length, 1);
  assert.equal(result?.directProducts[0].quantity, 0);
  assert.equal(result?.directProducts[0].inventoryStatus, "out_of_stock");
});

test("separate tenant stores cannot expose each other's catalog", async () => {
  const giftShop = catalogStore({
    categories: [category({ name: "Gift Shop" })],
    subcategories: [],
    products: [product({ id: 1, name: "Gift-only product" })],
  });
  const pandaPop = catalogStore({
    categories: [category({ name: "Panda Pop" })],
    subcategories: [],
    products: [product({ id: 2, name: "Panda-only product" })],
  });

  const giftResult = await getCategoryCatalog(
    giftShop,
    inventory([[1, 5, 0]]),
    1
  );
  const pandaResult = await getCategoryCatalog(
    pandaPop,
    inventory([[2, 5, 0]]),
    1
  );
  assert.deepEqual(giftResult?.directProducts.map((item) => item.name), [
    "Gift-only product",
  ]);
  assert.deepEqual(pandaResult?.directProducts.map((item) => item.name), [
    "Panda-only product",
  ]);
});

test("Drizzle catalog store enforces hierarchy and storefront visibility", async () => {
  const source = await readFile(
    "src/lib/storefront-catalog/drizzle-store.ts",
    "utf8"
  );
  assert.match(source, /isNull\(products\.subcategoryId\)/);
  assert.match(source, /eq\(products\.categoryId, categoryId\)/);
  assert.match(source, /eq\(products\.subcategoryId, subcategoryId\)/);
  assert.match(source, /eq\(products\.isActive, true\)/);
  assert.match(source, /eq\(products\.isAvailable, true\)/);
  assert.match(source, /isNull\(products\.deletedAt\)/);
  assert.match(source, /eq\(subcategories\.isActive, true\)/);
  assert.match(source, /isNull\(subcategories\.deletedAt\)/);
  assert.match(source, /eq\(categories\.isActive, true\)/);
  assert.match(source, /isNull\(categories\.deletedAt\)/);
});

test("subcategory route is tenant-aware, validates both IDs, and returns 404", async () => {
  const page = await readFile(
    "src/app/(customer)/categories/[id]/subcategories/[subcategoryId]/page.tsx",
    "utf8"
  );
  assert.match(page, /const tenant = await getTenant\(\)/);
  assert.match(page, /getDbForTenant\(tenant\)/);
  assert.match(page, /params: Promise<\{ id: string; subcategoryId: string \}>/);
  assert.match(page, /getSubcategoryCatalog[\s\S]*Number\(id\)[\s\S]*Number\(subcategoryId\)/);
  assert.match(page, /if \(!catalog\) notFound\(\)/);
  assert.match(page, /`\/categories\/\$\{category\.id\}\/products`/);
});

test("breadcrumbs and navigation use category, subcategory, and product paths", async () => {
  const [subcategoryPage, productPage, subcategoryCard] = await Promise.all([
    readFile(
      "src/app/(customer)/categories/[id]/subcategories/[subcategoryId]/page.tsx",
      "utf8"
    ),
    readFile("src/app/(customer)/products/[id]/details/page.tsx", "utf8"),
    readFile("src/app/components/SubcategoryCard.tsx", "utf8"),
  ]);
  assert.match(
    subcategoryCard,
    /href=\{`\/categories\/\$\{categoryId\}\/subcategories\/\$\{id\}`\}/
  );
  assert.match(
    productPage,
    /`\/categories\/\$\{product\.categoryId\}\/subcategories\/\$\{product\.subcategoryId\}`/
  );
  assert.match(subcategoryPage, /label: category\.name/);
  assert.match(subcategoryPage, /label: subcategory\.name/);
});

test("App Router siblings use one dynamic slug name per URL level", async () => {
  const dynamicNamesByUrlLevel = new Map<string, Set<string>>();

  async function visit(directory: string, urlSegments: string[] = []) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const isRouteGroup = /^\(.+\)$/.test(entry.name);
      const nextUrlSegments = isRouteGroup
        ? urlSegments
        : [...urlSegments, entry.name];
      const dynamicMatch = entry.name.match(/^\[\[?\.\.\.([^\]]+)\]\]?$/) ??
        entry.name.match(/^\[([^\]]+)\]$/);

      if (dynamicMatch) {
        const parentUrl = `/${urlSegments.join("/")}`;
        const names = dynamicNamesByUrlLevel.get(parentUrl) ?? new Set<string>();
        names.add(dynamicMatch[1]);
        dynamicNamesByUrlLevel.set(parentUrl, names);
      }

      await visit(path.join(directory, entry.name), nextUrlSegments);
    }
  }

  await visit("src/app");

  const conflicts = [...dynamicNamesByUrlLevel.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([url, names]) => `${url}: ${[...names].sort().join(", ")}`);
  assert.deepEqual(conflicts, []);
});

test("redesigned ProductCard preserves stock policy, cart reservations, and search reuse", async () => {
  const [card, addButton, searchPage] = await Promise.all([
    readFile("src/app/components/ProductCard.tsx", "utf8"),
    readFile("src/app/components/AddToCartButton.tsx", "utf8"),
    readFile("src/app/(customer)/search/page.tsx", "utf8"),
  ]);
  assert.match(card, /getCustomerStockMessage\(quantity\)/);
  assert.match(card, /inventoryStatus === "out_of_stock"/);
  assert.match(card, /href=\{`\/products\/\$\{id\}\/details`\}/);
  assert.match(card, /<AddToCartButton productId=\{id\} disabled=\{outOfStock\}/);
  assert.match(addButton, /tenant\.path\("\/api\/cart\/add"\)/);
  assert.match(addButton, /setCartCount\(\(count\) => count \+ 1\)/);
  assert.match(searchPage, /<ProductCard/);
});

class MemoryCatalogStore implements StorefrontCatalogStore {
  private readonly categories: CategoryRow[];
  private readonly subcategories: SubcategoryRow[];
  private readonly products: ProductRow[];

  constructor(
    categories: CategoryRow[],
    subcategories: SubcategoryRow[],
    products: ProductRow[]
  ) {
    this.categories = categories;
    this.subcategories = subcategories;
    this.products = products;
  }

  async findVisibleCategory(categoryId: number) {
    return (
      this.categories
        .filter((row) => row.active && !row.deleted)
        .find((row) => row.id === categoryId) ?? null
    );
  }

  async listVisibleSubcategories(categoryId: number) {
    return this.subcategories
      .filter(
        (row) => row.categoryId === categoryId && row.active && !row.deleted
      )
      .map(toSubcategory);
  }

  async listVisibleDirectProducts(categoryId: number) {
    return this.products
      .filter(
        (row) =>
          row.categoryId === categoryId &&
          row.subcategoryId === null &&
          visibleProduct(row)
      )
      .map(toProduct);
  }

  async findVisibleSubcategory(categoryId: number, subcategoryId: number) {
    const row = this.subcategories.find(
      (item) =>
        item.id === subcategoryId &&
        item.categoryId === categoryId &&
        item.active &&
        !item.deleted
    );
    return row ? toSubcategory(row) : null;
  }

  async listVisibleSubcategoryProducts(
    categoryId: number,
    subcategoryId: number
  ) {
    return this.products
      .filter(
        (row) =>
          row.categoryId === categoryId &&
          row.subcategoryId === subcategoryId &&
          visibleProduct(row)
      )
      .map(toProduct);
  }
}

function catalogStore({
  categories,
  subcategories,
  products,
}: {
  categories: CategoryRow[];
  subcategories: SubcategoryRow[];
  products: ProductRow[];
}) {
  return new MemoryCatalogStore(categories, subcategories, products);
}

function category(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 1,
    name: "Gifts",
    imageUrl: "/categories/gifts.jpg",
    active: true,
    deleted: false,
    ...overrides,
  };
}

function subcategory(
  overrides: Partial<SubcategoryRow> = {}
): SubcategoryRow {
  return {
    id: 10,
    categoryId: 1,
    name: "Birthday Gifts",
    imageUrl: "/subcategories/birthday.jpg",
    active: true,
    deleted: false,
    ...overrides,
  };
}

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 1,
    name: "Product",
    description: "Description",
    price: 12900,
    imageUrl: "/products/product.jpg",
    categoryId: 1,
    subcategoryId: null,
    active: true,
    availableForSale: true,
    deleted: false,
    ...overrides,
  };
}

function visibleProduct(row: ProductRow) {
  return row.active && row.availableForSale && !row.deleted;
}

function toSubcategory(row: SubcategoryRow): StorefrontSubcategory {
  const { id, name, imageUrl, categoryId } = row;
  return { id, name, imageUrl, categoryId };
}

function toProduct(row: ProductRow): StorefrontCatalogProduct {
  const { id, name, description, price, imageUrl } = row;
  return { id, name, description, price, imageUrl };
}

function inventory(entries: Array<[number, number, number]>) {
  const availability = new Map<number, InventoryAvailability>();
  for (const [id, physical, reserved] of entries) {
    const record: InventoryProductRecord = {
      id,
      physical,
      lowStockThreshold: 10,
      criticalStockThreshold: 4,
      isActive: true,
      isAvailable: true,
    };
    availability.set(id, calculateInventoryAvailability(record, reserved));
  }
  return {
    async getAvailabilityBatch() {
      return availability;
    },
  };
}

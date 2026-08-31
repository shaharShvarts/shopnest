import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_SEARCH_QUERY_LENGTH,
  readSearchQueryParam,
  SearchQueryError,
  searchStorefrontProducts,
  type SearchCatalogProduct,
  type StorefrontSearchStore,
} from "../src/lib/search/core.ts";
import {
  buildTenantRewriteUrl,
  resolveTenantRoute,
} from "../src/lib/tenant-routing/core.ts";
import {
  calculateInventoryAvailability,
  type InventoryAvailability,
  type InventoryProductRecord,
} from "../src/lib/inventory/core.ts";

type MemoryProduct = SearchCatalogProduct & {
  productActive: boolean;
  productAvailable: boolean;
  productDeleted: boolean;
  categoryActive: boolean;
  categoryDeleted: boolean;
  hasSubcategory: boolean;
  subcategoryActive: boolean;
  subcategoryDeleted: boolean;
};

test("product name match", async () => {
  assert.deepEqual(await resultNames([row({ name: "Red Gift Box" })], "Red"), ["Red Gift Box"]);
});

test("description match", async () => {
  assert.deepEqual(await resultNames([row({ description: "Birthday present" })], "Birthday"), ["Product 1"]);
});

test("category name match", async () => {
  assert.deepEqual(await resultNames([row({ categoryName: "Gifts" })], "Gifts"), ["Product 1"]);
});

test("subcategory name match", async () => {
  assert.deepEqual(await resultNames([row({ subcategoryName: "Party Boxes" })], "Party"), ["Product 1"]);
});

test("English search is case-insensitive", async () => {
  assert.deepEqual(await resultNames([row({ name: "Red Gift Box" })], "gIfT"), ["Red Gift Box"]);
});

test("Hebrew product and category text is searchable", async () => {
  const products = [
    row({ id: 1, name: "מארז מתנה" }),
    row({ id: 2, name: "מוצר נוסף", categoryName: "מתנות לחג" }),
  ];
  assert.deepEqual(await resultNames(products, "מתנ"), ["מארז מתנה", "מוצר נוסף"]);
});

test("gift product and category searches return all matching storefront products", async () => {
  const products = [
    row({ id: 1, name: "gift1", categoryName: "Other" }),
    row({ id: 2, name: "gift2", categoryName: "Other" }),
    row({ id: 3, name: "gift3", categoryName: "new gift" }),
  ];
  assert.deepEqual(await resultNames(products, "gift"), ["gift1", "gift2", "gift3"]);
  assert.deepEqual(await resultNames(products, "new gift"), ["gift3"]);
});

test("tenant rewrite preserves search queries through the SearchPage boundary", () => {
  const cases = [
    ["/gift-shop/search?q=gift", "gift"],
    ["/gift-shop/search?q=new%20gift", "new gift"],
    ["/gift-shop/search?q=%D7%9E%D7%AA%D7%A0%D7%94", "מתנה"],
  ] as const;

  for (const [path, expectedQuery] of cases) {
    const browserUrl = new URL(path, "http://shopnest.local");
    const route = resolveTenantRoute(browserUrl.pathname);
    assert.equal(route.kind, "tenant");
    if (route.kind !== "tenant") continue;

    const appRouterUrl = buildTenantRewriteUrl(browserUrl, route.internalPath);
    const pageSearchParams = Object.fromEntries(appRouterUrl.searchParams);

    assert.equal(appRouterUrl.pathname, "/search");
    assert.equal(readSearchQueryParam(pageSearchParams), expectedQuery);
  }
});

test("tenant rewrite preserves every query parameter, not only q", () => {
  const browserUrl = new URL(
    "/gift-shop/search?q=gift&category=7&sort=newest",
    "http://shopnest.local"
  );
  const route = resolveTenantRoute(browserUrl.pathname);
  assert.equal(route.kind, "tenant");
  if (route.kind !== "tenant") return;

  const appRouterUrl = buildTenantRewriteUrl(browserUrl, route.internalPath);
  assert.equal(appRouterUrl.search, browserUrl.search);
  assert.deepEqual(Object.fromEntries(appRouterUrl.searchParams), {
    q: "gift",
    category: "7",
    sort: "newest",
  });
});

test("inactive, merchant-disabled, and deleted products are excluded", async () => {
  const products = [
    row({ id: 1, name: "match active" }),
    row({ id: 2, name: "match inactive", productActive: false }),
    row({ id: 3, name: "match disabled", productAvailable: false }),
    row({ id: 4, name: "match deleted", productDeleted: true }),
  ];
  assert.deepEqual(await resultNames(products, "match"), ["match active"]);
});

test("inactive or deleted categories are excluded", async () => {
  const products = [
    row({ id: 1, name: "match inactive category", categoryActive: false }),
    row({ id: 2, name: "match deleted category", categoryDeleted: true }),
  ];
  assert.deepEqual(await resultNames(products, "match"), []);
});

test("inactive or deleted attached subcategories are excluded", async () => {
  const products = [
    row({ id: 1, name: "match inactive subcategory", subcategoryActive: false }),
    row({ id: 2, name: "match deleted subcategory", subcategoryDeleted: true }),
    row({ id: 3, name: "match no subcategory", hasSubcategory: false, subcategoryName: null }),
  ];
  assert.deepEqual(await resultNames(products, "match"), ["match no subcategory"]);
});

test("out-of-stock product remains searchable and visible", async () => {
  const store = new MemorySearchStore([row({ name: "Rare Gift" })]);
  const response = await searchStorefrontProducts(store, inventory([[1, 0, 0]]), "Gift");
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].available, 0);
  assert.equal(response.results[0].inventoryStatus, "out_of_stock");
});

test("active reservations affect displayed availability", async () => {
  const store = new MemorySearchStore([row({ name: "Reserved Gift" })]);
  const response = await searchStorefrontProducts(store, inventory([[1, 5, 2]]), "Gift");
  assert.deepEqual(
    pickStock(response.results[0]),
    { physical: 5, reserved: 2, available: 3, quantity: 3, inventoryStatus: "critical_stock" }
  );
});

test("empty query does not return or load the full catalog", async () => {
  const store = new MemorySearchStore([row({ name: "Anything" })]);
  const response = await searchStorefrontProducts(store, inventory([[1, 5, 0]]), "   ");
  assert.equal(response.query, "");
  assert.deepEqual(response.results, []);
  assert.equal(store.calls, 0);
});

test("query is trimmed before searching", async () => {
  const store = new MemorySearchStore([row({ name: "Gift" })]);
  const response = await searchStorefrontProducts(store, inventory([[1, 5, 0]]), "  Gift  ");
  assert.equal(response.query, "Gift");
  assert.equal(store.lastQuery, "Gift");
});

test("oversized query is rejected safely before database access", async () => {
  const store = new MemorySearchStore([row()]);
  await assert.rejects(
    searchStorefrontProducts(store, inventory([[1, 5, 0]]), "x".repeat(MAX_SEARCH_QUERY_LENGTH + 1)),
    (error: unknown) => error instanceof SearchQueryError
  );
  assert.equal(store.calls, 0);
});

test("tenant stores remain isolated", async () => {
  const giftShop = new MemorySearchStore([row({ name: "Gift Shop Exclusive" })]);
  const pandaPop = new MemorySearchStore([row({ id: 2, name: "Panda Pop Exclusive" })]);
  assert.deepEqual(await resultNamesFromStore(giftShop, "Exclusive"), ["Gift Shop Exclusive"]);
  assert.deepEqual(await resultNamesFromStore(pandaPop, "Exclusive", 2), ["Panda Pop Exclusive"]);
});

test("multiple matches are returned with name matches first and stable ordering", async () => {
  const products = [
    row({ id: 3, name: "Zebra", description: "gift" }),
    row({ id: 2, name: "Gift Beta" }),
    row({ id: 1, name: "Gift Alpha" }),
  ];
  assert.deepEqual(await resultNames(products, "gift"), ["Gift Alpha", "Gift Beta", "Zebra"]);
});

test("Drizzle search is parameterized and enforces storefront visibility and limit", async () => {
  const source = await readFile("src/lib/search/drizzle-store.ts", "utf8");
  assert.match(source, /ilike \$\{pattern\}/);
  assert.doesNotMatch(source, /sql\.raw|execute\([^)]*query/);
  assert.match(source, /eq\(products\.isActive, true\)/);
  assert.match(source, /eq\(products\.isAvailable, true\)/);
  assert.match(source, /isNull\(products\.deletedAt\)/);
  assert.match(source, /eq\(categories\.isActive, true\)/);
  assert.match(source, /isNull\(categories\.deletedAt\)/);
  assert.match(source, /eq\(subcategories\.isActive, true\)/);
  assert.match(source, /isNull\(subcategories\.deletedAt\)/);
  assert.match(source, /case when \$\{nameMatches\} then 0 else 1 end/);
  assert.match(source, /\.limit\(limit\)/);
});

test("search page derives tenant database server-side and reuses inventory, media, and ProductCard", async () => {
  const [page, form, layout] = await Promise.all([
    readFile("src/app/(customer)/search/page.tsx", "utf8"),
    readFile("src/app/(customer)/search/_components/SearchForm.tsx", "utf8"),
    readFile("src/app/(customer)/layout.tsx", "utf8"),
  ]);
  assert.match(page, /const tenant = await getTenant\(\)/);
  assert.match(page, /if \(!tenant\) notFound\(\)/);
  assert.match(page, /getDbForTenant\(tenant\)/);
  assert.match(page, /new InventoryService\(new DrizzleInventoryStore\(db\)\)/);
  assert.match(page, /<ProductCard[\s\S]*tenantSlug=\{tenant\.slug\}/);
  assert.match(page, /grid-cols-1[^\"]*min-\[430px\]:grid-cols-2[^\"]*lg:grid-cols-3[^\"]*xl:grid-cols-4/);
  assert.match(form, /method="GET"/);
  assert.match(form, /name="q"/);
  assert.match(form, /dir="auto"/);
  assert.match(layout, /tenantPath\("\/search"\)/);
  assert.match(layout, /basis-full[^\"]*sm:max-w-xl[^\"]*sm:flex-1/);
});

class MemorySearchStore implements StorefrontSearchStore {
  calls = 0;
  lastQuery = "";
  private readonly products: MemoryProduct[];

  constructor(products: MemoryProduct[]) {
    this.products = products;
  }

  async searchVisibleProducts(query: string, limit: number) {
    this.calls += 1;
    this.lastQuery = query;
    const needle = query.toLocaleLowerCase();
    return this.products
      .filter((product) =>
        product.productActive &&
        product.productAvailable &&
        !product.productDeleted &&
        product.categoryActive &&
        !product.categoryDeleted &&
        (!product.hasSubcategory || (product.subcategoryActive && !product.subcategoryDeleted)) &&
        [product.name, product.description, product.categoryName, product.subcategoryName]
          .some((value) => value?.toLocaleLowerCase().includes(needle))
      )
      .sort((left, right) => {
        const leftName = left.name.toLocaleLowerCase().includes(needle) ? 0 : 1;
        const rightName = right.name.toLocaleLowerCase().includes(needle) ? 0 : 1;
        return leftName - rightName || left.name.localeCompare(right.name) || left.id - right.id;
      })
      .slice(0, limit)
      .map(toCatalogProduct);
  }
}

function row(overrides: Partial<MemoryProduct> = {}): MemoryProduct {
  return {
    id: 1,
    name: "Product 1",
    description: "Description",
    price: 1000,
    imageUrl: "/products/product.jpg",
    categoryName: "Category",
    subcategoryName: "Subcategory",
    productActive: true,
    productAvailable: true,
    productDeleted: false,
    categoryActive: true,
    categoryDeleted: false,
    hasSubcategory: true,
    subcategoryActive: true,
    subcategoryDeleted: false,
    ...overrides,
  };
}

function toCatalogProduct(product: MemoryProduct): SearchCatalogProduct {
  const {
    id, name, description, price, imageUrl, categoryName, subcategoryName,
  } = product;
  return { id, name, description, price, imageUrl, categoryName, subcategoryName };
}

function inventory(entries: Array<[number, number, number]>) {
  const values = new Map<number, InventoryAvailability>();
  for (const [id, physical, reserved] of entries) {
    const product: InventoryProductRecord = {
      id,
      physical,
      lowStockThreshold: 10,
      criticalStockThreshold: 4,
      isActive: true,
      isAvailable: true,
    };
    values.set(id, calculateInventoryAvailability(product, reserved));
  }
  return { async getAvailabilityBatch() { return values; } };
}

async function resultNames(products: MemoryProduct[], query: string) {
  const stock = products.map((product) => [product.id, 20, 0] as [number, number, number]);
  const response = await searchStorefrontProducts(new MemorySearchStore(products), inventory(stock), query);
  return response.results.map((product) => product.name);
}

async function resultNamesFromStore(store: MemorySearchStore, query: string, id = 1) {
  const response = await searchStorefrontProducts(store, inventory([[id, 20, 0]]), query);
  return response.results.map((product) => product.name);
}

function pickStock(result: {
  physical: number;
  reserved: number;
  available: number;
  quantity: number;
  inventoryStatus: string;
}) {
  return {
    physical: result.physical,
    reserved: result.reserved,
    available: result.available,
    quantity: result.quantity,
    inventoryStatus: result.inventoryStatus,
  };
}

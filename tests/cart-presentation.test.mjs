import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(path, "utf8");
const root = "src/app/(customer)/";
// Execute the real server components, replacing only framework/UI and DB boundaries.
function load(path, mocks) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id === "react/jsx-runtime") return require(id);
      throw new Error(`Unmocked dependency: ${id}`);
    },
  });
  return exports.default;
}
const tag = (name) => function MockElement({ children }) {
  return React.createElement(name, null, children);
};
const translations = { getLocale: async () => "he", getTranslations: async () => (key) => key };
const CartTable = load(root + "components/CartTable.tsx", {
  "@/components/ui": Object.fromEntries(Object.entries({ Table: "table", TableBody: "tbody", TableCell: "td", TableHead: "th", TableHeader: "thead", TableRow: "tr" }).map(([key, value]) => [key, tag(value)])),
  "next-intl/server": translations,
  "../carts/_components/RemoveButton": { RemoveButton: () => null },
  "../carts/_components/QuantityControl": { QuantityControl: ({ quantity }) => React.createElement("span", null, quantity) },
  "@/components/ui/button": { Button: tag("button") },
  "@/components/TenantLink": { TenantLink: tag("a") },
  "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  "next/image": { default: () => null, __esModule: true },
  "@/lib/images/image-url.mjs": { resolveTenantImageUrl: () => null },
});
const item = (id, price, quantity) => ({ id, price, quantity, name: `Product ${id}`, description: "", imageUrl: "", available: 100 });
const money = (value) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(value);
async function assertAmounts(items, lines, total) {
  const html = renderToStaticMarkup(await CartTable({ cartData: items, tenantSlug: "panda-pop" }));
  const desktop = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1];
  const mobile = [...html.matchAll(/<article\b[^>]*>(.*?)<\/article>/gs)].map((match) => match[1]);
  const summary = html.match(/<section\b[^>]*>(.*?)<\/section>/s)?.[1];
  assert.equal(mobile.length, lines.length);
  lines.forEach((line, index) => {
    assert.ok(desktop.includes(money(line)), `desktop line ${line}`);
    assert.ok(mobile[index].includes(money(line)), `mobile line ${line}`);
  });
  assert.ok(summary.includes(money(total)), `summary ${total}`);
  return html;
}
test("quantity one renders the unit amount in both layouts and summary", async () => {
  await assertAmounts([item(1, 50, 1)], [50], 50);
});
test("quantity three renders 150 ILS in both layouts and summary", async () => {
  await assertAmounts([item(1, 50, 3)], [150], 150);
});
test("multiple products sum line totals", async () => {
  await assertAmounts([item(1, 50, 3), item(2, 25, 2)], [150, 50], 200);
});
test("new quantity props update both layouts and summary", async () => {
  const before = await assertAmounts([item(1, 50, 1)], [50], 50);
  const after = await assertAmounts([item(1, 50, 3)], [150], 150);
  assert.notEqual(before, after);
  const control = read(root + "carts/_components/QuantityControl.tsx");
  assert.match(control, /await updateProductQuantity\(productId, next\)/);
  assert.match(control, /if \(!result.success\)[\s\S]*?return;[\s\S]*?router.refresh\(\)/);
});

function serverCart(tenant, database) {
  const products = Object.fromEntries(["id", "name", "price", "description", "imageUrl"].map((key) => [key, `products.${key}`]));
  const cartProducts = { quantity: "cart.quantity", cartId: "cart.id", productId: "cart.productId" };
  const db = {
    select(fields) {
      assert.equal(fields.price, products.price);
      assert.equal(fields.quantity, cartProducts.quantity);
      return { from(table) {
        assert.equal(table, cartProducts);
        return { innerJoin(joined) {
          assert.equal(joined, products);
          return { async where(filter) {
            assert.equal(filter[0], cartProducts.cartId);
            assert.equal(filter[1], "owned-cart");
            return database[tenant].cart.map((row) => {
              const product = database[tenant].products.find((p) => p.id === row.productId);
              return Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, column.startsWith("products.") ? product[column.slice(9)] : row.quantity]));
            });
          } };
        } };
      } };
    },
  };
  return load(root + "carts/page.tsx", {
    "drizzle-orm": { eq: (...args) => args },
    "@/drizzle/db": { getDb: async () => db },
    "../_actions/cartVerification": { fetchCartId: async () => "owned-cart" },
    "@/drizzle/schema": { products, cartProducts },
    "../components/CartTable": { default: CartTable, __esModule: true },
    "next-intl/server": translations,
    "../components/StorefrontPageHeader": { StorefrontPageHeader: tag("h1") },
    "@/lib/tenant-context": { getTenant: async () => ({ slug: tenant }) },
    "@/lib/inventory/core": { InventoryService: class { async getAvailabilityBatchForCart(ids) { return new Map(ids.map((id) => [id, { available: 100 }])); } } },
    "@/lib/inventory/drizzle-store": { DrizzleInventoryStore: class {} },
    "@/lib/customer-commerce/identity": { commerceOwnerKey: () => "owner", getCommerceIdentity: async () => ({ sessionId: "owner" }) },
  });
}
async function loadedItems(page) {
  const tree = await page({ searchParams: Promise.resolve({}) });
  return tree.props.children.find((child) => child?.type === CartTable).props.cartData;
}
test("server refresh reloads quantity and current tenant DB product price; ignores cart price snapshots", async () => {
  const database = {
    "panda-pop": { products: [item(1, 50, 100)], cart: [{ productId: 1, quantity: 1, price: 999, total: 999 }] },
    "gift-shop": { products: [item(1, 80, 100)], cart: [{ productId: 1, quantity: 3 }] },
  };
  const panda = serverCart("panda-pop", database);
  await assertAmounts(await loadedItems(panda), [50], 50);
  database["panda-pop"].cart[0].quantity = 3;
  await assertAmounts(await loadedItems(panda), [150], 150);
  await assertAmounts(await loadedItems(panda), [150], 150);
  database["panda-pop"].products[0].price = 60;
  await assertAmounts(await loadedItems(panda), [180], 180);
  await assertAmounts(await loadedItems(serverCart("gift-shop", database)), [240], 240);
  await assertAmounts(await loadedItems(panda), [180], 180);
});
test("cart and checkout retain trusted DB access, quantity-only writes and purchase snapshots", () => {
  const db = read("src/drizzle/db.ts");
  assert.match(db, /const tenant = await getTenant\(\)/);
  assert.match(db, /configuredTenant.schema !== tenant.schema/);
  assert.match(db, /search_path=\$\{configuredTenant.schema\}/);
  const actions = read(root + "_actions/carts.ts");
  assert.match(actions, /updateProductQuantity\(productId: number, quantity: number\)/);
  assert.match(actions, /set\(\{ quantity: targetQuantity, updatedAt: new Date\(\) \}\)/);
  const checkout = read("src/lib/checkout/create-order.ts");
  assert.match(checkout, /sum \+ item.price! \* item.quantity/);
  assert.match(checkout, /priceAtPurchase: item.price!/);
  assert.match(read(root + "checkout/page.tsx"), /products.price\} \* \$\{cartProducts.quantity/);
});
test("safe integer boundary renders exactly; overflowing lines or summed totals reject", async () => {
  await assertAmounts([item(1, Number.MAX_SAFE_INTEGER, 1)], [Number.MAX_SAFE_INTEGER], Number.MAX_SAFE_INTEGER);
  await assert.rejects(CartTable({ cartData: [item(1, Number.MAX_SAFE_INTEGER, 2)], tenantSlug: "panda-pop" }), /supported range/);
  await assert.rejects(CartTable({ cartData: [item(1, Number.MAX_SAFE_INTEGER, 1), item(2, 1, 1)], tenantSlug: "panda-pop" }), /supported range/);
});

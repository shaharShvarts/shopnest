import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("product details use an explicit responsive grid and fluid image", async () => {
  const source = await read(
    "src/app/(customer)/products/_components/ProductDetails.tsx"
  );
  assert.doesNotMatch(source, /columns-2|xs:columns-1/);
  assert.match(source, /grid-cols-1[^\"]*lg:grid-cols-\[/);
  assert.match(source, /w-full[^\"]*object-contain/);
  assert.match(source, /lg:max-h-\[680px\]/);
  assert.match(source, /min-h-12 w-full/);
  assert.match(source, /size-11[^\"]*rounded-xl/);
});

test("storefront header stays compact while preserving all controls", async () => {
  const [layout, language, cart] = await Promise.all([
    read("src/app/(customer)/layout.tsx"),
    read("src/app/components/LanguageSelector.tsx"),
    read("src/app/(customer)/components/CartIcon.tsx"),
  ]);
  assert.match(layout, /size-10[^\"]*sm:size-12/);
  assert.match(layout, /LanguageSelector/);
  assert.match(layout, /CartIcon/);
  assert.match(layout, /UserRound/);
  assert.match(layout, /customer \? "\/account" : "\/account\/login"/);
  assert.match(layout, /getCurrentCustomer/);
  assert.match(layout, /aria-label="View shopping cart"[\s\S]*?size-11/);
  assert.match(language, /hidden sm:inline/);
  assert.match(language, /h-11 min-w-11/);
  assert.match(cart, /min-h-5 min-w-5/);
});

test("storefront navigation targets only implemented customer routes", async () => {
  const sources = await Promise.all([
    read("src/app/(customer)/layout.tsx"),
    read("src/app/(customer)/components/Footer.tsx"),
    read("src/app/(customer)/components/CookieConsent.tsx"),
    read("src/app/(customer)/components/CartTable.tsx"),
    read("src/app/(customer)/categories/[id]/products/page.tsx"),
    read("src/app/(customer)/products/[id]/details/page.tsx"),
    read("src/app/(customer)/categories/[id]/subcategories/[subcategoryId]/page.tsx"),
    read("src/app/components/CategoryCard.tsx"),
    read("src/app/components/SubcategoryCard.tsx"),
    read("src/app/components/ProductCard.tsx"),
  ]);
  const source = sources.join("\n");
  const targetPattern = /\bhref(?:=|:)\s*\{?(["'`])([^"'`]+)\1\}?/g;
  const targets = [...source.matchAll(targetPattern)]
    .map((match) => match[2])
    .filter((target) => target.startsWith("/"));
  const implementedCustomerRoutes = [
    /^\/$/,
    /^\/carts$/,
    /^\/categories$/,
    /^\/checkout$/,
    /^\/account$/,
    /^\/account\/login$/,
    /^\/account\/register(?:\?.*)?$/,
    /^\/account\/orders$/,
    /^\/privacy-policy$/,
    /^\/categories\/\$\{id\}\/products$/,
    /^\/categories\/\$\{categoryId\}\/subcategories\/\$\{id\}$/,
    /^\/categories\/\$\{category\.id\}\/products$/,
    /^\/categories\/\$\{product\.categoryId\}\/products$/,
    /^\/categories\/\$\{product\.categoryId\}\/subcategories\/\$\{product\.subcategoryId\}$/,
    /^\/products\/\$\{id\}\/details$/,
  ];

  assert.ok(targets.length > 0, "expected storefront navigation targets");
  for (const target of targets) {
    assert.ok(
      implementedCustomerRoutes.some((route) => route.test(target)),
      `storefront navigation references missing route: ${target}`
    );
  }
  assert.doesNotMatch(source, /\/admin\/login\b/);
});

test("category and product grids cover mobile through large desktop", async () => {
  const [categories, products] = await Promise.all([
    read("src/app/(customer)/components/CategoriesGrid.tsx"),
    read("src/app/(customer)/categories/[id]/products/page.tsx"),
  ]);
  for (const source of [categories, products]) {
    assert.match(
      source,
      /grid-cols-1[^\"]*min-\[430px\]:grid-cols-2[^\"]*lg:grid-cols-3[^\"]*xl:grid-cols-4/
    );
  }
});

test("cart switches from cards on mobile to a table on larger screens", async () => {
  const [cart, page, remove] = await Promise.all([
    read("src/app/(customer)/components/CartTable.tsx"),
    read("src/app/(customer)/carts/page.tsx"),
    read("src/app/(customer)/carts/_components/RemoveButton.tsx"),
  ]);
  assert.match(cart, /hidden md:block/);
  assert.match(cart, /md:hidden/);
  assert.match(cart, /grid-cols-\[5rem_minmax\(0,1fr\)\]/);
  assert.match(cart, /min-h-11 w-full sm:w-auto/);
  assert.match(page, /imageUrl: products\.imageUrl/);
  assert.match(page, /tenantSlug=\{tenant\?\.slug \?\? ""\}/);
  assert.match(cart, /resolveTenantImageUrl\(imageUrl, tenantSlug\)/);
  assert.doesNotMatch(cart, /src=\{item\.imageUrl\}/);
  assert.match(remove, /aria-label="Remove item from cart"/);
  assert.match(remove, /size-11/);
});

test("responsive storefront images use the shared tenant-aware resolver", async () => {
  const [category, product, details, productPage] = await Promise.all([
    read("src/app/components/CategoryCard.tsx"),
    read("src/app/components/ProductCard.tsx"),
    read("src/app/(customer)/products/_components/ProductDetails.tsx"),
    read("src/app/(customer)/categories/[id]/products/page.tsx"),
  ]);

  assert.match(category, /resolveTenantImageUrl\([\s\S]*tenant\.slug/);
  assert.match(product, /resolveTenantImageUrl\(imageUrl, tenantSlug\)/);
  assert.match(details, /resolveTenantImageUrl\([\s\S]*tenant\.slug/);
  assert.match(productPage, /tenantSlug=\{tenant\.slug\}/);
  assert.match(category, /aspect-\[5\/4\][\s\S]*normalizedImageUrl/);
  assert.match(product, /aspect-square[\s\S]*normalizedImageUrl/);
  assert.match(details, /grid-cols-1[^\"]*lg:grid-cols-\[/);
  for (const source of [category, product, details]) {
    assert.doesNotMatch(source, /src=\{(?:String\()?imageUrl\)?\}/);
  }
});

test("checkout and shipping fields stack on narrow screens", async () => {
  const [checkout, address, shipping] = await Promise.all([
    read("src/app/(customer)/checkout/_components/CheckoutTable.tsx"),
    read("src/app/(customer)/checkout/_components/ShippingAddress.tsx"),
    read("src/app/(customer)/shipping/_components/ShippingTable.tsx"),
  ]);
  assert.match(checkout, /w-full max-w-2xl/);
  assert.match(checkout, /min-h-11 w-full sm:w-auto/);
  assert.match(address, /grid-cols-1[^\"]*sm:grid-cols-2/);
  assert.match(address, /grid-cols-1[^\"]*sm:grid-cols-3/);
  assert.match(shipping, /grid-cols-1[^\"]*sm:grid-cols-2/);
});

test("breadcrumbs and footer wrap without directional spacing assumptions", async () => {
  const [breadcrumb, footer] = await Promise.all([
    read("src/app/(customer)/components/Breadcrumb.tsx"),
    read("src/app/(customer)/components/Footer.tsx"),
  ]);
  assert.match(breadcrumb, /flex-wrap/);
  assert.match(breadcrumb, /rtl:rotate-180/);
  assert.doesNotMatch(breadcrumb, /overflow-x-auto|whitespace-nowrap/);
  assert.match(footer, /grid-cols-1[^\"]*sm:grid-cols-2[^\"]*lg:grid-cols-3/);
  assert.match(footer, /gap-x-4 gap-y-2/);
  assert.doesNotMatch(footer, /space-x-/);
});

test("responsive changes remain CSS-only", async () => {
  const sources = await Promise.all([
    read("src/app/(customer)/layout.tsx"),
    read("src/app/(customer)/components/CartTable.tsx"),
    read("src/app/(customer)/products/_components/ProductDetails.tsx"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /innerWidth|matchMedia|resizeObserver/i);
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as routing from "../src/lib/tenant-routing/core.ts";
import {
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "../src/lib/tenant-validation.mjs";

const fixtureTenantSlugs = new Set([
  "fixture-store",
  "gift-shop",
  "panda-pop",
  "dvorik-collection",
]);

function resolveFixtureTenant(value) {
  const tenant = normalizeTenantSlug(value);
  return tenant && fixtureTenantSlugs.has(tenant.slug) ? tenant : null;
}

const storefront = ["", "/categories", "/categories/1/products", "/categories/1/subcategories/2", "/products/1/details", "/carts", "/checkout", "/checkout/payment/123", "/account", "/account/login", "/account/register", "/account/orders", "/account/orders/1", "/forgot-password", "/reset-password", "/search", "/shipping", "/privacy-policy"];
const tenantAdmin = ["", "/login", "/categories", "/categories/new", "/categories/1/edit", "/subcategories", "/subcategories/new", "/subcategories/1/edit", "/products", "/products/new", "/products/1/edit", "/orders", "/orders/1", "/payments", "/shipping", "/shipping/new", "/shipping/1/edit"].map(path => `/admin${path}`);
const platform = ["/", "/features", "/pricing", "/examples", "/faq", "/login", "/signup", "/forgot-password", "/reset-password", "/dashboard", "/admin", "/admin/login", "/admin/stores", "/admin/stores/panda-pop", "/admin/plans", "/admin/featured"];
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function load(file, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  runInNewContext(outputText, { exports, Headers, URL, process: { env: { NODE_ENV: "test" } }, require(name) {
    assert.ok(name in dependencies, `Unexpected import ${name}`);
    return dependencies[name];
  } });
  return exports;
}

test("every storefront/admin route retains its tenant; tenantless storefronts and unknown tenants fail closed", () => {
  for (const path of platform) assert.equal(routing.resolveTenantRoute(path).kind, "legacy");
  for (const path of [...storefront, ...tenantAdmin]) {
    const route = routing.resolveTenantRoute(
      `/panda-pop${path}`,
      resolveFixtureTenant
    );
    assert.equal(route.kind, "tenant");
    assert.equal(route.tenant.slug, "panda-pop");
    assert.equal(route.tenant.schema, "panda_pop");
    assert.equal(route.internalPath, path || "/");
    assert.equal(
      routing.prefixTenantPath(path || "/", "/panda-pop", resolveFixtureTenant),
      `/panda-pop${path}`
    );
    assert.equal(
      routing.resolveTenantRoute(`/unknown${path}`, resolveFixtureTenant).kind,
      "not-found"
    );
  }
  for (const path of storefront.filter(Boolean)) {
    const expected = platform.includes(path) ? "legacy" : "not-found";
    assert.equal(routing.resolveTenantRoute(path).kind, expected);
  }
  for (const path of ["/products", "/shopnest/admin", "/api/cart/add", "/api/subcategories", "/api/reservations", "/media/products/a.png"]) {
    assert.equal(routing.resolveTenantRoute(path).kind, "not-found");
  }
});

test("tenant path builder preserves queries, hashes, and existing prefixes and rejects cross-tenant/context escapes", () => {
  for (const path of storefront) {
    const url = routing.prefixTenantPath(
      `${path || "/"}?q=gift#content`,
      "/panda-pop",
      resolveFixtureTenant
    );
    assert.equal(
      routing.prefixTenantPath(url, "/panda-pop", resolveFixtureTenant),
      url
    );
    assert.equal(
      routing.resolveTenantRoute(
        new URL(url, "https://shop.test").pathname,
        resolveFixtureTenant
      ).tenant.slug,
      "panda-pop"
    );
  }
  assert.equal(
    routing.prefixTenantPath("/gift-shop/categories", "/panda-pop"),
    "/panda-pop/gift-shop/categories"
  );
  for (const path of ["/panda-pop/../gift-shop/carts", "//evil.test", "https://evil.test", "/panda-pop%2f..%2fgift-shop", "/%2e%2e%2fadmin", "/\\evil.test"]) {
    assert.throws(() =>
      routing.prefixTenantPath(path, "/panda-pop")
    );
  }
  assert.throws(() =>
    routing.prefixTenantPath("/categories", "", resolveFixtureTenant)
  );
  assert.throws(() =>
    routing.prefixTenantPath("/categories", "/unknown", resolveFixtureTenant)
  );
});

test("actual middleware preserves physical page routes and replaces spoofed headers; only API/media rewrite", async () => {
  class Response {
    constructor(body, options = {}) { this.body = body; this.status = options.status; }
    cookies = { set() {} };
    static next(options) { return Object.assign(new Response(), { kind: "next", headers: options.request.headers }); }
    static rewrite(url, options) { return Object.assign(new Response(), { kind: "rewrite", url, headers: options.request.headers }); }
  }
  const fixtureRouting = {
    ...routing,
    resolveTenantRouteAsync: pathname =>
      Promise.resolve(
        routing.resolveTenantRoute(pathname, resolveFixtureTenant)
      ),
  };
  const { middleware, config } = load("../src/middleware.ts", {
    nanoid: { nanoid: () => "test-session" },
    "next/server": { NextResponse: Response },
    "./lib/tenant-routing/core": fixtureRouting,
    "./lib/tenant-registry/server": {
      resolveTrustedTenant: async value => resolveFixtureTenant(value),
    },
  });
  for (const path of [...platform, ...storefront.map(p => `/panda-pop${p}`), ...tenantAdmin.map(p => `/panda-pop${p}`), "/panda-pop/api/cart/add", "/panda-pop/media/products/a.png", "/api/customer-auth/google/callback"]) {
    const response = await middleware({ nextUrl: new URL(`${path}?q=gift`, "https://shop.test"), headers: new Headers({ [routing.TENANT_HEADER]: "gift-shop", [routing.TENANT_SCHEMA_HEADER]: "public", [routing.INTERNAL_PATH_HEADER]: "/admin/login" }), cookies: { has: () => false } });
    const tenant = path.startsWith("/panda-pop");
    assert.equal(response.headers.get(routing.TENANT_HEADER), tenant ? "panda-pop" : null);
    assert.equal(response.headers.get(routing.TENANT_SCHEMA_HEADER), tenant ? "panda_pop" : null);
    const internal = tenant ? path.slice("/panda-pop".length) || "/" : path;
    assert.equal(response.headers.get(routing.INTERNAL_PATH_HEADER), internal);
    assert.equal(response.kind, tenant && routing.isTenantHandlerPath(internal) ? "rewrite" : "next");
    if (response.url) assert.equal(response.url.search, "?q=gift");
  }
  for (const path of ["/categories", "/unknown/categories", "/api/cart/add", "/media/products/a.png"]) {
    assert.equal((await middleware({ nextUrl: new URL(path, "https://shop.test") })).status, 404);
  }

  const { middleware: runtimeMiddleware } = load("../src/middleware.ts", {
    nanoid: { nanoid: () => "runtime-session" },
    "next/server": { NextResponse: Response },
    "./lib/tenant-routing/core": routing,
    "./lib/tenant-registry/server": {
      resolveTrustedTenant: async () => null,
    },
  });
  for (const path of [
    "/panda-pop",
    "/gift-shop/admin",
    "/dvorik-collection/api/cart/add",
  ]) {
    const response = await runtimeMiddleware({
      nextUrl: new URL(path, "https://shop.test"),
      headers: new Headers({
        [routing.TENANT_HEADER]: "attacker",
        [routing.TENANT_SCHEMA_HEADER]: "public",
      }),
      cookies: { has: () => false },
    });
    assert.equal(response.status, 404);
  }
  // A dotted path may not skip middleware and inject trusted tenant headers.
  const matcher = new RegExp(`^${config.matcher[1]}$`);
  for (const path of ["/media/products/a.png", "/panda-pop/products/a.png", "/admin/foo.png"]) assert.ok(matcher.test(path));
});

test("actual TenantLink scopes string, object and as URLs", () => {
  const { TenantLink } = load("../src/components/TenantLink.tsx", {
    "next/link": { default: "Link" }, "react/jsx-runtime": jsx,
    react: { forwardRef: render => render },
    "@/context/TenantContext": {
      useTenant: () => ({
        path: path =>
          routing.prefixTenantPath(path, "/panda-pop", resolveFixtureTenant),
      }),
    },
  });
  for (const path of [...storefront, ...tenantAdmin]) assert.equal(TenantLink({ href: path || "/" }).props.href, `/panda-pop${path}`);
  const link = TenantLink({ href: { pathname: "/search", query: { q: "gift" } }, as: "/search?q=gift" });
  assert.equal(link.props.href.pathname, "/panda-pop/search");
  assert.equal(link.props.href.query.q, "gift");
  assert.equal(link.props.as, "/panda-pop/search?q=gift");
  assert.throws(() => TenantLink({ href: "/gift-shop/carts" }));
});

test("removed legacy tenant slugs are not runtime-configured", () => {
  for (const slug of ["panda-pop", "gift-shop", "dvorik-collection"]) {
    assert.equal(resolveConfiguredTenant(slug), null);
  }
});

test("provider has no tenantless fallback and tenant layout validates context against route params", async () => {
  const provider = load("../src/context/TenantContext.tsx", {
    "react/jsx-runtime": jsx,
    "@/lib/tenant": {
      ...routing,
      normalizeTenantSlug,
      prefixTenantPath: (path, basePath) =>
        routing.prefixTenantPath(path, basePath),
    },
    react: { createContext: value => ({ value }), useContext: context => context.value, useMemo: fn => fn() },
  });
  assert.throws(() => provider.useTenant(), /TenantProvider/);
  assert.throws(() => provider.TenantProvider({ slug: "panda-pop", basePath: "/gift-shop" }), /Invalid tenant/);
  let tenant = normalizeTenantSlug("panda-pop");
  const { default: layout } = load("../src/app/[tenant]/layout.tsx", {
    "react/jsx-runtime": jsx, "@/context/TenantContext": { TenantProvider: "TenantProvider" },
    "@/lib/tenant-context": { getTenant: async () => tenant }, "next/navigation": { notFound() { throw new Error("404"); } },
  });
  assert.equal((await layout({ params: Promise.resolve({ tenant: "panda-pop" }) })).props.basePath, "/panda-pop");
  await assert.rejects(() => layout({ params: Promise.resolve({ tenant: "gift-shop" }) }), /404/);
  tenant = null;
  await assert.rejects(() => layout({ params: Promise.resolve({ tenant: "panda-pop" }) }), /404/);
});

test("platform page needs no tenant or database and global links never use TenantLink", () => {
  const { default: home } = load("../src/app/page.tsx", {
    "react/jsx-runtime": jsx,
    "next/link": { default: "Link" },
    "./(marketing)/_components/CapabilitiesSection": { CapabilitiesSection: "CapabilitiesSection" },
    "./(marketing)/_components/DemoStoresSection": { DemoStoresSection: "DemoStoresSection" },
    "./(marketing)/_components/FaqSection": { FaqSection: "FaqSection" },
    "./(marketing)/_components/FinalCtaSection": { FinalCtaSection: "FinalCtaSection" },
    "./(marketing)/_components/HeroSection": { HeroSection: "HeroSection" },
    "./(marketing)/_components/HowItWorksSection": { HowItWorksSection: "HowItWorksSection" },
    "./(marketing)/_components/MarketingFooter": { MarketingFooter: "MarketingFooter" },
    "./(marketing)/_components/MarketingHeader": { MarketingHeader: "MarketingHeader" },
    "./(marketing)/_components/PricingPreview": { PricingPreview: "PricingPreview" },
    "./(marketing)/_components/WhyShopNestSection": { WhyShopNestSection: "WhyShopNestSection" },
  });
  assert.ok(home());
  const rootLayout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(rootLayout, /TenantProvider|getTenant/);
  function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(new URL(`${entry.name}/`, directory)) : [new URL(entry.name, directory)]); }
  for (const file of files(new URL("../src/app/admin/", import.meta.url))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /TenantLink|tenantPath\(/);
  }
});

test("route inventory covers every physical page and handler", () => {
  const inventory = readFileSync(new URL("../docs/route-audit.md", import.meta.url), "utf8");
  function routes(directory, segments = []) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (entry.isDirectory()) return routes(new URL(`${entry.name}/`, directory), [...segments, entry.name]);
      if (!["page.tsx", "route.ts"].includes(entry.name)) return [];
      let route = "/" + segments.filter(segment => !segment.startsWith("(")).join("/").replace("[tenant]", "<tenant>");
      if ((route.startsWith("/api/") && !["/api/customer-auth/google/callback", "/api/iCount/payment"].includes(route)) || route.startsWith("/media/")) route = `/<tenant>${route}`;
      return [route];
    });
  }
  const patterns = routes(new URL("../src/app/", import.meta.url));
  assert.equal(patterns.length, new Set(patterns).size);
  for (const route of patterns) assert.ok(inventory.includes(`\`${route}\``), `Missing inventory: ${route}`);
});

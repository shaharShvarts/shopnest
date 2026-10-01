import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import test from "node:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ts from "typescript";
import * as routing from "../src/lib/tenant-routing/core.ts";
import { resolveConfiguredTenant } from "../src/lib/tenant-validation.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));

// Transpile the real TSX components. Only request/auth boundaries are substituted;
// React, Next Link, TenantLink, context, navigation, and Radix render normally.
function shellModules(slug, locale, internalPath) {
  const tenant = resolveConfiguredTenant(slug);
  const cache = new Map();
  const overrides = {
    "@/lib/tenant": { ...routing, resolveConfiguredTenant },
    "@/lib/tenant-context": { getTenant: async () => tenant },
    "@/lib/admin-auth/server": { requireTenantAdmin: async () => ({ controlTenant: { displayName: slug } }) },
    "next/headers": { headers: async () => new Headers({ [routing.INTERNAL_PATH_HEADER]: internalPath }) },
    "next/navigation": { usePathname: () => `/${slug}${internalPath}`, useRouter: () => ({ refresh() {} }), notFound() { throw new Error("404"); } },
    "next/font/google": { Montserrat: () => ({ variable: "test-font" }) },
    "next-intl/server": {
      getTranslations: async () => key => key === "title" ? (locale === "he" ? "תשלומים" : "Payments") : key,
      getLocale: async () => locale,
      getMessages: async () => ({}),
    },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(name => {
      if (name in overrides) return overrides[name];
      if (name.endsWith(".css")) return {};
      // Next's server wrapper supplies locale/timeZone before crossing the RSC boundary.
      if (name === "next-intl") {
        const intl = require(name);
        return { ...intl, NextIntlClientProvider: props => require("react").createElement(intl.NextIntlClientProvider, { locale, timeZone: "UTC", ...props }) };
      }
      if (name === "./_actions/auth") return { logoutCurrentAdmin: async () => {} };
      if (!name.startsWith("@/") && !name.startsWith(".")) return require(name);
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, `${base}.tsx`, `${base}.ts`].find(existsSync);
      assert.ok(resolved, `Unresolved component dependency: ${name}`);
      return load(resolved);
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return file => load(path.join(root, "src", file));
}

test("tenant admin shell and dashboard hydrate without recoverable errors or lost prefixes", async () => {
  for (const slug of ["panda-pop", "gift-shop"]) {
    for (const locale of ["he", "en"]) {
      for (const internalPath of ["/admin", "/admin/products"]) {
        const load = shellModules(slug, locale, internalPath);
        const dashboard = await load("app/[tenant]/admin/page.tsx").default();
        const admin = await load("app/[tenant]/admin/layout.tsx").default({ children: dashboard });
        const tenantTree = await load("app/[tenant]/layout.tsx").default({ children: admin, params: Promise.resolve({ tenant: slug }) });
        const tree = await load("app/layout.tsx").default({ children: tenantTree });
        const html = renderToString(tree);
        const dom = new JSDOM(`<!DOCTYPE html>${html}`, { url: `https://shop.test/${slug}${internalPath}` });
        const previous = new Map();
        for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
          previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
          Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        }
        document.cookie = `SHOPNEST_LOCALE=${locale}; path=/`;
        const errors = [];
        const originalError = console.error;
        console.error = (...args) => errors.push(args.map(String).join(" "));
        let hydrated;
        try {
          const container = document;
          assert.equal(document.documentElement.lang, locale);
          assert.equal(document.documentElement.dir, locale === "he" ? "rtl" : "ltr");
          const before = [...container.querySelectorAll("nav a")].map(a => a.getAttribute("href"));
          assert.equal(before.length, 7);
          for (const href of before) {
            assert.ok(href.startsWith(`/${slug}/admin`), href);
            assert.notEqual(href, `/${slug}/admin/users`);
            const relative = href.slice(`/${slug}/admin`.length);
            assert.ok(existsSync(path.join(root, "src/app/[tenant]/admin", relative, "page.tsx")), `Dead link: ${href}`);
          }
          await act(async () => {
            hydrated = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error.message) });
          });
          assert.deepEqual([...container.querySelectorAll("nav a")].map(a => a.getAttribute("href")), before);
          assert.deepEqual(errors, [], `${slug} ${locale} ${internalPath}`);
        } catch (error) {
          if (error instanceof AggregateError) throw new Error(error.errors.map(e => e.stack).join("\n"));
          throw error;
        } finally {
          if (hydrated) await act(async () => hydrated.unmount());
          console.error = originalError;
          dom.window.close();
          for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
          }
        }
      }
    }
  }
});

test("application source contains no dead tenant admin users reference", () => {
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.[cm]?[jt]sx?$/.test(file)) assert.doesNotMatch(readFileSync(file, "utf8"), /\/admin\/users\b/, file);
    }
  }
  scan(path.join(root, "src"));
});

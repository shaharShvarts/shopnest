import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPlanSchema,
  formatMinorAmount,
  parseIlsToMinor,
  planUpdateFormSchema,
  validateEntitlementValue,
} from "../src/lib/plan-administration/core.ts";
import {
  SUPPORTED_ENTITLEMENTS,
  supportedEntitlementByCode,
} from "../src/lib/store-entitlements/registry.ts";

test("plan codes are stable machine identifiers", () => {
  assert.equal(
    createPlanSchema.parse({ code: "small_plus", name: "Small Plus" }).code,
    "small_plus"
  );
  assert.throws(() =>
    createPlanSchema.parse({ code: "Bad Plan", name: "Bad" })
  );
});

test("supported entitlement registry exposes only implemented capabilities", () => {
  assert.equal(SUPPORTED_ENTITLEMENTS.length, 3);
  assert.deepEqual(supportedEntitlementByCode("store_managers"), {
    code: "store_managers",
    name: "Store Managers",
    description: "Maximum number of Store Managers assigned to one Store.",
    valueType: "integer",
  });
  assert.deepEqual(supportedEntitlementByCode("custom_domain"), {
    code: "custom_domain",
    name: "Custom Domain",
    description: "Allow the Store to use its own custom domain.",
    valueType: "boolean",
  });
  assert.equal(supportedEntitlementByCode("media_storage_mb"), null);
  assert.deepEqual(supportedEntitlementByCode("products_limit"), {
    code: "products_limit",
    name: "Products",
    description: "Maximum number of products allowed in the Store catalog.",
    valueType: "integer",
  });
  assert.equal(supportedEntitlementByCode("free_shipping"), null);
});

test("ILS prices round-trip in minor units", () => {
  assert.equal(parseIlsToMinor("49"), 4900);
  assert.equal(parseIlsToMinor("49.90"), 4990);
  assert.equal(parseIlsToMinor("49,9"), 4990);
  assert.throws(() => parseIlsToMinor(""));
  assert.throws(() => parseIlsToMinor("abc"));
  assert.throws(() => parseIlsToMinor("9.999"));
  assert.equal(formatMinorAmount(4990), "49.90");
});

test("entitlement values enforce integer and boolean semantics", () => {
  assert.equal(validateEntitlementValue("integer", -1), -1);
  assert.equal(validateEntitlementValue("integer", 25), 25);
  assert.equal(validateEntitlementValue("boolean", 0), 0);
  assert.equal(validateEntitlementValue("boolean", 1), 1);
  assert.throws(() => validateEntitlementValue("boolean", -1));
  assert.throws(() => validateEntitlementValue("boolean", 2));
});


test("plan update form requires complete prices and valid fixed fields", () => {
  assert.deepEqual(
    planUpdateFormSchema.parse({
      planId: "1",
      name: "Free",
      status: "active",
      monthlyPrice: "0",
      annualPrice: "0.00",
    }),
    {
      planId: 1,
      name: "Free",
      status: "active",
      monthlyPrice: "0",
      annualPrice: "0.00",
    }
  );

  assert.throws(() =>
    planUpdateFormSchema.parse({
      planId: "1",
      name: "Free",
      status: "active",
      monthlyPrice: "",
      annualPrice: "0",
    })
  );

  assert.throws(() =>
    planUpdateFormSchema.parse({
      planId: "1",
      name: "Free",
      status: "active",
      monthlyPrice: "9.999",
      annualPrice: "0",
    })
  );
});


test("marketing pricing reads the dynamic active plan catalog", async () => {
  const [catalog, page, preview] = await Promise.all([
    readFile("src/lib/public-plans/server.ts", "utf8"),
    readFile("src/app/(marketing)/pricing/page.tsx", "utf8"),
    readFile("src/app/(marketing)/_components/PricingPreview.tsx", "utf8"),
  ]);

  assert.match(catalog, /eq\(plans\.status, "active"\)/);
  assert.match(catalog, /planPrices/);
  assert.match(page, /listPublicPlans/);
  assert.match(preview, /listPublicPlans/);
  assert.doesNotMatch(page, /\["free","small","medium","large"\]/);
  assert.doesNotMatch(preview, /\["free","small","medium","large"\]/);
  assert.doesNotMatch(page, /pricing\.\$\{plan\}/);
  assert.doesNotMatch(preview, /pricing\.\$\{plan\}/);
});


test("plan administration uses clean flash redirects and readable language control", async () => {
  const [actions, page, flash, language] = await Promise.all([
    readFile("src/app/admin/_actions/plans.ts", "utf8"),
    readFile("src/app/admin/plans/page.tsx", "utf8"),
    readFile("src/app/admin/plans/PlanFlashMessage.tsx", "utf8"),
    readFile("src/app/components/LanguageSelector.tsx", "utf8"),
  ]);

  assert.match(actions, /SHOPNEST_PLAN_RESULT/);
  assert.match(actions, /redirect\("\/admin\/plans"\)/);
  assert.doesNotMatch(actions, /\?result=/);
  assert.doesNotMatch(page, /searchParams/);
  assert.match(page, /SHOPNEST_PLAN_RESULT/);
  assert.match(flash, /max-age=0/);
  assert.match(language, /bg-white/);
  assert.match(language, /text-slate-950/);
});


test("Control Plane shell and plan controls have active navigation and consistent interaction styling", async () => {
  const [layout, nav, plans, language] = await Promise.all([
    readFile("src/app/admin/layout.tsx", "utf8"),
    readFile("src/app/admin/_components/AdminNavigation.tsx", "utf8"),
    readFile("src/app/admin/plans/page.tsx", "utf8"),
    readFile("src/app/components/LanguageSelector.tsx", "utf8"),
  ]);

  assert.match(layout, /AdminNavigation/);
  assert.match(layout, /text-white transition-opacity hover:opacity-90/);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(nav, /bg-slate-900 text-white shadow-sm/);
  assert.match(language, /h-10/);
  assert.match(plans, /hover:bg-red-50/);
  assert.match(plans, /hover:bg-slate-800/);
  assert.match(plans, /hover:border-slate-300/);
});


test("Control Plane language, status select, and entitlement action polish remain wired", async () => {
  const [language, localeAction, layout, plans] = await Promise.all([
    readFile("src/app/components/LanguageSelector.tsx", "utf8"),
    readFile("src/app/_actions/locale.ts", "utf8"),
    readFile("src/app/admin/layout.tsx", "utf8"),
    readFile("src/app/admin/plans/page.tsx", "utf8"),
  ]);

  assert.match(language, /setShopNestLocaleAction/);
  assert.match(language, /router\.refresh\(\)/);
  assert.doesNotMatch(language, /document\.cookie/);
  assert.match(language, /locale: "he" \| "en"/);
  assert.match(layout, /<LanguageSelector locale=\{locale\} \/>/);
  assert.match(localeAction, /SHOPNEST_LOCALE/);
  assert.match(localeAction, /httpOnly: true/);
  assert.match(layout, /text-slate-300/);
  assert.match(plans, /appearance-none/);
  assert.match(plans, /absolute left-3 top-1\/2/);
  assert.match(plans, /self-start border-red-200/);
});

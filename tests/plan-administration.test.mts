import assert from "node:assert/strict";
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
  assert.equal(SUPPORTED_ENTITLEMENTS.length, 4);
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
  assert.deepEqual(supportedEntitlementByCode("media_storage_mb"), {
    code: "media_storage_mb",
    name: "Media Storage",
    description: "Maximum media storage available to the Store, in megabytes.",
    valueType: "integer",
  });
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

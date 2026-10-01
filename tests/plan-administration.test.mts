import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlanSchema,
  formatMinorAmount,
  parseIlsToMinor,
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
  assert.equal(SUPPORTED_ENTITLEMENTS.length, 1);
  assert.deepEqual(supportedEntitlementByCode("store_managers"), {
    code: "store_managers",
    name: "Store Managers",
    description: "Maximum number of Store Managers assigned to one Store.",
    valueType: "integer",
  });
  assert.equal(supportedEntitlementByCode("free_shipping"), null);
});

test("ILS prices round-trip in minor units", () => {
  assert.equal(parseIlsToMinor("49"), 4900);
  assert.equal(parseIlsToMinor("49.90"), 4990);
  assert.equal(parseIlsToMinor("49,9"), 4990);
  assert.equal(parseIlsToMinor(""), null);
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

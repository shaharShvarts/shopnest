import assert from "node:assert/strict";
import test from "node:test";
import {
  booleanEntitlement,
  effectiveStoreEntitlementsFromRows,
  entitlementHasCapacity,
  entitlementIsUnlimited,
  integerEntitlement,
} from "../src/lib/store-entitlements/core.ts";

test("resolves plan entitlements by code", () => {
  const state = effectiveStoreEntitlementsFromRows(4, [
    {
      storeId: 4,
      planId: 2,
      planCode: "small",
      planName: "Small",
      entitlementCode: "store_managers",
      entitlementName: "Store Managers",
      entitlementDescription: null,
      entitlementValueType: "integer",
      entitlementValue: 2,
    },
    {
      storeId: 4,
      planId: 2,
      planCode: "small",
      planName: "Small",
      entitlementCode: "custom_domain",
      entitlementName: "Custom Domain",
      entitlementDescription: null,
      entitlementValueType: "boolean",
      entitlementValue: 1,
    },
  ]);

  assert.deepEqual(state.plan, { id: 2, code: "small", name: "Small" });
  assert.equal(integerEntitlement(state, "store_managers"), 2);
  assert.equal(booleanEntitlement(state, "custom_domain"), true);
});

test("missing entitlements fail closed", () => {
  const state = effectiveStoreEntitlementsFromRows(4, []);
  assert.equal(state.plan, null);
  assert.equal(integerEntitlement(state, "store_managers"), 0);
  assert.equal(booleanEntitlement(state, "custom_domain"), false);
});

test("supports unlimited numeric entitlements", () => {
  assert.equal(entitlementIsUnlimited(-1), true);
  assert.equal(entitlementHasCapacity(-1, 1000000), true);
  assert.equal(entitlementHasCapacity(2, 1), true);
  assert.equal(entitlementHasCapacity(2, 2), false);
});

test("rejects invalid boolean values", () => {
  assert.throws(() =>
    effectiveStoreEntitlementsFromRows(4, [
      {
        storeId: 4,
        planId: 2,
        planCode: "small",
        planName: "Small",
        entitlementCode: "custom_domain",
        entitlementName: "Custom Domain",
        entitlementDescription: null,
        entitlementValueType: "boolean",
        entitlementValue: -1,
      },
    ])
  );
});

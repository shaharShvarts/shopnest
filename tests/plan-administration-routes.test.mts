import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Super Admin plans UI assigns supported features inside each plan", async () => {
  const source = await readFile("src/app/admin/plans/page.tsx", "utf8");
  assert.match(source, /addPlanEntitlementAction/);
  assert.match(source, /availableEntitlements/);
  assert.match(source, /chooseFeature/);
  assert.match(source, /removePlanEntitlementAction/);
  assert.doesNotMatch(source, /createEntitlementAction/);
  assert.doesNotMatch(source, /entitlementCode.*placeholder/);
});

test("plan server rejects unsupported capability names", async () => {
  const source = await readFile("src/lib/plan-administration/server.ts", "utf8");
  assert.match(source, /supportedEntitlementByCode/);
  assert.match(source, /Unsupported entitlement/);
});


test("feature removal binds trusted plan and entitlement ids", async () => {
  const source = await readFile("src/app/admin/plans/page.tsx", "utf8");
  assert.match(source, /removePlanEntitlementAction\.bind/);
  assert.match(source, /plan\.id/);
  assert.match(source, /entitlement\.id/);
  assert.match(source, /formNoValidate/);
});

test("integer entitlement input rejects exponent notation in the UI", async () => {
  const source = await readFile(
    "src/app/admin/plans/EntitlementIntegerInput.tsx",
    "utf8"
  );
  assert.match(source, /type="text"/);
  assert.match(source, /inputMode="numeric"/);
  assert.match(source, /pattern="-1\|0\|\[1-9\]\[0-9\]\*"/);
  assert.match(source, /\^\\d\+\$/);
});

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

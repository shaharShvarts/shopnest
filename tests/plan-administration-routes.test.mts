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

test("integer entitlement quota uses arrows and an unlimited control", async () => {
  const source = await readFile(
    "src/app/admin/plans/EntitlementIntegerInput.tsx",
    "utf8"
  );
  assert.match(source, /type="hidden"/);
  assert.match(source, /Math\.max\(0, base \+ delta\)/);
  assert.match(source, /setValue\(-1\)/);
  assert.match(source, /unlimitedLabel/);
  assert.doesNotMatch(source, /type="number"/);
});


test("plan price inputs reject free-form text and require explicit values", async () => {
  const source = await readFile(
    "src/app/admin/plans/PlanPriceInput.tsx",
    "utf8"
  );
  assert.match(source, /type="text"/);
  assert.match(source, /inputMode="decimal"/);
  assert.match(source, /required/);
  assert.match(source, /\[.,\]\\d\{0,2\}/);
  assert.doesNotMatch(source, /type="number"/);
});

test("plan update action validates fixed fields with Zod", async () => {
  const source = await readFile("src/app/admin/_actions/plans.ts", "utf8");
  assert.match(source, /planUpdateFormSchema\.parse/);
  assert.match(source, /validateEntitlementValue/);
});

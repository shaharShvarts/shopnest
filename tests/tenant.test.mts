import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveConfiguredTenant,
  resolveTenantRoute,
} from "../src/lib/tenant.js";

test("configured tenant allowlist", () => {
  assert.equal(resolveConfiguredTenant("panda-pop")?.schema, "panda_pop");
  assert.equal(
    resolveConfiguredTenant("dvorik-collection")?.schema,
    "dvorik_collection"
  );
  assert.equal(resolveConfiguredTenant("gift-shop")?.schema, "gift_shop");
  assert.equal(resolveConfiguredTenant("random-store"), null);
});

test("admin remains a legacy route", () => {
  assert.deepEqual(resolveTenantRoute("/admin"), { kind: "legacy" });
});

test("unknown tenant routes resolve to not-found", () => {
  assert.deepEqual(resolveTenantRoute("/random-store"), { kind: "not-found" });
  assert.deepEqual(resolveTenantRoute("/test123"), { kind: "not-found" });
  assert.deepEqual(resolveTenantRoute("/abcdef"), { kind: "not-found" });
});

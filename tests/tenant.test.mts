import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTenantRoute,
} from "../src/lib/tenant-routing/core.ts";
import { resolveConfiguredTenant } from "../src/lib/tenant-validation.mjs";

test("legacy tenants are no longer statically configured", () => {
  for (const slug of [
    "panda-pop",
    "gift-shop",
    "dvorik-collection",
    "random-store",
  ]) {
    assert.equal(resolveConfiguredTenant(slug), null);
    assert.deepEqual(resolveTenantRoute("/" + slug), { kind: "not-found" });
  }
});

test("admin remains a legacy route", () => {
  assert.deepEqual(resolveTenantRoute("/admin"), { kind: "legacy" });
});

test("unknown tenant routes resolve to not-found", () => {
  assert.deepEqual(resolveTenantRoute("/random-store"), { kind: "not-found" });
  assert.deepEqual(resolveTenantRoute("/test123"), { kind: "not-found" });
  assert.deepEqual(resolveTenantRoute("/abcdef"), { kind: "not-found" });
});

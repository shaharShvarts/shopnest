import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STORE_LIFECYCLE_STATUSES,
  StoreLifecycleInputError,
  StoreLifecycleTransitionError,
  applyStoreLifecycleTransition,
  canTransitionStore,
  type StoreLifecycleSnapshot,
} from "../src/lib/store-lifecycle/core.ts";

function snapshot(
  status: StoreLifecycleSnapshot["status"] = "draft"
): StoreLifecycleSnapshot {
  return {
    storeId: 4,
    organizationId: 2,
    status,
    tenantId: null,
    activationRequestedAt: null,
    provisioningStartedAt: null,
    provisionedAt: null,
    lastProvisioningAttemptAt: null,
    provisioningAttemptCount: 0,
    lastProvisioningErrorCode: null,
    updatedAt: new Date("2026-09-21T08:00:00.000Z"),
  };
}

test("Store lifecycle exposes the exact PR #41 states", () => {
  assert.deepEqual(STORE_LIFECYCLE_STATUSES, [
    "draft",
    "ready_for_provisioning",
    "activation_requested",
    "provisioning",
    "provisioning_failed",
    "provisioned",
  ]);
});

test("Store lifecycle allows only explicit transitions", () => {
  assert.equal(
    canTransitionStore("draft", "ready_for_provisioning"),
    true
  );
  assert.equal(
    canTransitionStore("ready_for_provisioning", "activation_requested"),
    true
  );
  assert.equal(
    canTransitionStore("activation_requested", "provisioning"),
    true
  );
  assert.equal(
    canTransitionStore("provisioning", "provisioning_failed"),
    true
  );
  assert.equal(
    canTransitionStore("provisioning", "provisioned"),
    true
  );
  assert.equal(
    canTransitionStore("activation_requested", "draft"),
    true
  );
  assert.equal(
    canTransitionStore("provisioning_failed", "draft"),
    true
  );

  assert.equal(canTransitionStore("draft", "provisioning"), false);
  assert.equal(
    canTransitionStore("ready_for_provisioning", "provisioned"),
    false
  );
  assert.equal(
    canTransitionStore("provisioning_failed", "provisioned"),
    false
  );
  assert.equal(canTransitionStore("provisioned", "draft"), false);
});

test("transition metadata records activation and provisioning attempts", () => {
  const ready = applyStoreLifecycleTransition(
    snapshot(),
    { to: "ready_for_provisioning" },
    new Date("2026-09-21T08:01:00.000Z")
  );
  const requested = applyStoreLifecycleTransition(
    ready,
    { to: "activation_requested" },
    new Date("2026-09-21T08:02:00.000Z")
  );
  const provisioning = applyStoreLifecycleTransition(
    requested,
    { to: "provisioning" },
    new Date("2026-09-21T08:03:00.000Z")
  );

  assert.equal(
    requested.activationRequestedAt?.toISOString(),
    "2026-09-21T08:02:00.000Z"
  );
  assert.equal(
    provisioning.provisioningStartedAt?.toISOString(),
    "2026-09-21T08:03:00.000Z"
  );
  assert.equal(
    provisioning.lastProvisioningAttemptAt?.toISOString(),
    "2026-09-21T08:03:00.000Z"
  );
  assert.equal(provisioning.provisioningAttemptCount, 1);
});

test("failure stores only a safe code and never links a Tenant", () => {
  const current = {
    ...snapshot("provisioning"),
    provisioningAttemptCount: 1,
  };

  const failed = applyStoreLifecycleTransition(
    current,
    { to: "provisioning_failed", errorCode: "SCHEMA_MIGRATION_FAILED" },
    new Date("2026-09-21T08:04:00.000Z")
  );

  assert.equal(failed.status, "provisioning_failed");
  assert.equal(failed.tenantId, null);
  assert.equal(failed.provisionedAt, null);
  assert.equal(
    failed.lastProvisioningErrorCode,
    "SCHEMA_MIGRATION_FAILED"
  );

  assert.throws(
    () =>
      applyStoreLifecycleTransition(
        current,
        {
          to: "provisioning_failed",
          errorCode: "raw stack trace: password=secret",
        },
        new Date("2026-09-21T08:04:00.000Z")
      ),
    StoreLifecycleInputError
  );
});

test("provisioned transition requires a trusted positive Tenant id", () => {
  const current = snapshot("provisioning");

  assert.throws(
    () =>
      applyStoreLifecycleTransition(
        current,
        { to: "provisioned", tenantId: 0 }
      ),
    StoreLifecycleInputError
  );

  const provisioned = applyStoreLifecycleTransition(
    current,
    { to: "provisioned", tenantId: 27 },
    new Date("2026-09-21T08:05:00.000Z")
  );

  assert.equal(provisioned.status, "provisioned");
  assert.equal(provisioned.tenantId, 27);
  assert.equal(
    provisioned.provisionedAt?.toISOString(),
    "2026-09-21T08:05:00.000Z"
  );
});

test("illegal lifecycle jumps fail closed", () => {
  assert.throws(
    () =>
      applyStoreLifecycleTransition(
        snapshot(),
        { to: "provisioning" }
      ),
    StoreLifecycleTransitionError
  );
});

test("0011 migration preserves Store rows while expanding lifecycle", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0011_store_provisioning_lifecycle.sql",
    "utf8"
  );

  assert.match(
    sql,
    /ALTER COLUMN "status" TYPE varchar\(32\)/
  );
  assert.match(sql, /DROP TYPE "public"\."store_status"/);
  assert.match(sql, /"activation_requested_at"/);
  assert.match(sql, /"provisioning_started_at"/);
  assert.match(sql, /"provisioned_at"/);
  assert.match(sql, /"provisioning_attempt_count"/);
  assert.match(sql, /stores_status_check/);
  assert.match(sql, /stores_status_tenant_consistency/);
  assert.match(sql, /stores_provisioning_error_code_format/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP SCHEMA|TRUNCATE|DELETE FROM/);

  const journal = JSON.parse(
    await readFile(
      "src/drizzle/control-migrations/meta/_journal.json",
      "utf8"
    )
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) =>
      candidate.tag === "0011_store_provisioning_lifecycle"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 11);
});

test("lifecycle repository is owner scoped and control-plane only", async () => {
  const source = await readFile(
    "src/lib/store-lifecycle/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /organizationMemberships/);
  assert.match(source, /merchantAccountId/);
  assert.match(source, /"owner"/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /controlPlaneTenants/);
  assert.match(source, /tenant\.slug !== row\.slug/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path|schemaName/
  );
});

test("lifecycle service derives readiness server-side before activation", async () => {
  const source = await readFile(
    "src/lib/store-lifecycle/service.ts",
    "utf8"
  );

  assert.match(source, /evaluateForOwnedStore/);
  assert.match(source, /readiness\.ready/);
  assert.match(source, /STORE_NOT_READY/);
  assert.match(source, /requestActivationForOwnedStore/);
  assert.doesNotMatch(
    source,
    /browser|formData|tenantId.*input|schemaName/
  );
});

test("merchant lifecycle translations cover every Store status", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  for (const status of STORE_LIFECYCLE_STATUSES) {
    assert.equal(typeof en.MerchantStore[status], "string");
    assert.equal(typeof he.MerchantStore[status], "string");
  }
});

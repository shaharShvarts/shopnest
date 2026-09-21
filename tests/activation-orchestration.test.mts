import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ActivationOrchestrationError,
  asProvisionableTenantPlan,
  tenantSchemaNameForStore,
} from "../src/lib/activation-orchestration/core.ts";
import {
  ActivationOrchestrationService,
  type ActivationLifecycleService,
  type ActivationTenantProvisioner,
  type ActivationTenantRegistryCache,
} from "../src/lib/activation-orchestration/service.ts";
import type {
  ActivationOrchestrationRepository,
  ActivationProvisioningContext,
} from "../src/lib/activation-orchestration/drizzle-repository.ts";
import type { StoreLifecycleRepository } from "../src/lib/store-lifecycle/drizzle-repository.ts";
import type { StoreLifecycleSnapshot } from "../src/lib/store-lifecycle/core.ts";
import type { StoreReadinessRepository } from "../src/lib/store-readiness/drizzle-repository.ts";
import type { StoreReadinessResult } from "../src/lib/store-readiness/core.ts";

const NOW = new Date("2026-09-21T16:00:00.000Z");

function lifecycle(
  status: StoreLifecycleSnapshot["status"],
  tenantId: number | null = null
): StoreLifecycleSnapshot {
  return {
    storeId: 7,
    organizationId: 3,
    status,
    tenantId,
    activationRequestedAt:
      status === "activation_requested" ||
      status === "provisioning" ||
      status === "provisioned"
        ? NOW
        : null,
    provisioningStartedAt:
      status === "provisioning" || status === "provisioned"
        ? NOW
        : null,
    provisionedAt: status === "provisioned" ? NOW : null,
    lastProvisioningAttemptAt:
      status === "provisioning" || status === "provisioned"
        ? NOW
        : null,
    provisioningAttemptCount:
      status === "provisioning" || status === "provisioned" ? 1 : 0,
    lastProvisioningErrorCode: null,
    updatedAt: NOW,
  };
}

function readiness(ready: boolean): StoreReadinessResult {
  return {
    storeId: 7,
    ready,
    evaluatedAt: NOW,
    requirements: [],
  };
}

const CONTEXT: ActivationProvisioningContext = {
  storeId: 7,
  organizationId: 3,
  displayName: "Registry Store",
  slug: "registry-store",
  schemaName: "tenant_7",
  subscriptionId: 11,
  plan: "small",
};

function lifecycleRepository(
  initial: StoreLifecycleSnapshot,
  overrides: Partial<StoreLifecycleRepository> = {}
): StoreLifecycleRepository {
  return {
    async findForOwnedStore() {
      return initial;
    },
    async syncReadinessForOwnedStore() {
      return initial;
    },
    async requestActivationForOwnedStore() {
      return lifecycle("activation_requested");
    },
    async startProvisioning() {
      return lifecycle("provisioning");
    },
    async markProvisioningFailed() {
      return lifecycle("provisioning_failed");
    },
    async markProvisioned() {
      return lifecycle("provisioned", 19);
    },
    ...overrides,
  };
}

function lifecycleService(
  overrides: Partial<ActivationLifecycleService> = {}
): ActivationLifecycleService {
  return {
    async requestActivationForOwnedStore() {
      return lifecycle("activation_requested");
    },
    async startProvisioning() {
      return lifecycle("provisioning");
    },
    async markProvisioningFailed() {
      return lifecycle("provisioning_failed");
    },
    ...overrides,
  };
}

function readinessRepository(
  ready: boolean
): StoreReadinessRepository {
  return {
    async evaluateForOwnedStore() {
      return readiness(ready);
    },
  };
}

function activationRepository(
  overrides: Partial<ActivationOrchestrationRepository> = {}
): ActivationOrchestrationRepository {
  return {
    async loadProvisioningContext() {
      return CONTEXT;
    },
    async finalizeProvisioning() {
      return {
        storeId: 7,
        tenantId: 19,
        slug: "registry-store",
        schemaName: "tenant_7",
      };
    },
    ...overrides,
  };
}

test("Tenant schema identity is deterministic, safe and independent of slug", () => {
  assert.equal(tenantSchemaNameForStore(42), "tenant_42");
  assert.throws(() => tenantSchemaNameForStore(0), ActivationOrchestrationError);
  assert.throws(() => tenantSchemaNameForStore(-1), ActivationOrchestrationError);
});

test("legacy Tenant plan compatibility fails closed for free", () => {
  assert.equal(asProvisionableTenantPlan("small"), "small");
  assert.equal(asProvisionableTenantPlan("medium"), "medium");
  assert.equal(asProvisionableTenantPlan("large"), "large");
  assert.equal(asProvisionableTenantPlan("free"), null);
  assert.equal(asProvisionableTenantPlan("enterprise"), null);
});

test("successful activation provisions, finalizes and clears registry cache", async () => {
  const provisioned: ActivationProvisioningContext[] = [];
  const cleared: string[] = [];
  let startCalls = 0;

  const service = new ActivationOrchestrationService(
    lifecycleService({
      async startProvisioning() {
        startCalls += 1;
        return lifecycle("provisioning");
      },
    }),
    lifecycleRepository(lifecycle("activation_requested")),
    readinessRepository(true),
    activationRepository(),
    {
      async provision(context) {
        provisioned.push(context);
      },
    },
    {
      clear(slug) {
        cleared.push(slug);
      },
    }
  );

  const result = await service.activateOwnedStore(5, 7, NOW);

  assert.equal(startCalls, 1);
  assert.deepEqual(provisioned, [CONTEXT]);
  assert.deepEqual(cleared, ["registry-store"]);
  assert.deepEqual(result, {
    kind: "provisioned",
    storeId: 7,
    tenantId: 19,
    slug: "registry-store",
    schemaName: "tenant_7",
  });
});

test("readiness regression stops before provisioning side effects", async () => {
  let startCalls = 0;
  let provisionCalls = 0;
  let syncedReady: boolean | null = null;

  const repository = lifecycleRepository(
    lifecycle("activation_requested"),
    {
      async syncReadinessForOwnedStore(
        _merchantId,
        _storeId,
        ready
      ) {
        syncedReady = ready;
        return lifecycle("draft");
      },
    }
  );

  const service = new ActivationOrchestrationService(
    lifecycleService({
      async startProvisioning() {
        startCalls += 1;
        return lifecycle("provisioning");
      },
    }),
    repository,
    readinessRepository(false),
    activationRepository(),
    {
      async provision() {
        provisionCalls += 1;
      },
    },
    { clear() {} }
  );

  await assert.rejects(
    () => service.activateOwnedStore(5, 7, NOW),
    (error: unknown) =>
      error instanceof ActivationOrchestrationError &&
      error.code === "STORE_NOT_READY"
  );

  assert.equal(syncedReady, false);
  assert.equal(startCalls, 0);
  assert.equal(provisionCalls, 0);
});

test("already provisioned activation is idempotent and has no side effects", async () => {
  let readinessCalls = 0;
  let provisionCalls = 0;

  const service = new ActivationOrchestrationService(
    lifecycleService(),
    lifecycleRepository(lifecycle("provisioned", 19)),
    {
      async evaluateForOwnedStore() {
        readinessCalls += 1;
        return readiness(true);
      },
    },
    activationRepository(),
    {
      async provision() {
        provisionCalls += 1;
      },
    },
    { clear() {} }
  );

  const result = await service.activateOwnedStore(5, 7, NOW);

  assert.deepEqual(result, {
    kind: "already_provisioned",
    storeId: 7,
    tenantId: 19,
  });
  assert.equal(readinessCalls, 0);
  assert.equal(provisionCalls, 0);
});

test("retry while provisioning reuses the same attempt", async () => {
  let startCalls = 0;
  let provisionCalls = 0;

  const service = new ActivationOrchestrationService(
    lifecycleService({
      async startProvisioning() {
        startCalls += 1;
        return lifecycle("provisioning");
      },
    }),
    lifecycleRepository(lifecycle("provisioning")),
    readinessRepository(true),
    activationRepository(),
    {
      async provision() {
        provisionCalls += 1;
      },
    },
    { clear() {} }
  );

  await service.activateOwnedStore(5, 7, NOW);

  assert.equal(startCalls, 0);
  assert.equal(provisionCalls, 1);
});

test("provisioner failure records a bounded safe lifecycle failure", async () => {
  let failureCode: string | null = null;

  const service = new ActivationOrchestrationService(
    lifecycleService({
      async markProvisioningFailed(_storeId, errorCode) {
        failureCode = errorCode;
        return lifecycle("provisioning_failed");
      },
    }),
    lifecycleRepository(lifecycle("provisioning")),
    readinessRepository(true),
    activationRepository(),
    {
      async provision() {
        throw new Error("database password should never be persisted");
      },
    },
    { clear() {} }
  );

  await assert.rejects(
    () => service.activateOwnedStore(5, 7, NOW),
    (error: unknown) =>
      error instanceof ActivationOrchestrationError &&
      error.code === "SCHEMA_PROVISIONING_FAILED"
  );

  assert.equal(failureCode, "SCHEMA_PROVISIONING_FAILED");
});

test("activation implementation keeps browser authority out of Tenant identity", async () => {
  const [repositorySource, serverSource, actionSource] = await Promise.all([
    readFile(
      "src/lib/activation-orchestration/drizzle-repository.ts",
      "utf8"
    ),
    readFile("src/lib/activation-orchestration/server.ts", "utf8"),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_actions.ts",
      "utf8"
    ),
  ]);

  assert.match(repositorySource, /tenantSchemaNameForStore\(store\.id\)/);
  assert.match(repositorySource, /validateStoreSlug\(store\.slug\)/);
  assert.match(repositorySource, /controlPlaneTenants/);
  assert.match(repositorySource, /subscriptions/);
  assert.match(repositorySource, /\.for\("update"\)/);
  assert.match(serverSource, /provisionTenant/);
  assert.match(serverSource, /env\.DATABASE_URL/);
  assert.match(actionSource, /requireMerchantPage/);
  assert.match(actionSource, /parseStoreId\(formData\.get\("storeId"\)\)/);
  assert.doesNotMatch(
    actionSource,
    /formData\.get\("(?:schema|schemaName|tenantId|status|ready|plan)"\)/
  );
  assert.doesNotMatch(repositorySource, /DROP SCHEMA|Host|TENANT_SCHEMA_HEADER/);
});

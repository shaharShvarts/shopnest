import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import { getStoreLifecycleRepository } from "../src/lib/store-lifecycle/server.ts";
import { getActivationOrchestrationRepository } from "../src/lib/activation-orchestration/server.ts";
import { getTenantRegistryService } from "../src/lib/tenant-registry/server.ts";
import { provisionTenant } from "./lib/tenant-provisioning.mjs";

function requireStagingAcceptanceEnvironment() {
  if (
    process.env.SHOPNEST_STAGING_ACCEPTANCE !== "true" ||
    process.env.DB_HOST !== "db-staging"
  ) {
    throw new Error(
      "STAGING acceptance provisioning is disabled outside the explicit db-staging environment"
    );
  }
}

const merchantId = Number(process.argv[2]);
const storeId = Number(process.argv[3]);

if (
  !Number.isInteger(merchantId) ||
  merchantId <= 0 ||
  !Number.isInteger(storeId) ||
  storeId <= 0
) {
  console.error(
    "Usage: npm run staging-acceptance:provision-store -- <merchant-id> <store-id>"
  );
  process.exit(2);
}

requireStagingAcceptanceEnvironment();

const lifecycleRepository = getStoreLifecycleRepository();
const activationRepository = getActivationOrchestrationRepository();
const registryCache = getTenantRegistryService();
const now = new Date();

let current = await lifecycleRepository.findForOwnedStore(
  merchantId,
  storeId
);

if (!current) {
  throw new Error("Owned Store not found");
}

if (current.status === "provisioned" && current.tenantId !== null) {
  console.log("kind: already_provisioned");
  console.log("store_id:", current.storeId);
  console.log("tenant_id:", current.tenantId);
  process.exit(0);
}

try {
  if (
    current.status === "draft" ||
    current.status === "provisioning_failed"
  ) {
    const refreshed =
      await lifecycleRepository.syncReadinessForOwnedStore(
        merchantId,
        storeId,
        true,
        now
      );

    if (!refreshed) throw new Error("Owned Store disappeared");
    current = refreshed;
  }

  if (current.status === "ready_for_provisioning") {
    const requested =
      await lifecycleRepository.requestActivationForOwnedStore(
        merchantId,
        storeId,
        now
      );

    if (!requested) throw new Error("Owned Store disappeared");
    current = requested;
  }

  if (current.status === "activation_requested") {
    current = await lifecycleRepository.startProvisioning(
      storeId,
      now
    );
  }

  if (current.status !== "provisioning") {
    throw new Error(
      `Unexpected Store lifecycle state for STAGING acceptance: ${current.status}`
    );
  }

  const context =
    await activationRepository.loadProvisioningContext(storeId);

  if (context.plan !== "medium" && context.plan !== "large") {
    throw new Error(
      "STAGING custom-domain acceptance requires Medium or Large plan"
    );
  }

  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );

  await provisionTenant({
    tenant: {
      slug: context.slug,
      schema: context.schemaName,
      basePath: `/${context.slug}`,
    },
    databaseUrl: resolveDatabaseUrl(),
    migrationsFolder: path.join(
      repositoryRoot,
      "src",
      "drizzle",
      "migrations"
    ),
  });

  const finalized =
    await activationRepository.finalizeProvisioning(context, now);

  registryCache.clear(finalized.slug);

  console.log("kind: provisioned");
  console.log("store_id:", finalized.storeId);
  console.log("tenant_id:", finalized.tenantId);
  console.log("slug:", finalized.slug);
  console.log("schema_name:", finalized.schemaName);
  console.log("plan:", context.plan);
} catch (error) {
  const latest =
    await lifecycleRepository.findForOwnedStore(
      merchantId,
      storeId
    );

  if (latest?.status === "provisioning") {
    await lifecycleRepository.markProvisioningFailed(
      storeId,
      "STAGING_ACCEPTANCE_FAILED",
      new Date()
    );
  }

  throw error;
}

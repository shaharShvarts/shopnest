import "server-only";

import path from "node:path";
import { env } from "@/data/env/server";
import {
  getStoreLifecycleRepository,
  getStoreLifecycleService,
} from "@/lib/store-lifecycle/server";
import { getStoreReadinessRepository } from "@/lib/store-readiness/server";
import { getTenantRegistryService } from "@/lib/tenant-registry/server";
import { provisionTenant } from "../../../scripts/lib/tenant-provisioning.mjs";
import { DrizzleActivationOrchestrationRepository } from "./drizzle-repository";
import { ActivationOrchestrationService } from "./service";

const repository = new DrizzleActivationOrchestrationRepository();

const service = new ActivationOrchestrationService(
  getStoreLifecycleService(),
  getStoreLifecycleRepository(),
  getStoreReadinessRepository(),
  repository,
  {
    async provision(context) {
      await provisionTenant({
        tenant: {
          slug: context.slug,
          schema: context.schemaName,
          basePath: `/${context.slug}`,
        },
        databaseUrl: env.DATABASE_URL,
        migrationsFolder: path.join(
          process.cwd(),
          "src",
          "drizzle",
          "migrations"
        ),
      });
    },
  },
  getTenantRegistryService()
);

export function getActivationOrchestrationRepository() {
  return repository;
}

export function getActivationOrchestrationService() {
  return service;
}

import "server-only";

import { getCloudflareDomainSyncService } from "@/lib/cloudflare-saas/domain-sync-server";
import { getDomainRegistryService } from "@/lib/domain-registry/server";
import { CustomDomainLifecycleService } from "./core";
import { DrizzleCustomDomainLifecycleRepository } from "./drizzle-repository";

let cached: CustomDomainLifecycleService | null = null;

export function getCustomDomainLifecycleService() {
  if (cached) return cached;

  cached = new CustomDomainLifecycleService(
    new DrizzleCustomDomainLifecycleRepository(),
    getCloudflareDomainSyncService(),
    () => getDomainRegistryService().clear()
  );

  return cached;
}

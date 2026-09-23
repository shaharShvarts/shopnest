import "server-only";

import { CloudflareSaasError } from "@/lib/cloudflare-saas/client";
import { CloudflareSaasDisabledError } from "@/lib/cloudflare-saas/core";
import { getCloudflareDomainRemovalService } from "@/lib/cloudflare-saas/domain-removal-server";
import { getCloudflareDomainSyncService } from "@/lib/cloudflare-saas/domain-sync-server";
import { getDomainRegistryService } from "@/lib/domain-registry/server";
import { CustomDomainLifecycleService } from "./core";
import { DrizzleCustomDomainLifecycleRepository } from "./drizzle-repository";

const repository = new DrizzleCustomDomainLifecycleRepository();
let cached: CustomDomainLifecycleService | null = null;

export function getCustomDomainLifecycleService() {
  if (cached) return cached;

  cached = new CustomDomainLifecycleService(
    repository,
    getCloudflareDomainSyncService(),
    () => getDomainRegistryService().clear(),
    getCloudflareDomainRemovalService()
  );

  return cached;
}

export async function getCustomDomainAdminSummary(
  tenantSlug: string,
  now = new Date()
) {
  try {
    await getCustomDomainLifecycleService()
      .cleanupExpiredRetiringForTenantSlug(tenantSlug, now);
  } catch (error) {
    if (!(error instanceof CloudflareSaasError || error instanceof CloudflareSaasDisabledError)) {
      throw error;
    }
  }

  return repository.findAdminSummary(tenantSlug);
}

export function rollbackRetiringDomainForAdmin(
  tenantSlug: string,
  restoreHostname: string,
  now = new Date()
) {
  return getCustomDomainLifecycleService()
    .rollbackRetiringDomainForAdmin(
      tenantSlug,
      restoreHostname,
      now
    );
}

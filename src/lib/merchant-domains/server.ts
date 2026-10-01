import "server-only";

import { CloudflareSaasError } from "@/lib/cloudflare-saas/client";
import { CloudflareSaasDisabledError } from "@/lib/cloudflare-saas/core";
import { getCustomDomainLifecycleService } from "@/lib/custom-domain-lifecycle/server";
import {
  merchantDomainViewFromRecord,
  type MerchantDomainView,
} from "./core";
import { DrizzleMerchantDomainRepository } from "./drizzle-repository";

const repository = new DrizzleMerchantDomainRepository();

export async function getMerchantDomainView(
  merchantId: number,
  storeId: number,
  now = new Date()
): Promise<MerchantDomainView | null> {
  try {
    await getCustomDomainLifecycleService()
      .cleanupExpiredRetiringForOwnedStore(merchantId, storeId, now);
  } catch (error) {
    if (!(error instanceof CloudflareSaasError || error instanceof CloudflareSaasDisabledError)) {
      throw error;
    }
  }

  const record = await repository.findForOwnedStore(
    merchantId,
    storeId
  );
  const platformOrigin =
    process.env.SHOPNEST_PLATFORM_ORIGIN?.trim() || "https://shopnest.co.il";

  return record
    ? merchantDomainViewFromRecord(record, now, platformOrigin)
    : null;
}

export function getMerchantDomainRepository() {
  return repository;
}

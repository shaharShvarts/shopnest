import "server-only";

import { CloudflareSaasError } from "@/lib/cloudflare-saas/client";
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
    if (!(error instanceof CloudflareSaasError)) throw error;
  }

  const record = await repository.findForOwnedStore(
    merchantId,
    storeId
  );
  return record ? merchantDomainViewFromRecord(record, now) : null;
}

export function getMerchantDomainRepository() {
  return repository;
}

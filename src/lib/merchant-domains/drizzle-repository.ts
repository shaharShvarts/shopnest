import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
} from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  organizationMemberships,
  storeDomainClaims,
  storeDomains,
  stores,
} from "@/drizzle/control-plane-schema";
import type {
  MerchantDomainRecord,
  MerchantDomainRepository,
} from "./core";

export class DrizzleMerchantDomainRepository
  implements MerchantDomainRepository
{
  async findForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<MerchantDomainRecord | null> {
    const db = getControlPlaneDb();

    const [store] = await db
      .select({
        storeId: stores.id,
        storeSlug: stores.slug,
        tenantId: stores.tenantId,
      })
      .from(stores)
      .innerJoin(
        organizationMemberships,
        eq(
          organizationMemberships.organizationId,
          stores.organizationId
        )
      )
      .where(
        and(
          eq(stores.id, storeId),
          isNull(stores.deletedAt),
          eq(
            organizationMemberships.merchantAccountId,
            merchantId
          ),
          eq(organizationMemberships.role, "owner")
        )
      )
      .limit(1);

    if (!store) return null;

    const [claimRows, domainRows] = await Promise.all([
      db
        .select({
          hostname: storeDomainClaims.hostname,
          status: storeDomainClaims.status,
          expiresAt: storeDomainClaims.expiresAt,
          verifiedAt: storeDomainClaims.verifiedAt,
          cnameVerifiedAt: storeDomainClaims.cnameVerifiedAt,
          lastTxtCheckAt: storeDomainClaims.lastTxtCheckAt,
          lastCnameCheckAt: storeDomainClaims.lastCnameCheckAt,
          createdAt: storeDomainClaims.createdAt,
        })
        .from(storeDomainClaims)
        .where(
          and(
            eq(storeDomainClaims.storeId, store.storeId),
            inArray(storeDomainClaims.status, [
              "pending_verification",
              "verified",
            ])
          )
        )
        .orderBy(desc(storeDomainClaims.createdAt))
        .limit(1),
      store.tenantId === null
        ? Promise.resolve([])
        : db
            .select({
              id: storeDomains.id,
              hostname: storeDomains.hostname,
              lifecycleRole: storeDomains.lifecycleRole,
              providerHostnameStatus:
                storeDomains.providerHostnameStatus,
              providerSslStatus: storeDomains.providerSslStatus,
              lastManualCheckAt: storeDomains.lastManualCheckAt,
              retireAt: storeDomains.retireAt,
              redirectToDomainId: storeDomains.redirectToDomainId,
            })
            .from(storeDomains)
            .where(
              and(
                eq(storeDomains.tenantId, store.tenantId),
                ne(storeDomains.status, "removed")
              )
            ),
    ]);

    const primary = domainRows.find(
      (domain) => domain.lifecycleRole === "primary"
    );
    const candidate = domainRows.find(
      (domain) => domain.lifecycleRole === "candidate"
    );
    const retiring = domainRows.find(
      (domain) => domain.lifecycleRole === "retiring"
    );
    const claim = claimRows[0];

    return {
      storeId: store.storeId,
      storeSlug: store.storeSlug,
      tenantId: store.tenantId,
      currentPrimary: primary
        ? {
            id: primary.id,
            hostname: primary.hostname,
          }
        : null,
      retiring:
        retiring?.retireAt && retiring.redirectToDomainId
          ? {
              id: retiring.id,
              hostname: retiring.hostname,
              redirectToDomainId: retiring.redirectToDomainId,
              retireAt: retiring.retireAt,
            }
          : null,
      candidate: candidate
        ? {
            id: candidate.id,
            hostname: candidate.hostname,
            providerHostnameStatus:
              candidate.providerHostnameStatus,
            providerSslStatus: candidate.providerSslStatus,
            lastManualCheckAt: candidate.lastManualCheckAt,
          }
        : null,
      claim:
        claim &&
        (claim.status === "pending_verification" ||
          claim.status === "verified")
          ? {
              hostname: claim.hostname,
              status: claim.status,
              expiresAt: claim.expiresAt,
              verifiedAt: claim.verifiedAt,
              cnameVerifiedAt: claim.cnameVerifiedAt,
              lastTxtCheckAt: claim.lastTxtCheckAt,
              lastCnameCheckAt: claim.lastCnameCheckAt,
            }
          : null,
    };
  }
}

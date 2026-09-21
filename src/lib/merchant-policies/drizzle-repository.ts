import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  organizationMemberships,
  organizations,
  storePolicyDocuments,
  stores,
} from "@/drizzle/control-plane-schema";
import {
  MerchantPolicyError,
  isStorePolicyType,
  requiredPolicyTypesForMarket,
  type MerchantPolicyDocument,
  type MerchantPolicyRepository,
  type MerchantPolicyWorkspace,
  type PolicyDocumentInput,
  type StorePolicyStatus,
} from "./core";

const policySelection = {
  id: storePolicyDocuments.id,
  organizationId: storePolicyDocuments.organizationId,
  storeId: storePolicyDocuments.storeId,
  market: storePolicyDocuments.market,
  policyType: storePolicyDocuments.policyType,
  version: storePolicyDocuments.version,
  title: storePolicyDocuments.title,
  content: storePolicyDocuments.content,
  status: storePolicyDocuments.status,
  publishedAt: storePolicyDocuments.publishedAt,
  createdAt: storePolicyDocuments.createdAt,
  updatedAt: storePolicyDocuments.updatedAt,
};

function mapPolicy(
  row: typeof storePolicyDocuments.$inferSelect
): MerchantPolicyDocument {
  if (!isStorePolicyType(row.policyType)) {
    throw new MerchantPolicyError(
      "POLICY_TYPE_UNSUPPORTED",
      "Stored policy type is unsupported"
    );
  }

  if (row.status !== "draft" && row.status !== "published") {
    throw new MerchantPolicyError(
      "POLICY_INVALID",
      "Stored policy status is invalid"
    );
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    market: row.market,
    policyType: row.policyType,
    version: row.version,
    title: row.title,
    content: row.content,
    status: row.status as StorePolicyStatus,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOwnedStoreContext(
  db: ReturnType<typeof getControlPlaneDb>,
  merchantId: number,
  storeId: number
) {
  const [row] = await db
    .select({
      storeId: stores.id,
      organizationId: stores.organizationId,
      market: organizations.country,
    })
    .from(stores)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, stores.organizationId),
        eq(organizationMemberships.merchantAccountId, merchantId),
        eq(organizationMemberships.role, "owner")
      )
    )
    .innerJoin(organizations, eq(organizations.id, stores.organizationId))
    .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
    .orderBy(
      asc(organizationMemberships.createdAt),
      asc(organizationMemberships.organizationId)
    )
    .limit(1);

  return row ?? null;
}

export class DrizzleMerchantPolicyRepository
  implements MerchantPolicyRepository
{
  async getWorkspaceForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<MerchantPolicyWorkspace | null> {
    const db = getControlPlaneDb();
    const context = await findOwnedStoreContext(db, merchantId, storeId);
    if (!context) return null;

    const rows = await db
      .select(policySelection)
      .from(storePolicyDocuments)
      .where(
        and(
          eq(storePolicyDocuments.storeId, storeId),
          eq(storePolicyDocuments.organizationId, context.organizationId),
          eq(storePolicyDocuments.market, context.market)
        )
      )
      .orderBy(
        asc(storePolicyDocuments.policyType),
        desc(storePolicyDocuments.version)
      );

    const latestByType = new Map<string, MerchantPolicyDocument>();
    for (const row of rows) {
      if (latestByType.has(row.policyType)) continue;
      const policy = mapPolicy(
        row as typeof storePolicyDocuments.$inferSelect
      );
      latestByType.set(policy.policyType, policy);
    }

    return {
      storeId,
      organizationId: context.organizationId,
      market: context.market,
      requiredPolicyTypes: requiredPolicyTypesForMarket(context.market),
      documents: [...latestByType.values()],
    };
  }

  async saveDraftForOwnedStore(
    merchantId: number,
    storeId: number,
    input: PolicyDocumentInput,
    now = new Date()
  ): Promise<MerchantPolicyDocument> {
    return this.writePolicy(merchantId, storeId, input, false, now);
  }

  async publishForOwnedStore(
    merchantId: number,
    storeId: number,
    input: PolicyDocumentInput,
    now = new Date()
  ): Promise<MerchantPolicyDocument> {
    return this.writePolicy(merchantId, storeId, input, true, now);
  }

  private async writePolicy(
    merchantId: number,
    storeId: number,
    input: PolicyDocumentInput,
    publish: boolean,
    now: Date
  ): Promise<MerchantPolicyDocument> {
    return getControlPlaneDb().transaction(async (tx) => {
      const context = await findOwnedStoreContext(
        tx as ReturnType<typeof getControlPlaneDb>,
        merchantId,
        storeId
      );

      if (!context) {
        throw new MerchantPolicyError(
          "STORE_NOT_FOUND",
          "Owned Store not found"
        );
      }

      const [latest] = await tx
        .select(policySelection)
        .from(storePolicyDocuments)
        .where(
          and(
            eq(storePolicyDocuments.storeId, storeId),
            eq(
              storePolicyDocuments.organizationId,
              context.organizationId
            ),
            eq(storePolicyDocuments.market, context.market),
            eq(storePolicyDocuments.policyType, input.policyType)
          )
        )
        .orderBy(desc(storePolicyDocuments.version))
        .limit(1);

      const status: StorePolicyStatus = publish ? "published" : "draft";
      const publishedAt = publish ? now : null;

      if (latest?.status === "draft") {
        const [updated] = await tx
          .update(storePolicyDocuments)
          .set({
            title: input.title,
            content: input.content,
            status,
            publishedAt,
            updatedAt: now,
          })
          .where(eq(storePolicyDocuments.id, latest.id))
          .returning();

        return mapPolicy(updated);
      }

      const [created] = await tx
        .insert(storePolicyDocuments)
        .values({
          organizationId: context.organizationId,
          storeId,
          market: context.market,
          policyType: input.policyType,
          version: (latest?.version ?? 0) + 1,
          title: input.title,
          content: input.content,
          status,
          publishedAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return mapPolicy(created);
    });
  }
}

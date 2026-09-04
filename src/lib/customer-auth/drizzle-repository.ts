import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { controlPlaneDb } from "@/drizzle/db";
import {
  customerAccounts,
  customerAuthIdentities,
  customerOAuthTransactions,
  customerPasswordResetTokens,
  customerSessions,
  customerTenants,
} from "@/drizzle/control-plane-schema";
import type {
  CustomerAuthRepository,
  CustomerRecord,
  StoredCustomerSession,
} from "./core";
import type {
  GoogleOAuthRepository,
  StoredGoogleOAuthTransaction,
} from "./google-oauth";

const customerSelection = {
  id: customerAccounts.id,
  email: customerAccounts.email,
  emailNormalized: customerAccounts.emailNormalized,
  passwordHash: customerAccounts.passwordHash,
  displayName: customerAccounts.displayName,
  status: customerAccounts.status,
};

export class DrizzleCustomerAuthRepository
  implements CustomerAuthRepository, GoogleOAuthRepository
{
  async findCustomerByNormalizedEmail(email: string) {
    const [customer] = await controlPlaneDb
      .select(customerSelection)
      .from(customerAccounts)
      .where(eq(customerAccounts.emailNormalized, email))
      .limit(1);
    return customer ?? null;
  }

  createCustomerWithPassword(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
  }): Promise<CustomerRecord> {
    return controlPlaneDb.transaction(async (tx) => {
      const [customer] = await tx
        .insert(customerAccounts)
        .values(input)
        .returning(customerSelection);
      await tx.insert(customerAuthIdentities).values({
        customerId: customer.id,
        provider: "password",
        providerAccountId: input.emailNormalized,
        providerEmail: input.emailNormalized,
      });
      return customer;
    });
  }

  async createSession(input: {
    tokenHash: string;
    customerId: number;
    expiresAt: Date;
  }) {
    await controlPlaneDb.insert(customerSessions).values(input);
  }

  async findSessionByTokenHash(
    tokenHash: string
  ): Promise<StoredCustomerSession | null> {
    const [row] = await controlPlaneDb
      .select({
        tokenHash: customerSessions.tokenHash,
        expiresAt: customerSessions.expiresAt,
        id: customerAccounts.id,
        email: customerAccounts.email,
        displayName: customerAccounts.displayName,
        status: customerAccounts.status,
      })
      .from(customerSessions)
      .innerJoin(
        customerAccounts,
        eq(customerSessions.customerId, customerAccounts.id)
      )
      .where(eq(customerSessions.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;
    return {
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      customer: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        status: row.status,
      },
    };
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    await controlPlaneDb
      .delete(customerSessions)
      .where(eq(customerSessions.tokenHash, tokenHash));
  }

  async createGoogleOAuthTransaction(input: {
    stateHash: string;
    browserBindingHash: string;
    tenantSlug: string;
    callbackPath: string;
    nonceHash: string;
    codeVerifier: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    await controlPlaneDb.transaction(async (tx) => {
      await tx
        .delete(customerOAuthTransactions)
        .where(lt(customerOAuthTransactions.expiresAt, input.createdAt));
      await tx.insert(customerOAuthTransactions).values(input);
    });
  }

  async consumeGoogleOAuthTransaction(input: {
    stateHash: string;
    browserBindingHash: string;
    tenantSlug: string;
    now: Date;
  }): Promise<StoredGoogleOAuthTransaction | null> {
    const [transaction] = await controlPlaneDb
      .delete(customerOAuthTransactions)
      .where(
        and(
          eq(customerOAuthTransactions.stateHash, input.stateHash),
          eq(
            customerOAuthTransactions.browserBindingHash,
            input.browserBindingHash
          ),
          eq(customerOAuthTransactions.tenantSlug, input.tenantSlug),
          gt(customerOAuthTransactions.expiresAt, input.now)
        )
      )
      .returning({
        tenantSlug: customerOAuthTransactions.tenantSlug,
        callbackPath: customerOAuthTransactions.callbackPath,
        nonceHash: customerOAuthTransactions.nonceHash,
        codeVerifier: customerOAuthTransactions.codeVerifier,
        expiresAt: customerOAuthTransactions.expiresAt,
      });
    return transaction ?? null;
  }

  resolveGoogleCustomer(input: {
    subject: string;
    email: string;
    emailNormalized: string;
    displayName: string | null;
    verifiedAt: Date;
  }): Promise<CustomerRecord> {
    return controlPlaneDb.transaction(async (tx) => {
      const lockKeys = [
        `customer-email:${input.emailNormalized}`,
        `google-sub:${input.subject}`,
      ].sort();
      for (const key of lockKeys) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`
        );
      }

      const existingIdentity = await findGoogleIdentity(tx, input.subject);
      if (existingIdentity) {
        if (existingIdentity.status !== "active") {
          throw new Error("google_account_unavailable");
        }
        await tx
          .update(customerAuthIdentities)
          .set({ providerEmail: input.emailNormalized, updatedAt: input.verifiedAt })
          .where(eq(customerAuthIdentities.id, existingIdentity.identityId));
        return existingIdentity.customer;
      }

      let [customer] = await tx
        .select({
          ...customerSelection,
          emailVerifiedAt: customerAccounts.emailVerifiedAt,
        })
        .from(customerAccounts)
        .where(eq(customerAccounts.emailNormalized, input.emailNormalized))
        .limit(1)
        .for("update");

      if (!customer) {
        [customer] = await tx
          .insert(customerAccounts)
          .values({
            email: input.email,
            emailNormalized: input.emailNormalized,
            displayName: input.displayName,
            emailVerifiedAt: input.verifiedAt,
          })
          .onConflictDoNothing({ target: customerAccounts.emailNormalized })
          .returning({
            ...customerSelection,
            emailVerifiedAt: customerAccounts.emailVerifiedAt,
          });
      }

      if (!customer) {
        [customer] = await tx
          .select({
            ...customerSelection,
            emailVerifiedAt: customerAccounts.emailVerifiedAt,
          })
          .from(customerAccounts)
          .where(eq(customerAccounts.emailNormalized, input.emailNormalized))
          .limit(1)
          .for("update");
      }
      if (!customer || customer.status !== "active") {
        throw new Error("google_account_unavailable");
      }

      await tx
        .insert(customerAuthIdentities)
        .values({
          customerId: customer.id,
          provider: "google",
          providerAccountId: input.subject,
          providerEmail: input.emailNormalized,
        })
        .onConflictDoNothing({
          target: [
            customerAuthIdentities.provider,
            customerAuthIdentities.providerAccountId,
          ],
        });

      const linkedIdentity = await findGoogleIdentity(tx, input.subject);
      if (!linkedIdentity || linkedIdentity.customer.id !== customer.id) {
        throw new Error("google_identity_conflict");
      }
      if (!customer.emailVerifiedAt) {
        await tx
          .update(customerAccounts)
          .set({ emailVerifiedAt: input.verifiedAt, updatedAt: input.verifiedAt })
          .where(eq(customerAccounts.id, customer.id));
      }
      return linkedIdentity.customer;
    });
  }

  issuePasswordResetToken(input: {
    emailNormalized: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
  }) {
    return controlPlaneDb.transaction(async (tx) => {
      const [customer] = await tx
        .select(customerSelection)
        .from(customerAccounts)
        .where(eq(customerAccounts.emailNormalized, input.emailNormalized))
        .limit(1)
        .for("update");
      if (
        !customer ||
        customer.status !== "active" ||
        !customer.passwordHash
      ) {
        return null;
      }

      const [latestActive] = await tx
        .select({ createdAt: customerPasswordResetTokens.createdAt })
        .from(customerPasswordResetTokens)
        .where(
          and(
            eq(customerPasswordResetTokens.customerId, customer.id),
            isNull(customerPasswordResetTokens.usedAt)
          )
        )
        .orderBy(desc(customerPasswordResetTokens.createdAt))
        .limit(1);
      if (
        latestActive &&
        input.now.getTime() - latestActive.createdAt.getTime() <
          input.cooldownMs
      ) {
        return null;
      }

      await tx
        .update(customerPasswordResetTokens)
        .set({ usedAt: input.now })
        .where(
          and(
            eq(customerPasswordResetTokens.customerId, customer.id),
            isNull(customerPasswordResetTokens.usedAt)
          )
        );
      await tx.insert(customerPasswordResetTokens).values({
        customerId: customer.id,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      });
      return { customerId: customer.id, email: customer.email };
    });
  }

  consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }) {
    return controlPlaneDb.transaction(async (tx) => {
      const [tokenOwner] = await tx
        .select({ customerId: customerPasswordResetTokens.customerId })
        .from(customerPasswordResetTokens)
        .where(eq(customerPasswordResetTokens.tokenHash, input.tokenHash))
        .limit(1);
      if (!tokenOwner) return false;

      const [customer] = await tx
        .select({
          id: customerAccounts.id,
          status: customerAccounts.status,
          passwordHash: customerAccounts.passwordHash,
        })
        .from(customerAccounts)
        .where(eq(customerAccounts.id, tokenOwner.customerId))
        .limit(1)
        .for("update");
      if (
        !customer ||
        customer.status !== "active" ||
        !customer.passwordHash
      ) {
        return false;
      }

      const [resetToken] = await tx
        .select({
          customerId: customerPasswordResetTokens.customerId,
          expiresAt: customerPasswordResetTokens.expiresAt,
          usedAt: customerPasswordResetTokens.usedAt,
        })
        .from(customerPasswordResetTokens)
        .where(
          and(
            eq(customerPasswordResetTokens.tokenHash, input.tokenHash),
            eq(customerPasswordResetTokens.customerId, customer.id)
          )
        )
        .limit(1)
        .for("update");
      if (
        !resetToken ||
        resetToken.usedAt ||
        resetToken.expiresAt.getTime() <= input.now.getTime()
      ) {
        return false;
      }

      await tx
        .update(customerAccounts)
        .set({ passwordHash: input.passwordHash, updatedAt: input.now })
        .where(eq(customerAccounts.id, customer.id));
      await tx
        .delete(customerSessions)
        .where(eq(customerSessions.customerId, customer.id));
      await tx
        .update(customerPasswordResetTokens)
        .set({ usedAt: input.now })
        .where(
          and(
            eq(customerPasswordResetTokens.customerId, customer.id),
            isNull(customerPasswordResetTokens.usedAt)
          )
        );
      return true;
    });
  }

  async upsertTenantMembership(input: {
    customerId: number;
    tenantSlug: string;
    seenAt: Date;
  }) {
    await controlPlaneDb
      .insert(customerTenants)
      .values({
        customerId: input.customerId,
        tenantSlug: input.tenantSlug,
        firstSeenAt: input.seenAt,
        lastSeenAt: input.seenAt,
      })
      .onConflictDoUpdate({
        target: [customerTenants.customerId, customerTenants.tenantSlug],
        set: { lastSeenAt: input.seenAt },
      });
  }

  async hasTenantMembership(customerId: number, tenantSlug: string) {
    const [membership] = await controlPlaneDb
      .select({ customerId: customerTenants.customerId })
      .from(customerTenants)
      .where(
        and(
          eq(customerTenants.customerId, customerId),
          eq(customerTenants.tenantSlug, tenantSlug)
        )
      )
      .limit(1);
    return Boolean(membership);
  }
}

type CustomerAuthTransaction = Parameters<
  Parameters<typeof controlPlaneDb.transaction>[0]
>[0];

async function findGoogleIdentity(
  tx: CustomerAuthTransaction,
  subject: string
) {
  const [row] = await tx
    .select({
      identityId: customerAuthIdentities.id,
      ...customerSelection,
    })
    .from(customerAuthIdentities)
    .innerJoin(
      customerAccounts,
      eq(customerAuthIdentities.customerId, customerAccounts.id)
    )
    .where(
      and(
        eq(customerAuthIdentities.provider, "google"),
        eq(customerAuthIdentities.providerAccountId, subject)
      )
    )
    .limit(1);
  if (!row) return null;
  return {
    identityId: row.identityId,
    status: row.status,
    customer: {
      id: row.id,
      email: row.email,
      emailNormalized: row.emailNormalized,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      status: row.status,
    },
  };
}

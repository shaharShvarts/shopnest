import { and, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  merchantAccounts,
  merchantPasswordResetTokens,
  merchantSessions,
} from "@/drizzle/control-plane-schema";
import type {
  MerchantAuthRepository,
  MerchantRecord,
  StoredMerchantSession,
} from "./core";

const merchantSelection = {
  id: merchantAccounts.id,
  email: merchantAccounts.email,
  emailNormalized: merchantAccounts.emailNormalized,
  passwordHash: merchantAccounts.passwordHash,
  displayName: merchantAccounts.displayName,
  phoneE164: merchantAccounts.phoneE164,
  emailVerifiedAt: merchantAccounts.emailVerifiedAt,
  status: merchantAccounts.status,
};

export class DrizzleMerchantAuthRepository implements MerchantAuthRepository {
  async findMerchantByNormalizedEmail(email: string) {
    const [merchant] = await getControlPlaneDb()
      .select(merchantSelection)
      .from(merchantAccounts)
      .where(eq(merchantAccounts.emailNormalized, email))
      .limit(1);
    return merchant ?? null;
  }

  async createMerchantWithPassword(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
    phoneE164: string;
  }): Promise<MerchantRecord> {
    const [merchant] = await getControlPlaneDb()
      .insert(merchantAccounts)
      .values(input)
      .returning(merchantSelection);
    return merchant;
  }

  async createSession(input: {
    tokenHash: string;
    merchantId: number;
    expiresAt: Date;
  }) {
    await getControlPlaneDb().insert(merchantSessions).values(input);
  }

  async findSessionByTokenHash(
    tokenHash: string
  ): Promise<StoredMerchantSession | null> {
    const [row] = await getControlPlaneDb()
      .select({
        tokenHash: merchantSessions.tokenHash,
        expiresAt: merchantSessions.expiresAt,
        id: merchantAccounts.id,
        email: merchantAccounts.email,
        displayName: merchantAccounts.displayName,
        phoneE164: merchantAccounts.phoneE164,
        status: merchantAccounts.status,
      })
      .from(merchantSessions)
      .innerJoin(
        merchantAccounts,
        eq(merchantSessions.merchantId, merchantAccounts.id)
      )
      .where(eq(merchantSessions.tokenHash, tokenHash))
      .limit(1);

    if (!row) return null;
    return {
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      merchant: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        phoneE164: row.phoneE164,
        status: row.status,
      },
    };
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    await getControlPlaneDb()
      .delete(merchantSessions)
      .where(eq(merchantSessions.tokenHash, tokenHash));
  }

  async deleteSessionsForMerchant(merchantId: number) {
    await getControlPlaneDb()
      .delete(merchantSessions)
      .where(eq(merchantSessions.merchantId, merchantId));
  }

  issuePasswordResetToken(input: {
    emailNormalized: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    return getControlPlaneDb().transaction(async (tx) => {
      const [merchant] = await tx
        .select(merchantSelection)
        .from(merchantAccounts)
        .where(eq(merchantAccounts.emailNormalized, input.emailNormalized))
        .limit(1)
        .for("update");
      if (!merchant || merchant.status !== "active") return null;

      await tx
        .update(merchantPasswordResetTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(merchantPasswordResetTokens.merchantId, merchant.id),
            isNull(merchantPasswordResetTokens.consumedAt)
          )
        );

      await tx.insert(merchantPasswordResetTokens).values({
        merchantId: merchant.id,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      });

      return { merchantId: merchant.id, email: merchant.email };
    });
  }

  consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }) {
    return getControlPlaneDb().transaction(async (tx) => {
      const [resetToken] = await tx
        .select({
          merchantId: merchantPasswordResetTokens.merchantId,
          expiresAt: merchantPasswordResetTokens.expiresAt,
          consumedAt: merchantPasswordResetTokens.consumedAt,
        })
        .from(merchantPasswordResetTokens)
        .where(eq(merchantPasswordResetTokens.tokenHash, input.tokenHash))
        .limit(1)
        .for("update");

      if (
        !resetToken ||
        resetToken.consumedAt ||
        resetToken.expiresAt.getTime() <= input.now.getTime()
      ) {
        return false;
      }

      const [merchant] = await tx
        .select({ id: merchantAccounts.id, status: merchantAccounts.status })
        .from(merchantAccounts)
        .where(eq(merchantAccounts.id, resetToken.merchantId))
        .limit(1)
        .for("update");

      if (!merchant || merchant.status !== "active") return false;

      await tx
        .update(merchantAccounts)
        .set({ passwordHash: input.passwordHash, updatedAt: input.now })
        .where(eq(merchantAccounts.id, merchant.id));

      await tx
        .delete(merchantSessions)
        .where(eq(merchantSessions.merchantId, merchant.id));

      await tx
        .update(merchantPasswordResetTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(merchantPasswordResetTokens.merchantId, merchant.id),
            isNull(merchantPasswordResetTokens.consumedAt)
          )
        );

      return true;
    });
  }
}

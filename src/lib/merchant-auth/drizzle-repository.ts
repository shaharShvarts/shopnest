import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  merchantAccounts,
  merchantPasswordResetTokens,
  merchantSessions,
  merchantSignupTokens,
} from "@/drizzle/control-plane-schema";
import type {
  MerchantAuthRepository,
  MerchantRecord,
  MerchantSignupIssueResult,
  MerchantSignupTokenState,
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

  async createPendingMerchant(input: {
    email: string;
    emailNormalized: string;
    displayName: string;
    phoneE164: string;
  }): Promise<MerchantRecord> {
    const [merchant] = await getControlPlaneDb()
      .insert(merchantAccounts)
      .values({
        ...input,
        passwordHash: null,
        emailVerifiedAt: null,
        status: "pending_verification",
      })
      .returning(merchantSelection);
    return merchant;
  }

  issueSignupToken(input: {
    merchantId: number;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
    maxPerHour: number;
  }): Promise<MerchantSignupIssueResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [merchant] = await tx
        .select({
          id: merchantAccounts.id,
          status: merchantAccounts.status,
          emailVerifiedAt: merchantAccounts.emailVerifiedAt,
        })
        .from(merchantAccounts)
        .where(eq(merchantAccounts.id, input.merchantId))
        .limit(1)
        .for("update");

      if (
        !merchant ||
        merchant.status !== "pending_verification" ||
        merchant.emailVerifiedAt
      ) {
        return { kind: "unavailable" };
      }

      const [latest] = await tx
        .select({ createdAt: merchantSignupTokens.createdAt })
        .from(merchantSignupTokens)
        .where(eq(merchantSignupTokens.merchantId, merchant.id))
        .orderBy(desc(merchantSignupTokens.createdAt))
        .limit(1);

      if (
        latest &&
        latest.createdAt.getTime() + input.cooldownMs > input.now.getTime()
      ) {
        return {
          kind: "cooldown",
          nextAllowedAt: new Date(
            latest.createdAt.getTime() + input.cooldownMs
          ),
        };
      }

      const recent = await tx
        .select({ id: merchantSignupTokens.id })
        .from(merchantSignupTokens)
        .where(
          and(
            eq(merchantSignupTokens.merchantId, merchant.id),
            gte(
              merchantSignupTokens.createdAt,
              new Date(input.now.getTime() - 60 * 60 * 1000)
            )
          )
        );

      if (recent.length >= input.maxPerHour) {
        return { kind: "rate_limited" };
      }

      await tx
        .update(merchantSignupTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(merchantSignupTokens.merchantId, merchant.id),
            isNull(merchantSignupTokens.consumedAt)
          )
        );

      await tx.insert(merchantSignupTokens).values({
        merchantId: merchant.id,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: input.now,
      });

      return { kind: "issued" };
    });
  }

  async inspectSignupToken(input: {
    tokenHash: string;
    now: Date;
  }): Promise<MerchantSignupTokenState> {
    const [row] = await getControlPlaneDb()
      .select({
        merchantId: merchantSignupTokens.merchantId,
        expiresAt: merchantSignupTokens.expiresAt,
        consumedAt: merchantSignupTokens.consumedAt,
        email: merchantAccounts.email,
        emailVerifiedAt: merchantAccounts.emailVerifiedAt,
        status: merchantAccounts.status,
      })
      .from(merchantSignupTokens)
      .innerJoin(
        merchantAccounts,
        eq(merchantSignupTokens.merchantId, merchantAccounts.id)
      )
      .where(eq(merchantSignupTokens.tokenHash, input.tokenHash))
      .limit(1);

    if (!row || row.status === "disabled") return { kind: "invalid" };

    if (row.status === "active" && row.emailVerifiedAt) {
      return {
        kind: "completed",
        merchantId: row.merchantId,
        email: row.email,
      };
    }

    if (row.status !== "pending_verification") {
      return { kind: "invalid" };
    }

    if (row.consumedAt || row.expiresAt.getTime() <= input.now.getTime()) {
      return {
        kind: "expired",
        merchantId: row.merchantId,
        email: row.email,
      };
    }

    return {
      kind: "pending",
      merchantId: row.merchantId,
      email: row.email,
      expiresAt: row.expiresAt,
    };
  }

  async deleteSignupTokenByHash(tokenHash: string) {
    await getControlPlaneDb()
      .delete(merchantSignupTokens)
      .where(eq(merchantSignupTokens.tokenHash, tokenHash));
  }

  completeSignupToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }) {
    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select({
          tokenId: merchantSignupTokens.id,
          merchantId: merchantSignupTokens.merchantId,
          expiresAt: merchantSignupTokens.expiresAt,
          consumedAt: merchantSignupTokens.consumedAt,
          status: merchantAccounts.status,
          emailVerifiedAt: merchantAccounts.emailVerifiedAt,
        })
        .from(merchantSignupTokens)
        .innerJoin(
          merchantAccounts,
          eq(merchantSignupTokens.merchantId, merchantAccounts.id)
        )
        .where(eq(merchantSignupTokens.tokenHash, input.tokenHash))
        .limit(1)
        .for("update");

      if (!row || row.status === "disabled") return { kind: "invalid" } as const;

      if (row.status === "active" && row.emailVerifiedAt) {
        return {
          kind: "already_completed",
          merchantId: row.merchantId,
        } as const;
      }

      if (
        row.status !== "pending_verification" ||
        row.consumedAt ||
        row.expiresAt.getTime() <= input.now.getTime()
      ) {
        return { kind: "expired" } as const;
      }

      const [updated] = await tx
        .update(merchantAccounts)
        .set({
          passwordHash: input.passwordHash,
          emailVerifiedAt: input.now,
          status: "active",
          updatedAt: input.now,
        })
        .where(
          and(
            eq(merchantAccounts.id, row.merchantId),
            eq(merchantAccounts.status, "pending_verification")
          )
        )
        .returning({ id: merchantAccounts.id });

      if (!updated) return { kind: "invalid" } as const;

      await tx
        .delete(merchantSessions)
        .where(eq(merchantSessions.merchantId, row.merchantId));

      await tx
        .update(merchantSignupTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(merchantSignupTokens.merchantId, row.merchantId),
            isNull(merchantSignupTokens.consumedAt)
          )
        );

      return {
        kind: "completed",
        merchantId: row.merchantId,
      } as const;
    });
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
      if (
        !merchant ||
        merchant.status !== "active" ||
        !merchant.emailVerifiedAt ||
        !merchant.passwordHash
      ) {
        return null;
      }

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
        .select({
          id: merchantAccounts.id,
          status: merchantAccounts.status,
          emailVerifiedAt: merchantAccounts.emailVerifiedAt,
        })
        .from(merchantAccounts)
        .where(eq(merchantAccounts.id, resetToken.merchantId))
        .limit(1)
        .for("update");

      if (
        !merchant ||
        merchant.status !== "active" ||
        !merchant.emailVerifiedAt
      ) {
        return false;
      }

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

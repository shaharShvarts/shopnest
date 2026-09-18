import { createHash, randomBytes } from "node:crypto";
import {
  hashMerchantPassword,
  verifyMerchantPassword,
} from "./password.mjs";
import { normalizeMerchantPhone } from "./phone";

export const MERCHANT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const MERCHANT_PASSWORD_MIN_LENGTH = 12;
export const MERCHANT_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export type MerchantStatus = "active" | "disabled";

export type MerchantRecord = {
  id: number;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  displayName: string;
  phoneE164: string | null;
  emailVerifiedAt: Date | null;
  status: MerchantStatus;
};

export type MerchantPrincipal = Pick<
  MerchantRecord,
  "id" | "email" | "displayName" | "phoneE164" | "status"
>;

export type StoredMerchantSession = {
  tokenHash: string;
  expiresAt: Date;
  merchant: MerchantPrincipal;
};

export type MerchantPasswordResetRecipient = {
  merchantId: number;
  email: string;
};

export interface MerchantPasswordResetDelivery {
  deliverPasswordReset(input: {
    email: string;
    resetUrl: string;
  }): Promise<void>;
}

export interface MerchantAuthRepository {
  findMerchantByNormalizedEmail(email: string): Promise<MerchantRecord | null>;
  createMerchantWithPassword(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
    phoneE164: string;
  }): Promise<MerchantRecord>;
  createSession(input: {
    tokenHash: string;
    merchantId: number;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredMerchantSession | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  deleteSessionsForMerchant(merchantId: number): Promise<void>;
  issuePasswordResetToken(input: {
    emailNormalized: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<MerchantPasswordResetRecipient | null>;
  consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<boolean>;
}

export function normalizeMerchantEmail(email: string) {
  return email.trim().normalize("NFKC").toLowerCase();
}

export async function registerMerchant(
  repository: MerchantAuthRepository,
  input: {
    email: string;
    password: string;
    displayName: string;
    phone: string;
  }
) {
  if (input.password.length < MERCHANT_PASSWORD_MIN_LENGTH) {
    throw new Error("invalid_password");
  }

  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("invalid_display_name");

  const emailNormalized = normalizeMerchantEmail(input.email);
  const phoneE164 = normalizeMerchantPhone(input.phone);

  if (await repository.findMerchantByNormalizedEmail(emailNormalized)) {
    throw new Error("account_unavailable");
  }

  const passwordHash = await hashMerchantPassword(input.password);
  return repository.createMerchantWithPassword({
    email: emailNormalized,
    emailNormalized,
    passwordHash,
    displayName,
    phoneE164,
  });
}

export async function authenticateMerchant(
  repository: MerchantAuthRepository,
  email: string,
  password: string
): Promise<MerchantRecord | null> {
  const merchant = await repository.findMerchantByNormalizedEmail(
    normalizeMerchantEmail(email)
  );
  if (!merchant || merchant.status !== "active") return null;
  return (await verifyMerchantPassword(password, merchant.passwordHash))
    ? merchant
    : null;
}

export async function createMerchantSession(
  repository: MerchantAuthRepository,
  merchantId: number,
  options: { now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashMerchantSessionToken(token);
  const expiresAt = new Date(now.getTime() + MERCHANT_SESSION_TTL_MS);
  await repository.createSession({ tokenHash, merchantId, expiresAt });
  return {
    token,
    expiresAt,
    maxAgeSeconds: MERCHANT_SESSION_TTL_MS / 1000,
  };
}

export async function resolveMerchantSession(
  repository: MerchantAuthRepository,
  token: string | null | undefined,
  now = new Date()
): Promise<MerchantPrincipal | null> {
  if (!token) return null;
  const tokenHash = hashMerchantSessionToken(token);
  const session = await repository.findSessionByTokenHash(tokenHash);
  if (!session) return null;

  if (
    session.merchant.status !== "active" ||
    session.expiresAt.getTime() <= now.getTime()
  ) {
    await repository.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  return session.merchant;
}

export async function logoutMerchant(
  repository: MerchantAuthRepository,
  token: string | null | undefined
) {
  if (!token) return;
  await repository.deleteSessionByTokenHash(hashMerchantSessionToken(token));
}

export function hashMerchantSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestMerchantPasswordReset(
  repository: MerchantAuthRepository,
  delivery: MerchantPasswordResetDelivery,
  input: {
    email: string;
    buildResetUrl: (token: string) => string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const token = generateMerchantPasswordResetToken();
  const tokenHash = hashMerchantPasswordResetToken(token);
  const recipient = await repository.issuePasswordResetToken({
    emailNormalized: normalizeMerchantEmail(input.email),
    tokenHash,
    expiresAt: new Date(now.getTime() + MERCHANT_PASSWORD_RESET_TTL_MS),
    now,
  });

  if (recipient) {
    try {
      await delivery.deliverPasswordReset({
        email: recipient.email,
        resetUrl: input.buildResetUrl(token),
      });
    } catch {
      // Delivery failures must not disclose whether the account exists.
    }
  }

  return { accepted: true as const };
}

export async function resetMerchantPassword(
  repository: MerchantAuthRepository,
  input: { token: string; password: string; now?: Date }
) {
  if (input.password.length < MERCHANT_PASSWORD_MIN_LENGTH) return false;
  const passwordHash = await hashMerchantPassword(input.password);
  return repository.consumePasswordResetToken({
    tokenHash: hashMerchantPasswordResetToken(input.token),
    passwordHash,
    now: input.now ?? new Date(),
  });
}

export function generateMerchantPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashMerchantPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

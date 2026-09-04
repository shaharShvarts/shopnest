import { createHash, randomBytes } from "node:crypto";
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from "./password.mjs";

export const CUSTOMER_NORMAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const CUSTOMER_REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CUSTOMER_SESSION_TTL_MS = CUSTOMER_NORMAL_SESSION_TTL_MS;
export const CUSTOMER_PASSWORD_MIN_LENGTH = 12;
export const CUSTOMER_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const CUSTOMER_PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

export type CustomerStatus = "active" | "disabled";
export type CustomerRecord = {
  id: number;
  email: string;
  emailNormalized: string;
  passwordHash: string | null;
  displayName: string | null;
  status: CustomerStatus;
};

export type CustomerPrincipal = Pick<
  CustomerRecord,
  "id" | "email" | "displayName" | "status"
>;

export type StoredCustomerSession = {
  tokenHash: string;
  expiresAt: Date;
  customer: CustomerPrincipal;
};

export type PasswordResetRecipient = {
  customerId: number;
  email: string;
};

export interface CustomerPasswordResetDelivery {
  deliverPasswordReset(input: {
    email: string;
    resetUrl: string;
  }): Promise<void>;
}

export interface CustomerAuthRepository {
  findCustomerByNormalizedEmail(email: string): Promise<CustomerRecord | null>;
  createCustomerWithPassword(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
  }): Promise<CustomerRecord>;
  createSession(input: {
    tokenHash: string;
    customerId: number;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(
    tokenHash: string
  ): Promise<StoredCustomerSession | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  issuePasswordResetToken(input: {
    emailNormalized: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
  }): Promise<PasswordResetRecipient | null>;
  consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<boolean>;
  upsertTenantMembership(input: {
    customerId: number;
    tenantSlug: string;
    seenAt: Date;
  }): Promise<void>;
  hasTenantMembership(customerId: number, tenantSlug: string): Promise<boolean>;
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().normalize("NFKC").toLowerCase();
}

export async function registerCustomer(
  repository: CustomerAuthRepository,
  input: { email: string; password: string; displayName: string }
) {
  const emailNormalized = normalizeCustomerEmail(input.email);
  if (await repository.findCustomerByNormalizedEmail(emailNormalized)) {
    throw new Error("account_unavailable");
  }
  const passwordHash = await hashCustomerPassword(input.password);
  return repository.createCustomerWithPassword({
    email: emailNormalized,
    emailNormalized,
    passwordHash,
    displayName: input.displayName.trim(),
  });
}

export async function authenticateCustomer(
  repository: CustomerAuthRepository,
  email: string,
  password: string
): Promise<CustomerRecord | null> {
  const customer = await repository.findCustomerByNormalizedEmail(
    normalizeCustomerEmail(email)
  );
  if (!customer || customer.status !== "active" || !customer.passwordHash) {
    return null;
  }
  return (await verifyCustomerPassword(password, customer.passwordHash))
    ? customer
    : null;
}

export async function createCustomerSession(
  repository: CustomerAuthRepository,
  customerId: number,
  options: { rememberMe?: boolean; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const ttlMs = options.rememberMe
    ? CUSTOMER_REMEMBERED_SESSION_TTL_MS
    : CUSTOMER_NORMAL_SESSION_TTL_MS;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashCustomerSessionToken(token);
  const expiresAt = new Date(now.getTime() + ttlMs);
  await repository.createSession({ tokenHash, customerId, expiresAt });
  return { token, expiresAt, maxAgeSeconds: ttlMs / 1000 };
}

export async function requestCustomerPasswordReset(
  repository: CustomerAuthRepository,
  delivery: CustomerPasswordResetDelivery,
  input: {
    email: string;
    buildResetUrl: (token: string) => string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const token = generateCustomerPasswordResetToken();
  const tokenHash = hashCustomerPasswordResetToken(token);
  const recipient = await repository.issuePasswordResetToken({
    emailNormalized: normalizeCustomerEmail(input.email),
    tokenHash,
    expiresAt: new Date(now.getTime() + CUSTOMER_PASSWORD_RESET_TTL_MS),
    now,
    cooldownMs: CUSTOMER_PASSWORD_RESET_COOLDOWN_MS,
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

export async function resetCustomerPassword(
  repository: CustomerAuthRepository,
  input: { token: string; password: string; now?: Date }
) {
  if (input.password.length < CUSTOMER_PASSWORD_MIN_LENGTH) return false;
  const passwordHash = await hashCustomerPassword(input.password);
  return repository.consumePasswordResetToken({
    tokenHash: hashCustomerPasswordResetToken(input.token),
    passwordHash,
    now: input.now ?? new Date(),
  });
}

export async function resolveCustomerSession(
  repository: CustomerAuthRepository,
  token: string | null | undefined,
  now = new Date()
): Promise<CustomerPrincipal | null> {
  if (!token) return null;
  const tokenHash = hashCustomerSessionToken(token);
  const session = await repository.findSessionByTokenHash(tokenHash);
  if (!session) return null;
  if (
    session.customer.status !== "active" ||
    session.expiresAt.getTime() <= now.getTime()
  ) {
    await repository.deleteSessionByTokenHash(tokenHash);
    return null;
  }
  return session.customer;
}

export async function logoutCustomer(
  repository: CustomerAuthRepository,
  token: string | null | undefined
) {
  if (!token) return;
  await repository.deleteSessionByTokenHash(hashCustomerSessionToken(token));
}

export function hashCustomerSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateCustomerPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCustomerPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function resolveSafeTenantCallback(
  callback: string | null | undefined,
  tenantBasePath: string,
  fallback = tenantBasePath || "/"
) {
  if (!callback || !callback.startsWith("/") || callback.startsWith("//")) {
    return fallback;
  }
  if (callback.includes("\\") || /[\u0000-\u001f]/.test(callback)) {
    return fallback;
  }
  try {
    const parsed = new URL(callback, "https://shopnest.invalid");
    const insideTenant =
      parsed.pathname === tenantBasePath ||
      parsed.pathname.startsWith(`${tenantBasePath}/`);
    const adminPath =
      parsed.pathname === `${tenantBasePath}/admin` ||
      parsed.pathname.startsWith(`${tenantBasePath}/admin/`);
    if (!insideTenant || adminPath) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function getCustomerSocialProviderStatus() {
  return {
    google: "implemented" as const,
    apple: "planned" as const,
  };
}

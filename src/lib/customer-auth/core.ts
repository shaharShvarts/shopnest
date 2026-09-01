import { createHash, randomBytes } from "node:crypto";
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from "./password.mjs";

export const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CUSTOMER_PASSWORD_MIN_LENGTH = 12;

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
  now = new Date()
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashCustomerSessionToken(token);
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS);
  await repository.createSession({ tokenHash, customerId, expiresAt });
  return { token, expiresAt };
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
    google: "not_implemented" as const,
    apple: "planned" as const,
  };
}

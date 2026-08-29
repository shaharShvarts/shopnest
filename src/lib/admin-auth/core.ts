import { createHash, randomBytes } from "node:crypto";
import { verifyAdminPassword } from "./password.mjs";

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type AdminRole = "super_admin" | "tenant_admin";
export type TenantStatus = "active" | "suspended" | "disabled";

export type AdminUserRecord = {
  id: number;
  email: string;
  passwordHash: string;
  role: AdminRole;
  isActive: boolean;
};

export type AdminPrincipal = {
  id: number;
  email: string;
  role: AdminRole;
  isActive: boolean;
  tenantSlugs: string[];
};

export type StoredAdminSession = {
  tokenHash: string;
  expiresAt: Date;
  user: AdminPrincipal;
};

export type TenantControlRecord = {
  slug: string;
  schemaName: string;
  displayName: string;
  status: TenantStatus;
};

export interface AdminAuthRepository {
  findAdminByEmail(email: string): Promise<AdminUserRecord | null>;
  createSession(input: {
    tokenHash: string;
    adminUserId: number;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredAdminSession | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
}

export type TenantAccessDecision =
  | "allowed"
  | "unauthenticated"
  | "unknown_tenant"
  | "forbidden";

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function authenticateAdmin(
  repository: AdminAuthRepository,
  email: string,
  password: string
): Promise<AdminUserRecord | null> {
  const user = await repository.findAdminByEmail(normalizeAdminEmail(email));
  if (!user || !user.isActive) return null;
  return (await verifyAdminPassword(password, user.passwordHash)) ? user : null;
}

export async function createAdminSession(
  repository: AdminAuthRepository,
  adminUserId: number,
  now = new Date()
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAdminSessionToken(token);
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS);
  await repository.createSession({ tokenHash, adminUserId, expiresAt });
  return { token, expiresAt };
}

export async function resolveAdminSession(
  repository: AdminAuthRepository,
  token: string | null | undefined,
  now = new Date()
): Promise<AdminPrincipal | null> {
  if (!token) return null;
  const tokenHash = hashAdminSessionToken(token);
  const session = await repository.findSessionByTokenHash(tokenHash);
  if (!session) return null;

  if (!session.user.isActive || session.expiresAt.getTime() <= now.getTime()) {
    await repository.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  return session.user;
}

export async function logoutAdmin(
  repository: AdminAuthRepository,
  token: string | null | undefined
) {
  if (!token) return;
  await repository.deleteSessionByTokenHash(hashAdminSessionToken(token));
}

export function authorizeTenantAdmin(
  principal: AdminPrincipal | null,
  tenant: TenantControlRecord | null
): TenantAccessDecision {
  if (!principal) return "unauthenticated";
  if (!tenant) return "unknown_tenant";
  if (!principal.isActive) return "unauthenticated";
  if (principal.role === "super_admin") return "allowed";
  if (tenant.status !== "active") return "forbidden";
  return principal.tenantSlugs.includes(tenant.slug) ? "allowed" : "forbidden";
}

export function authorizeSuperAdmin(principal: AdminPrincipal | null) {
  return Boolean(
    principal?.isActive && principal.role === "super_admin"
  );
}

export function hashAdminSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

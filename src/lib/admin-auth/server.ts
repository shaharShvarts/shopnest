import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { forbidden, notFound, redirect } from "next/navigation";
import { controlPlaneDb, getDbForTenant } from "@/drizzle/db";
import { controlPlaneTenants } from "@/drizzle/control-plane-schema";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";
import {
  authorizeSuperAdmin,
  authorizeTenantAdmin,
  resolveAdminSession,
  type AdminPrincipal,
  type TenantAccessDecision,
  type TenantControlRecord,
} from "./core";
import { DrizzleAdminAuthRepository } from "./drizzle-repository";
import {
  resolveGlobalAdminPageAccess,
  resolveTenantAdminPageAccess,
} from "./navigation";

export const ADMIN_SESSION_COOKIE = "shopnest_admin_session";
const repository = new DrizzleAdminAuthRepository();

export class AdminAuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string
  ) {
    super(message);
    this.name = "AdminAuthorizationError";
  }
}

export async function getCurrentAdminSession() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return resolveAdminSession(repository, token);
}

export async function getControlTenant(
  slug: string
): Promise<TenantControlRecord | null> {
  const [tenant] = await controlPlaneDb
    .select({
      slug: controlPlaneTenants.slug,
      schemaName: controlPlaneTenants.schemaName,
      displayName: controlPlaneTenants.displayName,
      status: controlPlaneTenants.status,
    })
    .from(controlPlaneTenants)
    .where(eq(controlPlaneTenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}

export async function getTenantAdminAccess(): Promise<{
  decision: TenantAccessDecision;
  principal: AdminPrincipal | null;
  tenant: Tenant | null;
  controlTenant: TenantControlRecord | null;
}> {
  const tenant = await getTenant();
  const principal = await getCurrentAdminSession();
  const resolvedControlTenant = tenant
    ? await getControlTenant(tenant.slug)
    : null;
  const controlTenant =
    tenant && resolvedControlTenant?.schemaName === tenant.schema
      ? resolvedControlTenant
      : null;
  const decision = authorizeTenantAdmin(principal, controlTenant);
  return { decision, principal, tenant, controlTenant };
}

export async function requireTenantAdmin() {
  const access = await getTenantAdminAccess();
  enforceTenantAdminPageAccess(access);
  return tenantAdminResult(access);
}

export async function requireTenantAdminForApi() {
  const access = await getTenantAdminAccess();
  if (access.decision === "unauthenticated") {
    throw new AdminAuthorizationError(401, "Admin login required");
  }
  if (access.decision === "unknown_tenant" || !access.tenant) {
    throw new AdminAuthorizationError(404, "Unknown tenant");
  }
  if (access.decision !== "allowed" || !access.principal) {
    throw new AdminAuthorizationError(403, "Tenant access denied");
  }
  return tenantAdminResult(access);
}

export async function requireTenantAdminDb() {
  const access = await requireTenantAdmin();
  return { ...access, db: getDbForTenant(access.tenant) };
}

export async function requireTenantAdminApiDb() {
  const access = await requireTenantAdminForApi();
  return { ...access, db: getDbForTenant(access.tenant) };
}

export async function requireSuperAdmin() {
  const principal = await getCurrentAdminSession();
  if (!principal) throw new AdminAuthorizationError(401, "Admin login required");
  if (!authorizeSuperAdmin(principal)) {
    throw new AdminAuthorizationError(403, "Super admin access denied");
  }
  return principal;
}

export async function requireSuperAdminPage() {
  const principal = await getCurrentAdminSession();
  const outcome = resolveGlobalAdminPageAccess(principal);
  if (outcome.kind === "redirect") redirect(outcome.location);
  if (outcome.kind === "forbidden") forbidden();
  if (outcome.kind === "not-found") notFound();
  return principal!;
}

export async function requireActiveTenantStorefront() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const controlTenant = await getControlTenant(tenant.slug);
  if (!controlTenant || controlTenant.status !== "active") {
    throw new AdminAuthorizationError(403, "Store unavailable");
  }
  return controlTenant;
}

export function getAdminAuthRepository() {
  return repository;
}

function enforceTenantAdminPageAccess(
  access: Awaited<ReturnType<typeof getTenantAdminAccess>>
) {
  const outcome = resolveTenantAdminPageAccess(access);
  if (outcome.kind === "redirect") redirect(outcome.location);
  if (outcome.kind === "forbidden") forbidden();
  if (outcome.kind === "not-found") notFound();
}

function tenantAdminResult(
  access: Awaited<ReturnType<typeof getTenantAdminAccess>>
) {
  if (!access.tenant || !access.controlTenant || !access.principal) {
    throw new Error("Allowed tenant admin access is missing required context");
  }
  return {
    tenant: access.tenant,
    controlTenant: access.controlTenant,
    principal: access.principal,
  };
}


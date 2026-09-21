import "server-only";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  prefixTenantPath,
  TENANT_HEADER,
  TENANT_ROUTE_MODE_HEADER,
  TENANT_SCHEMA_HEADER,
  type Tenant,
  type TenantRouteMode,
} from "./tenant";
import { resolveTrustedTenant } from "./tenant-registry/server";

async function trustedRequestContext() {
  const requestHeaders = await headers();
  const slug = requestHeaders.get(TENANT_HEADER);

  if (!slug) {
    return { tenant: null, routeMode: null } as const;
  }

  const tenant = await resolveTrustedTenant(slug);
  if (!tenant) throw new Error("Unknown tenant context");

  const schema = requestHeaders.get(TENANT_SCHEMA_HEADER);
  if (schema !== tenant.schema) throw new Error("Invalid tenant schema context");

  const routeMode = requestHeaders.get(TENANT_ROUTE_MODE_HEADER);
  if (routeMode !== "path" && routeMode !== "host") {
    throw new Error("Invalid tenant route context");
  }

  return {
    tenant,
    routeMode: routeMode as TenantRouteMode,
  };
}

export async function getTenant(): Promise<Tenant | null> {
  return (await trustedRequestContext()).tenant;
}

export async function getTenantRouteMode(): Promise<TenantRouteMode | null> {
  return (await trustedRequestContext()).routeMode;
}

export async function tenantPath(path: string) {
  const { tenant, routeMode } = await trustedRequestContext();
  if (!tenant || !routeMode) {
    throw new Error("Tenant navigation requires trusted tenant context");
  }

  return prefixTenantPath(
    path,
    routeMode === "host" ? "" : tenant.basePath
  );
}

export async function revalidateTenantPath(path: string) {
  const tenant = await getTenant();
  if (!tenant) {
    throw new Error("Tenant revalidation requires trusted tenant context");
  }
  revalidatePath(prefixTenantPath(path, tenant.basePath));
}

import "server-only";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  prefixTenantPath,
  resolveConfiguredTenant,
  TENANT_HEADER,
  TENANT_SCHEMA_HEADER,
  type Tenant,
} from "./tenant";

export async function getTenant(): Promise<Tenant | null> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get(TENANT_HEADER);

  if (!slug) return null;

  const tenant = resolveConfiguredTenant(slug);
  if (!tenant) throw new Error("Unknown tenant context");

  const schema = requestHeaders.get(TENANT_SCHEMA_HEADER);
  if (schema !== tenant.schema) throw new Error("Invalid tenant schema context");

  return tenant;
}

export async function tenantPath(path: string) {
  const tenant = await getTenant();
  return prefixTenantPath(path, tenant?.basePath ?? "");
}

export async function revalidateTenantPath(path: string) {
  revalidatePath(await tenantPath(path));
}

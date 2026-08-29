import { env } from "@/data/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/drizzle/schema";
import * as controlPlaneSchema from "@/drizzle/control-plane-schema";
import { Pool } from "pg";
import { getTenant } from "@/lib/tenant-context";
import { resolveConfiguredTenant, type Tenant } from "@/lib/tenant";

export const db = drizzle(env.DATABASE_URL, { schema });
const globalForPools = globalThis as typeof globalThis & {
  shopnestControlPlanePool?: Pool;
  shopnestTenantPools?: Map<string, Pool>;
};
const controlPlanePool = globalForPools.shopnestControlPlanePool ?? new Pool({
  connectionString: env.DATABASE_URL,
  options: "-c search_path=public",
});
if (process.env.NODE_ENV !== "production") {
  globalForPools.shopnestControlPlanePool = controlPlanePool;
}

export const controlPlaneDb = drizzle(controlPlanePool, {
  schema: controlPlaneSchema,
});

type Database = typeof db;

const tenantPools =
  globalForPools.shopnestTenantPools ?? new Map<string, Pool>();

if (process.env.NODE_ENV !== "production") {
  globalForPools.shopnestTenantPools = tenantPools;
}

export async function getDb(): Promise<Database> {
  const tenant = await getTenant();
  return getDbForTenant(tenant);
}

export function getDbForTenant(tenant: Tenant | null): Database {
  if (!tenant) return db;

  const configuredTenant = resolveConfiguredTenant(tenant.slug);
  if (
    !configuredTenant ||
    configuredTenant.schema !== tenant.schema ||
    configuredTenant.basePath !== tenant.basePath
  ) {
    throw new Error(`Refusing database access for unknown tenant: ${tenant.slug}`);
  }

  let pool = tenantPools.get(configuredTenant.schema);

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${configuredTenant.schema}`,
    });
    tenantPools.set(configuredTenant.schema, pool);
  }

  return drizzle(pool, { schema });
}

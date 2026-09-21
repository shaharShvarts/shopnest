import { env } from "@/data/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/drizzle/schema";
import { Pool } from "pg";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";
import { isTrustedTenant } from "@/lib/tenant-registry/core";
export { getControlPlaneDb } from "@/drizzle/control-db";

type Database = ReturnType<typeof drizzle<typeof schema>>;
let defaultDb: Database | undefined;

function getDefaultDb(): Database {
  return defaultDb ??= drizzle(env.DATABASE_URL, { schema });
}
const globalForPools = globalThis as typeof globalThis & {
  shopnestTenantPools?: Map<string, Pool>;
};

const tenantPools =
  globalForPools.shopnestTenantPools ?? new Map<string, Pool>();

if (process.env.NODE_ENV !== "production") {
  globalForPools.shopnestTenantPools = tenantPools;
}

export async function getDb(): Promise<Database> {
  const tenant = await getTenant();
  if (!tenant) throw new Error("Tenant database access requires tenant context");
  return getDbForTenant(tenant);
}

export function getDbForTenant(tenant: Tenant | null): Database {
  if (!tenant) return getDefaultDb();

  if (!isTrustedTenant(tenant)) {
    throw new Error(`Refusing database access for untrusted tenant: ${tenant.slug}`);
  }

  let pool = tenantPools.get(tenant.schema);

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      options: `-c search_path=${tenant.schema}`,
    });
    tenantPools.set(tenant.schema, pool);
  }

  return drizzle(pool, { schema });
}

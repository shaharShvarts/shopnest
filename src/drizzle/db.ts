import { env } from "@/data/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/drizzle/schema";
import { Pool } from "pg";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";

export const db = drizzle(env.DATABASE_URL, { schema });

type Database = typeof db;

const globalForTenantPools = globalThis as typeof globalThis & {
  shopnestTenantPools?: Map<string, Pool>;
};

const tenantPools =
  globalForTenantPools.shopnestTenantPools ?? new Map<string, Pool>();

if (process.env.NODE_ENV !== "production") {
  globalForTenantPools.shopnestTenantPools = tenantPools;
}

export async function getDb(): Promise<Database> {
  const tenant = await getTenant();
  return getDbForTenant(tenant);
}

export function getDbForTenant(tenant: Tenant | null): Database {
  if (!tenant) return db;

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

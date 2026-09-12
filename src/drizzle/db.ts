import { env } from "@/data/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/drizzle/schema";
import * as controlPlaneSchema from "@/drizzle/control-plane-schema";
import { Pool } from "pg";
import { getTenant } from "@/lib/tenant-context";
import { resolveConfiguredTenant, type Tenant } from "@/lib/tenant";

type Database = ReturnType<typeof drizzle<typeof schema>>;
let defaultDb: Database | undefined;

function getDefaultDb(): Database {
  return defaultDb ??= drizzle(env.DATABASE_URL, { schema });
}
const globalForPools = globalThis as typeof globalThis & {
  shopnestControlPlanePool?: Pool;
  shopnestTenantPools?: Map<string, Pool>;
};
let controlPlaneDb: ReturnType<typeof drizzle<typeof controlPlaneSchema>> | undefined;

// Do not initialize clients while Next.js imports routes during page collection.
export function getControlPlaneDb() {
  if (!controlPlaneDb) {
    const controlPlanePool = globalForPools.shopnestControlPlanePool ?? new Pool({
      connectionString: env.DATABASE_URL,
      options: "-c search_path=public",
    });
    if (process.env.NODE_ENV !== "production") {
      globalForPools.shopnestControlPlanePool = controlPlanePool;
    }
    controlPlaneDb = drizzle(controlPlanePool, { schema: controlPlaneSchema });
  }
  return controlPlaneDb;
}

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

import { env } from "@/data/env/server";
import * as controlPlaneSchema from "@/drizzle/control-plane-schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForControlDb = globalThis as typeof globalThis & {
  shopnestControlPlanePool?: Pool;
};

let controlPlaneDb:
  | ReturnType<typeof drizzle<typeof controlPlaneSchema>>
  | undefined;

// Do not initialize clients while Next.js imports routes during page collection.
export function getControlPlaneDb() {
  if (!controlPlaneDb) {
    const controlPlanePool =
      globalForControlDb.shopnestControlPlanePool ??
      new Pool({
        connectionString: env.DATABASE_URL,
        options: "-c search_path=public",
      });

    if (process.env.NODE_ENV !== "production") {
      globalForControlDb.shopnestControlPlanePool = controlPlanePool;
    }

    controlPlaneDb = drizzle(controlPlanePool, {
      schema: controlPlaneSchema,
    });
  }

  return controlPlaneDb;
}

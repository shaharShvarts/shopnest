import "server-only";

import { and, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import { controlPlaneTenants } from "@/drizzle/control-schema/tenant";
import type {
  TenantRegistryRecord,
  TenantRegistryRepository,
} from "./core";

export class DrizzleTenantRegistryRepository
  implements TenantRegistryRepository
{
  async findActiveBySlug(
    slug: string
  ): Promise<TenantRegistryRecord | null> {
    const [tenant] = await getControlPlaneDb()
      .select({
        slug: controlPlaneTenants.slug,
        schemaName: controlPlaneTenants.schemaName,
        status: controlPlaneTenants.status,
      })
      .from(controlPlaneTenants)
      .where(
        and(
          eq(controlPlaneTenants.slug, slug),
          eq(controlPlaneTenants.status, "active")
        )
      )
      .limit(1);

    return tenant ?? null;
  }
}

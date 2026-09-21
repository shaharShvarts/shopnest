import "server-only";

import { and, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import { storeDomains } from "@/drizzle/control-schema/storeDomain";
import { controlPlaneTenants } from "@/drizzle/control-schema/tenant";
import type {
  DomainRegistryRecord,
  DomainRegistryRepository,
} from "./core";

export class DrizzleDomainRegistryRepository
  implements DomainRegistryRepository
{
  async findActiveByHostname(
    hostname: string
  ): Promise<DomainRegistryRecord | null> {
    const [row] = await getControlPlaneDb()
      .select({
        hostname: storeDomains.hostname,
        domainStatus: storeDomains.status,
        tenantSlug: controlPlaneTenants.slug,
        tenantSchemaName: controlPlaneTenants.schemaName,
        tenantStatus: controlPlaneTenants.status,
      })
      .from(storeDomains)
      .innerJoin(
        controlPlaneTenants,
        eq(controlPlaneTenants.id, storeDomains.tenantId)
      )
      .where(
        and(
          eq(storeDomains.hostname, hostname),
          eq(storeDomains.status, "active"),
          eq(controlPlaneTenants.status, "active")
        )
      )
      .limit(1);

    if (!row) return null;

    return {
      hostname: row.hostname,
      domainStatus: row.domainStatus,
      tenant: {
        slug: row.tenantSlug,
        schemaName: row.tenantSchemaName,
        status: row.tenantStatus,
      },
    };
  }
}

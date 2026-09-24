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
        id: storeDomains.id,
        tenantId: storeDomains.tenantId,
        hostname: storeDomains.hostname,
        domainStatus: storeDomains.status,
        lifecycleRole: storeDomains.lifecycleRole,
        providerHostnameStatus: storeDomains.providerHostnameStatus,
        providerSslStatus: storeDomains.providerSslStatus,
        retireAt: storeDomains.retireAt,
        redirectToDomainId: storeDomains.redirectToDomainId,
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

    let redirectTargetHostname: string | null = null;
    if (row.lifecycleRole === "retiring") {
      if (!row.redirectToDomainId) return null;

      const [target] = await getControlPlaneDb()
        .select({
          hostname: storeDomains.hostname,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.id, row.redirectToDomainId),
            eq(storeDomains.tenantId, row.tenantId),
            eq(storeDomains.status, "active"),
            eq(storeDomains.lifecycleRole, "primary"),
            eq(storeDomains.providerHostnameStatus, "active"),
            eq(storeDomains.providerSslStatus, "active")
          )
        )
        .limit(1);

      if (!target) return null;
      redirectTargetHostname = target.hostname;
    }

    return {
      hostname: row.hostname,
      domainStatus: row.domainStatus,
      lifecycleRole: row.lifecycleRole,
      providerHostnameStatus: row.providerHostnameStatus,
      providerSslStatus: row.providerSslStatus,
      retireAt: row.retireAt,
      redirectTargetHostname,
      tenant: {
        slug: row.tenantSlug,
        schemaName: row.tenantSchemaName,
        status: row.tenantStatus,
      },
    };
  }

  async findPrimaryByTenantSlug(
    tenantSlug: string
  ): Promise<{ hostname: string } | null> {
    const [row] = await getControlPlaneDb()
      .select({
        hostname: storeDomains.hostname,
      })
      .from(storeDomains)
      .innerJoin(
        controlPlaneTenants,
        eq(controlPlaneTenants.id, storeDomains.tenantId)
      )
      .where(
        and(
          eq(controlPlaneTenants.slug, tenantSlug),
          eq(controlPlaneTenants.status, "active"),
          eq(storeDomains.status, "active"),
          eq(storeDomains.lifecycleRole, "primary"),
          eq(storeDomains.providerHostnameStatus, "active"),
          eq(storeDomains.providerSslStatus, "active")
        )
      )
      .limit(1);

    return row ?? null;
  }
}

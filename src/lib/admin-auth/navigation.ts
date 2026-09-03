import type { Tenant } from "@/lib/tenant";
import type {
  AdminPrincipal,
  TenantAccessDecision,
  TenantControlRecord,
} from "./core";

export type AdminPageAccess =
  | { kind: "allowed" }
  | { kind: "redirect"; location: string }
  | { kind: "forbidden" }
  | { kind: "not-found" };

export function resolveTenantAdminPageAccess(input: {
  decision: TenantAccessDecision;
  principal: AdminPrincipal | null;
  tenant: Tenant | null;
  controlTenant: TenantControlRecord | null;
}): AdminPageAccess {
  if (!input.tenant) return { kind: "not-found" };
  if (input.decision === "unauthenticated" || !input.principal) {
    return {
      kind: "redirect",
      location: `${input.tenant.basePath}/admin/login`,
    };
  }
  if (input.decision === "unknown_tenant" || !input.controlTenant) {
    return { kind: "not-found" };
  }
  if (input.decision !== "allowed") return { kind: "forbidden" };
  return { kind: "allowed" };
}

export function resolveGlobalAdminPageAccess(
  principal: AdminPrincipal | null
): AdminPageAccess {
  if (!principal) {
    return { kind: "redirect", location: "/shopnest/admin/login" };
  }
  if (principal.role !== "super_admin" || !principal.isActive) {
    return { kind: "forbidden" };
  }
  return { kind: "allowed" };
}


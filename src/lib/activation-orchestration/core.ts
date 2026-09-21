import { isSafeTenantSchemaName } from "../tenant-registry/core.ts";

export const ACTIVATION_SAFE_ERROR_CODES = [
  "READINESS_REGRESSED",
  "INVALID_STORE_SLUG",
  "TENANT_IDENTITY_CONFLICT",
  "PLAN_NOT_PROVISIONABLE",
  "SCHEMA_PROVISIONING_FAILED",
  "TENANT_FINALIZATION_FAILED",
] as const;

export type ActivationSafeErrorCode =
  (typeof ACTIVATION_SAFE_ERROR_CODES)[number];

export type ProvisionableTenantPlan = "small" | "medium" | "large";

export type ActivationResult =
  | {
      kind: "provisioned";
      storeId: number;
      tenantId: number;
      slug: string;
      schemaName: string;
    }
  | {
      kind: "already_provisioned";
      storeId: number;
      tenantId: number;
    };

export class ActivationOrchestrationError extends Error {
  constructor(
    readonly code:
      | ActivationSafeErrorCode
      | "STORE_NOT_FOUND"
      | "STORE_NOT_READY",
    message: string
  ) {
    super(message);
    this.name = "ActivationOrchestrationError";
  }
}

export function tenantSchemaNameForStore(storeId: number) {
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new ActivationOrchestrationError(
      "TENANT_FINALIZATION_FAILED",
      "Store id cannot produce a trusted Tenant schema"
    );
  }

  const schemaName = `tenant_${storeId}`;
  if (!isSafeTenantSchemaName(schemaName)) {
    throw new ActivationOrchestrationError(
      "TENANT_FINALIZATION_FAILED",
      "Generated Tenant schema is unsafe"
    );
  }

  return schemaName;
}

export function asProvisionableTenantPlan(
  planCode: string
): ProvisionableTenantPlan | null {
  switch (planCode) {
    case "small":
    case "medium":
    case "large":
      return planCode;
    default:
      return null;
  }
}

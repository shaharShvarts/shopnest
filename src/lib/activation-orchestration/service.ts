import type { StoreLifecycleRepository } from "@/lib/store-lifecycle/drizzle-repository";
import {
  StoreLifecycleService,
  StoreLifecycleServiceError,
} from "@/lib/store-lifecycle/service";
import type { StoreReadinessRepository } from "@/lib/store-readiness/drizzle-repository";
import {
  ACTIVATION_SAFE_ERROR_CODES,
  ActivationOrchestrationError,
  type ActivationResult,
  type ActivationSafeErrorCode,
} from "./core";
import type {
  ActivationOrchestrationRepository,
  ActivationProvisioningContext,
} from "./drizzle-repository";

export interface ActivationLifecycleService {
  requestActivationForOwnedStore(
    merchantId: number,
    storeId: number,
    now?: Date
  ): ReturnType<StoreLifecycleService["requestActivationForOwnedStore"]>;
  startProvisioning(
    storeId: number,
    now?: Date
  ): ReturnType<StoreLifecycleService["startProvisioning"]>;
  markProvisioningFailed(
    storeId: number,
    errorCode: string,
    now?: Date
  ): ReturnType<StoreLifecycleService["markProvisioningFailed"]>;
}

export interface ActivationTenantProvisioner {
  provision(context: ActivationProvisioningContext): Promise<void>;
}

export interface ActivationTenantRegistryCache {
  clear(slug: string): void;
}

function asSafeFailureCode(
  error: unknown,
  fallback: ActivationSafeErrorCode
): ActivationSafeErrorCode {
  if (
    error instanceof ActivationOrchestrationError &&
    (ACTIVATION_SAFE_ERROR_CODES as readonly string[]).includes(error.code)
  ) {
    return error.code as ActivationSafeErrorCode;
  }
  return fallback;
}

export class ActivationOrchestrationService {
  constructor(
    private readonly lifecycleService: ActivationLifecycleService,
    private readonly lifecycleRepository: StoreLifecycleRepository,
    private readonly readinessRepository: StoreReadinessRepository,
    private readonly activationRepository: ActivationOrchestrationRepository,
    private readonly provisioner: ActivationTenantProvisioner,
    private readonly registryCache: ActivationTenantRegistryCache
  ) {}

  async activateOwnedStore(
    merchantId: number,
    storeId: number,
    now = new Date()
  ): Promise<ActivationResult> {
    let current =
      await this.lifecycleRepository.findForOwnedStore(
        merchantId,
        storeId
      );

    if (!current) {
      throw new ActivationOrchestrationError(
        "STORE_NOT_FOUND",
        "Store not found"
      );
    }

    if (current.status === "provisioned" && current.tenantId !== null) {
      return {
        kind: "already_provisioned",
        storeId,
        tenantId: current.tenantId,
      };
    }

    if (
      current.status !== "activation_requested" &&
      current.status !== "provisioning"
    ) {
      try {
        current =
          await this.lifecycleService.requestActivationForOwnedStore(
            merchantId,
            storeId,
            now
          );
      } catch (error) {
        if (error instanceof StoreLifecycleServiceError) {
          throw new ActivationOrchestrationError(
            error.code,
            error.message
          );
        }
        throw error;
      }
    }

    const readiness =
      await this.readinessRepository.evaluateForOwnedStore(
        merchantId,
        storeId,
        now
      );

    if (!readiness) {
      throw new ActivationOrchestrationError(
        "STORE_NOT_FOUND",
        "Store not found"
      );
    }

    if (!readiness.ready) {
      if (current.status === "provisioning") {
        await this.recordFailureIfStillProvisioning(
          merchantId,
          storeId,
          "READINESS_REGRESSED",
          now
        );
      } else {
        await this.lifecycleRepository.syncReadinessForOwnedStore(
          merchantId,
          storeId,
          false,
          now
        );
      }

      throw new ActivationOrchestrationError(
        "STORE_NOT_READY",
        "Store readiness regressed before provisioning"
      );
    }

    if (current.status !== "provisioning") {
      current = await this.lifecycleService.startProvisioning(
        storeId,
        now
      );
    }

    if (current.status === "provisioned" && current.tenantId !== null) {
      return {
        kind: "already_provisioned",
        storeId,
        tenantId: current.tenantId,
      };
    }

    let context: ActivationProvisioningContext;
    try {
      context =
        await this.activationRepository.loadProvisioningContext(
          storeId
        );
    } catch (error) {
      const code = asSafeFailureCode(
        error,
        "TENANT_FINALIZATION_FAILED"
      );
      const completed = await this.recordFailureIfStillProvisioning(
        merchantId,
        storeId,
        code,
        now
      );
      if (completed) return completed;
      throw error;
    }

    try {
      await this.provisioner.provision(context);
    } catch {
      const completed = await this.recordFailureIfStillProvisioning(
        merchantId,
        storeId,
        "SCHEMA_PROVISIONING_FAILED",
        now
      );
      if (completed) return completed;

      throw new ActivationOrchestrationError(
        "SCHEMA_PROVISIONING_FAILED",
        "Tenant schema provisioning failed"
      );
    }

    try {
      const finalized =
        await this.activationRepository.finalizeProvisioning(
          context,
          now
        );

      this.registryCache.clear(finalized.slug);

      return {
        kind: "provisioned",
        storeId: finalized.storeId,
        tenantId: finalized.tenantId,
        slug: finalized.slug,
        schemaName: finalized.schemaName,
      };
    } catch (error) {
      const code = asSafeFailureCode(
        error,
        "TENANT_FINALIZATION_FAILED"
      );
      const completed = await this.recordFailureIfStillProvisioning(
        merchantId,
        storeId,
        code,
        now
      );
      if (completed) {
        this.registryCache.clear(context.slug);
        return completed;
      }
      throw error instanceof ActivationOrchestrationError
        ? error
        : new ActivationOrchestrationError(
            "TENANT_FINALIZATION_FAILED",
            "Tenant finalization failed"
          );
    }
  }

  private async recordFailureIfStillProvisioning(
    merchantId: number,
    storeId: number,
    errorCode: ActivationSafeErrorCode,
    now: Date
  ): Promise<ActivationResult | null> {
    const current =
      await this.lifecycleRepository.findForOwnedStore(
        merchantId,
        storeId
      );

    if (current?.status === "provisioned" && current.tenantId !== null) {
      return {
        kind: "already_provisioned",
        storeId,
        tenantId: current.tenantId,
      };
    }

    if (current?.status !== "provisioning") {
      return null;
    }

    await this.lifecycleService.markProvisioningFailed(
      storeId,
      errorCode,
      now
    );
    return null;
  }
}

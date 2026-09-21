import type { StoreReadinessRepository } from "@/lib/store-readiness/drizzle-repository";
import type { StoreReadinessResult } from "@/lib/store-readiness/core";
import type {
  StoreLifecycleRepository,
} from "./drizzle-repository";
import type { StoreLifecycleSnapshot } from "./core";

export class StoreLifecycleServiceError extends Error {
  constructor(
    readonly code: "STORE_NOT_FOUND" | "STORE_NOT_READY",
    readonly readiness?: StoreReadinessResult
  ) {
    super(
      code === "STORE_NOT_FOUND"
        ? "Store not found"
        : "Store is not ready for activation"
    );
    this.name = "StoreLifecycleServiceError";
  }
}

export class StoreLifecycleService {
  constructor(
    private readonly lifecycleRepository: StoreLifecycleRepository,
    private readonly readinessRepository: StoreReadinessRepository
  ) {}

  async refreshOwnedStoreReadiness(
    merchantId: number,
    storeId: number,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot | null> {
    const readiness =
      await this.readinessRepository.evaluateForOwnedStore(
        merchantId,
        storeId,
        now
      );

    if (!readiness) return null;

    return this.lifecycleRepository.syncReadinessForOwnedStore(
      merchantId,
      storeId,
      readiness.ready,
      now
    );
  }

  async requestActivationForOwnedStore(
    merchantId: number,
    storeId: number,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot> {
    const readiness =
      await this.readinessRepository.evaluateForOwnedStore(
        merchantId,
        storeId,
        now
      );

    if (!readiness) {
      throw new StoreLifecycleServiceError("STORE_NOT_FOUND");
    }

    await this.lifecycleRepository.syncReadinessForOwnedStore(
      merchantId,
      storeId,
      readiness.ready,
      now
    );

    if (!readiness.ready) {
      throw new StoreLifecycleServiceError(
        "STORE_NOT_READY",
        readiness
      );
    }

    const requested =
      await this.lifecycleRepository.requestActivationForOwnedStore(
        merchantId,
        storeId,
        now
      );

    if (!requested) {
      throw new StoreLifecycleServiceError("STORE_NOT_FOUND");
    }

    return requested;
  }

  startProvisioning(storeId: number, now = new Date()) {
    return this.lifecycleRepository.startProvisioning(storeId, now);
  }

  markProvisioningFailed(
    storeId: number,
    errorCode: string,
    now = new Date()
  ) {
    return this.lifecycleRepository.markProvisioningFailed(
      storeId,
      errorCode,
      now
    );
  }

  markProvisioned(
    storeId: number,
    tenantId: number,
    now = new Date()
  ) {
    return this.lifecycleRepository.markProvisioned(
      storeId,
      tenantId,
      now
    );
  }
}

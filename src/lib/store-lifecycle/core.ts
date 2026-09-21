export const STORE_LIFECYCLE_STATUSES = [
  "draft",
  "ready_for_provisioning",
  "activation_requested",
  "provisioning",
  "provisioning_failed",
  "provisioned",
] as const;

export type StoreLifecycleStatus =
  (typeof STORE_LIFECYCLE_STATUSES)[number];

const ALLOWED_STORE_TRANSITIONS: Record<
  StoreLifecycleStatus,
  readonly StoreLifecycleStatus[]
> = {
  draft: ["ready_for_provisioning"],
  ready_for_provisioning: ["draft", "activation_requested"],
  activation_requested: [
    "draft",
    "ready_for_provisioning",
    "provisioning",
  ],
  provisioning: ["provisioned", "provisioning_failed"],
  provisioning_failed: [
    "draft",
    "activation_requested",
    "ready_for_provisioning",
  ],
  provisioned: [],
};

const SAFE_PROVISIONING_ERROR_CODE = /^[A-Z0-9_]{1,64}$/;

export type StoreLifecycleSnapshot = {
  storeId: number;
  organizationId: number;
  status: StoreLifecycleStatus;
  tenantId: number | null;
  activationRequestedAt: Date | null;
  provisioningStartedAt: Date | null;
  provisionedAt: Date | null;
  lastProvisioningAttemptAt: Date | null;
  provisioningAttemptCount: number;
  lastProvisioningErrorCode: string | null;
  updatedAt: Date;
};

export type StoreLifecycleTransition =
  | { to: "draft" }
  | { to: "ready_for_provisioning" }
  | { to: "activation_requested" }
  | { to: "provisioning" }
  | { to: "provisioning_failed"; errorCode: string }
  | { to: "provisioned"; tenantId: number };

export function isStoreLifecycleStatus(
  value: unknown
): value is StoreLifecycleStatus {
  return (
    typeof value === "string" &&
    (STORE_LIFECYCLE_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransitionStore(
  from: StoreLifecycleStatus,
  to: StoreLifecycleStatus
) {
  return ALLOWED_STORE_TRANSITIONS[from].includes(to);
}

export class StoreLifecycleTransitionError extends Error {
  constructor(
    readonly from: StoreLifecycleStatus,
    readonly to: StoreLifecycleStatus
  ) {
    super(`Illegal Store lifecycle transition: ${from} -> ${to}`);
    this.name = "StoreLifecycleTransitionError";
  }
}

export class StoreLifecycleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreLifecycleInputError";
  }
}

export function assertStoreTransition(
  from: StoreLifecycleStatus,
  to: StoreLifecycleStatus
) {
  if (!canTransitionStore(from, to)) {
    throw new StoreLifecycleTransitionError(from, to);
  }
}

export function assertSafeProvisioningErrorCode(errorCode: string) {
  if (!SAFE_PROVISIONING_ERROR_CODE.test(errorCode)) {
    throw new StoreLifecycleInputError(
      "Provisioning error code must be a bounded machine-readable code"
    );
  }
}

export function assertTrustedTenantId(tenantId: number) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw new StoreLifecycleInputError("Trusted Tenant id must be positive");
  }
}

function nextLifecycleVersion(current: Date, now: Date) {
  return new Date(Math.max(now.getTime(), current.getTime() + 1));
}

export function applyStoreLifecycleTransition(
  current: StoreLifecycleSnapshot,
  transition: StoreLifecycleTransition,
  now = new Date()
): StoreLifecycleSnapshot {
  assertStoreTransition(current.status, transition.to);

  const next: StoreLifecycleSnapshot = {
    ...current,
    status: transition.to,
    updatedAt: nextLifecycleVersion(current.updatedAt, now),
  };

  switch (transition.to) {
    case "draft":
      return {
        ...next,
        activationRequestedAt: null,
        provisioningStartedAt: null,
        lastProvisioningErrorCode: null,
      };

    case "ready_for_provisioning":
      return {
        ...next,
        activationRequestedAt: null,
        provisioningStartedAt: null,
        lastProvisioningErrorCode: null,
      };

    case "activation_requested":
      return {
        ...next,
        activationRequestedAt: now,
        provisioningStartedAt: null,
        lastProvisioningErrorCode: null,
      };

    case "provisioning":
      return {
        ...next,
        provisioningStartedAt: now,
        lastProvisioningAttemptAt: now,
        provisioningAttemptCount: current.provisioningAttemptCount + 1,
        lastProvisioningErrorCode: null,
      };

    case "provisioning_failed":
      assertSafeProvisioningErrorCode(transition.errorCode);
      return {
        ...next,
        tenantId: null,
        provisionedAt: null,
        lastProvisioningErrorCode: transition.errorCode,
      };

    case "provisioned":
      assertTrustedTenantId(transition.tenantId);
      return {
        ...next,
        tenantId: transition.tenantId,
        provisionedAt: now,
        lastProvisioningErrorCode: null,
      };
  }
}

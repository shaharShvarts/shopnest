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
  activation_requested: ["ready_for_provisioning", "provisioning"],
  provisioning: ["provisioned", "provisioning_failed"],
  provisioning_failed: [
    "activation_requested",
    "ready_for_provisioning",
  ],
  provisioned: [],
};

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

export function assertStoreTransition(
  from: StoreLifecycleStatus,
  to: StoreLifecycleStatus
) {
  if (!canTransitionStore(from, to)) {
    throw new StoreLifecycleTransitionError(from, to);
  }
}

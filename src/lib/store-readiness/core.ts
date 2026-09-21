import type { StorePolicyType } from "../merchant-policies/core.ts";

export const READINESS_KEYS = [
  "store_profile",
  "shipping",
  "payments",
  "invoicing",
  "policies",
  "products",
  "subscription",
] as const;

export type ReadinessKey = (typeof READINESS_KEYS)[number];

export const READINESS_STATUSES = [
  "complete",
  "incomplete",
  "unavailable",
  "not_applicable",
] as const;

export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export type ReadinessReason =
  | "complete"
  | "organization_profile_incomplete"
  | "market_rules_unavailable"
  | "onboarding_not_implemented"
  | "subscription_missing"
  | "subscription_mismatch"
  | "subscription_state_invalid"
  | "subscription_plan_inactive"
  | "policies_missing";

export type ReadinessRequirement = {
  key: ReadinessKey;
  status: ReadinessStatus;
  blocking: boolean;
  reason: ReadinessReason;
  details?: string[];
};

export type StoreReadinessResult = {
  storeId: number;
  ready: boolean;
  evaluatedAt: Date;
  requirements: ReadinessRequirement[];
};

export type StoreProfileReadinessInput = {
  storeDisplayName: string;
  storeSlug: string;
  organizationDisplayName: string;
  legalName: string | null;
  businessNumber: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  country: string;
};

export function evaluateStoreProfile(
  input: StoreProfileReadinessInput
): ReadinessRequirement {
  const commonComplete =
    input.storeDisplayName.trim().length > 0 &&
    input.storeSlug.trim().length > 0 &&
    input.organizationDisplayName.trim().length > 0 &&
    /^[A-Z]{2}$/.test(input.country);

  if (!commonComplete) {
    return {
      key: "store_profile",
      status: "incomplete",
      blocking: true,
      reason: "organization_profile_incomplete",
    };
  }

  if (input.country !== "IL") {
    return {
      key: "store_profile",
      status: "unavailable",
      blocking: true,
      reason: "market_rules_unavailable",
    };
  }

  const hasBusinessIdentity =
    Boolean(input.businessNumber?.trim()) || Boolean(input.vatNumber?.trim());

  const israelComplete =
    Boolean(input.legalName?.trim()) &&
    hasBusinessIdentity &&
    Boolean(input.email?.trim()) &&
    Boolean(input.phone?.trim());

  return israelComplete
    ? {
        key: "store_profile",
        status: "complete",
        blocking: true,
        reason: "complete",
      }
    : {
        key: "store_profile",
        status: "incomplete",
        blocking: true,
        reason: "organization_profile_incomplete",
      };
}

export type SubscriptionReadinessInput = {
  storeId: number;
  organizationId: number;
  subscription:
    | {
        storeId: number | null;
        organizationId: number;
        tenantId: number | null;
        status:
          | "pending"
          | "trialing"
          | "active"
          | "past_due"
          | "cancelled"
          | "expired";
        planStatus: "active" | "inactive";
      }
    | null;
};

export function evaluateSubscription(
  input: SubscriptionReadinessInput
): ReadinessRequirement {
  const subscription = input.subscription;
  if (!subscription) {
    return {
      key: "subscription",
      status: "incomplete",
      blocking: true,
      reason: "subscription_missing",
    };
  }

  if (
    subscription.storeId !== input.storeId ||
    subscription.organizationId !== input.organizationId ||
    subscription.tenantId !== null
  ) {
    return {
      key: "subscription",
      status: "unavailable",
      blocking: true,
      reason: "subscription_mismatch",
    };
  }

  if (!["pending", "trialing", "active"].includes(subscription.status)) {
    return {
      key: "subscription",
      status: "incomplete",
      blocking: true,
      reason: "subscription_state_invalid",
    };
  }

  if (subscription.planStatus !== "active") {
    return {
      key: "subscription",
      status: "incomplete",
      blocking: true,
      reason: "subscription_plan_inactive",
    };
  }

  return {
    key: "subscription",
    status: "complete",
    blocking: true,
    reason: "complete",
  };
}

export function evaluatePolicies(
  requiredPolicyTypes: readonly StorePolicyType[] | null,
  publishedPolicyTypes: ReadonlySet<StorePolicyType>
): ReadinessRequirement {
  if (requiredPolicyTypes === null) {
    return {
      key: "policies",
      status: "unavailable",
      blocking: true,
      reason: "market_rules_unavailable",
    };
  }

  const missing = requiredPolicyTypes.filter(
    (policyType) => !publishedPolicyTypes.has(policyType)
  );

  return missing.length === 0
    ? {
        key: "policies",
        status: "complete",
        blocking: true,
        reason: "complete",
      }
    : {
        key: "policies",
        status: "incomplete",
        blocking: true,
        reason: "policies_missing",
        details: [...missing],
      };
}

export function unavailableRequirement(key: ReadinessKey): ReadinessRequirement {
  return {
    key,
    status: "unavailable",
    blocking: true,
    reason: "onboarding_not_implemented",
  };
}

export function buildStoreReadinessResult(
  storeId: number,
  requirements: ReadinessRequirement[],
  evaluatedAt = new Date()
): StoreReadinessResult {
  const byKey = new Map(requirements.map((requirement) => [requirement.key, requirement]));
  const ordered = READINESS_KEYS.map(
    (key) => byKey.get(key) ?? unavailableRequirement(key)
  );

  return {
    storeId,
    ready: ordered.every(
      (requirement) =>
        !requirement.blocking ||
        requirement.status === "complete" ||
        requirement.status === "not_applicable"
    ),
    evaluatedAt,
    requirements: ordered,
  };
}

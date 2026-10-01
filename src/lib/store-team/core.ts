import { normalizeAdminEmail } from "../admin-auth/core.ts";

export const STORE_MANAGERS_ENTITLEMENT = "store_managers";

export type StoreManager = {
  adminUserId: number;
  email: string;
  isActive: boolean;
  createdAt: Date;
};

export type StoreManagerQuota = {
  used: number;
  limit: number;
  unlimited: boolean;
  remaining: number | null;
};

export type StoreTeamErrorCode =
  | "MANAGER_LIMIT_REACHED"
  | "MANAGER_NOT_FOUND"
  | "MANAGER_ALREADY_ASSIGNED"
  | "MANAGER_ACCOUNT_UNAVAILABLE"
  | "INVALID_MANAGER_ACCOUNT";

export class StoreTeamError extends Error {
  constructor(
    public readonly code: StoreTeamErrorCode,
    message: string
  ) {
    super(message);
    this.name = "StoreTeamError";
  }
}

export function storeManagerQuota(used: number, limit: number): StoreManagerQuota {
  if (!Number.isSafeInteger(used) || used < 0) {
    throw new Error("Manager usage must be a non-negative integer");
  }
  if (!Number.isSafeInteger(limit) || limit < -1) {
    throw new Error("Manager limit must be -1 or a non-negative integer");
  }

  const unlimited = limit === -1;
  return {
    used,
    limit,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - used),
  };
}

export function assertManagerCapacity(used: number, limit: number) {
  const quota = storeManagerQuota(used, limit);
  if (!quota.unlimited && quota.used >= quota.limit) {
    throw new StoreTeamError(
      "MANAGER_LIMIT_REACHED",
      "Store Manager limit reached"
    );
  }
  return quota;
}

export function normalizeManagerEmail(email: string) {
  const normalized = normalizeAdminEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 320) {
    throw new StoreTeamError(
      "INVALID_MANAGER_ACCOUNT",
      "Invalid Manager email"
    );
  }
  return normalized;
}

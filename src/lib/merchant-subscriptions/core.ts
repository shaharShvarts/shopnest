import { z } from "zod";
import {
  planStatuses,
  subscriptionStatuses,
  type PlanStatus,
  type SubscriptionStatus,
} from "../../drizzle/control-schema/shared.ts";

export { planStatuses, subscriptionStatuses };
export type { PlanStatus, SubscriptionStatus };

export const planSelectionSchema = z
  .object({
    planCode: z.string().trim().min(1).max(64),
  })
  .strip();

export type PlanSelection = z.infer<typeof planSelectionSchema>;

export type MerchantPlan = {
  id: number;
  code: string;
  name: string;
  status: PlanStatus;
};

export type MerchantStoreSubscription = {
  id: number;
  organizationId: number;
  storeId: number | null;
  tenantId: number | null;
  planId: number;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  plan: MerchantPlan;
};

export function parsePlanSelection(input: unknown): PlanSelection {
  const parsed = planSelectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new MerchantSubscriptionError(
      "INVALID_PLAN",
      "Invalid plan selection"
    );
  }
  return parsed.data;
}

export type MerchantSubscriptionErrorCode =
  | "INVALID_PLAN"
  | "PLAN_UNAVAILABLE"
  | "STORE_NOT_FOUND"
  | "STORE_PROVISIONED"
  | "OWNERSHIP_MISMATCH";

export class MerchantSubscriptionError extends Error {
  constructor(
    readonly code: MerchantSubscriptionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MerchantSubscriptionError";
  }
}

export interface MerchantSubscriptionRepository {
  listActivePlans(): Promise<MerchantPlan[]>;
  findForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<MerchantStoreSubscription | null>;
  selectPlanForOwnedStore(
    merchantId: number,
    storeId: number,
    selection: PlanSelection,
    now?: Date
  ): Promise<MerchantStoreSubscription>;
}

import { z } from "zod";

export const billingIntervals = ["monthly", "annual"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

export const platformBillingStatuses = [
  "created",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "review_required",
] as const;
export type PlatformBillingStatus = (typeof platformBillingStatuses)[number];

const platformBillingSelectionSchema = z
  .object({
    billingInterval: z.enum(billingIntervals),
  })
  .strip();

export type PlatformBillingSelection = z.infer<
  typeof platformBillingSelectionSchema
>;

export function parsePlatformBillingSelection(
  input: unknown
): PlatformBillingSelection {
  return platformBillingSelectionSchema.parse(input);
}

export type PlatformBillingCreateCheckoutInput = {
  attemptId: number;
  externalReference: string;
  amountMinor: number;
  currency: string;
  billingInterval: BillingInterval;
};

export type PlatformBillingCreateCheckoutResult = {
  providerReference: string;
  redirectUrl: string;
  amountMinor: number;
  currency: string;
};

export type PlatformBillingVerifyInput = {
  providerReference: string;
  expectedAmountMinor: number;
  expectedCurrency: string;
};

export type PlatformBillingVerifyResult = {
  providerReference: string;
  status: Exclude<PlatformBillingStatus, "created" | "pending"> | "pending";
  amountMinor: number;
  currency: string;
};

export interface PlatformBillingProvider {
  readonly id: string;
  createCheckout(
    input: PlatformBillingCreateCheckoutInput
  ): Promise<PlatformBillingCreateCheckoutResult>;
  verifyResult(
    input: PlatformBillingVerifyInput
  ): Promise<PlatformBillingVerifyResult>;
}


export type PlatformBillingAttempt = {
  id: number;
  subscriptionId: number;
  organizationId: number;
  storeId: number;
  planId: number;
  planCodeSnapshot: string;
  planNameSnapshot: string;
  billingInterval: BillingInterval;
  currency: string;
  amountMinor: number;
  status: PlatformBillingStatus;
  provider: string | null;
  providerReference: string | null;
  externalReference: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PlatformBillingErrorCode =
  | "STORE_NOT_FOUND"
  | "SUBSCRIPTION_NOT_FOUND"
  | "SUBSCRIPTION_NOT_BILLABLE"
  | "PRICE_NOT_CONFIGURED"
  | "OWNERSHIP_MISMATCH";

export class PlatformBillingError extends Error {
  readonly code: PlatformBillingErrorCode;

  constructor(code: PlatformBillingErrorCode, message: string) {
    super(message);
    this.name = "PlatformBillingError";
    this.code = code;
  }
}

export interface PlatformBillingRepository {
  createOrReuseAttemptForOwnedStore(
    merchantId: number,
    storeId: number,
    selection: PlatformBillingSelection,
    now?: Date
  ): Promise<PlatformBillingAttempt>;
}

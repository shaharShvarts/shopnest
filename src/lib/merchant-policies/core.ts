import { z } from "zod";

export const STORE_POLICY_TYPES = [
  "returns_refunds_cancellation",
  "privacy",
  "terms",
  "shipping_delivery",
  "cookie_tracking",
] as const;

export type StorePolicyType = (typeof STORE_POLICY_TYPES)[number];
export type StorePolicyStatus = "draft" | "published";

export function isStorePolicyType(value: string): value is StorePolicyType {
  return (STORE_POLICY_TYPES as readonly string[]).includes(value);
}

const REQUIRED_POLICY_TYPES_BY_MARKET: Record<
  string,
  readonly StorePolicyType[]
> = {
  IL: [
    "returns_refunds_cancellation",
    "privacy",
    "terms",
    "shipping_delivery",
  ],
};

export function requiredPolicyTypesForMarket(
  market: string
): readonly StorePolicyType[] | null {
  return REQUIRED_POLICY_TYPES_BY_MARKET[market.toUpperCase()] ?? null;
}

export const policyDocumentInputSchema = z
  .object({
    policyType: z.enum(STORE_POLICY_TYPES),
    title: z.string().trim().min(3).max(200),
    content: z.string().trim().min(80).max(100_000),
  })
  .strip();

export type PolicyDocumentInput = z.infer<typeof policyDocumentInputSchema>;

export type MerchantPolicyDocument = {
  id: number;
  organizationId: number;
  storeId: number;
  market: string;
  policyType: StorePolicyType;
  version: number;
  title: string;
  content: string;
  status: StorePolicyStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantPolicyWorkspace = {
  storeId: number;
  organizationId: number;
  market: string;
  requiredPolicyTypes: readonly StorePolicyType[] | null;
  documents: MerchantPolicyDocument[];
};

export type MerchantPolicyErrorCode =
  | "STORE_NOT_FOUND"
  | "POLICY_INVALID"
  | "POLICY_TYPE_UNSUPPORTED";

export class MerchantPolicyError extends Error {
  constructor(
    readonly code: MerchantPolicyErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MerchantPolicyError";
  }
}

export function parsePolicyDocumentInput(input: unknown): PolicyDocumentInput {
  const parsed = policyDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new MerchantPolicyError("POLICY_INVALID", "Invalid policy document");
  }
  return parsed.data;
}

export interface MerchantPolicyRepository {
  getWorkspaceForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<MerchantPolicyWorkspace | null>;

  saveDraftForOwnedStore(
    merchantId: number,
    storeId: number,
    input: PolicyDocumentInput,
    now?: Date
  ): Promise<MerchantPolicyDocument>;

  publishForOwnedStore(
    merchantId: number,
    storeId: number,
    input: PolicyDocumentInput,
    now?: Date
  ): Promise<MerchantPolicyDocument>;
}

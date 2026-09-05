export const providerIds = ["cardcom", "pelecard", "tranzila"] as const;
export type ProviderId = (typeof providerIds)[number];
export type PaymentEnvironment = "test" | "production";
export const paymentStatuses = [
  "created",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "review_required",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export class PaymentError extends Error {
  readonly code: string;
  constructor(code: string) {
    // Codes only: never include credentials, provider messages or request bodies.
    super(code);
    this.code = code;
    this.name = "PaymentError";
  }
}

export type PaymentSettings = {
  provider: ProviderId;
  environment: PaymentEnvironment;
  enabled: boolean;
  encryptedCredentials: string;
  configuredFields: string[];
};

export type PaymentOrder = {
  id: number;
  amount: number; // Existing ShopNest integer major currency units, NOT cents.
  currency: string;
  paymentStatus: "pending" | "paid";
  payable: boolean;
  ownerKey: string;
  cartId: string;
  checkoutToken: string;
  items: Array<{ productId: number; quantity: number }>;
};

export type PaymentAttempt = {
  id: string;
  orderId: number;
  provider: ProviderId;
  environment: PaymentEnvironment;
  encryptedCredentials: string;
  amount: number;
  currency: string;
  externalReference: string;
  providerTransactionId: string | null;
  redirectUrl: string | null;
  status: PaymentStatus;
  failureCode: string | null;
  confirmedAt: Date | null;
};

export type VerifiedPayment = {
  provider: ProviderId;
  externalReference: string;
  providerTransactionId: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
};

export type PaymentRequest = {
  externalReference: string;
  amount: number;
  currency: string;
  callbackUrl: string;
  returnUrl: string;
};

export interface PaymentProvider {
  createPayment(
    input: PaymentRequest,
  ): Promise<{ providerTransactionId: string; redirectUrl: string }>;
  // Must authenticate with the provider/signature. Browser navigation is never evidence.
  verifyCallback(input: {
    body: string;
    headers: Headers;
    attempt: PaymentAttempt;
  }): Promise<VerifiedPayment>;
  getPaymentStatus(attempt: PaymentAttempt): Promise<VerifiedPayment>;
  testConnection?(): Promise<boolean>;
}

export type ProviderField = {
  id: string;
  label: string;
  type: "text" | "password";
  secret: boolean;
  maxLength: number;
};
export type ProviderMetadata = {
  id: ProviderId;
  displayName: string;
  environments: readonly PaymentEnvironment[];
  fields: readonly ProviderField[];
  live: boolean;
  capabilities: {
    hostedPayment: boolean;
    verification: boolean;
    testConnection: boolean;
  };
};

export type PaymentResult = {
  status: PaymentStatus;
  redirectUrl: string | null;
};

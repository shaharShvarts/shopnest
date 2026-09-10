import type { PaymentEnvironment, ProviderMetadata } from "./types.ts";

// Shared display/server policy. Production still requires an explicitly live adapter.
export function paymentActivationAllowed(provider: ProviderMetadata, environment: PaymentEnvironment): boolean {
  return provider.environments.includes(environment) &&
    provider.capabilities.hostedPayment && provider.capabilities.verification &&
    (environment === "production" ? provider.live : provider.testPayments === true);
}

import { PaymentError, type PaymentProvider } from "../types.ts";

// Deliberately no network calls or simulated success. Not registered as live.
export function unavailableProvider(): PaymentProvider {
  const unavailable = async (): Promise<never> => {
    throw new PaymentError("not_implemented");
  };
  return {
    createPayment: unavailable,
    verifyCallback: unavailable,
    getPaymentStatus: unavailable,
  };
}

import type { PaymentResult } from "./types.ts";

export function checkoutPaymentMessage(payment: PaymentResult | undefined) {
  if (payment?.status === "paid") return "statuses.paid";
  if (payment?.redirectUrl) return "continueExplanation";
  return "paymentUnavailable";
}

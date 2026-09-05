import { randomUUID } from "node:crypto";
import {
  PaymentError,
  type PaymentAttempt,
  type PaymentProvider,
  type PaymentResult,
  type PaymentSettings,
  type PaymentStatus,
  type VerifiedPayment,
} from "./types.ts";
import type { PaymentStore } from "./store.ts";

export type AdapterResolver = (
  settings: Pick<
    PaymentSettings,
    "provider" | "environment" | "encryptedCredentials"
  >,
) => PaymentProvider;
const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: [
    "pending",
    "paid",
    "failed",
    "cancelled",
    "expired",
    "review_required",
  ],
  pending: ["paid", "failed", "cancelled", "expired", "review_required"],
  failed: ["review_required"],
  cancelled: ["review_required"],
  expired: ["review_required"],
  paid: [],
  review_required: [],
};
export function transitionPayment(
  current: PaymentStatus,
  next: PaymentStatus,
): PaymentStatus {
  if (current === next || current === "paid" || current === "review_required")
    return current;
  if (!transitions[current].includes(next))
    throw new PaymentError("invalid_transition");
  return next;
}

function paymentResult(attempt: PaymentAttempt): PaymentResult {
  return {
    status: attempt.status,
    redirectUrl: attempt.status === "pending" ? attempt.redirectUrl : null,
  };
}
function assertMoney(amount: number, currency: string) {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !/^[A-Z]{3}$/.test(currency)
  )
    throw new PaymentError("invalid_amount");
}

export async function startPayment(
  store: PaymentStore,
  input: {
    orderId: number;
    ownerKey: string;
    publicOrigin: string;
    basePath: string;
  },
  adapterFor: AdapterResolver,
): Promise<PaymentResult> {
  const id = randomUUID();
  const attempt = await store.transaction(async (tx) => {
    const order = await tx.lockOrder(input.orderId);
    if (!order || order.ownerKey !== input.ownerKey)
      throw new PaymentError("order_not_found");
    const existing = await tx.findAttemptForOrder(order.id);
    if (existing) return existing;
    if (!order.payable || order.paymentStatus !== "pending")
      throw new PaymentError("order_not_payable");
    assertMoney(order.amount, order.currency);
    const settings = await tx.getSettings();
    if (!settings) throw new PaymentError("not_configured");
    if (!settings.enabled) throw new PaymentError("disabled");
    // Validate implementation/encryption before persisting a new attempt.
    adapterFor(settings);
    if (!(await tx.reservationValid(order)))
      throw new PaymentError("reservation_expired");
    const record: PaymentAttempt = {
      id,
      orderId: order.id,
      provider: settings.provider,
      environment: settings.environment,
      encryptedCredentials: settings.encryptedCredentials,
      amount: order.amount,
      currency: order.currency,
      externalReference: `${store.tenant}:${id}`,
      providerTransactionId: null,
      redirectUrl: null,
      status: "created",
      failureCode: null,
      confirmedAt: null,
    };
    await tx.insertAttempt(record);
    return record;
  });
  // The durable claim prevents duplicate provider calls, including after a crash.
  // An ambiguous/created attempt is reconciled, never automatically recreated.
  if (attempt.id !== id) return paymentResult(attempt);

  let created: { providerTransactionId: string; redirectUrl: string };
  try {
    const callbackUrl = new URL(
      `${input.basePath}/api/payments/${id}/callback`,
      input.publicOrigin,
    ).toString();
    const returnUrl = new URL(
      `${input.basePath}/checkout/payment/${id}`,
      input.publicOrigin,
    ).toString();
    created = await adapterFor(attempt).createPayment({
      externalReference: attempt.externalReference,
      amount: attempt.amount,
      currency: attempt.currency,
      callbackUrl,
      returnUrl,
    });
    const url = new URL(created.redirectUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !created.providerTransactionId ||
      created.providerTransactionId.length > 200
    )
      throw new PaymentError("invalid_provider_result");
  } catch {
    await store.transaction(async (tx) => {
      await tx.lockOrder(attempt.orderId);
      const current = await tx.getAttempt(id);
      if (current?.status === "created")
        await tx.updateAttempt({
          ...current,
          failureCode: "creation_unconfirmed",
        });
    });
    throw new PaymentError("creation_unconfirmed");
  }
  return store.transaction(async (tx) => {
    await tx.lockOrder(attempt.orderId);
    const current = await tx.getAttempt(id);
    if (!current) throw new PaymentError("payment_not_found");
    const updated = {
      ...current,
      ...created,
      status: transitionPayment(current.status, "pending"),
    };
    await tx.updateAttempt(updated);
    return paymentResult(updated);
  });
}

function verifyBinding(attempt: PaymentAttempt, evidence: VerifiedPayment) {
  if (
    !evidence ||
    evidence.provider !== attempt.provider ||
    evidence.externalReference !== attempt.externalReference ||
    !attempt.providerTransactionId ||
    evidence.providerTransactionId !== attempt.providerTransactionId ||
    evidence.amount !== attempt.amount ||
    evidence.currency !== attempt.currency ||
    !["pending", "paid", "failed", "cancelled", "expired"].includes(
      evidence.status,
    )
  ) {
    throw new PaymentError("invalid_confirmation");
  }
}

// No caller can pass "verified=true" or an authoritative payment status.
// Only an adapter's authenticated verification operation creates evidence.
export async function confirmPayment(
  store: PaymentStore,
  id: string,
  callback: { body: string; headers: Headers },
  adapterFor: AdapterResolver,
): Promise<PaymentStatus> {
  const attempt = await store.getAttempt(id);
  if (!attempt) throw new PaymentError("payment_not_found");
  const evidence = await adapterFor(attempt).verifyCallback({
    ...callback,
    attempt,
  });
  verifyBinding(attempt, evidence);
  return store.transaction(async (tx) => {
    const order = await tx.lockOrder(attempt.orderId);
    const current = await tx.getAttempt(id);
    if (
      !order ||
      !current ||
      current.orderId !== order.id ||
      current.amount !== order.amount ||
      current.currency !== order.currency
    )
      throw new PaymentError("invalid_confirmation");
    verifyBinding(current, evidence);
    if (current.status === "paid" || current.status === "review_required")
      return current.status;
    if (evidence.status === "pending") return current.status;
    if (evidence.status === "paid") {
      // Late verified funds are recorded for reconciliation; never oversell or
      // silently claim fulfilment after a released/expired hold.
      const ready =
        ["created", "pending"].includes(current.status) &&
        order.payable &&
        order.paymentStatus === "pending" &&
        (await tx.reservationValid(order));
      if (!ready) {
        await tx.updateAttempt({
          ...current,
          status: transitionPayment(current.status, "review_required"),
          confirmedAt: new Date(),
          failureCode: "reservation_review_required",
        });
        return "review_required";
      }
      await tx.consumeInventory(order);
      await tx.markOrderPaid(order.id, current.provider);
      await tx.updateAttempt({
        ...current,
        status: transitionPayment(current.status, "paid"),
        confirmedAt: new Date(),
        failureCode: null,
      });
      return "paid";
    }
    // Stale failure/cancellation cannot overwrite another terminal outcome.
    if (!["created", "pending"].includes(current.status)) return current.status;
    await tx.releaseInventory(order);
    const status = transitionPayment(current.status, evidence.status);
    await tx.updateAttempt({
      ...current,
      status,
      failureCode: evidence.status,
    });
    return status;
  });
}

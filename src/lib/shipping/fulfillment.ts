import type { FulfillmentStatus } from "@/drizzle/schema/order";

export const trackingNumberMaxLength = 160;

export type FulfillmentRecord = {
  fulfillmentStatus: FulfillmentStatus;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  readyForPickupAt: Date | null;
  pickedUpAt: Date | null;
};

export function buildFulfillmentUpdate(
  order: FulfillmentRecord,
  input: { status: FulfillmentStatus; trackingNumber?: string | null },
  now = new Date()
) {
  const trackingNumber = input.trackingNumber?.trim() || null;

  if (trackingNumber && trackingNumber.length > trackingNumberMaxLength) {
    throw new Error("Tracking number is too long.");
  }

  return {
    fulfillmentStatus: input.status,
    trackingNumber,
    shippedAt:
      input.status === "shipped" ? order.shippedAt ?? now : order.shippedAt,
    deliveredAt:
      input.status === "delivered"
        ? order.deliveredAt ?? now
        : order.deliveredAt,
    readyForPickupAt:
      input.status === "ready_for_pickup"
        ? order.readyForPickupAt ?? now
        : order.readyForPickupAt,
    pickedUpAt:
      input.status === "picked_up"
        ? order.pickedUpAt ?? now
        : order.pickedUpAt,
  };
}

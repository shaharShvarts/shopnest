import type {
  FulfillmentStatus,
} from "@/drizzle/schema/order";
import type { ShippingMethodType } from "@/drizzle/schema/shippingMethod";

export const trackingNumberMaxLength = 160;

export type FulfillmentRecord = {
  shippingMethodType: ShippingMethodType | null;
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
  const pickup = order.shippingMethodType === "store_pickup";
  if (pickup && (input.status === "shipped" || input.status === "delivered")) {
    throw new Error("Store pickup orders cannot use delivery fulfillment states.");
  }
  if (
    !pickup &&
    (input.status === "ready_for_pickup" || input.status === "picked_up")
  ) {
    throw new Error("Delivery orders cannot use store-pickup fulfillment states.");
  }
  if (pickup && trackingNumber) {
    throw new Error("Store pickup orders do not use tracking numbers.");
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

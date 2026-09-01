import type { ShippingMethodType } from "@/drizzle/schema/shippingMethod";

export type ShippingMethod = {
  id: number;
  name: string;
  code: string;
  type: ShippingMethodType;
  isActive: boolean;
  price: number;
  freeShippingThreshold: number | null;
  sortOrder: number;
};

export type ShippingQuote = ShippingMethod & {
  shippingPrice: number;
  freeShippingThresholdApplied: boolean;
};

export interface ShippingMethodStore {
  listActive(): Promise<ShippingMethod[]>;
  findActiveById(id: number): Promise<ShippingMethod | null>;
}

export class ShippingError extends Error {
  readonly code:
    | "invalid_subtotal"
    | "invalid_shipping_method"
    | "inactive_shipping_method"
    | "invalid_shipping_configuration";

  constructor(
    code:
      | "invalid_subtotal"
      | "invalid_shipping_method"
      | "inactive_shipping_method"
      | "invalid_shipping_configuration",
    message: string
  ) {
    super(message);
    this.name = "ShippingError";
    this.code = code;
  }
}

export function calculateShippingPrice(
  method: ShippingMethod,
  itemsSubtotal: number
): Pick<ShippingQuote, "shippingPrice" | "freeShippingThresholdApplied"> {
  assertSafeMoney(itemsSubtotal, "Cart subtotal");
  assertSafeMoney(method.price, "Shipping price");
  if (
    method.freeShippingThreshold !== null &&
    (!Number.isSafeInteger(method.freeShippingThreshold) ||
      method.freeShippingThreshold < 0)
  ) {
    throw new ShippingError(
      "invalid_shipping_configuration",
      "Shipping threshold must be a non-negative whole number."
    );
  }
  if (!method.isActive) {
    throw new ShippingError(
      "inactive_shipping_method",
      "The selected shipping method is not available."
    );
  }

  const thresholdApplied =
    method.price > 0 &&
    method.freeShippingThreshold !== null &&
    itemsSubtotal >= method.freeShippingThreshold;
  return {
    shippingPrice: thresholdApplied ? 0 : method.price,
    freeShippingThresholdApplied: thresholdApplied,
  };
}

export async function listAvailableShippingMethods(
  store: ShippingMethodStore,
  itemsSubtotal: number
): Promise<ShippingQuote[]> {
  const methods = await store.listActive();
  return methods.map((method) => ({
    ...method,
    ...calculateShippingPrice(method, itemsSubtotal),
  }));
}

export async function validateSelectedShippingMethod(
  store: ShippingMethodStore,
  shippingMethodId: number,
  itemsSubtotal: number
): Promise<ShippingQuote> {
  if (!Number.isSafeInteger(shippingMethodId) || shippingMethodId <= 0) {
    throw new ShippingError(
      "invalid_shipping_method",
      "A valid shipping method is required."
    );
  }
  const method = await store.findActiveById(shippingMethodId);
  if (!method) {
    throw new ShippingError(
      "invalid_shipping_method",
      "The selected shipping method is not available."
    );
  }
  return { ...method, ...calculateShippingPrice(method, itemsSubtotal) };
}

function assertSafeMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ShippingError(
      "invalid_subtotal",
      `${label} must be a non-negative whole number.`
    );
  }
}

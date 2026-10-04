export type ShippingMethod = {
  id: number;
  name: string;
  isActive: boolean;
  price: number;
  requiresAddress: boolean;
  sortOrder: number;
  logoUrl: string | null;
};

export type ShippingQuote = ShippingMethod & {
  shippingPrice: number;
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
): Pick<ShippingQuote, "shippingPrice"> {
  assertSafeMoney(itemsSubtotal, "Cart subtotal");
  assertSafeMoney(method.price, "Shipping price");

  if (!method.isActive) {
    throw new ShippingError(
      "inactive_shipping_method",
      "The selected shipping method is not available."
    );
  }

  return {
    shippingPrice: method.price,
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

  return {
    ...method,
    ...calculateShippingPrice(method, itemsSubtotal),
  };
}

function assertSafeMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ShippingError(
      "invalid_subtotal",
      `${label} must be a non-negative whole number.`
    );
  }
}

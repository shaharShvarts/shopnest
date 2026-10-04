import type { ShippingQuote } from "./core";

export type CheckoutShippingSelection = {
  method: ShippingQuote | null;
  shippingTotal: number;
  totalPrice: number;
  requiresAddress: boolean;
  addressHeading: "Contact details" | "Shipping Address";
};

export function getDefaultShippingMethodId(methods: ShippingQuote[]) {
  return methods[0]?.id ?? null;
}

export function getCheckoutShippingSelection(
  methods: ShippingQuote[],
  selectedMethodId: number | null,
  itemsSubtotal: number
): CheckoutShippingSelection {
  const method =
    methods.find((candidate) => candidate.id === selectedMethodId) ?? null;
  const shippingTotal = method?.shippingPrice ?? 0;
  const requiresAddress = method?.requiresAddress ?? false;

  return {
    method,
    shippingTotal,
    totalPrice: itemsSubtotal + shippingTotal,
    requiresAddress,
    addressHeading: requiresAddress ? "Shipping Address" : "Contact details",
  };
}

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

  return {
    method,
    shippingTotal,
    totalPrice: itemsSubtotal + shippingTotal,
    requiresAddress: method?.type === "home_delivery",
    addressHeading:
      method?.type === "store_pickup"
        ? "Contact details"
        : "Shipping Address",
  };
}

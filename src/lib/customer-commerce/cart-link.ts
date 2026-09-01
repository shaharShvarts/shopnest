export type CartQuantity = { productId: number; quantity: number };
export type CartQuantityAdjustment = {
  productId: number;
  requested: number;
  reserved: number;
};

export type CartLinkResult = {
  kind: "none" | "transferred" | "merged";
  adjustments: CartQuantityAdjustment[];
};

export interface CustomerCartLinkStore {
  linkGuestCart(input: {
    customerId: number;
    guestSessionId: string;
  }): Promise<CartLinkResult>;
}

export function linkGuestCartToCustomer(
  store: CustomerCartLinkStore,
  input: { customerId: number; guestSessionId: string | null | undefined }
) {
  if (!input.guestSessionId?.trim()) {
    return Promise.resolve<CartLinkResult>({ kind: "none", adjustments: [] });
  }
  if (!Number.isSafeInteger(input.customerId) || input.customerId <= 0) {
    throw new Error("A valid customer is required to link a cart.");
  }
  return store.linkGuestCart({
    customerId: input.customerId,
    guestSessionId: input.guestSessionId,
  });
}

export function mergeCartQuantities(
  guest: CartQuantity[],
  account: CartQuantity[],
  availableByProduct: Map<number, number>
) {
  const requested = new Map<number, number>();
  for (const item of [...account, ...guest]) {
    requested.set(
      item.productId,
      (requested.get(item.productId) ?? 0) + item.quantity
    );
  }

  const items: CartQuantity[] = [];
  const adjustments: CartQuantityAdjustment[] = [];
  for (const [productId, quantity] of [...requested].sort(
    ([left], [right]) => left - right
  )) {
    const reserved = Math.max(
      0,
      Math.min(quantity, availableByProduct.get(productId) ?? 0)
    );
    if (reserved > 0) items.push({ productId, quantity: reserved });
    if (reserved !== quantity) {
      adjustments.push({ productId, requested: quantity, reserved });
    }
  }
  return { items, adjustments };
}

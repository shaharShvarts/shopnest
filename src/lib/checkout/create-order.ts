export type CheckoutIdentity = {
  userId: number | null;
  sessionId: string | null;
};

export type CheckoutDetails = {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  shippingMethod: string;
  shippingAddress: string;
  billingAddress: string;
};

export type CheckoutResult = {
  orderId: number;
  orderNumber: string;
  totalPrice: number;
};

export type CheckoutCart = {
  id: string;
  currency: string;
};

export type CheckoutCartItem = {
  productId: number;
  quantity: number;
  price: number | null;
};

export type NewCheckoutOrder = CheckoutIdentity &
  CheckoutDetails & {
    cartId: string;
    checkoutToken: string;
    orderNumber: string;
    numberOfItems: number;
    currency: string;
    totalPrice: number;
  };

export type NewCheckoutOrderProduct = {
  orderId: number;
  productId: number;
  quantity: number;
  priceAtPurchase: number;
};

export interface CheckoutTransaction {
  lockSubmission(checkoutToken: string): Promise<void>;
  findOrderByCheckoutToken(
    checkoutToken: string,
    identity: CheckoutIdentity
  ): Promise<CheckoutResult | null>;
  lockActiveCart(identity: CheckoutIdentity): Promise<CheckoutCart | null>;
  getCartItems(cartId: string): Promise<CheckoutCartItem[]>;
  createOrder(
    order: NewCheckoutOrder
  ): Promise<{ id: number; orderNumber: string }>;
  createOrderProducts(items: NewCheckoutOrderProduct[]): Promise<void>;
  deactivateCart(cartId: string): Promise<boolean>;
}

export interface CheckoutStore {
  transaction<T>(callback: (tx: CheckoutTransaction) => Promise<T>): Promise<T>;
}

export type CheckoutErrorCode =
  | "missing_identity"
  | "no_active_cart"
  | "empty_cart"
  | "missing_product"
  | "invalid_cart_item"
  | "cart_changed";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;

  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

export async function createCheckoutOrder(
  store: CheckoutStore,
  identity: CheckoutIdentity,
  details: CheckoutDetails,
  checkoutToken: string,
  createOrderNumber: () => string
): Promise<CheckoutResult> {
  if (!identity.userId && !identity.sessionId) {
    throw new CheckoutError(
      "missing_identity",
      "A user or cart session is required to check out."
    );
  }

  return store.transaction(async (tx) => {
    await tx.lockSubmission(checkoutToken);

    const existingOrder = await tx.findOrderByCheckoutToken(
      checkoutToken,
      identity
    );
    if (existingOrder) return existingOrder;

    const cart = await tx.lockActiveCart(identity);
    if (!cart) {
      throw new CheckoutError("no_active_cart", "No active cart was found.");
    }

    const cartItems = await tx.getCartItems(cart.id);
    if (cartItems.length === 0) {
      throw new CheckoutError("empty_cart", "The active cart is empty.");
    }

    if (cartItems.some((item) => item.price === null)) {
      throw new CheckoutError(
        "missing_product",
        "A product in the cart is no longer available."
      );
    }

    if (
      cartItems.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isInteger(item.price) ||
          item.price! < 0
      )
    ) {
      throw new CheckoutError(
        "invalid_cart_item",
        "The cart contains an invalid item."
      );
    }

    const numberOfItems = cartItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const totalPrice = cartItems.reduce(
      (sum, item) => sum + item.price! * item.quantity,
      0
    );

    if (!Number.isSafeInteger(totalPrice)) {
      throw new CheckoutError(
        "invalid_cart_item",
        "The cart total is outside the supported range."
      );
    }

    const order = await tx.createOrder({
      ...identity,
      ...details,
      cartId: cart.id,
      checkoutToken,
      orderNumber: createOrderNumber(),
      numberOfItems,
      currency: cart.currency,
      totalPrice,
    });

    await tx.createOrderProducts(
      cartItems.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        priceAtPurchase: item.price!,
      }))
    );

    if (!(await tx.deactivateCart(cart.id))) {
      throw new CheckoutError(
        "cart_changed",
        "The cart changed while the order was being created."
      );
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalPrice,
    };
  });
}

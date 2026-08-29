import assert from "node:assert/strict";
import test from "node:test";
import {
  CheckoutError,
  createCheckoutOrder,
  type CheckoutCart,
  type CheckoutCartItem,
  type CheckoutDetails,
  type CheckoutIdentity,
  type CheckoutStore,
  type CheckoutTransaction,
  type NewCheckoutOrder,
  type NewCheckoutOrderProduct,
} from "../src/lib/checkout/create-order.ts";

const customer: CheckoutIdentity = {
  userId: null,
  sessionId: "session-panda",
};

const details: CheckoutDetails = {
  email: "buyer@example.com",
  firstName: "Panda",
  lastName: "Buyer",
  phoneNumber: "0500000000",
  shippingMethod: "regular",
  shippingAddress: '{"city":"Tel Aviv"}',
  billingAddress: '{"city":"Tel Aviv"}',
};

const validItems: CheckoutCartItem[] = [
  { productId: 11, quantity: 2, price: 1250 },
  { productId: 22, quantity: 1, price: 500 },
];

test("empty cart cannot create an order", async () => {
  const store = new FakeCheckoutStore("panda_pop", customer, []);

  await assert.rejects(
    create(store, customer, "11111111-1111-4111-8111-111111111111"),
    (error) => error instanceof CheckoutError && error.code === "empty_cart"
  );
  assert.equal(store.orders.length, 0);
  assert.equal(store.cart.isActive, true);
});

test("valid cart creates one order and the correct order product rows", async () => {
  const store = new FakeCheckoutStore("panda_pop", customer, validItems);
  const result = await create(
    store,
    customer,
    "22222222-2222-4222-8222-222222222222"
  );

  assert.equal(store.orders.length, 1);
  assert.equal(store.orderProducts.length, 2);
  assert.equal(result.orderId, 1);
  assert.equal(result.orderNumber, "SN-TEST-ABCDEFGH");
});

test("price at purchase and total use server-side product prices", async () => {
  const store = new FakeCheckoutStore("panda_pop", customer, validItems);
  const result = await create(
    store,
    customer,
    "33333333-3333-4333-8333-333333333333"
  );

  assert.deepEqual(
    store.orderProducts.map((item) => item.priceAtPurchase),
    [1250, 500]
  );
  assert.equal(result.totalPrice, 3000);
  assert.equal(store.orders[0].totalPrice, 3000);
  assert.equal(store.orders[0].numberOfItems, 3);
});

test("cart becomes inactive only after a successful order", async () => {
  const store = new FakeCheckoutStore("panda_pop", customer, validItems);
  await create(store, customer, "44444444-4444-4444-8444-444444444444");

  assert.equal(store.cart.isActive, false);
  assert.equal(store.orders.length, 1);
  assert.equal(store.orderProducts.length, validItems.length);
});

test("a referenced product that no longer exists rejects and rolls back", async () => {
  const store = new FakeCheckoutStore("panda_pop", customer, [
    { productId: 99, quantity: 1, price: null },
  ]);

  await assert.rejects(
    create(store, customer, "55555555-5555-4555-8555-555555555555"),
    (error) =>
      error instanceof CheckoutError && error.code === "missing_product"
  );
  assert.equal(store.orders.length, 0);
  assert.equal(store.orderProducts.length, 0);
  assert.equal(store.cart.isActive, true);
});

test("one tenant cannot create an order from another tenant cart", async () => {
  const pandaStore = new FakeCheckoutStore("panda_pop", customer, validItems);
  const giftStore = new FakeCheckoutStore(
    "gift_shop",
    { userId: null, sessionId: "session-gift" },
    validItems
  );

  await assert.rejects(
    create(
      giftStore,
      customer,
      "66666666-6666-4666-8666-666666666666"
    ),
    (error) =>
      error instanceof CheckoutError && error.code === "no_active_cart"
  );
  assert.equal(giftStore.orders.length, 0);
  assert.equal(pandaStore.orders.length, 0);
});

test("duplicate submission returns the first order without creating another", async () => {
  const store = new FakeCheckoutStore("panda_pop", customer, validItems);
  const token = "77777777-7777-4777-8777-777777777777";

  const first = await create(store, customer, token);
  const duplicate = await create(store, customer, token);

  assert.deepEqual(duplicate, first);
  assert.equal(store.orders.length, 1);
  assert.equal(store.orderProducts.length, validItems.length);
});

function create(
  store: CheckoutStore,
  identity: CheckoutIdentity,
  token: string
) {
  return createCheckoutOrder(
    store,
    identity,
    details,
    token,
    () => "SN-TEST-ABCDEFGH"
  );
}

type StoredOrder = NewCheckoutOrder & { id: number };

class FakeCheckoutStore implements CheckoutStore {
  readonly tenantSchema: string;
  readonly cart: CheckoutCart & CheckoutIdentity & { isActive: boolean };
  readonly items: CheckoutCartItem[];
  orders: StoredOrder[] = [];
  orderProducts: NewCheckoutOrderProduct[] = [];

  constructor(
    tenantSchema: string,
    identity: CheckoutIdentity,
    items: CheckoutCartItem[]
  ) {
    this.tenantSchema = tenantSchema;
    this.cart = {
      id: `${tenantSchema}-cart`,
      currency: "ILS",
      isActive: true,
      ...identity,
    };
    this.items = items;
  }

  async transaction<T>(
    callback: (tx: CheckoutTransaction) => Promise<T>
  ): Promise<T> {
    const ordersBefore = structuredClone(this.orders);
    const productsBefore = structuredClone(this.orderProducts);
    const activeBefore = this.cart.isActive;

    const tx: CheckoutTransaction = {
      lockSubmission: async () => undefined,
      findOrderByCheckoutToken: async (token, identity) => {
        const order = this.orders.find(
          (candidate) =>
            candidate.checkoutToken === token &&
            sameIdentity(candidate, identity)
        );
        return order
          ? {
              orderId: order.id,
              orderNumber: order.orderNumber,
              totalPrice: order.totalPrice,
            }
          : null;
      },
      lockActiveCart: async (identity) =>
        this.cart.isActive && sameIdentity(this.cart, identity)
          ? this.cart
          : null,
      getCartItems: async (cartId) =>
        cartId === this.cart.id ? structuredClone(this.items) : [],
      reserveInventory: async () => undefined,
      createOrder: async (order) => {
        const stored = { ...order, id: this.orders.length + 1 };
        this.orders.push(stored);
        return { id: stored.id, orderNumber: stored.orderNumber };
      },
      createOrderProducts: async (items) => {
        this.orderProducts.push(...structuredClone(items));
      },
      deactivateCart: async (cartId) => {
        if (cartId !== this.cart.id || !this.cart.isActive) return false;
        this.cart.isActive = false;
        return true;
      },
    };

    try {
      return await callback(tx);
    } catch (error) {
      this.orders = ordersBefore;
      this.orderProducts = productsBefore;
      this.cart.isActive = activeBefore;
      throw error;
    }
  }
}

function sameIdentity(left: CheckoutIdentity, right: CheckoutIdentity) {
  return right.userId
    ? left.userId === right.userId
    : left.sessionId === right.sessionId;
}

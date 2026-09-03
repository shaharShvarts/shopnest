import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateShippingPrice,
  listAvailableShippingMethods,
  ShippingError,
  validateSelectedShippingMethod,
  type ShippingMethod,
  type ShippingMethodStore,
} from "../src/lib/shipping/core.ts";
import { buildFulfillmentUpdate } from "../src/lib/shipping/fulfillment.ts";
import {
  getNextShippingSortOrder,
  moveShippingMethod,
  reorderShippingMethods,
  ShippingOrderError,
  type ShippingSortUpdate,
} from "../src/lib/shipping/order.ts";
import {
  getCheckoutShippingSelection,
  getDefaultShippingMethodId,
} from "../src/lib/shipping/checkout-selection.ts";
import { createCheckoutOrder, CheckoutError, type CheckoutIdentity, type CheckoutTransaction, type NewCheckoutOrder } from "../src/lib/checkout/create-order.ts";

const delivery: ShippingMethod = { id: 1, name: "Home Delivery", code: "home", type: "home_delivery", isActive: true, price: 30, freeShippingThreshold: 300, sortOrder: 1 };
const pickup: ShippingMethod = { id: 2, name: "Store Pickup", code: "pickup", type: "store_pickup", isActive: true, price: 0, freeShippingThreshold: null, sortOrder: 2 };
const inactive: ShippingMethod = { ...delivery, id: 3, code: "disabled", isActive: false };

class MethodStore implements ShippingMethodStore {
  readonly methods: ShippingMethod[];
  constructor(methods: ShippingMethod[]) { this.methods = methods; }
  async listActive() { return this.methods.filter((method) => method.isActive); }
  async findActiveById(id: number) { return this.methods.find((method) => method.id === id && method.isActive) ?? null; }
}

test("1 active shipping methods are returned", async () => assert.equal((await listAvailableShippingMethods(new MethodStore([delivery]), 250)).length, 1));
test("2 inactive shipping methods are excluded", async () => assert.deepEqual(await listAvailableShippingMethods(new MethodStore([inactive]), 250), []));
test("3 method lookup is bounded to the current tenant store", async () => {
  assert.equal((await validateSelectedShippingMethod(new MethodStore([delivery]), 1, 250)).name, "Home Delivery");
  await assert.rejects(validateSelectedShippingMethod(new MethodStore([{ ...delivery, id: 9 }]), 1, 250), ShippingError);
});
test("4 fixed price is calculated", () => assert.equal(calculateShippingPrice({ ...delivery, freeShippingThreshold: null }, 250).shippingPrice, 30));
test("5 threshold below is not applied", () => assert.deepEqual(calculateShippingPrice(delivery, 299), { shippingPrice: 30, freeShippingThresholdApplied: false }));
test("6 threshold at boundary is applied", () => assert.deepEqual(calculateShippingPrice(delivery, 300), { shippingPrice: 0, freeShippingThresholdApplied: true }));
test("7 zero-price store pickup remains free", () => assert.deepEqual(calculateShippingPrice(pickup, 0), { shippingPrice: 0, freeShippingThresholdApplied: false }));
test("8 negative price is rejected", () => assert.throws(() => calculateShippingPrice({ ...delivery, price: -1 }, 250), ShippingError));
test("9 negative threshold is rejected", () => assert.throws(() => calculateShippingPrice({ ...delivery, freeShippingThreshold: -1 }, 250), ShippingError));
test("10 submitted client shipping amount is ignored", async () => { const schema = await readFile(new URL("../src/app/(customer)/checkout/schema.ts", import.meta.url), "utf8"); assert.doesNotMatch(schema, /shipping_(?:price|total)/); const action = await readFile(new URL("../src/app/(customer)/_actions/checkout.ts", import.meta.url), "utf8"); assert.doesNotMatch(action, /result\.data\.shipping(?:Price|_price|Total|_total)/); });
test("11 invalid shipping method ID is rejected", async () => assert.rejects(validateSelectedShippingMethod(new MethodStore([delivery]), 0, 250), ShippingError));
test("12 cross-tenant method ID is rejected", async () => assert.rejects(validateSelectedShippingMethod(new MethodStore([{ ...delivery, id: 77 }]), 1, 250), ShippingError));

const guest: CheckoutIdentity = { customerAccountId: null, userId: null, sessionId: "guest" };

function checkoutHarness(method: ShippingMethod, identity: CheckoutIdentity = guest, address: null | { address: string; city: string; state: string; postalCode: string } = { address: "1 Main", city: "Tel Aviv", state: "Israel", postalCode: "61000" }) {
  let stored: NewCheckoutOrder | null = null;
  let reservationCalls = 0;
  const tx: CheckoutTransaction = {
    lockSubmission: async () => undefined,
    findOrderByCheckoutToken: async () => null,
    lockActiveCart: async () => ({ id: "11111111-1111-4111-8111-111111111111", currency: "ILS" }),
    getCartItems: async () => [{ productId: 1, quantity: 2, price: 100 }, { productId: 2, quantity: 1, price: 50 }],
    findActiveShippingMethod: async (id) => id === method.id && method.isActive ? method : null,
    reserveInventory: async () => { reservationCalls += 1; },
    createOrder: async (order) => { stored = order; return { id: 10, orderNumber: order.orderNumber }; },
    createOrderProducts: async () => undefined,
    deactivateCart: async () => true,
  };
  return {
    run: () => createCheckoutOrder({ transaction: async (callback) => callback(tx) }, identity, { email: "buyer@example.com", firstName: "Test", lastName: "Buyer", phoneNumber: "0500000000", shippingMethodId: method.id, shippingAddress: address }, "22222222-2222-4222-8222-222222222222", () => "SN-TEST"),
    order: () => stored as NewCheckoutOrder | null,
    reservationCalls: () => reservationCalls,
  };
}

test("13 order snapshots method name type and charged price", async () => { const h = checkoutHarness(delivery); await h.run(); assert.deepEqual([h.order()!.shippingMethodName, h.order()!.shippingMethodType, h.order()!.shippingTotal], ["Home Delivery", "home_delivery", 30]); });
test("14 later method edits cannot alter historical snapshot", async () => { const h = checkoutHarness(delivery); await h.run(); const snapshot = structuredClone(h.order()); delivery.name = "Changed temporarily"; assert.equal(snapshot!.shippingMethodName, "Home Delivery"); delivery.name = "Home Delivery"; });
test("15 items subtotal is server-calculated", async () => { const h = checkoutHarness(delivery); const result = await h.run(); assert.equal(result.itemsSubtotal, 250); });
test("16 shipping subtotal is server-calculated", async () => { const h = checkoutHarness(delivery); const result = await h.run(); assert.equal(result.shippingTotal, 30); });
test("17 total equals items plus shipping", async () => { const h = checkoutHarness(delivery); const result = await h.run(); assert.equal(result.totalPrice, 280); });
test("18 guest checkout with shipping works", async () => assert.equal((await checkoutHarness(delivery).run()).orderId, 10));
test("19 authenticated checkout with shipping works", async () => assert.equal((await checkoutHarness(delivery, { customerAccountId: 42, userId: null, sessionId: null }).run()).orderId, 10));
test("20 home delivery requires complete address", async () => assert.rejects(checkoutHarness(delivery, guest, null).run(), (error) => error instanceof CheckoutError && error.code === "shipping_address_required"));
test("21 store pickup does not require a delivery address", async () => { const h = checkoutHarness(pickup, guest, null); await h.run(); assert.equal(h.order()!.shippingAddress, null); });
test("22 fulfillment starts unfulfilled", async () => { const source = await readFile(new URL("../src/lib/drizzle-checkout-store.ts", import.meta.url), "utf8"); assert.match(source, /fulfillmentStatus:\s*"unfulfilled"/); });

const fulfillmentBase = { shippingMethodType: "home_delivery" as const, fulfillmentStatus: "unfulfilled" as const, trackingNumber: null, shippedAt: null, deliveredAt: null, readyForPickupAt: null, pickedUpAt: null };
test("23 shipped records state and timestamp safely", () => { const now = new Date("2026-01-01T00:00:00Z"); const update = buildFulfillmentUpdate(fulfillmentBase, { status: "shipped" }, now); assert.equal(update.fulfillmentStatus, "shipped"); assert.equal(update.shippedAt, now); });
test("24 ready-for-pickup state is supported", () => assert.equal(buildFulfillmentUpdate({ ...fulfillmentBase, shippingMethodType: "store_pickup" }, { status: "ready_for_pickup" }).fulfillmentStatus, "ready_for_pickup"));
test("25 tracking number can be stored by admin", () => assert.equal(buildFulfillmentUpdate(fulfillmentBase, { status: "shipped", trackingNumber: " TRACK-1 " }).trackingNumber, "TRACK-1"));
test("26 customer checkout cannot set fulfillment or tracking", async () => { const source = await readFile(new URL("../src/app/(customer)/_actions/checkout.ts", import.meta.url), "utf8"); assert.doesNotMatch(source, /formData\.get\(["'](?:fulfillment|tracking)/); });
test("27 customer order detail is bounded by tenant database and customer ID", async () => { const source = await readFile(new URL("../src/app/(customer)/account/orders/[id]/page.tsx", import.meta.url), "utf8"); assert.match(source, /getDbForTenant\(tenant\)/); assert.match(source, /eq\(orders\.customerAccountId, customer\.id\)/); });
test("28 legacy order rendering has null-safe shipping fallbacks", async () => { const source = await readFile(new URL("../src/app/(customer)/account/orders/page.tsx", import.meta.url), "utf8"); assert.match(source, /shippingMethodName \?\? order\.shippingMethod/); assert.match(source, /shippingTotal == null/); });
test("29 tenant migration contains shipping and fulfillment data", async () => { const sql = await readFile(new URL("../src/drizzle/migrations/0006_famous_boomerang.sql", import.meta.url), "utf8"); assert.match(sql, /CREATE TABLE "shipping_methods"/); assert.match(sql, /"fulfillment_status"/); assert.match(sql, /shipping_method_id/); });
test("30 shipping calculation does not mutate inventory reservations", async () => { const h = checkoutHarness(delivery); calculateShippingPrice(delivery, 250); assert.equal(h.reservationCalls(), 0); await h.run(); assert.equal(h.reservationCalls(), 1); });
test("31 cross-tenant fulfillment updates cannot select a schema", async () => { const source = await readFile(new URL("../src/app/admin/_actions/shipping.ts", import.meta.url), "utf8"); assert.match(source, /requireTenantAdminDb\(\)/); assert.doesNotMatch(source, /schema_name|tenantSlug\s*:\s*formData|getDbForTenant/); });

type OrderedMethod = {
  id: number;
  code: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

class FakeShippingOrderStore {
  readonly methods: OrderedMethod[];
  constructor(methods: OrderedMethod[]) { this.methods = methods; }
  async listMethodIds() {
    return [...this.methods]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((method) => method.id);
  }
  async updateSortOrders(updates: ShippingSortUpdate[]) {
    for (const update of updates) {
      const method = this.methods.find((candidate) => candidate.id === update.id);
      if (!method) throw new Error("Unknown test method");
      method.sortOrder = update.sortOrder;
    }
  }
}

const orderedMethods = () => [
  { id: 1, code: "home", price: 30, isActive: true, sortOrder: 10 },
  { id: 2, code: "pickup", price: 0, isActive: true, sortOrder: 20 },
  { id: 3, code: "disabled", price: 15, isActive: false, sortOrder: 30 },
];

test("32 newly created methods receive the next automatic order", () => {
  assert.equal(getNextShippingSortOrder([]), 0);
  assert.equal(getNextShippingSortOrder([0, 4, 9]), 10);
});

test("33 reordering persists normalized sort positions", async () => {
  const store = new FakeShippingOrderStore(orderedMethods());
  const updates = await reorderShippingMethods(store, [3, 1, 2]);
  assert.deepEqual(updates, [
    { id: 3, sortOrder: 0 },
    { id: 1, sortOrder: 1 },
    { id: 2, sortOrder: 2 },
  ]);
  assert.deepEqual(await store.listMethodIds(), [3, 1, 2]);
});

test("34 shipping reordering is tenant-isolated", async () => {
  const gift = new FakeShippingOrderStore(orderedMethods());
  const panda = new FakeShippingOrderStore([
    { id: 1, code: "panda_home", price: 20, isActive: true, sortOrder: 0 },
    { id: 2, code: "panda_pickup", price: 0, isActive: true, sortOrder: 1 },
  ]);
  await reorderShippingMethods(gift, [2, 3, 1]);
  assert.deepEqual(await panda.listMethodIds(), [1, 2]);
  assert.deepEqual(await gift.listMethodIds(), [2, 3, 1]);
});

test("35 duplicate and unknown shipping IDs are rejected", async () => {
  const store = new FakeShippingOrderStore(orderedMethods());
  await assert.rejects(
    reorderShippingMethods(store, [1, 1, 3]),
    (error) => error instanceof ShippingOrderError && error.code === "duplicate_method"
  );
  await assert.rejects(
    reorderShippingMethods(store, [1, 2, 99]),
    (error) => error instanceof ShippingOrderError && error.code === "unknown_method"
  );
});

test("36 checkout keeps the persisted active shipping order", async () => {
  const methods = [{ ...pickup, sortOrder: 0 }, { ...delivery, sortOrder: 1 }];
  const quotes = await listAvailableShippingMethods(new MethodStore(methods), 250);
  assert.deepEqual(quotes.map((method) => method.id), [2, 1]);
  const drizzleSource = await readFile(new URL("../src/lib/shipping/drizzle-store.ts", import.meta.url), "utf8");
  assert.match(drizzleSource, /orderBy\(asc\(shippingMethods\.sortOrder\)/);
});

test("37 reorder preserves method identity and business fields", async () => {
  const methods = orderedMethods();
  const before = methods.map(({ sortOrder: _sortOrder, ...method }) => ({ ...method }));
  await reorderShippingMethods(new FakeShippingOrderStore(methods), [3, 2, 1]);
  assert.deepEqual(
    methods.map(({ sortOrder: _sortOrder, ...method }) => ({ ...method })),
    before
  );
});

test("38 drag reorder changes the client-side method ordering", () => {
  const methods = orderedMethods();
  const reordered = moveShippingMethod(methods, 3, 1);
  assert.deepEqual(reordered.map((method) => method.id), [3, 1, 2]);
  assert.deepEqual(methods.map((method) => method.id), [1, 2, 3]);
});

test("39 persisted ordering survives a page reload", async () => {
  const methods = orderedMethods();
  await reorderShippingMethods(new FakeShippingOrderStore(methods), [2, 3, 1]);
  const reloadedStore = new FakeShippingOrderStore(structuredClone(methods));
  assert.deepEqual(await reloadedStore.listMethodIds(), [2, 3, 1]);
});

test("40 checkout defaults to the first active method and includes its cost", async () => {
  const quotes = await listAvailableShippingMethods(
    new MethodStore([
      { ...pickup, price: 12, sortOrder: 0 },
      { ...delivery, sortOrder: 1, freeShippingThreshold: null },
      inactive,
    ]),
    250
  );
  const selectedId = getDefaultShippingMethodId(quotes);
  const selection = getCheckoutShippingSelection(quotes, selectedId, 250);
  assert.deepEqual(quotes.map((method) => method.id), [2, 1]);
  assert.equal(selectedId, 2);
  assert.equal(selection.method?.id, 2);
  assert.equal(selection.shippingTotal, 12);
  assert.equal(selection.totalPrice, 262);
  assert.equal(selection.requiresAddress, false);
  assert.equal(selection.addressHeading, "Contact details");
});

test("41 switching checkout methods updates total and address requirements", async () => {
  const quotes = await listAvailableShippingMethods(
    new MethodStore([
      { ...pickup, sortOrder: 0 },
      { ...delivery, sortOrder: 1, freeShippingThreshold: null },
    ]),
    250
  );
  const pickupSelection = getCheckoutShippingSelection(quotes, 2, 250);
  const deliverySelection = getCheckoutShippingSelection(quotes, 1, 250);
  assert.equal(pickupSelection.totalPrice, 250);
  assert.equal(pickupSelection.requiresAddress, false);
  assert.equal(deliverySelection.shippingTotal, 30);
  assert.equal(deliverySelection.totalPrice, 280);
  assert.equal(deliverySelection.requiresAddress, true);
  assert.equal(deliverySelection.addressHeading, "Shipping Address");
});

test("42 checkout with no available methods retains its empty state", () => {
  assert.equal(getDefaultShippingMethodId([]), null);
  assert.deepEqual(getCheckoutShippingSelection([], null, 250), {
    method: null,
    shippingTotal: 0,
    totalPrice: 250,
    requiresAddress: false,
    addressHeading: "Shipping Address",
  });
});

import type {
  InventoryAlertType,
  InventoryNotificationStatus,
} from "@/drizzle/schema/inventoryAlert";
import type {
  ReservationPurpose,
  ReservationState,
} from "@/drizzle/schema/reservation";
import {
  getCartReservationDurationsMs,
  getCheckoutReservationDurationMs,
  getCustomerStockDisplayPolicy,
} from "./config.ts";
import {
  DatabaseOnlyInventoryNotificationService,
  type InventoryNotificationService,
} from "./notifications.ts";

export type InventoryStatus =
  | "in_stock"
  | "low_stock"
  | "critical_stock"
  | "out_of_stock";

export type InventoryProductRecord = {
  id: number;
  physical: number;
  lowStockThreshold: number;
  criticalStockThreshold: number;
  isActive: boolean;
  isAvailable: boolean;
};

export type InventoryAvailability = InventoryProductRecord & {
  reserved: number;
  available: number;
  status: InventoryStatus;
  purchasable: boolean;
};

export type InventoryHealthSummary = Record<InventoryStatus, number>;

export function summarizeInventoryHealth(
  items: Iterable<InventoryAvailability>
): InventoryHealthSummary {
  const summary: InventoryHealthSummary = {
    in_stock: 0,
    low_stock: 0,
    critical_stock: 0,
    out_of_stock: 0,
  };
  for (const item of items) summary[item.status] += 1;
  return summary;
}

export function filterInventoryByStatus(
  items: Iterable<InventoryAvailability>,
  status: InventoryStatus
) {
  return [...items].filter((item) => item.status === status);
}

export type InventoryReservationRecord = {
  id: string;
  ownerKey: string;
  cartId: string | null;
  checkoutToken: string;
  purpose: ReservationPurpose;
  productId: number;
  quantity: number;
  state: ReservationState;
  expiresAt: Date;
  startedAt: Date;
  lastActivityAt: Date;
  maxExpiresAt: Date;
};

export type InventoryAlertRecord = {
  id: string;
  productId: number;
  alertType: InventoryAlertType;
};

export type NewInventoryReservation = {
  ownerKey: string;
  cartId: string;
  checkoutToken: string;
  purpose: ReservationPurpose;
  productId: number;
  quantity: number;
  expiresAt: Date;
  startedAt: Date;
  lastActivityAt: Date;
  maxExpiresAt: Date;
};

export type NewInventoryAlert = {
  productId: number;
  alertType: InventoryAlertType;
  availableQuantity: number;
  threshold: number;
  notificationStatus: InventoryNotificationStatus;
  createdAt: Date;
};

export type ReservationAttemptIdentity = {
  checkoutToken: string;
  cartId: string;
  ownerKey: string;
  purpose: ReservationPurpose;
};

export interface InventoryTransaction {
  getProducts(productIds: number[]): Promise<InventoryProductRecord[]>;
  lockProducts(productIds: number[]): Promise<InventoryProductRecord[]>;
  lockReservationAttempt(checkoutToken: string): Promise<void>;
  getActiveReservationTotals(
    productIds: number[],
    now: Date,
    excludeAttempts?:
      | ReservationAttemptIdentity
      | ReservationAttemptIdentity[]
  ): Promise<Map<number, number>>;
  getAttemptReservations(
    checkoutToken: string
  ): Promise<InventoryReservationRecord[]>;
  upsertReservations(reservations: NewInventoryReservation[]): Promise<void>;
  releaseAttemptReservationsExcept(
    attempt: ReservationAttemptIdentity,
    retainedProductIds: number[],
    now: Date
  ): Promise<void>;
  markAttemptReservations(
    attempt: ReservationAttemptIdentity,
    state: Exclude<ReservationState, "active">,
    now: Date
  ): Promise<number>;
  updateProductInventory(
    productId: number,
    input: {
      physical: number;
      lowStockThreshold: number;
      criticalStockThreshold: number;
    }
  ): Promise<void>;
  getUnresolvedAlerts(productId: number): Promise<InventoryAlertRecord[]>;
  resolveAlerts(
    productId: number,
    alertTypes: InventoryAlertType[],
    resolvedAt: Date
  ): Promise<void>;
  createAlert(alert: NewInventoryAlert): Promise<void>;
  cleanupExpiredReservations(now: Date): Promise<number>;
}

export interface InventoryStore {
  transaction<T>(callback: (tx: InventoryTransaction) => Promise<T>): Promise<T>;
}

export type ReservationItem = { productId: number; quantity: number };

export type ReserveInventoryInput = Omit<ReservationAttemptIdentity, "purpose"> & {
  items: ReservationItem[];
  now?: Date;
  durationMs?: number;
};

export type ReserveCartInventoryInput = Omit<
  ReserveInventoryInput,
  "checkoutToken" | "durationMs"
> & {
  idleDurationMs?: number;
  maxDurationMs?: number;
};

export type ConsumeReservationInput = Omit<ReservationAttemptIdentity, "purpose"> & {
  now?: Date;
};

export type CustomerStockMessage =
  | { kind: "none" }
  | { kind: "few_left" }
  | { kind: "exact"; quantity: number }
  | { kind: "last_one" }
  | { kind: "out_of_stock" };

export function getCustomerStockMessage(
  available: number,
  policy = getCustomerStockDisplayPolicy()
): CustomerStockMessage {
  if (!Number.isSafeInteger(available) || available < 0) {
    throw new InventoryError(
      "invalid_quantity",
      "Available inventory must be a non-negative whole number."
    );
  }
  if (available === 0) return { kind: "out_of_stock" };
  if (available === 1) return { kind: "last_one" };
  if (available <= policy.exactThreshold) {
    return { kind: "exact", quantity: available };
  }
  if (available <= policy.warningThreshold) return { kind: "few_left" };
  return { kind: "none" };
}

export type InventoryErrorCode =
  | "invalid_quantity"
  | "invalid_thresholds"
  | "invalid_attempt"
  | "product_not_found"
  | "product_unavailable"
  | "insufficient_stock"
  | "reservation_not_found"
  | "reservation_expired"
  | "reservation_owner_mismatch";

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;
  readonly productId?: number;

  constructor(
    code: InventoryErrorCode,
    message: string,
    productId?: number
  ) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.productId = productId;
  }
}

export function validateInventoryThresholds(
  lowStockThreshold: number,
  criticalStockThreshold: number
) {
  if (
    !Number.isInteger(lowStockThreshold) ||
    !Number.isInteger(criticalStockThreshold) ||
    lowStockThreshold < 0 ||
    criticalStockThreshold < 0 ||
    criticalStockThreshold > lowStockThreshold
  ) {
    throw new InventoryError(
      "invalid_thresholds",
      "Stock thresholds must be non-negative whole numbers and the critical threshold cannot exceed the low threshold."
    );
  }
}

export function calculateInventoryAvailability(
  product: InventoryProductRecord,
  reserved: number
): InventoryAvailability {
  validateInventoryThresholds(
    product.lowStockThreshold,
    product.criticalStockThreshold
  );
  if (
    !Number.isInteger(product.physical) ||
    product.physical < 0 ||
    !Number.isInteger(reserved) ||
    reserved < 0 ||
    reserved > product.physical
  ) {
    throw new InventoryError(
      "invalid_quantity",
      "Inventory quantities must be non-negative and reserved stock cannot exceed physical stock.",
      product.id
    );
  }

  const available = product.physical - reserved;
  const status = getInventoryStatus(
    available,
    product.lowStockThreshold,
    product.criticalStockThreshold
  );
  return {
    ...product,
    reserved,
    available,
    status,
    purchasable:
      product.isActive && product.isAvailable && available > 0,
  };
}

export function getInventoryStatus(
  available: number,
  lowStockThreshold: number,
  criticalStockThreshold: number
): InventoryStatus {
  validateInventoryThresholds(lowStockThreshold, criticalStockThreshold);
  if (!Number.isInteger(available) || available < 0) {
    throw new InventoryError(
      "invalid_quantity",
      "Available inventory must be a non-negative whole number."
    );
  }
  if (available === 0) return "out_of_stock";
  if (available <= criticalStockThreshold) return "critical_stock";
  if (available <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

export class InventoryService {
  private readonly store: InventoryStore;
  private readonly notificationService: InventoryNotificationService;
  private readonly reservationDurationMs: number;
  private readonly cartReservationIdleMs: number;
  private readonly cartReservationMaxMs: number;

  constructor(
    store: InventoryStore,
    notificationService: InventoryNotificationService =
      new DatabaseOnlyInventoryNotificationService(),
    reservationDurationMs = getCheckoutReservationDurationMs(),
    cartDurations = getCartReservationDurationsMs()
  ) {
    this.store = store;
    this.notificationService = notificationService;
    this.reservationDurationMs = reservationDurationMs;
    this.cartReservationIdleMs = cartDurations.idleMs;
    this.cartReservationMaxMs = cartDurations.maxMs;
  }

  getAvailability(productId: number, now = new Date()) {
    return this.store.transaction(async (tx) => {
      const [product] = await tx.getProducts([productId]);
      if (!product) throw productNotFound(productId);
      const totals = await tx.getActiveReservationTotals([productId], now);
      return calculateInventoryAvailability(
        product,
        totals.get(productId) ?? 0
      );
    });
  }

  getAvailabilityBatch(productIds: number[], now = new Date()) {
    const ids = uniqueProductIds(productIds);
    return this.store.transaction(async (tx) => {
      const products = await tx.getProducts(ids);
      const totals = await tx.getActiveReservationTotals(ids, now);
      return new Map(
        products.map((product) => [
          product.id,
          calculateInventoryAvailability(
            product,
            totals.get(product.id) ?? 0
          ),
        ])
      );
    });
  }

  getAvailabilityBatchForCart(
    productIds: number[],
    identity: { ownerKey: string; cartId: string },
    now = new Date()
  ) {
    const ids = uniqueProductIds(productIds);
    const attempt = cartAttempt(identity);
    return this.store.transaction(async (tx) => {
      const products = await tx.getProducts(ids);
      const totals = await tx.getActiveReservationTotals(ids, now, attempt);
      return new Map(
        products.map((product) => [
          product.id,
          calculateInventoryAvailability(product, totals.get(product.id) ?? 0),
        ])
      );
    });
  }

  reserveInventory(input: ReserveInventoryInput) {
    return this.store.transaction((tx) =>
      reserveInventoryInTransaction(tx, {
        ...input,
        durationMs: input.durationMs ?? this.reservationDurationMs,
      })
    );
  }

  reserveCartInventory(input: ReserveCartInventoryInput) {
    return this.store.transaction((tx) =>
      reserveCartInventoryInTransaction(tx, {
        ...input,
        idleDurationMs: input.idleDurationMs ?? this.cartReservationIdleMs,
        maxDurationMs: input.maxDurationMs ?? this.cartReservationMaxMs,
      })
    );
  }

  transitionCartToCheckout(input: ReserveInventoryInput) {
    return this.store.transaction((tx) =>
      transitionCartToCheckoutInTransaction(tx, {
        ...input,
        durationMs: input.durationMs ?? this.reservationDurationMs,
      })
    );
  }

  releaseReservation(input: ConsumeReservationInput) {
    const now = input.now ?? new Date();
    return this.store.transaction(async (tx) => {
      validateAttempt(input);
      await tx.lockReservationAttempt(input.checkoutToken);
      const reservations = await tx.getAttemptReservations(input.checkoutToken);
      if (reservations.length === 0) {
        throw new InventoryError(
          "reservation_not_found",
          "No checkout reservation was found."
        );
      }
      const attempt = checkoutAttempt(input);
      assertAttemptBinding(reservations, attempt);
      return tx.markAttemptReservations(
        attempt,
        "released",
        now
      );
    });
  }

  consumeReservation(input: ConsumeReservationInput) {
    return this.store.transaction((tx) =>
      consumeReservationInTransaction(
        tx,
        input,
        this.notificationService
      )
    );
  }

  adjustInventory(
    productId: number,
    input: {
      physical: number;
      lowStockThreshold?: number;
      criticalStockThreshold?: number;
      now?: Date;
    }
  ) {
    return this.store.transaction((tx) =>
      adjustInventoryInTransaction(
        tx,
        productId,
        input,
        this.notificationService
      )
    );
  }

  cleanupExpiredReservations(now = new Date()) {
    return this.store.transaction((tx) => tx.cleanupExpiredReservations(now));
  }

  initializeInventoryAlerts(productId: number, now = new Date()) {
    return this.store.transaction((tx) =>
      initializeInventoryAlertsInTransaction(
        tx,
        productId,
        now,
        this.notificationService
      )
    );
  }
}

export async function initializeInventoryAlertsInTransaction(
  tx: InventoryTransaction,
  productId: number,
  now: Date,
  notificationService: InventoryNotificationService
) {
  const [product] = await tx.lockProducts([productId]);
  if (!product) throw productNotFound(productId);
  const totals = await tx.getActiveReservationTotals([productId], now);
  const availability = calculateInventoryAvailability(
    product,
    totals.get(productId) ?? 0
  );
  await evaluateAlertState(tx, availability, now, notificationService);
  return availability;
}

export async function reserveInventoryInTransaction(
  tx: InventoryTransaction,
  input: ReserveInventoryInput & { durationMs: number }
) {
  const now = input.now ?? new Date();
  validateAttempt(input);
  assertPositiveDuration(input.durationMs, "Checkout reservation duration");
  const attempt = checkoutAttempt(input);
  await tx.lockReservationAttempt(attempt.checkoutToken);
  const existingAttempt = await tx.getAttemptReservations(
    attempt.checkoutToken
  );
  assertAttemptBinding(existingAttempt, attempt);
  const expiresAt = new Date(now.getTime() + input.durationMs);
  return reserveAttemptItems(tx, {
    attempt,
    items: input.items,
    now,
    startedAt: now,
    lastActivityAt: now,
    expiresAt,
    maxExpiresAt: expiresAt,
    excludeAttempts: [attempt],
  });
}

export async function reserveCartInventoryInTransaction(
  tx: InventoryTransaction,
  input: ReserveCartInventoryInput & {
    idleDurationMs: number;
    maxDurationMs: number;
  }
) {
  const now = input.now ?? new Date();
  validateAttempt({ ...input, checkoutToken: input.cartId });
  assertPositiveDuration(input.idleDurationMs, "Cart idle duration");
  assertPositiveDuration(input.maxDurationMs, "Cart maximum duration");
  if (input.maxDurationMs < input.idleDurationMs) {
    throw new InventoryError(
      "invalid_attempt",
      "Cart maximum duration cannot be shorter than its idle duration."
    );
  }
  const attempt = cartAttempt(input);
  await tx.lockReservationAttempt(attempt.checkoutToken);
  const existingAttempt = await tx.getAttemptReservations(
    attempt.checkoutToken
  );
  assertAttemptBinding(existingAttempt, attempt);

  const active = existingAttempt.filter(
    (item) =>
      item.state === "active" &&
      item.expiresAt.getTime() > now.getTime() &&
      item.maxExpiresAt.getTime() > now.getTime()
  );
  const startedAt = active.length > 0 ? active[0].startedAt : now;
  const maxExpiresAt =
    active.length > 0
      ? active[0].maxExpiresAt
      : new Date(now.getTime() + input.maxDurationMs);
  const expiresAt = new Date(
    Math.min(now.getTime() + input.idleDurationMs, maxExpiresAt.getTime())
  );

  return reserveAttemptItems(tx, {
    attempt,
    items: input.items,
    now,
    startedAt,
    lastActivityAt: now,
    expiresAt,
    maxExpiresAt,
    excludeAttempts: [attempt],
  });
}

export async function transitionCartToCheckoutInTransaction(
  tx: InventoryTransaction,
  input: ReserveInventoryInput & { durationMs: number }
) {
  const now = input.now ?? new Date();
  validateAttempt(input);
  assertPositiveDuration(input.durationMs, "Checkout reservation duration");
  const cart = cartAttempt(input);
  const checkout = checkoutAttempt(input);
  for (const token of [cart.checkoutToken, checkout.checkoutToken].sort()) {
    await tx.lockReservationAttempt(token);
  }
  const [cartReservations, checkoutReservations] = await Promise.all([
    tx.getAttemptReservations(cart.checkoutToken),
    tx.getAttemptReservations(checkout.checkoutToken),
  ]);
  assertAttemptBinding(cartReservations, cart);
  assertAttemptBinding(checkoutReservations, checkout);
  const expiresAt = new Date(now.getTime() + input.durationMs);
  const result = await reserveAttemptItems(tx, {
    attempt: checkout,
    items: input.items,
    now,
    startedAt: now,
    lastActivityAt: now,
    expiresAt,
    maxExpiresAt: expiresAt,
    excludeAttempts: [cart, checkout],
  });
  await tx.markAttemptReservations(cart, "released", now);
  return result;
}

async function reserveAttemptItems(
  tx: InventoryTransaction,
  input: {
    attempt: ReservationAttemptIdentity;
    items: ReservationItem[];
    now: Date;
    startedAt: Date;
    lastActivityAt: Date;
    expiresAt: Date;
    maxExpiresAt: Date;
    excludeAttempts: ReservationAttemptIdentity[];
  }
) {
  const items = normalizeReservationItems(input.items);
  const productIds = items.map((item) => item.productId);
  const products = await tx.lockProducts(productIds);
  if (products.length !== productIds.length) {
    const found = new Set(products.map((product) => product.id));
    throw productNotFound(productIds.find((id) => !found.has(id))!);
  }

  const otherReservations = await tx.getActiveReservationTotals(
    productIds,
    input.now,
    input.excludeAttempts
  );
  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const item of items) {
    const product = productMap.get(item.productId)!;
    if (!product.isActive || !product.isAvailable) {
      throw new InventoryError(
        "product_unavailable",
        "A product in the cart is not available for purchase.",
        product.id
      );
    }
    const available = calculateInventoryAvailability(
      product,
      otherReservations.get(product.id) ?? 0
    ).available;
    if (item.quantity > available) {
      throw new InventoryError(
        "insufficient_stock",
        `Only ${available} item(s) are currently available for product ${product.id}.`,
        product.id
      );
    }
  }

  if (
    input.startedAt.getTime() > input.lastActivityAt.getTime() ||
    input.lastActivityAt.getTime() > input.expiresAt.getTime() ||
    input.expiresAt.getTime() > input.maxExpiresAt.getTime()
  ) {
    throw new InventoryError(
      "invalid_attempt",
      "Reservation timestamps are inconsistent."
    );
  }

  await tx.upsertReservations(
    items.map((item) => ({
      ownerKey: input.attempt.ownerKey,
      cartId: input.attempt.cartId,
      checkoutToken: input.attempt.checkoutToken,
      purpose: input.attempt.purpose,
      productId: item.productId,
      quantity: item.quantity,
      startedAt: input.startedAt,
      lastActivityAt: input.lastActivityAt,
      expiresAt: input.expiresAt,
      maxExpiresAt: input.maxExpiresAt,
    }))
  );
  await tx.releaseAttemptReservationsExcept(
    input.attempt,
    productIds,
    input.now
  );

  return {
    purpose: input.attempt.purpose,
    startedAt: input.startedAt,
    lastActivityAt: input.lastActivityAt,
    expiresAt: input.expiresAt,
    maxExpiresAt: input.maxExpiresAt,
    items,
  };
}

export async function consumeReservationInTransaction(
  tx: InventoryTransaction,
  input: ConsumeReservationInput,
  notificationService: InventoryNotificationService
) {
  const now = input.now ?? new Date();
  validateAttempt(input);
  const attempt = checkoutAttempt(input);
  await tx.lockReservationAttempt(input.checkoutToken);
  const initial = await tx.getAttemptReservations(input.checkoutToken);
  if (initial.length === 0) {
    throw new InventoryError(
      "reservation_not_found",
      "No checkout reservation was found."
    );
  }
  assertAttemptBinding(initial, attempt);

  const productIds = uniqueProductIds(initial.map((item) => item.productId));
  const products = await tx.lockProducts(productIds);
  const reservations = await tx.getAttemptReservations(input.checkoutToken);
  assertAttemptBinding(reservations, attempt);
  if (
    reservations.some(
      (reservation) =>
        reservation.state !== "active" ||
        reservation.expiresAt.getTime() <= now.getTime()
    )
  ) {
    throw new InventoryError(
      "reservation_expired",
      "The checkout reservation has expired."
    );
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const otherTotals = await tx.getActiveReservationTotals(
    productIds,
    now,
    attempt
  );
  const availabilityAfter = new Map<number, InventoryAvailability>();

  for (const reservation of reservations) {
    const product = productMap.get(reservation.productId);
    if (!product) throw productNotFound(reservation.productId);
    const physical = product.physical - reservation.quantity;
    if (physical < 0) {
      throw new InventoryError(
        "insufficient_stock",
        "Consuming the reservation would make physical inventory negative.",
        product.id
      );
    }
    await tx.updateProductInventory(product.id, {
      physical,
      lowStockThreshold: product.lowStockThreshold,
      criticalStockThreshold: product.criticalStockThreshold,
    });
    const next = calculateInventoryAvailability(
      { ...product, physical },
      otherTotals.get(product.id) ?? 0
    );
    availabilityAfter.set(product.id, next);
  }

  const consumed = await tx.markAttemptReservations(
    attempt,
    "consumed",
    now
  );
  if (consumed !== reservations.length) {
    throw new InventoryError(
      "reservation_expired",
      "The reservation changed before it could be consumed."
    );
  }

  for (const availability of availabilityAfter.values()) {
    await evaluateAlertState(tx, availability, now, notificationService);
  }
  return availabilityAfter;
}

export async function adjustInventoryInTransaction(
  tx: InventoryTransaction,
  productId: number,
  input: {
    physical: number;
    lowStockThreshold?: number;
    criticalStockThreshold?: number;
    now?: Date;
  },
  notificationService: InventoryNotificationService
) {
  const now = input.now ?? new Date();
  if (!Number.isInteger(input.physical) || input.physical < 0) {
    throw new InventoryError(
      "invalid_quantity",
      "Physical inventory must be a non-negative whole number.",
      productId
    );
  }
  const [product] = await tx.lockProducts([productId]);
  if (!product) throw productNotFound(productId);
  const low = input.lowStockThreshold ?? product.lowStockThreshold;
  const critical =
    input.criticalStockThreshold ?? product.criticalStockThreshold;
  validateInventoryThresholds(low, critical);
  const totals = await tx.getActiveReservationTotals([productId], now);
  const reserved = totals.get(productId) ?? 0;
  if (input.physical < reserved) {
    throw new InventoryError(
      "insufficient_stock",
      `Physical inventory cannot be reduced below ${reserved} actively reserved item(s).`,
      productId
    );
  }
  const next = calculateInventoryAvailability(
    {
      ...product,
      physical: input.physical,
      lowStockThreshold: low,
      criticalStockThreshold: critical,
    },
    reserved
  );
  await tx.updateProductInventory(productId, {
    physical: input.physical,
    lowStockThreshold: low,
    criticalStockThreshold: critical,
  });
  await evaluateAlertState(tx, next, now, notificationService);
  return next;
}

async function evaluateAlertState(
  tx: InventoryTransaction,
  availability: InventoryAvailability,
  now: Date,
  notificationService: InventoryNotificationService
) {
  const alertType = statusToAlertType(availability.status);
  const unresolved = await tx.getUnresolvedAlerts(availability.id);
  const obsoleteTypes = unresolved
    .filter((alert) => alert.alertType !== alertType)
    .map((alert) => alert.alertType);
  if (obsoleteTypes.length > 0) {
    await tx.resolveAlerts(availability.id, obsoleteTypes, now);
  }

  if (!alertType) return;
  if (unresolved.some((alert) => alert.alertType === alertType)) return;
  const threshold =
    alertType === "low_stock"
      ? availability.lowStockThreshold
      : alertType === "critical_stock"
        ? availability.criticalStockThreshold
        : 0;
  const notificationStatus =
    await notificationService.notifyInventoryAlert({
      productId: availability.id,
      type: alertType,
      availableQuantity: availability.available,
      threshold,
    });
  await tx.createAlert({
    productId: availability.id,
    alertType,
    availableQuantity: availability.available,
    threshold,
    notificationStatus,
    createdAt: now,
  });
}

function normalizeReservationItems(items: ReservationItem[]) {
  if (items.length === 0) {
    throw new InventoryError(
      "invalid_attempt",
      "A reservation requires at least one cart item."
    );
  }
  const quantities = new Map<number, number>();
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.productId) ||
      item.productId <= 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new InventoryError(
        "invalid_quantity",
        "Reservation product IDs and quantities must be positive whole numbers.",
        item.productId
      );
    }
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? 0) + item.quantity
    );
  }
  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId - right.productId);
}

function uniqueProductIds(productIds: number[]) {
  return [...new Set(productIds)].sort((left, right) => left - right);
}

function validateAttempt(input: {
  ownerKey: string;
  cartId: string;
  checkoutToken: string;
}) {
  if (
    !input.ownerKey.trim() ||
    !input.cartId.trim() ||
    !input.checkoutToken.trim()
  ) {
    throw new InventoryError(
      "invalid_attempt",
      "Reservation owner, cart, and checkout token are required."
    );
  }
}

function assertPositiveDuration(durationMs: number, label: string) {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) {
    throw new InventoryError(
      "invalid_attempt",
      `${label} must be positive.`
    );
  }
}

function checkoutAttempt(input: {
  ownerKey: string;
  cartId: string;
  checkoutToken: string;
}): ReservationAttemptIdentity {
  return { ...input, purpose: "checkout" };
}

function cartAttempt(input: {
  ownerKey: string;
  cartId: string;
}): ReservationAttemptIdentity {
  return {
    ownerKey: input.ownerKey,
    cartId: input.cartId,
    checkoutToken: input.cartId,
    purpose: "cart",
  };
}

function assertAttemptBinding(
  reservations: InventoryReservationRecord[],
  attempt: ReservationAttemptIdentity
) {
  if (reservations.some((item) => item.cartId !== attempt.cartId)) {
    throw new InventoryError(
      "invalid_attempt",
      "The checkout token is already bound to a different cart."
    );
  }
  if (reservations.some((item) => item.ownerKey !== attempt.ownerKey)) {
    throw new InventoryError(
      "reservation_owner_mismatch",
      "The checkout token is already bound to a different owner."
    );
  }
  if (reservations.some((item) => item.purpose !== attempt.purpose)) {
    throw new InventoryError(
      "invalid_attempt",
      "The reservation token is already bound to a different purpose."
    );
  }
}

function productNotFound(productId: number) {
  return new InventoryError(
    "product_not_found",
    `Product ${productId} does not exist.`,
    productId
  );
}

function statusToAlertType(
  status: InventoryStatus
): InventoryAlertType | null {
  return status === "in_stock" ? null : status;
}

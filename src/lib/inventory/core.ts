import type {
  InventoryAlertType,
  InventoryNotificationStatus,
} from "@/drizzle/schema/inventoryAlert";
import type { ReservationState } from "@/drizzle/schema/reservation";
import { getInventoryReservationDurationMs } from "./config.ts";
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
  productId: number;
  quantity: number;
  state: ReservationState;
  expiresAt: Date;
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
  productId: number;
  quantity: number;
  expiresAt: Date;
};

export type NewInventoryAlert = {
  productId: number;
  alertType: InventoryAlertType;
  availableQuantity: number;
  threshold: number;
  notificationStatus: InventoryNotificationStatus;
  createdAt: Date;
};

export interface InventoryTransaction {
  getProducts(productIds: number[]): Promise<InventoryProductRecord[]>;
  lockProducts(productIds: number[]): Promise<InventoryProductRecord[]>;
  getActiveReservationTotals(
    productIds: number[],
    now: Date,
    excludeCheckoutToken?: string
  ): Promise<Map<number, number>>;
  getAttemptReservations(
    checkoutToken: string,
    cartId: string
  ): Promise<InventoryReservationRecord[]>;
  upsertReservations(reservations: NewInventoryReservation[]): Promise<void>;
  releaseAttemptReservationsExcept(
    checkoutToken: string,
    cartId: string,
    retainedProductIds: number[],
    now: Date
  ): Promise<void>;
  markAttemptReservations(
    checkoutToken: string,
    cartId: string,
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

export type ReserveInventoryInput = {
  ownerKey: string;
  cartId: string;
  checkoutToken: string;
  items: ReservationItem[];
  now?: Date;
  durationMs?: number;
};

export type ConsumeReservationInput = {
  ownerKey: string;
  cartId: string;
  checkoutToken: string;
  now?: Date;
};

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

  constructor(
    store: InventoryStore,
    notificationService: InventoryNotificationService =
      new DatabaseOnlyInventoryNotificationService(),
    reservationDurationMs = getInventoryReservationDurationMs()
  ) {
    this.store = store;
    this.notificationService = notificationService;
    this.reservationDurationMs = reservationDurationMs;
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

  reserveInventory(input: ReserveInventoryInput) {
    return this.store.transaction((tx) =>
      reserveInventoryInTransaction(tx, {
        ...input,
        durationMs: input.durationMs ?? this.reservationDurationMs,
      })
    );
  }

  releaseReservation(input: ConsumeReservationInput) {
    const now = input.now ?? new Date();
    return this.store.transaction(async (tx) => {
      validateAttempt(input);
      const reservations = await tx.getAttemptReservations(
        input.checkoutToken,
        input.cartId
      );
      if (reservations.length === 0) {
        throw new InventoryError(
          "reservation_not_found",
          "No checkout reservation was found."
        );
      }
      if (reservations.some((item) => item.ownerKey !== input.ownerKey)) {
        throw new InventoryError(
          "reservation_owner_mismatch",
          "The reservation does not belong to this checkout owner."
        );
      }
      return tx.markAttemptReservations(
        input.checkoutToken,
        input.cartId,
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
  await evaluateAlertState(
    tx,
    availability,
    now,
    notificationService,
    true
  );
  return availability;
}

export async function reserveInventoryInTransaction(
  tx: InventoryTransaction,
  input: ReserveInventoryInput & { durationMs: number }
) {
  const now = input.now ?? new Date();
  validateAttempt(input);
  const items = normalizeReservationItems(input.items);
  const productIds = items.map((item) => item.productId);
  const products = await tx.lockProducts(productIds);
  if (products.length !== productIds.length) {
    const found = new Set(products.map((product) => product.id));
    throw productNotFound(productIds.find((id) => !found.has(id))!);
  }

  const otherReservations = await tx.getActiveReservationTotals(
    productIds,
    now,
    input.checkoutToken
  );
  const existingAttempt = await tx.getAttemptReservations(
    input.checkoutToken,
    input.cartId
  );
  if (
    existingAttempt.some(
      (reservation) => reservation.ownerKey !== input.ownerKey
    )
  ) {
    throw new InventoryError(
      "reservation_owner_mismatch",
      "The reservation does not belong to this checkout owner."
    );
  }
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

  const expiresAt = new Date(now.getTime() + input.durationMs);
  if (!(input.durationMs > 0) || Number.isNaN(expiresAt.getTime())) {
    throw new InventoryError(
      "invalid_attempt",
      "Reservation duration must be positive."
    );
  }

  await tx.upsertReservations(
    items.map((item) => ({
      ownerKey: input.ownerKey,
      cartId: input.cartId,
      checkoutToken: input.checkoutToken,
      productId: item.productId,
      quantity: item.quantity,
      expiresAt,
    }))
  );
  await tx.releaseAttemptReservationsExcept(
    input.checkoutToken,
    input.cartId,
    productIds,
    now
  );

  return { expiresAt, items };
}

export async function consumeReservationInTransaction(
  tx: InventoryTransaction,
  input: ConsumeReservationInput,
  notificationService: InventoryNotificationService
) {
  const now = input.now ?? new Date();
  validateAttempt(input);
  const initial = await tx.getAttemptReservations(
    input.checkoutToken,
    input.cartId
  );
  if (initial.length === 0) {
    throw new InventoryError(
      "reservation_not_found",
      "No checkout reservation was found."
    );
  }

  const productIds = uniqueProductIds(initial.map((item) => item.productId));
  const products = await tx.lockProducts(productIds);
  const reservations = await tx.getAttemptReservations(
    input.checkoutToken,
    input.cartId
  );
  if (
    reservations.some((reservation) => reservation.ownerKey !== input.ownerKey)
  ) {
    throw new InventoryError(
      "reservation_owner_mismatch",
      "The reservation does not belong to this checkout owner."
    );
  }
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
    input.checkoutToken
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
    input.checkoutToken,
    input.cartId,
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
    await evaluateAlertState(
      tx,
      availability,
      now,
      notificationService,
      true
    );
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
  const previous = calculateInventoryAvailability(product, reserved);
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
  await evaluateAlertState(
    tx,
    next,
    now,
    notificationService,
    statusSeverity(next.status) > statusSeverity(previous.status)
  );
  return next;
}

async function evaluateAlertState(
  tx: InventoryTransaction,
  availability: InventoryAvailability,
  now: Date,
  notificationService: InventoryNotificationService,
  emitCurrentAlert: boolean
) {
  const resolve: InventoryAlertType[] = [];
  if (availability.available > availability.lowStockThreshold) {
    resolve.push("low_stock");
  }
  if (availability.available > availability.criticalStockThreshold) {
    resolve.push("critical_stock");
  }
  if (availability.available > 0) resolve.push("out_of_stock");
  if (resolve.length > 0) {
    await tx.resolveAlerts(availability.id, resolve, now);
  }

  const alertType = statusToAlertType(availability.status);
  if (!emitCurrentAlert || !alertType) return;
  const unresolved = await tx.getUnresolvedAlerts(availability.id);
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

function statusSeverity(status: InventoryStatus) {
  return {
    in_stock: 0,
    low_stock: 1,
    critical_stock: 2,
    out_of_stock: 3,
  }[status];
}

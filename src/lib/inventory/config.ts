const DEFAULT_CART_RESERVATION_IDLE_MINUTES = 60;
const DEFAULT_CART_RESERVATION_MAX_MINUTES = 120;
const DEFAULT_CHECKOUT_RESERVATION_MINUTES = 15;
const MIN_RESERVATION_MINUTES = 1;
const MAX_RESERVATION_MINUTES = 24 * 60;

function readDurationMinutes(
  name: string,
  fallback: number,
  environment: NodeJS.ProcessEnv = process.env
) {
  const configured = environment[name]?.trim();
  const minutes = configured ? Number(configured) : fallback;

  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_RESERVATION_MINUTES ||
    minutes > MAX_RESERVATION_MINUTES
  ) {
    throw new Error(
      `${name} must be an integer between ${MIN_RESERVATION_MINUTES} and ${MAX_RESERVATION_MINUTES}.`
    );
  }

  return minutes;
}

export function getCartReservationDurationsMs(
  environment: NodeJS.ProcessEnv = process.env
) {
  const idleMinutes = readDurationMinutes(
    "CART_RESERVATION_IDLE_MINUTES",
    DEFAULT_CART_RESERVATION_IDLE_MINUTES,
    environment
  );
  const maxMinutes = readDurationMinutes(
    "CART_RESERVATION_MAX_MINUTES",
    DEFAULT_CART_RESERVATION_MAX_MINUTES,
    environment
  );
  if (maxMinutes < idleMinutes) {
    throw new Error(
      "CART_RESERVATION_MAX_MINUTES must be greater than or equal to CART_RESERVATION_IDLE_MINUTES."
    );
  }
  return { idleMs: idleMinutes * 60_000, maxMs: maxMinutes * 60_000 };
}

export function getCheckoutReservationDurationMs(
  environment: NodeJS.ProcessEnv = process.env
) {
  const legacy = environment.INVENTORY_RESERVATION_MINUTES?.trim();
  const effectiveEnvironment =
    environment.CHECKOUT_RESERVATION_MINUTES || !legacy
      ? environment
      : { ...environment, CHECKOUT_RESERVATION_MINUTES: legacy };
  return (
    readDurationMinutes(
      "CHECKOUT_RESERVATION_MINUTES",
      DEFAULT_CHECKOUT_RESERVATION_MINUTES,
      effectiveEnvironment
    ) * 60_000
  );
}

/** @deprecated Use getCheckoutReservationDurationMs. */
export const getInventoryReservationDurationMs =
  getCheckoutReservationDurationMs;

export function getCustomerStockDisplayPolicy(
  environment: NodeJS.ProcessEnv = process.env
) {
  const warningThreshold = readNonNegativeInteger(
    "CUSTOMER_LOW_STOCK_MESSAGE_THRESHOLD",
    10,
    environment
  );
  const exactThreshold = readNonNegativeInteger(
    "CUSTOMER_EXACT_STOCK_THRESHOLD",
    5,
    environment
  );
  if (exactThreshold > warningThreshold) {
    throw new Error(
      "CUSTOMER_EXACT_STOCK_THRESHOLD cannot exceed CUSTOMER_LOW_STOCK_MESSAGE_THRESHOLD."
    );
  }
  return { warningThreshold, exactThreshold };
}

function readNonNegativeInteger(
  name: string,
  fallback: number,
  environment: NodeJS.ProcessEnv
) {
  const configured = environment[name]?.trim();
  const value = configured ? Number(configured) : fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;
export const DEFAULT_CRITICAL_STOCK_THRESHOLD = 4;

const DEFAULT_RESERVATION_MINUTES = 15;
const MIN_RESERVATION_MINUTES = 1;
const MAX_RESERVATION_MINUTES = 24 * 60;

export function getInventoryReservationDurationMs(
  environment: NodeJS.ProcessEnv = process.env
) {
  const configured = environment.INVENTORY_RESERVATION_MINUTES?.trim();
  const minutes = configured
    ? Number(configured)
    : DEFAULT_RESERVATION_MINUTES;

  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_RESERVATION_MINUTES ||
    minutes > MAX_RESERVATION_MINUTES
  ) {
    throw new Error(
      `INVENTORY_RESERVATION_MINUTES must be an integer between ${MIN_RESERVATION_MINUTES} and ${MAX_RESERVATION_MINUTES}.`
    );
  }

  return minutes * 60 * 1000;
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;
export const DEFAULT_CRITICAL_STOCK_THRESHOLD = 4;

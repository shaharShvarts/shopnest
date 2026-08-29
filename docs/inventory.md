# ShopNest inventory foundation

## Stock model

- **Physical stock** is `products.quantity`. Zero is valid; negative values are rejected by both the service and PostgreSQL.
- **Reserved stock** is the sum of active cart soft reservations and checkout hard reservations whose `expires_at` is later than the current time.
- **Available stock** is `physical - reserved`. Purchasing requires an active product, the merchant `isAvailable` override, and available stock greater than zero.

`isActive`, `isAvailable`, and stock quantity remain independent. The inventory service in `src/lib/inventory` is the shared source for availability, status, reservations, consumption, adjustment, cleanup, and alerts.

## Two-phase reservation model

**Cart = soft reservation. Checkout = hard reservation. Confirmed payment = inventory consumption.** Adding or changing an item uses the same inventory transaction and product-row locks as checkout, so a successful cart mutation temporarily protects that quantity from other shoppers. The cart row and inventory hold remain separate records: a cart may persist after its hold expires.

Soft reservations have a 60-minute inactivity timeout (`CART_RESERVATION_IDLE_MINUTES`) and a 120-minute absolute lifetime (`CART_RESERVATION_MAX_MINUTES`). Only meaningful shopping mutations—add, remove, quantity change, or checkout transition—refresh the idle expiry. Page loads, images, prefetch, analytics, an open browser tab, and passive availability reads do not refresh it. Refresh is capped by `max_expires_at`; it can never extend the same hold beyond its absolute lifetime.

An expired hold is ignored immediately, without deleting `cart_products`. A later meaningful action revalidates current availability and attempts a new soft hold. If stock has changed, the cart shows the current maximum and lets the shopper reduce quantity rather than silently deleting the item.

## Reservation lifecycle

Both phases use the existing `reservations` table and are distinguished by `type = cart | checkout`. A cart attempt uses its trusted cart ID as its reservation key; checkout uses the server-issued checkout token. Every mutation verifies purpose, cart, and session/user owner before excluding, refreshing, releasing, transitioning, or consuming rows. Conflict updates never rewrite ownership fields.

Cart rows record `started_at`, `last_activity_at`, `expires_at`, and `max_expires_at`. Checkout atomically converts/releases the cart phase while creating/updating the 15-minute hard hold (`CHECKOUT_RESERVATION_MINUTES`), so the same units are never counted twice. Refresh/retry with the same checkout token remains idempotent. Reuse by another cart or owner fails without changing availability.

Availability always excludes rows with `expires_at <= now()`. Correctness therefore does not depend on cron. `InventoryService.cleanupExpiredReservations()` is available for a future scheduled maintenance job and changes expired active rows to `expired`.

Future payment code must call the inventory service rather than updating tables directly:

1. `reserveCartInventory` for meaningful cart mutations.
2. `transitionCartToCheckout` before the protected checkout/payment attempt.
3. `consumeReservation` after confirmed payment. It verifies owner, state, and expiry, decrements physical stock, marks rows consumed, and evaluates alerts atomically.
4. `releaseReservation` after an explicit cancellation; otherwise expiration releases stock logically.

The current checkout creates a `pending` / `pending_payment` order but does not consume inventory or pretend payment succeeded.

## Concurrency and overselling protection

Cart mutation, checkout transition, consumption, and admin stock adjustment lock affected product rows with `SELECT ... FOR UPDATE`, in ascending product-ID order. Active soft and hard reservations are recalculated while those locks are held. Concurrent Add to Cart attempts for the final unit serialize, and only one succeeds. Advisory locks serialize mutations for the same cart/checkout attempt.

All stores receive the existing trusted tenant database object. Tables, row locks, availability totals, reservations, and alerts therefore operate only in the current tenant schema; no schema is accepted from request data and there is no public-schema fallback.

## Status and alerts

Each product has independent thresholds, defaulting to low `10` and critical `4`. Thresholds must be non-negative whole numbers and critical cannot exceed low.

| Available stock | Status |
| --- | --- |
| `> low` | `in_stock` |
| `<= low` and `> critical` | `low_stock` |
| `<= critical` and `> 0` | `critical_stock` |
| `0` | `out_of_stock` |

Reservations affect the live status returned to storefront and future dashboard queries, but transient reservation changes do not send alert events. Completed consumption and admin adjustments evaluate post-transaction available stock. A partial unique index permits only one unresolved alert per product. When severity changes, the previous severity row is resolved before the current severity is persisted; historical rows remain available for audit. Repeated changes within one band do not create new events. Healthy stock resolves the remaining active alert, allowing a later drop to create a fresh event.

`inventory_alerts` records product, type, available quantity, threshold, creation/resolution timestamps, and delivery state. The current `DatabaseOnlyInventoryNotificationService` returns `not_configured`; no email, SMS, WhatsApp, or other delivery is claimed. A future provider can implement `InventoryNotificationService` without coupling delivery to stock transactions.

`InventoryService.getAvailabilityBatch()` supplies physical/reserved/available/status records suitable for a future inventory-health summary and status filtering. This PR intentionally does not add the dashboard.

## Admin and storefront behavior

Product create/edit accepts zero quantity and per-product thresholds. Admin stock changes cannot reduce physical stock below all active soft plus hard reservations. Product cards/details use available stock and a separate customer policy: above 10 shows no warning, 6–10 shows a few-left message, 2–5 shows the exact available quantity, 1 shows last-one, and 0 shows out-of-stock. These defaults are centrally configurable with `CUSTOMER_LOW_STOCK_MESSAGE_THRESHOLD` and `CUSTOMER_EXACT_STOCK_THRESHOLD`; they do not reuse merchant alert thresholds. English and Hebrew use the existing translation catalogs.

The cart allows quantity reduction/removal. Increasing quantity re-locks and revalidates inventory; decreasing/removing releases stock immediately. No visible countdown is included.

## Migration

Tenant migration `0002_classy_bloodstorm.sql`:

- changes the product quantity constraint to `>= 0`;
- adds threshold columns and integrity checks;
- extends the existing reservations table with checkout/cart ownership, state, lifecycle timestamps, uniqueness, foreign keys, and query indexes;
- safely backfills legacy reservation rows as released with unique checkout tokens so old rows cannot unexpectedly hold stock;
- adds tenant-local inventory alert enums, table, constraints, and indexes.

Follow-up migration `0003_free_vermin.sql` safely resolves any duplicate legacy unresolved severities while retaining their history, then enforces one unresolved alert per product. The original `0002` SQL remains unchanged so tenants that already applied it continue to pass migration-integrity hashing.

Migration `0004_soft_cart_reservations.sql` normalizes the legacy reservation purpose, adds the cart/checkout purpose constraint and the start/activity/idle/absolute-expiry timestamps, and safely backfills existing checkout reservations. It remains tenant-scoped and does not introduce another reservation table.

The normal `npm run tenant:create -- <tenant>` path applies the migration to new and existing configured tenant schemas. Existing migrations and tables are retained.

## Local verification

Run `npm run inventory:test`. A useful manual scenario is:

1. Create a product with physical `12`, low `10`, critical `4`; observe available `12`.
2. Add quantity `3` to a cart; observe physical `12`, reserved `3`, available `9` for other carts.
3. Perform meaningful activity before 60 minutes and verify idle expiry refreshes but never exceeds 120 minutes from the hold start.
4. Start checkout; verify reserved remains `3` while purpose changes from soft cart to hard checkout for 15 minutes.
5. Let the hard reservation expire without payment; observe reserved `0`, available `12` without cleanup, while the cart history remains stored.
6. Through the backend service, adjust or consume across `11→10`, `5→4`, and `1→0`; verify only the current severity is unresolved.
7. Restock to `30`; verify the remaining alert resolves.
8. Repeat in two tenants and verify one tenant's reservations never change the other's availability.

## Current limitations

There is no payment provider, real notification delivery, visible countdown, scheduled cleanup, inventory dashboard, or customer authentication in this foundation. Pending checkout orders keep hard reservations until a future payment flow consumes/releases them or they expire. External delivery and payment callbacks must preserve the same tenant context and call the service lifecycle methods above.

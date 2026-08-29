# ShopNest inventory foundation

## Stock model

- **Physical stock** is `products.quantity`. Zero is valid; negative values are rejected by both the service and PostgreSQL.
- **Reserved stock** is the sum of `active` checkout reservations whose `expires_at` is later than the current time.
- **Available stock** is `physical - reserved`. Purchasing requires an active product, the merchant `isAvailable` override, and available stock greater than zero.

`isActive`, `isAvailable`, and stock quantity remain independent. The inventory service in `src/lib/inventory` is the shared source for availability, status, reservations, consumption, adjustment, cleanup, and alerts.

## Cart versus reservation

**CART != RESERVATION.** Adding an item to a cart validates current availability but does not hold stock and does not guarantee a future purchase. Checkout revalidates every cart item and creates the temporary reservation in the same tenant transaction used to create the pending order.

The legacy reservations endpoint is now read-only for availability. Its POST handler returns 405 so a browser probe cannot reserve stock outside checkout.

## Reservation lifecycle

Checkout reservations are keyed by `checkout_token + product_id` and associated with the cart and session/user owner. Reusing a checkout token updates the same rows, so refresh or retry does not multiply reserved stock. The default lifetime is 15 minutes and may be configured with `INVENTORY_RESERVATION_MINUTES` (valid range: 1–1440).

Availability always excludes rows with `expires_at <= now()`. Correctness therefore does not depend on cron. `InventoryService.cleanupExpiredReservations()` is available for a future scheduled maintenance job and changes expired active rows to `expired`.

Future payment code must call the inventory service rather than updating tables directly:

1. `reserveInventory` before the protected checkout/payment attempt.
2. `consumeReservation` after confirmed payment. It verifies owner, state, and expiry, decrements physical stock, marks rows consumed, and evaluates alerts atomically.
3. `releaseReservation` after an explicit cancellation; otherwise expiration releases stock logically.

The current checkout creates a `pending` / `pending_payment` order but does not consume inventory or pretend payment succeeded.

## Concurrency and overselling protection

Reservation, consumption, and admin stock adjustment lock affected product rows with `SELECT ... FOR UPDATE`, in ascending product-ID order. Active reservations are recalculated while those locks are held before rows are inserted or updated. Concurrent attempts for the final unit therefore serialize, and only the first valid attempt succeeds. PostgreSQL constraints provide a second layer of protection for non-negative stock and valid quantities.

All stores receive the existing trusted tenant database object. Tables, row locks, availability totals, reservations, and alerts therefore operate only in the current tenant schema; no schema is accepted from request data and there is no public-schema fallback.

## Status and alerts

Each product has independent thresholds, defaulting to low `10` and critical `4`. Thresholds must be non-negative whole numbers and critical cannot exceed low.

| Available stock | Status |
| --- | --- |
| `> low` | `in_stock` |
| `<= low` and `> critical` | `low_stock` |
| `<= critical` and `> 0` | `critical_stock` |
| `0` | `out_of_stock` |

Reservations affect the live status returned to storefront and future dashboard queries, but transient reservation changes do not send alert events. Completed consumption and admin adjustments evaluate post-transaction available stock. An unresolved unique index deduplicates each product/alert type. Repeated changes within one band do not create new events; worsening threshold crossings do. Restocking resolves alerts whose conditions no longer apply, allowing a later drop to create a fresh event.

`inventory_alerts` records product, type, available quantity, threshold, creation/resolution timestamps, and delivery state. The current `DatabaseOnlyInventoryNotificationService` returns `not_configured`; no email, SMS, WhatsApp, or other delivery is claimed. A future provider can implement `InventoryNotificationService` without coupling delivery to stock transactions.

`InventoryService.getAvailabilityBatch()` supplies physical/reserved/available/status records suitable for a future inventory-health summary and status filtering. This PR intentionally does not add the dashboard.

## Admin and storefront behavior

Product create/edit accepts zero quantity and per-product thresholds. Admin stock changes pass through the inventory transaction, cannot reduce physical stock below active reservations, and keep alert state current. Product cards and details remain visible at zero available stock, show an out-of-stock state, and disable purchase controls. The cart API enforces availability again server-side, and checkout is authoritative if stock changes after the page was loaded.

## Migration

Tenant migration `0002_classy_bloodstorm.sql`:

- changes the product quantity constraint to `>= 0`;
- adds threshold columns and integrity checks;
- extends the existing reservations table with checkout/cart ownership, state, lifecycle timestamps, uniqueness, foreign keys, and query indexes;
- safely backfills legacy reservation rows as released with unique checkout tokens so old rows cannot unexpectedly hold stock;
- adds tenant-local inventory alert enums, table, constraints, and indexes.

The normal `npm run tenant:create -- <tenant>` path applies the migration to new and existing configured tenant schemas. Existing migrations and tables are retained.

## Local verification

Run `npm run inventory:test`. A useful manual scenario is:

1. Create a product with physical `12`, low `10`, critical `4`; observe available `12`.
2. Submit checkout for quantity `3`; observe physical `12`, reserved `3`, available `9`.
3. Let the configured reservation period expire without payment; observe reserved `0`, available `12` without cleanup.
4. Through the backend service, adjust or consume across `11→10`, `10→9`, `5→4`, `4→3`, and `1→0`; verify one LOW, one CRITICAL, and one OUT event.
5. Restock to `30`; verify applicable alerts resolve. Drop to `10`; verify a new LOW event can be created.
6. Repeat in two tenants and verify one tenant's reservations never change the other's availability.

## Current limitations

There is no payment provider, real notification delivery, scheduled cleanup, inventory dashboard, or customer authentication in this foundation. Pending checkout orders keep reservations until a future payment flow consumes/releases them or they expire. External delivery and payment callbacks must preserve the same tenant context and call the service lifecycle methods above.

# ShopNest technical and business specification

## Purpose and status language

This document is the long-term source of truth for agreed ShopNest platform behavior. Future pull requests that introduce or change an important business rule must update this document in the same change. `docs/inventory.md` remains the detailed inventory implementation guide.

The labels in this document are normative:

- **CURRENT / AGREED** means the rule is agreed and implemented unless a subsection explicitly says that only its foundation is implemented.
- **PLANNED** means the architecture is agreed, but the end-to-end feature is not implemented yet.
- **FUTURE / OPEN** means no production behavior should be inferred; product and technical decisions remain open.

## Multi-tenant platform — CURRENT / AGREED

ShopNest is a schema-per-tenant PostgreSQL application. A configured tenant slug such as `panda-pop` maps through trusted normalization to a schema such as `panda_pop`. Only slugs in the authoritative tenant registry resolve as tenants. Unknown tenant paths return 404, and legacy routes such as `/admin`, `/products`, and `/categories` are not interpreted as tenant slugs.

Storefront and tenant-admin routes are rooted at `/<tenant>` and `/<tenant>/admin`. Middleware, route context, database access, media URLs, authentication authorization, carts, checkout, orders, reservations, and inventory all derive the tenant from the trusted routing context. Request fields must never select a schema. Tenant database access must never fall back to `public`, and `getDbForTenant` must never create a pool for an unconfigured tenant.

Runtime catalog media is tenant-scoped. A tenant's product/category media URL and storage path cannot resolve through another tenant. The control plane for administrator identities and assignments is separate from tenant business schemas. Existing Basic Auth and tenant-aware admin authorization remain security boundaries; storefront cart identity uses the existing user/session cookie model.

## Inventory definitions — CURRENT / AGREED

- **Physical stock** is the merchant-owned on-hand quantity stored on the product. Zero is valid; negative stock is invalid.
- **Reserved stock** is the sum of quantities in all active, unexpired cart soft reservations and checkout hard reservations.
- **Available stock** is `physical stock - reserved stock`.
- **Purchasable** additionally requires an active product and the merchant availability switch. These concepts are intentionally independent.

Expired reservations are excluded logically at query time. Correctness does not depend on a cleanup cron. Maintenance may later mark expired rows for operational hygiene, but failure or delay of that job must not lock stock.

## Cart soft reservations — CURRENT / AGREED

Adding an item to a cart creates or updates a soft reservation in the existing reservation system. A successful hold reduces availability for other shoppers. It is bound to the trusted tenant, cart, and owner/session and uses the same protected transaction and row-locking model as checkout.

Default timing is centrally configurable:

- `CART_RESERVATION_IDLE_MINUTES=60`
- `CART_RESERVATION_MAX_MINUTES=120`

The 60-minute idle expiry may refresh only after meaningful shopping activity: adding an item, changing quantity, removing an item, or transitioning to checkout. Passive page requests, image loading, Next.js prefetch, analytics, background polling, and merely leaving a tab open do not refresh a hold. There is no unrestricted keep-alive API.

Every soft hold records its start, last meaningful activity, current idle expiry, and absolute expiry. A refresh is capped at the original absolute expiry. Once that maximum is reached, stock is released logically and any later action must revalidate and establish a new hold.

The cart may outlive its reservation for days. Expiration does not delete or silently alter cart product rows. On a later meaningful action, ShopNest attempts to reserve current stock again. If the cart quantity is no longer available, the customer sees the current available limit and can reduce or remove the item.

Increasing quantity locks the product, excludes only that cart's verified existing hold, recalculates availability, and updates the cart plus reservation atomically. Decreasing quantity releases the difference immediately. Removing a product releases its corresponding hold immediately. Admin stock reductions account for all active soft and hard holds and cannot reduce physical stock below reserved stock.

## Checkout hard reservations — CURRENT / AGREED

Starting checkout atomically transitions the cart's units into a hard reservation; it does not add a second reservation for the same quantity. The default checkout hold is centrally configured with `CHECKOUT_RESERVATION_MINUTES=15`.

The checkout token remains idempotent and is immutably bound to its cart and owner/session. Before any row is excluded, refreshed, moved, released, or consumed, ShopNest verifies the checkout token, cart, owner, purpose, and trusted tenant. Reusing a token from another cart or owner fails without changing the original reservation or availability.

A checkout retry with the same identity refreshes/upserts the same attempt rather than multiplying rows. A payment failure, explicit cancellation, or timeout releases the hard hold explicitly or logically through expiration. No successful payment is simulated in the current implementation.

## Concurrency and overselling — CURRENT / AGREED

Any operation that may change a hold or physical inventory runs in a PostgreSQL transaction. Affected products are locked with `SELECT ... FOR UPDATE` in stable product-ID order, and the relevant cart/checkout attempt is serialized with transaction advisory locks. Availability is recalculated under those locks before mutation. A read followed later by an unprotected insert is forbidden.

This rule applies to concurrent Add to Cart requests, cart quantity changes, cart-to-checkout transition, checkout retry, consumption, release, and admin adjustment. Database constraints enforce positive reservation quantities, valid timing, valid purpose, non-negative physical stock, and alert uniqueness as defense in depth.

## Customer stock messaging — CURRENT / AGREED

Customer urgency messaging is based on **available** stock and is separate from merchant alert thresholds. The centralized defaults are:

- Available above 10: no warning.
- Available 6–10: “Only a few left in stock.”
- Available 2–5: show the exact available quantity.
- Available 1: “Last one in stock.”
- Available 0: “Out of stock.”

The warning and exact thresholds are configurable with `CUSTOMER_LOW_STOCK_MESSAGE_THRESHOLD` and `CUSTOMER_EXACT_STOCK_THRESHOLD`. Storefront text uses the existing localization system, including Hebrew. Product cards keep the message minimal; product details provide the fuller status. The server remains authoritative even when the UI displays availability. A visible reservation countdown is not part of current behavior.

## Merchant inventory alerts — CURRENT / AGREED

Merchant alert severities are `LOW`, `CRITICAL`, and `OUT_OF_STOCK`, calculated from available stock and per-product merchant thresholds. These thresholds do not control customer messaging.

Only the currently relevant severity may be unresolved for a product:

- Entering LOW creates or retains one unresolved LOW alert.
- Entering CRITICAL resolves LOW and creates or retains CRITICAL.
- Reaching OUT_OF_STOCK resolves CRITICAL and creates or retains OUT_OF_STOCK.
- Returning to healthy stock resolves the remaining active alert.

Resolved historical rows remain stored. Repeated movement inside one severity band does not create duplicate unresolved events. A partial unique database index guarantees at most one unresolved alert per product.

The notification abstraction is implemented, but real delivery is not. The database-only provider records `not_configured`; it must never claim an email, SMS, WhatsApp, or push notification was sent. Future providers must implement the existing abstraction without coupling external network calls to stock correctness.

## Orders — CURRENT / AGREED

Checkout creates a tenant-local order from the active cart belonging to the current user/session. Customer and shipping data are validated, product existence is rechecked, totals and `price_at_purchase` are calculated from server-side product prices, order items are copied, and the cart is deactivated atomically. The customer-facing order number is unique and non-sequential. Initial status is `pending`, payment method is explicitly `pending_payment`, and the order is not marked paid.

The current lifecycle ends at a pending order plus a 15-minute hard inventory reservation. The cart and its historical rows are retained; a later request may create a new active cart.

### Payment-provider architecture — PLANNED, NOT IMPLEMENTED

Payment integration will use a provider abstraction owned by ShopNest application code. Each merchant will connect and own its own payment-provider account/credentials; ShopNest must not silently route all tenant sales through one platform merchant account. Secrets belong in secure server-side configuration and must never be accepted from storefront request data or committed to Git.

The planned flow is: create/reuse the pending order and hard reservation, initiate a provider payment attempt with tenant/order idempotency, then process a verified provider callback in trusted tenant context. Only a confirmed successful payment may consume the reservation, decrement physical stock, and move the order to a paid/processing state. Failure/cancellation releases the hold; timeout lets it expire. Callback replay must be idempotent. Exact provider selection, onboarding, fee model, and final status vocabulary remain **FUTURE / OPEN**.

### Invoice-provider architecture — PLANNED, NOT IMPLEMENTED

Invoices/receipts will use a separate provider abstraction after confirmed payment. Merchant invoice accounts and legal business details are merchant-owned and tenant-scoped. Invoice failure must not roll back a confirmed payment or corrupt inventory; it should be recorded for retry and operator visibility. Provider selection, document types, numbering rules, tax localization, cancellation documents, and retry policy are **FUTURE / OPEN**.

## Inventory Admin dashboard — FUTURE / OPEN

The inventory service already exposes physical/reserved/available/status data suitable for a future dashboard, but no full dashboard is implemented. The future dashboard may include health summaries, filters, active holds, alert history, adjustment controls, and operational drill-down. Permissions, bulk operations, data retention, and whether reservation owner details are visible remain open. Any dashboard must use tenant-aware authorization and the inventory service rather than direct unprotected writes.

## Open Decisions / Future Features — FUTURE / OPEN

Everything in this section is explicitly undecided and must not be described as current functionality.

### Catalog and inventory

- **Product variants and per-variant stock:** variant model, SKU uniqueness, option combinations, pricing, media, and reservation granularity.
- **Products without inventory tracking:** merchant controls and storefront semantics when stock is intentionally not tracked.
- **Digital/unlimited products:** fulfillment, download rights, taxation, and whether reservations are bypassed.
- **Backorders and pre-orders:** eligibility, promised dates, caps, messaging, charging time, and negative/virtual stock representation.
- **Inventory audit history:** immutable adjustment ledger, actor identity, reason codes, import reconciliation, retention, and export.

### Customer and commerce lifecycle

- **Abandoned cart recovery:** consent, contact eligibility, recovery links, messaging cadence, and whether recovery attempts ever re-reserve inventory (they must not do so silently).
- **Customer accounts:** registration, login, guest-account linking, tenant identity boundaries, order history, address book, and deletion/export rights.
- **Refunds:** payment-provider workflow, order states, inventory return policy, and accounting/invoice effects.
- **Partial refunds:** line allocation, quantity handling, shipping/tax allocation, multiple refund attempts, and idempotency.
- **Shipping and fulfillment:** rate calculation, carrier integration, shipment states, tracking, split shipments, pickup, and fulfillment permissions.
- **Returns:** authorization, return windows, condition, restocking decisions, exchanges, shipping labels, and invoice documents.
- **Subscriptions:** recurring products, renewal reservations, failed-payment recovery, cancellation, plan changes, and tenant/provider support.

### Platform and operations

- **Notification preferences:** merchant/customer channels, severity subscriptions, quiet hours, consent, localization, and escalation.
- **Custom domains:** domain verification, TLS, routing, canonical URLs, cookies, tenant discovery, and takeover prevention.
- **Analytics:** event taxonomy, tenant dashboards, attribution, inventory funnels, privacy/consent, retention, and export.

## Change-control rule

An implementation PR that changes tenant isolation, inventory calculation, reservation timing/activity, checkout/payment/order behavior, customer stock policy, alert lifecycle, or another material business rule must update this specification. An undecided idea moves out of **FUTURE / OPEN** only when the product decision is explicit and the implementation status is accurately stated.

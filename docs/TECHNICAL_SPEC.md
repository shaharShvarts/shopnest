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

## Customer identity — CURRENT / AGREED

Customer identity is global and optional. `customer_accounts`, provider identities, tenant memberships, customer sessions, and short-lived OAuth transactions live in the `public` control plane; carts, reservations, orders, and order items remain in the current tenant schema. Tenant commerce rows may store the global customer ID as an opaque identifier, but there is no cross-schema foreign key and customer identity never selects a tenant schema. Tenant membership records only first/last-seen association metadata and grants no administrator role or access to another tenant's commerce data.

Guest shopping and checkout remain first-class. A customer may register or sign in with email and password through tenant-prefixed account routes, while customer and administrator authentication use separate repositories, routes, cookies, and authorization checks. Passwords use the project's salted scrypt implementation with constant-time key comparison and a 12-character minimum. Customer sessions use cryptographically random opaque tokens whose SHA-256 hashes are stored server-side. Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` when the actual request protocol is HTTPS, and remain usable over local HTTP. An unchecked Remember Me option creates a 24-hour session; a checked option creates a 30-day session. These durations are selected only by server policy from the boolean choice, and the database expiry and cookie lifetime match. Successful authentication rotates the existing customer session. Authentication failures do not reveal whether an email exists. Disabled accounts cannot authenticate. Google customer sign-in is implemented as described below. Apple remains `planned` and is not presented as a working sign-in method.

### Google customer authentication — CURRENT / AGREED

Google Login uses Google's OpenID Connect Authorization Code flow with PKCE. ShopNest creates a cryptographically random state, nonce, browser-binding secret, and PKCE verifier. Only hashes of state, nonce, and the browser binding are stored in the public control plane. The PKCE verifier is retained only inside the short-lived server-side OAuth transaction and the entire transaction is atomically deleted when consumed. Transactions expire after 10 minutes, can be used once, and are bound to one configured tenant and one safe tenant-local callback. A separate `HttpOnly`, `SameSite=Lax`, protocol-aware callback cookie binds the authorization response to the browser that started it and protects against login CSRF.

The global callback exchanges the authorization code directly with Google's token endpoint and verifies the ID-token signature against Google's JWKS. Issuer, audience/authorized party, expiry, nonce, stable Google `sub`, email, and `email_verified=true` are mandatory. Google `sub`, not email, is the permanent provider key. ShopNest requests only `openid email profile`, requests no offline access, and does not persist Google access tokens, ID tokens, or refresh tokens.

An existing Google provider identity signs into its existing global customer account. A new verified Google identity creates one global account and one provider identity transactionally. Automatic linking to an existing password account is allowed only when Google's verified email exactly matches ShopNest's normalized email, the ShopNest account is active, and the provider identity is not assigned elsewhere. PostgreSQL email/provider uniqueness, advisory locks, and conflict checks prevent duplicate or stolen identities during concurrent first login. A later Google email change may update provider metadata but never silently overwrites the ShopNest account email. Disabled accounts cannot authenticate.

After Google verification, ShopNest records the current trusted tenant membership, executes the same tenant-local anonymous-cart link/merge service used by password authentication, and issues a normal 24-hour opaque ShopNest customer session. Google tokens never become ShopNest sessions. Tenant/schema selection comes only from the consumed transaction and authoritative tenant registry; callback query data cannot select a schema. ShopNest logout revokes only the ShopNest session and does not sign the customer out of Google.

Google configuration is server-only: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are required, and `GOOGLE_REDIRECT_URI` may specify the exact callback when host/proxy discovery is unsuitable. The authorized redirect URI must be exactly `<origin>/api/customer-auth/google/callback`; production uses HTTPS, while Google-compatible localhost HTTP is accepted for development. Missing or invalid configuration disables the Google action and direct starts fail with controlled tenant-local UX rather than an application error. Credentials must never be committed or exposed to the browser.

Customer password recovery is available through tenant-prefixed forgot/reset pages, while the credential being changed remains the global customer identity. Forgot-password responses are neutral and indistinguishable for active, missing, and disabled customer accounts. Eligible requests create at most one active reset token after a per-account cooldown. The browser receives a cryptographically random 256-bit raw token; only its SHA-256 hash is stored in the public control plane. Tokens expire after 30 minutes, are single-use, and are never used to choose a tenant or schema.

Password reset verifies and consumes the token transactionally, applies the same salted scrypt password hashing and 12-character policy, invalidates every other outstanding reset token for the customer, and revokes all normal and remembered customer sessions. Tenant memberships are unchanged, the resetting browser must sign in again, and administrator identities are outside this repository and cannot use the customer flow. The reset delivery boundary is implemented. Development/test mode emits the tenant-prefixed URL through an explicitly development-only provider. A production-built local Docker image may opt in only for local acceptance with `SHOPNEST_PASSWORD_RESET_DEV_CAPTURE=1`; normal production defaults never log the raw token. Production email delivery is currently unconfigured.

After successful registration or sign-in, an anonymous cart is linked inside the trusted current tenant. If no account cart exists, its ownership and verified reservation attempt move to the customer. If both carts exist, their quantities are merged under transaction locks and capped at current availability after excluding only the two verified existing holds. The guest hold is released and one customer hold is established, so reservations are not double-counted. Reduced quantities are reported to the customer. Cart rows remain tenant-local and historical carts are not deleted.

Registered checkout stores the global customer identifier on the tenant-local order while retaining the same server-side pricing, inventory and transaction rules as guest checkout. The account area lists only orders from the current trusted tenant schema belonging to that customer. Registration is not required to check out, and orders made before account creation are not retroactively linked.

### Customer identity evolution — FUTURE / OPEN

Email verification delivery, production password-reset email-provider selection/configuration, post-purchase guest-order claiming, saved address books, profile/preferences management, account deletion/export workflow, and Apple OAuth are not implemented. Their security, consent, retention, identity-linking, reauthentication and tenant-visibility rules require explicit decisions before implementation.

## Storefront catalog hierarchy — CURRENT / AGREED

The customer catalog follows the stored category hierarchy instead of flattening every product into its parent category. A category page displays its active, non-deleted subcategories and only its **direct products**, defined as products whose `category_id` matches the category and whose `subcategory_id` is `NULL`. Products assigned to a subcategory intentionally do not appear in the parent category's direct-product grid.

A subcategory page at `/<tenant>/categories/<categoryId>/subcategories/<subcategoryId>` displays only active, storefront-available, non-deleted products for which both IDs match. The server validates that the active, non-deleted subcategory belongs to the active, non-deleted category; mismatched or unavailable combinations return 404. URL IDs never select a tenant or schema.

Category, subcategory, product-detail, and search surfaces share the responsive product card, tenant-aware media resolver, centralized inventory availability and customer stock-message policy, and the existing cart reservation path. Zero-available products remain visible but cannot be added to the cart. Breadcrumbs reflect `Home > Category > Subcategory > Product`, omitting the subcategory segment for direct category products.

## Storefront search — CURRENT / AGREED

ShopNest provides tenant-aware product search at `/<tenant>/search?q=<query>`. Search database access is created only from the trusted server-side tenant context; the URL and form never accept a schema or database selector. Results, inventory, and media therefore remain isolated to the current tenant.

The current implementation uses parameterized PostgreSQL `ILIKE` matching across product name, product description, category name, and subcategory name. Queries are trimmed server-side, limited to 100 characters, and empty queries return a prompt rather than the entire catalog. The initial result limit is 24, with a service boundary that can support pagination and filters later.

Search applies the same storefront visibility rules as normal catalog pages: product and category must be active and not deleted, merchant-disabled products are excluded, and an attached subcategory must be active and not deleted. A product with zero **available** inventory remains visible and is labeled out of stock. All result stock data comes from the central inventory service, including physical, reserved, available, status, and the existing customer stock-message policy. Search reuses the shared responsive product card and tenant-aware media resolver.

Product-name matches are listed before description/category/subcategory-only matches, followed by stable product name and ID ordering. No new index is added for the leading-wildcard `ILIKE` query because a normal B-tree index would not accelerate that pattern reliably.

### Search evolution — FUTURE / OPEN

Typo tolerance, autocomplete, search suggestions, recent searches, popular searches, advanced category/subcategory/price/availability filters, and relevance/ranking tuning are not implemented. PostgreSQL `pg_trgm`, PostgreSQL full-text search, and external search infrastructure remain **FUTURE / OPEN** options that require demonstrated scale or product need. No external search service is currently part of ShopNest.

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

Checkout now calls the tenant payment framework after creating the pending order and 15-minute hard inventory reservation. All current provider definitions are non-live; without an implemented provider, the order remains pending. The cart and its historical rows are retained; a later request may create a new active cart.

## Shipping and fulfillment — CURRENT / AGREED

Shipping configuration is commerce data stored independently in every tenant schema. A method has a merchant-defined name and code, one of the supported types (`home_delivery`, `pickup_point`, or `store_pickup`), active state, non-negative integer price, optional non-negative free-shipping threshold, and sort order. No method is enabled or priced automatically for a new tenant. Deactivation is preferred to deletion so historical references remain understandable.

Checkout lists only active methods loaded from the trusted current tenant. The browser submits only `shippingMethodId`; it cannot submit an authoritative shipping amount or schema. Inside the order transaction, ShopNest reloads that active tenant-local method and calculates shipping from the current server-side product subtotal. A non-null threshold makes shipping free when the products subtotal is at or above it; otherwise the configured price applies. A zero-price method is always free. The final total is `items_subtotal + shipping_total`, using the existing integer ILS representation.

The order snapshots the method ID where available, code, name, type, charged price, whether its threshold applied, product subtotal, shipping total, and final total. Later method edits or deactivation cannot alter the historical order. Home delivery requires and snapshots a complete checkout address. Store pickup requires no fake delivery address. Pickup-point methods are only a safe type foundation in the current implementation; no external point is selected or implied.

Fulfillment state is separate from order/payment state. Supported states are `unfulfilled`, `processing`, `shipped`, `delivered`, `ready_for_pickup`, `picked_up`, and `cancelled`. New orders begin `unfulfilled`. Authorized tenant admins may correct the state and manually record a bounded tracking number for delivery orders. Entering shipped, delivered, ready-for-pickup, or picked-up records the corresponding timestamp once. Store pickup uses pickup states and has no tracking number; delivery methods use shipped/delivered states. Customer order history shows the tenant-local shipping snapshot, fulfillment state, and tracking number when present. Guest and authenticated checkout use the same shipping calculation and isolation rules.

Shipping calculation does not reserve, release, or consume inventory. The existing inventory service continues to own those semantics. The initial payment method remains `pending_payment`; the shipping total is included in the server-authoritative amount passed to the payment framework. Shipping never confirms payment.

### Payment-provider framework — CURRENT / AGREED (network providers PLANNED)

Tenant admins configure their own provider through /<tenant>/admin/payments. A singleton tenant-local settings row guarantees one selected provider; provider metadata drives fields, validation and capabilities. Cardcom configuration metadata is implemented; Cardcom, Pelecard and Tranzila network adapters are explicitly non-live and cannot be activated. There is no fake success or connection test. See [payments.md](payments.md) for the support matrix and official-documentation gaps.

Credentials use server-only AES-256-GCM encryption with PAYMENT_ENCRYPTION_KEY, authenticated to tenant/provider/environment. The browser receives configured-state indicators only. Tenant settings never use a public database fallback. Payment attempts preserve encrypted configuration snapshots so replacement does not change in-flight verification.

Checkout reloads the owned tenant order and server amount, validates the bound hard reservation and persists one idempotent attempt before a provider call. Pending-link reuse revalidates order state, amount/currency, selected/enabled provider and reservation binding, including after the provider creation response. Ambiguous creation is never blindly retried. Payment access accepts verified customer or opaque guest-session ownership, never the unsigned legacy user_id cookie; older user-owned commerce records need migration before using this framework. Only authenticated adapter evidence matching tenant-local attempt, provider reference, order amount and currency may confirm payment. A return URL is read-only and cannot mark paid.

Confirmation locks the order/attempt and consumes the complete matching hard reservation through the existing inventory abstraction in the same transaction as payment/order updates. Verified payment decrements physical stock once and changes payment_status to paid and order status to processing. Replays cannot decrement again or regress paid. Failed/cancelled/expired outcomes do not decrement stock and release the hold; missing callbacks retain logical expiry. Verified funds after an expired/released hold become review_required, leaving stock and order payment status unchanged for operator reconciliation.

The legacy iCount payment route is explicitly retired with HTTP 410. Its old shipping caller now redirects to tenant checkout. ShopNest collects/stores no raw card data. Live Cardcom verification, provider status reconciliation, connection tests where supported, new payment attempts after failure and refunds are PLANNED; provider-specific contracts must be verified before activation.

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
- **Customer account expansion:** saved address books, profile preferences, post-purchase guest-order claiming, deletion/export automation, Apple/Facebook sign-in, and social-provider account-management UI beyond the current Google Login behavior.
- **Refunds:** payment-provider workflow, order states, inventory return policy, and accounting/invoice effects.
- **Partial refunds:** line allocation, quantity handling, shipping/tax allocation, multiple refund attempts, and idempotency.
- **Shipping evolution:** carrier APIs, automatic tracking, shipping-label generation, real pickup-point provider selection and metadata snapshots, dynamic carrier rates, split shipments, multi-package fulfillment, returns labels, and merchant pickup schedules/instructions.
- **Returns:** authorization, return windows, condition, restocking decisions, exchanges, shipping labels, and invoice documents.
- **Subscriptions:** recurring products, renewal reservations, failed-payment recovery, cancellation, plan changes, and tenant/provider support.

### Platform and operations

- **Notification preferences:** merchant/customer channels, severity subscriptions, quiet hours, consent, localization, and escalation.
- **Custom domains:** domain verification, TLS, routing, canonical URLs, cookies, tenant discovery, and takeover prevention.
- **Analytics:** event taxonomy, tenant dashboards, attribution, inventory funnels, privacy/consent, retention, and export.

## Change-control rule

An implementation PR that changes tenant isolation, inventory calculation, reservation timing/activity, checkout/payment/order behavior, customer stock policy, alert lifecycle, or another material business rule must update this specification. An undecided idea moves out of **FUTURE / OPEN** only when the product decision is explicit and the implementation status is accurately stated.

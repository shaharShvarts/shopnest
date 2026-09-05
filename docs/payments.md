# Tenant payment framework

## CURRENT / AGREED

Each merchant owns its payment account. Settings and transactions live only in that merchant's tenant schema. `DrizzlePaymentStore` requires a configured tenant and rejects missing/mismatched context before calling `getDbForTenant`; it never uses the public database fallback. Admin reads and writes require `requireTenantAdminDb`. Middleware replaces client-supplied tenant headers from configured routing. Neither settings input nor checkout input selects a schema.

`/<tenant>/admin/payments` selects one provider and environment, stores/replaces configuration, shows configured-state indicators, and lists the latest 25 payment attempts. English and Hebrew strings use next-intl. A singleton settings row (`id = 1`, primary key plus CHECK) guarantees at most one selected/enabled provider. All providers in this release are non-live and cannot be enabled. Selecting another provider replaces the previous selection. Existing attempts retain their verification snapshot, but their checkout links cannot be resumed after disabling or changing the selected provider/environment.

### Provider support matrix

| Provider | Configuration | Network operations | Connection test |
| --- | --- | --- | --- |
| Cardcom | Terminal number and API username; test/production slots | Not implemented; activation blocked | Unsupported |
| Pelecard | Reserved definition; credential and environment contract pending | Not implemented; activation blocked | Unsupported |
| Tranzila | Reserved definition; credential and environment contract pending | Not implemented; activation blocked | Unsupported |

The runtime registry has no fake-success adapter. Unsupported methods throw `not_implemented`. Test adapters exist only under tests. A saved configuration does **not** establish that credentials are accepted by the provider. Pelecard/Tranzila currently expose only a non-live production placeholder; no sandbox endpoint or credential field is invented.

The central registry supplies metadata, credential validation, capability flags and adapter factories. UI receives a deliberately projected metadata object, not factories or validators. The provider contract defines hosted payment creation, authenticated callback verification and provider status retrieval, with optional connection testing. Refunds and provider cancellation operations are outside this release.

### Secret storage

Set `PAYMENT_ENCRYPTION_KEY` to a base64-encoded, cryptographically random **32-byte key**, using the deployment secret manager. AES-256-GCM uses a fresh 12-byte IV and 16-byte authentication tag for every encryption. The `v1` envelope is authenticated with tenant slug, provider and environment as additional authenticated data. Copying ciphertext to another tenant or environment fails authentication.

The key is never stored in PostgreSQL. No default key or plaintext fallback exists. Missing/invalid key configuration blocks credential saving/use. All credential fields, including the terminal identifier, are encrypted. The client receives only provider/environment/enabled and configured field names. Blank fields preserve saved values only for the same provider and environment; replacement requires new input. Settings updates decrypt only inside the server-side merge boundary. Adapter invocation decrypts only on the server. Errors contain normalized codes rather than provider/SQL error text; submitted secrets and raw responses are never logged.

Keep the encryption key available for the lifetime of in-flight attempts. Each attempt retains an encrypted configuration snapshot so later merchant credential replacement cannot silently change which account verifies the payment. Backup the key securely. Automated key rotation/re-encryption and retention policies are FUTURE / OPEN; changing the key without re-encrypting existing rows makes them unreadable.

`PAYMENT_PUBLIC_ORIGIN` is the canonical public HTTPS origin used for return/callback URLs (for example `https://shop.example`). It must contain no path, query, credentials or fragment. Request Host headers never set payment URLs. This setting does not enable a provider. No provider callbacks or external charges were exercised for this release.

### Database migration

`0007_payment_provider_framework.sql` adds tenant-local `payment_provider_settings`, `payment_transactions`, and `orders.payment_status` / `orders.paid_at`. It is additive and does not infer historical successful payments. Existing orders default to pending. Apply through the established **tenant migration/provisioning path**, which scopes Drizzle's public-qualified references to the tenant. Do not run raw tenant SQL against public. The migration must precede deploying code that reads the new columns/tables.

Attempt UUID and external reference provide durable idempotency. Unique order ID guarantees one attempt per order. Provider/environment/transaction reference and external reference are unique within the tenant. Positive amount, currency, provider, environment, status and confirmation constraints reject invalid database states. Only normalized failure codes are stored, not arbitrary provider failure messages or payment/card payloads.

### Checkout and confirmation

1. Existing checkout creates/reuses its server-priced order and hard reservation atomically. `pending_payment` remains the initial method, `orders.status` remains `pending`, and `payment_status` is `pending`.
2. The payment service reloads and locks that tenant's order, checks current customer/session ownership, selected/enabled provider, amount, currency and reservation binding. Amounts use the existing ShopNest **integer major currency units**. An eventual adapter must explicitly convert to the provider contract; do not assume cents.
3. One durable `created` attempt is committed **before** a network call. The network call does not hold order/product locks. Simultaneous requests reuse the same attempt. Credential snapshot and tenant-prefixed random external reference cannot be supplied by the browser.
4. A validated hosted redirect moves the attempt to `pending`. A timeout, malformed response, or crash after creation remains ambiguous (`created` / `creation_unconfirmed`); ShopNest never automatically creates another payment. Manual reconciliation is required until provider-specific status recovery exists.
5. A callback endpoint is available at `/<tenant>/api/payments/<attempt UUID>/callback` (POST, 64 KiB body limit). It loads the tenant-local attempt and invokes the registered adapter's verification method. All current adapters fail closed. A live provider must authenticate the callback or retrieve the status directly from its trusted server; payload fields are not evidence.
6. Authenticated evidence must match provider, external reference, provider transaction reference, expected order amount and currency. Confirmation locks the order then attempt, rechecks bindings and enters the existing inventory abstraction in the **same PostgreSQL transaction**. The checkout advisory lock and product row locks retain existing ordering. The complete reservation item/quantity set must match the order, together with checkout token, cart, owner and checkout purpose.
7. Successful consumption decrements physical stock, consumes reservations, sets `payment_status=paid`, `paid_at`, order status `processing`, payment method to provider ID, and attempt `paid`/`confirmed_at` atomically. An error rolls the entire transaction back. Repeated valid confirmation returns the terminal state without another decrement.

Payment ownership accepts a verified customer session or the opaque guest-session identifier. The unsigned legacy `user_id` cookie cannot authorize payment initiation or return-page access; legacy user-owned carts/orders need migration to verified customer accounts before using payments. This restriction does not redesign the older commerce identity paths.

Before returning a pending checkout link, the service rechecks the current order state, amount/currency, provider selection and complete reservation binding. It repeats this check after provider creation; an expired hold suppresses the link while retaining the provider reference for reconciliation.

The return page only reads the authenticated customer's payment status. Query parameters, refreshes and successful browser navigation never mark paid. Checkout distinguishes order creation from payment. If a provider is unavailable, the committed order remains unpaid and the hold expires; the UI does not claim payment success.

### Failure and late confirmation

Central states: `created`, `pending`, `paid`, `failed`, `cancelled`, `expired`, `review_required`. Failure, cancellation and provider-confirmed expiry release the bound hard reservation without decrementing stock. Without a callback, the existing logical 15-minute expiration remains authoritative; no cleanup job is required for availability. A failure callback cannot overwrite paid or another terminal outcome.

Verified funds arriving after reservation expiry/release or order cancellation are recorded as `review_required`, with confirmation time. Stock is not consumed and the order is not marked paid/fulfillable. The recent-payments admin list exposes this state. Operator reconciliation/refund requires provider-side investigation; no automatic refund or fulfilment is claimed. Automatic status polling, retry checkout/new attempts, recovery of a provider-created attempt whose response was lost, and operator resolution UI are PLANNED before live rollout.

### PCI / card-data boundary

ShopNest has no fields or APIs for full card numbers, CVV, track data or sensitive card authentication data. Future adapters must use official hosted checkout. Callback bodies exist only transiently for adapter verification and are not persisted or logged. Do not store the raw provider response even if a provider's guide suggests doing so. The database contains normalized payment references and amounts, not card data.

### Legacy iCount decision

The old `/api/iCount/payment` prototype accepted a client amount and used platform-wide environment credentials. It had no tenant order/reservation binding or authenticated confirmation. Its consumers were a prototype checkout component and the old shipping action; the current `submitCheckout` path did not use it.

Decision C: explicitly deprecate, preserving the route with `410 Gone` and a generic message directing clients to tenant checkout. It no longer accesses credentials or makes network calls. The prototype component links to checkout; the shipping action retains address-cookie behavior and redirects to tenant checkout. No silent deletion or compatibility route can bypass order/payment invariants. Historical iCount credentials are not migrated or reused.

## Cardcom integration — PLANNED

Official material reviewed:

- [Cardcom v11 hosted payment and status guide](https://cardcomapi.zendesk.com/hc/he/articles/28448202810514-Step-1-2-Creating-a-payment-page-sending-a-request-to-retrieve-transaction-details-Iframe-Redirect)
- [Official v11 API reference](https://secure.cardcom.solutions/Api/v11/Docs)
- [Official test-environment guidance](https://support.cardcom.solutions/hc/he/articles/360002688814)

The guide describes status verification after notification, but calls status retrieval GET while showing a JSON body. Its field table and sample also differ on transaction-ID spelling. The machine-readable reference was not retrievable in this environment. Therefore this release does not guess a usable network contract or claim an end-to-end Cardcom integration.

Required before implementing/enabling the adapter:

- Resolve the status HTTP method, authenticated request contract, exact response fields/types and successful-charge evidence using the current official OpenAPI specification.
- Confirm currency mapping, amount units, transaction-ID precision, terminal/environment binding and hosted-URL validation rules.
- Confirm test versus production endpoints/credentials, webhook method/fields, retries, error classification and late-result behavior.
- Obtain merchant-authorized sandbox credentials; exercise creation, declined, cancelled, expired, duplicate and late callbacks without real charges.
- Establish provider-supported idempotency/reconciliation after ambiguous creation and a safe hosted-page expiry policy aligned with inventory holds.
- Add sanitized contract fixtures, authenticated verification, timeouts, safe redirect allowlists and provider-specific regression tests; then set capability/live flags.

Pelecard and Tranzila require their own official onboarding/credential, hosted-page, verification and environment contracts before fields or capabilities are added. Automatic refunds, receipt issuance, automated reconciliation and key rotation remain FUTURE / OPEN.

## Validation

`npm run payment:test` runs 55 tests with isolated fake adapters and the actual inventory domain abstraction. It covers configuration, authenticated encryption, secret projections, owner/tenant boundaries, server-priced amounts, concurrent starts/confirmations, rollback, terminal states, expiry/review handling, and the retired route. Server-only modules run under Node's `react-server` condition for these tests; no fake adapter is bundled into the application.

`node --test tests/payment-db.test.mjs` is an explicit PostgreSQL integration check using the configured development database. It creates two random test schemas inside a transaction, runs every tenant migration, tests payment constraints and isolated reads/updates, and rolls everything back. It never migrates existing tenants. It requires schema-creation permission and is separate from the default payment unit suite.

Required checkout, inventory, shipping, customer-auth, admin-auth, admin-ui and tenant suites, plus storefront-ui and Google-auth regressions, pass. TypeScript, lint and the production build pass. Local browser acceptance also covers disabled dummy-credential storage/replacement, tenant isolation, English/Hebrew layouts and pending guest checkout. This does not constitute provider sandbox certification; network operations remain disabled.

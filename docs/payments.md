# Tenant payment framework

## CURRENT / AGREED

Each merchant owns its payment account. Settings and transactions live only in that merchant's tenant schema. `DrizzlePaymentStore` requires a configured tenant and rejects missing/mismatched context before calling `getDbForTenant`; it never uses the public database fallback. Admin reads and writes require `requireTenantAdminDb`. Middleware replaces client-supplied tenant headers from configured routing. Neither settings input nor checkout input selects a schema.

`/<tenant>/admin/payments` selects one provider and environment, stores/replaces configuration, shows configured-state indicators, and lists the latest 25 payment attempts. English and Hebrew strings use next-intl. A singleton settings row (`id = 1`, primary key plus CHECK) guarantees at most one selected/enabled provider. All providers remain non-live. Only Cardcom Test can be enabled, using the official non-charging terminal 1000; Production and other providers remain blocked. Selecting another provider replaces the previous selection. Existing attempts retain their verification snapshot, but their checkout links cannot be resumed after disabling or changing the selected provider/environment.

### Provider support matrix

| Provider | Configuration | Network operations | Connection test |
| --- | --- | --- | --- |
| Cardcom | Terminal number, API username and API password; isolated slots | Read-only terminal lookup; Test-only hosted creation and authenticated success verification | GetUserTerminalList |
| Pelecard | Reserved definition; credential and environment contract pending | Not implemented; activation blocked | Unsupported |
| Tranzila | Reserved definition; credential and environment contract pending | Not implemented; activation blocked | Unsupported |

The runtime registry has no fake-success adapter. Unsupported methods throw `not_implemented`. Cardcom has Test-only hosted payment support described below. The shared activation policy requires hosted/verification capabilities and an explicit Test capability; Production additionally requires live support, which remains false. Server-side activation and adapter invocation both enforce terminal 1000. Test doubles exist only under tests. A saved configuration does **not** establish that credentials are accepted by the provider. Pelecard/Tranzila currently expose only a non-live production placeholder; no sandbox endpoint or credential field is invented.

The central registry supplies metadata, credential validation, capability flags and adapter factories. UI receives a deliberately projected metadata object, not factories or validators. The provider contract defines hosted payment creation, authenticated callback verification and provider status retrieval, with optional connection testing. Refunds and provider cancellation operations are outside this release.

### Secret storage

Set `PAYMENT_ENCRYPTION_KEY` to a base64-encoded, cryptographically random **32-byte key**, using the deployment secret manager. AES-256-GCM uses a fresh 12-byte IV and 16-byte authentication tag for every encryption. The `v1` envelope is authenticated with tenant slug, provider and environment as additional authenticated data. Copying ciphertext to another tenant or environment fails authentication.

The key is never stored in PostgreSQL. No default key or plaintext fallback exists. Missing/invalid key configuration blocks credential saving/use. All credential fields, including the terminal identifier, are encrypted. The client receives only provider/environment/enabled and configured field names. Blank fields preserve saved values only for the same provider and environment; replacement requires new input. Settings updates and connection tests decrypt only inside the shared server-side merge boundary. Adapter invocation decrypts only on the server. Errors contain normalized codes rather than provider/SQL error text; submitted secrets and raw responses are never logged.

Keep the encryption key available for the lifetime of in-flight attempts. Each attempt retains an encrypted configuration snapshot so later merchant credential replacement cannot silently change which account verifies the payment. Backup the key securely. Automated key rotation/re-encryption and retention policies are FUTURE / OPEN; changing the key without re-encrypting existing rows makes them unreadable.

`PAYMENT_PUBLIC_ORIGIN` is the canonical public HTTPS origin used for return/callback URLs (for example `https://shop.example`). It must contain no path, query, credentials or fragment. Request Host headers never set payment URLs. This setting does not enable a provider. No provider callbacks or external charges were exercised for this release.

### Database migration

`0007_payment_provider_framework.sql` adds tenant-local `payment_provider_settings`, `payment_transactions`, and `orders.payment_status` / `orders.paid_at`. It is additive and does not infer historical successful payments. Existing orders default to pending. Apply through the established **tenant migration/provisioning path**, which scopes Drizzle's public-qualified references to the tenant. Do not run raw tenant SQL against public. The migration must precede deploying code that reads the new columns/tables.

Attempt UUID and external reference provide durable idempotency. Unique order ID guarantees one attempt per order. Provider/environment/transaction reference and external reference are unique within the tenant. Positive amount, currency, provider, environment, status and confirmation constraints reject invalid database states. Only normalized failure codes are stored, not arbitrary provider failure messages or payment/card payloads.

Migration `0008_cardcom_charge_reference.sql` adds only a nullable charge-reference text column, a positive signed-int64 decimal-format CHECK and a tenant-local unique charge index. It does not change the state model or backfill historical payments. Apply through the same tenant provisioning path before deploying these reads.

### Checkout and confirmation

1. Existing checkout creates/reuses its server-priced order and hard reservation atomically. `pending_payment` remains the initial method, `orders.status` remains `pending`, and `payment_status` is `pending`.
2. The payment service reloads and locks that tenant's order, checks current customer/session ownership, selected/enabled provider, amount, currency and reservation binding. Amounts use the existing ShopNest **integer major currency units**. The Cardcom adapter serializes exact major-unit decimal JSON; it never treats these values as cents.
3. One durable `created` attempt is committed **before** a network call. The network call does not hold order/product locks. Simultaneous requests reuse the same attempt. Credential snapshot and tenant-prefixed random external reference cannot be supplied by the browser.
4. A validated hosted redirect moves the attempt to `pending`. A timeout, malformed response, or crash after creation remains ambiguous (`created` / `creation_unconfirmed`); ShopNest never automatically creates another payment. Manual reconciliation is required until provider-specific status recovery exists.
5. A callback endpoint is available at `/<tenant>/api/payments/<attempt UUID>/callback` (POST, 64 KiB body limit). It loads the tenant-local attempt and invokes the registered adapter's verification method. Cardcom retrieves authenticated GetLpResult evidence from its fixed endpoint. Other providers fail closed; callback payload fields are never evidence.
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

## Cardcom hosted adapter — CURRENT Test-only implementation

The v11 [machine-readable OpenAPI specification](https://secure.cardcom.solutions/swagger/v11/swagger.json), retrieved on 2026-09-05 from the official API reference's Redoc configuration, resolves the older English guide's GET/POST and transaction-name inconsistencies. The [Hebrew guide](https://cardcomapi.zendesk.com/hc/he/articles/25264402497426) also specifies POST. Only the success path is implemented; no Cardcom non-success code is assigned terminal semantics.

### Verified contract and implementation boundary

| Operation / field | Contract used |
| --- | --- |
| Create | POST `https://secure.cardcom.solutions/api/v11/LowProfile/Create`, JSON |
| Status | POST `https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult`, JSON |
| Authentication | `TerminalNumber` (int32), `ApiName` (string). Status additionally requires `LowProfileId`. Neither operation requires API password; the existing encrypted password remains used only for SOAP connection testing. |
| Create operation | Explicit `Operation: "ChargeOnly"`; no Document, token, refund, or card fields sent |
| Amount | Decimal major units. ShopNest integer `100` is serialized as JSON number `100.00`, using validated decimal text, without floating-point business arithmetic. |
| Currency | Only ILS: create `ISOCoinId: 1`; status `TranzactionInfo.CoinId: 1`. Other currencies rejected. |
| External reference | Server-generated tenant-prefixed attempt reference maps to `ReturnValue` (maximum 250 characters). The durable attempt uniquely binds it to its order. This is correlation, not a provider idempotency guarantee. |
| Creation result | Integer `ResponseCode: 0`, nonzero GUID `LowProfileId`, validated `Url` |
| Stored provider reference | Existing text `provider_transaction_id` holds normalized `LowProfileId`, the reference available at creation and needed for status lookup. It is not overwritten by the charge ID. |
| Charge identifier | Official spelling `TranzactionId`, int64. Parsed losslessly as a decimal string, positive and at most signed-int64 maximum. Outer and nested IDs must match. Migration `0008_cardcom_charge_reference.sql` adds text `provider_charge_id`. It is saved atomically with paid/review_required, remains exact through PostgreSQL, and must match any later confirmation. A tenant-local provider/environment/charge unique index rejects reuse on another attempt. Neither reference is exposed in the admin list. |
| Hosted URL | Dedicated validator permits only HTTPS `secure.cardcom.solutions`, the returned-Url host in the official guide. Rejects credentials, fragments, nonstandard ports, whitespace/backslashes and alternate hosts. No PayPal/Bit URL is used. |
| Return URLs | Server-generated `SuccessRedirectUrl`, `FailedRedirectUrl`, `CancelRedirectUrl` all lead to the existing read-only return page. Browser navigation never changes payment state. |
| Notification | `WebHookUrl` receives JSON POST (`LowProfileResult`). The only consumed hint is its matching `LowProfileId`; all payment claims are ignored. Retrieve authoritative status using the attempt's credential snapshot. |
| Successful-charge evidence | Both response codes zero, `Operation: ChargeOnly`, nested transaction present, `IsRefund: false`, `DealType: Debit`, matching LowProfileId, ReturnValue, both terminal fields, both lossless charge IDs, exact amount and ILS currency. Missing/malformed/mismatched evidence cannot confirm payment. |
| Environment | These hosted methods accept only Test with the officially designated non-charging terminal 1000. Same official v11 host, no invented sandbox endpoint. Production methods reject before network invocation. Existing credential encryption remains tenant/provider/environment bound. |

Fetch and deadline are injected for tests. Requests use fixed endpoints, POST, `redirect: error`, `cache: no-store`, AbortController and a nine-second deadline covering headers and body. Responses are capped at 256 KiB and require JSON content type and valid UTF-8. JSON parsing preserves numeric lexemes, rejects duplicate keys (including escaped aliases), malformed syntax and excessive nesting. Only validated payment evidence is projected; raw provider messages, callbacks, credentials and responses are neither logged nor persisted.

### Unresolved outcomes and lifecycle blocker

Every non-success code, missing successful transaction, malformed response, mismatch or transport failure throws a normalized error. It does **not** return failed/cancelled/expired evidence and does not mutate the attempt, release reservations or decrement inventory. A pending attempt remains pending; an ambiguous creation remains created with `creation_unconfirmed`. The unique order constraint and existing start flow prohibit another attempt or automatic POST retry. Unresolved callbacks receive the existing generic non-success HTTP response; this does not claim callback acceptance or settlement.

Ordinary reservation expiry remains in force independently of Cardcom. This implementation does not extend or recreate holds. A later proven payment after expiry/release/cancellation enters `review_required` through the existing atomic confirmation transaction, without fulfilment. Concurrent duplicate proven successes consume inventory once. Proven success with missing or mismatched reservation owner/cart/token/items records review_required; known reservation-domain failures cannot cause fulfilment. Infrastructure failures still roll back, and do not manufacture a review outcome. No automatic refund, polling, reconciliation UI, or terminal-failure classification is added.

**Before production activation:** obtain Cardcom's authoritative unfinished/abandoned/retryable-decline/terminal-failure/expired/cancelled lifecycle definitions, including what guarantees a page cannot accept another payment. Finish manual sandbox acceptance and deployment callback reachability. `live` remains false. Hosted/verification capabilities are available only through Test activation on terminal 1000; settings validation and the application service both reject Production. No production activation is permitted before these blockers are resolved.

### Validation and manual sandbox status

All automated Cardcom calls are mocked with synthetic credentials. The hosted suite runs with the existing payment suite via `npm run payment:test`; see the final review report for current counts. It covers exact amounts, response and URL validation, int64 precision, network limits/timeouts, authentication/bindings, forged callbacks, durable ambiguous creation, unchanged unresolved state, duplicate confirmation and late-payment review. Existing PostgreSQL integration tests run in disposable schemas and roll back.

No real hosted-page creation or sandbox charge has been performed for this change. The official test guidance guarantees no actual charge on its designated terminal. Isolated manual sandbox **creation** can proceed without terminal-failure classification, provided official test credentials and a reachable public HTTPS callback/return origin are used. ShopNest browser checkout uses normal tenant-local Test settings, encrypted credentials and ownership checks; no activation bypass is introduced for manual testing. Full sandbox checkout acceptance is still outstanding. Never reuse the old read-only connection acceptance as evidence of hosted-payment acceptance.

## Cardcom lifecycle — PLANNED / BLOCKED

Official material reviewed:

- [Cardcom v11 hosted payment and status guide](https://cardcomapi.zendesk.com/hc/he/articles/28448202810514-Step-1-2-Creating-a-payment-page-sending-a-request-to-retrieve-transaction-details-Iframe-Redirect)
- [Official v11 API reference](https://secure.cardcom.solutions/Api/v11/Docs)
- [Official test-environment guidance](https://support.cardcom.solutions/hc/he/articles/360002688814)

The original framework review could not retrieve the machine-readable reference. The current implementation above resolves method and field spelling through OpenAPI, but does not claim end-to-end sandbox acceptance or terminal-failure lifecycle support. The separate read-only connection contract below remains unchanged.

Required before production activation:

- Resolve terminal versus retryable lifecycle semantics and page expiry guarantees; preserve unresolved outcomes until authoritative clarification.
- Verify production onboarding and environment behavior before implementing production support.
- Obtain merchant-authorized sandbox credentials; exercise creation, declined, cancelled, expired, duplicate and late callbacks without real charges.
- Establish provider-supported idempotency/reconciliation after ambiguous creation and a safe hosted-page expiry policy aligned with inventory holds.
- Complete sandbox acceptance before considering production support; `live` remains false.

Pelecard and Tranzila require their own official onboarding/credential, hosted-page, verification and environment contracts before fields or capabilities are added. Automatic refunds, receipt issuance, automated reconciliation and key rotation remain FUTURE / OPEN.

## Validation

`npm run payment:test` includes the existing framework/connection regressions and the expanded hosted-adapter/service tests (see final verification counts below) with mocked network, isolated fake adapters and the actual inventory domain abstraction. It covers configuration, authenticated encryption, secret projections, owner/tenant boundaries, server-priced amounts, concurrent starts/confirmations, rollback, terminal states, expiry/review handling, and the retired route. Server-only modules run under Node's `react-server` condition for these tests; no fake adapter is bundled into the application.

`node --test tests/payment-db.test.mjs` is an explicit PostgreSQL integration check using the configured development database. It creates two random test schemas inside a transaction, runs every tenant migration, tests payment constraints and isolated reads/updates, and rolls everything back. It never migrates existing tenants. It requires schema-creation permission and is separate from the default payment unit suite.

Required checkout, inventory, shipping, customer-auth, admin-auth, admin-ui and tenant suites, plus storefront-ui and Google-auth regressions, pass. TypeScript, lint and the production build pass. Local browser acceptance also covers disabled dummy-credential storage/replacement, tenant isolation, English/Hebrew layouts and pending guest checkout. This does not constitute provider sandbox certification; Production remains disabled.

## Cardcom read-only connection validation

The server-only adapter uses the [official GetUserTerminalList SOAP 1.1 operation](https://secure.cardcom.solutions/Interface/BillGoldService.asmx?op=GetUserTerminalList). It POSTs to the fixed BillGoldService endpoint with SOAPAction `BillGoldService/GetUserTerminalList`. Success requires response code zero and the configured terminal in the returned list. Both environment slots use this documented endpoint; environment selection isolates saved credentials and does not establish payment sandbox capability.

The admin test action authorizes before accessing the tenant-local singleton. It accepts only provider, environment and credential fields. Unsaved values override saved values; blank fields reuse saved values only for the same provider/environment, with authenticated tenant-bound decryption. It does not save, encrypt new settings, create attempts, or alter inventory. It returns only a boolean and a translated message key. Existing configurations without the new password require it to be entered before testing or saving. No migration is needed because credentials already use encrypted JSON.

The request has a nine-second deadline covering headers and body, no retries, no redirects, and no caching. Response size is capped at 256 KiB. The narrowly scoped XML parser checks XML declaration quoting, namespace bindings, expanded attribute uniqueness, nesting and the complete operation/result structure, and rejects DTDs, external entities, unknown entities, malformed XML and unsupported XML syntax. XML values are escaped. Neither requests, responses nor credentials are logged. Fetch and timeout duration can be injected by unit tests; all test credentials are synthetic.

### Manual acceptance

The maintainer reported that manual acceptance passed on 2026-09-05. The steps below document the acceptance procedure.

1. Ensure the existing development database and payment encryption key are configured, then run `npm run dev` from this repository.
2. Sign in as an authorized gift-shop tenant admin and open http://localhost:3000/gift-shop/admin/payments.
3. Select Cardcom and environment Test.
4. Manually enter the official Cardcom test terminal, API username and API password provided separately. Do not copy them into repository files or logs.
5. Click **Test connection**; expect **Testing connection…**, then **Connection successful.** This must not save the form.
6. Change the terminal to a syntactically valid number that is not assigned to that test account; test again and expect failure.
7. Restore the official test terminal. In this hosted milestone, Test activation is available only for terminal 1000; Production activation must remain disabled. The earlier connection-only acceptance expected both to be disabled.
8. Confirm the Cardcom dashboard shows no transaction created by these checks, and ShopNest's recent payment attempts are unchanged.
9. In browser DevTools, inspect action **response** payloads and page responses: no saved credentials, ciphertext, raw SOAP, or Cardcom description should appear. Newly typed credentials necessarily appear in the outgoing server-action request; they must never be echoed in its response.
10. Check the server console and application logs for credential leakage without printing/copying the credentials into logs. Confirm there is no browser request directly to Cardcom.
11. Separately save the test settings, reload, leave secrets blank and test again. Switch environment and verify blank values cannot reuse the Test credentials. Switch to Pelecard/Tranzila and confirm the unsupported message remains.
12. Confirm an admin lacking access to another tenant cannot test its settings. Repeat tenant-local checks for panda-pop and dvorik-collection using only their own authorized settings.

Live provider acceptance and runtime browser/log inspection were reported passed by the maintainer; these checks are manual. Automated tests verify safe response projections, failure normalization, non-live enforcement, authorization wiring and credential isolation. No production credentials or live payment operations are included.

### Acceptance security review

Adversarial review reproduced false connection success for malformed XML declarations/attributes/namespaces and unexpected nested result content. The parser now rejects these cases and validates every terminal entry, including entries after a matching terminal. The payment suite adds regression coverage for these failures, valid namespace prefixes, redirects, legacy settings upgrades, unsaved credential overrides, coherent in-flight snapshots, actual server-action authorization and forged tenant headers. That earlier XML hardening change did not change payment capability, storage schema or locking behavior. The subsequent hosted milestone adds Test-only capability and the additive charge-reference migration described above.

### Hosted milestone sandbox prerequisites (2026-09-07)

The local development database currently has no saved payment settings for gift-shop. Both the CLI and the standard Next.js development environment-file loading lack PAYMENT_PUBLIC_ORIGIN and PAYMENT_ENCRYPTION_KEY. Hosted creation, redirect, return, authenticated sandbox verification and a resulting sandbox order transition are therefore blocked, not passed. No credentials were invented, saved, or copied to source. Configure these prerequisites through the existing secret/configuration mechanisms before sandbox acceptance. Old read-only SOAP browser acceptance is separate.

Final local verification: payment 219/219 (108 framework/connection/service and 111 hosted), checkout 8/8, inventory 49/49, customer-auth 43/43, admin-ui 16/16, shipping 42/42, admin-auth 18/18, Google-auth 24/24, tenant provisioning 10/10, PostgreSQL payment integration 1/1: **430 passed, 0 failed, 0 skipped**. Production build (including lint/type validation) and standalone TypeScript pass. Webpack reported non-fatal cache snapshot warnings. The migration was first exercised in disposable transaction-local schemas with rollback. In the subsequent local acceptance phase it was applied through tenant:create to gift_shop, panda_pop and dvorik_collection, twice per tenant. Each schema has one migration-history entry, the nullable text column, CHECK and unique index. Pre/post hashes of existing orders, reservations, products, settings and attempts match. The integration test additionally verifies that an existing payment row survives the additive upgrade unchanged with a null charge ID.

Browser recheck after build: the authorized admin payments page loaded successfully (HTTP 200), Cardcom Test displayed the Test-only notice and available activation control, Production activation stayed disabled, all credential indicators remained unconfigured, and no payment attempts appeared. No settings were saved and no provider hosted request was made. Full sandbox acceptance remains blocked by the environment prerequisites above; the local tenant migration is now complete. The unrelated pre-existing middleware debug logging is outside the hosted-payment change and must be excluded from its eventual commit.

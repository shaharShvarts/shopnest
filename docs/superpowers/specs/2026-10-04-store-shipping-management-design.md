# Store Shipping Management Design

Date: 2026-10-04

Status: Approved design, implementation not started.

Standing rules: follow `docs/DEVELOPMENT_GUIDELINES.md` and `docs/ADMIN_UI_STANDARDS.md`.

## 1. Goal

Provide simple Store-level shipping-method management in the Unified Store Management Dashboard.

Each Store manages its own shipping methods independently.

ShopNest does not define fixed carriers, shipping companies, or fixed shipping method names.

Examples of merchant-defined methods:

- DHL
- Israel Post
- Home delivery
- Store pickup
- Free pickup from business

## 2. Scope

MVP shipping method fields:

- `id`
- `name`
- `price`
- `requires_address`
- `is_active`
- `sort_order`
- optional `logo`
- timestamps

The merchant can:

- create a shipping method
- edit a shipping method
- activate/deactivate a shipping method
- reorder shipping methods
- upload/replace/remove an optional logo

Both Store Owner and Store Manager may manage shipping methods through the Unified Store Management authorization layer.

Target route:

`/dashboard/stores/[id]/shipping`

## 3. Explicit Non-Goals

The MVP does not include:

- Organization-level shipping configuration
- Store overrides of Organization shipping
- fixed carrier/company definitions
- carrier API integrations
- calculated live shipping rates
- zones
- weight-based pricing
- free-shipping thresholds
- predefined shipping types
- shipping-method codes exposed to the merchant
- automatic carrier recognition from the method name

## 4. Clean Model Decision

There are no production orders that require compatibility with the current experimental shipping model.

The existing shipping implementation currently includes:

- `code`
- `type`
- `free_shipping_threshold`

These concepts are not part of the approved MVP and should be removed from the active shipping model rather than preserved as legacy product behavior.

The new business model is intentionally simpler:

```text
Shipping Method
    name
    price
    requires_address
    active
    display order
    optional logo
```

## 5. Address Requirement

ShopNest must not infer behavior from the shipping method name.

Each method has an explicit boolean:

`requires_address`

Examples:

```text
DHL               -> true
Home delivery     -> true
Store pickup      -> false
Pickup at office  -> false
```

For a newly created method, `requires_address` defaults to `true`.

The merchant may explicitly disable it.

Checkout asks for a shipping address only when the selected server-authoritative shipping method requires one.

## 6. Logo / Image

Each shipping method may have one optional image/logo.

Examples:

- DHL logo
- Israel Post logo
- merchant business logo for Store Pickup

The logo is presentation only. It never determines shipping behavior, price, identity, authorization, or carrier type.

The implementation should reuse the existing ShopNest tenant media/upload infrastructure where practical rather than introduce a second media system.

Only the interactive file-picker/preview component needs to be a Client Component.

Authorization, validation, tenant resolution, persistence, deletion, and file storage remain server-side.

The browser must not be allowed to select a tenant, schema, filesystem path, or authoritative persisted image URL.

## 7. Tenant Isolation

Shipping methods remain tenant business data inside the Store's tenant schema.

Trusted access flow:

```text
authenticated Owner / Manager
    -> requested Store ID
    -> Store Management authorization
    -> trusted public Store row
    -> trusted tenant_id
    -> trusted Tenant record
    -> trusted tenant schema
    -> tenant DB
    -> shipping_methods
```

`storeId` is only a lookup input.

It is never proof of ownership.

Browser-supplied tenant slug, schema, organization ID, tenant ID, or image path must never become authority.

Cross-Store and cross-tenant requests must fail closed.

## 8. Store Management Integration

The new management UI belongs in the Unified Store Management Dashboard.

It must use:

`requireStoreManagementDb(...)`

or the equivalent approved Store Management authorization boundary.

It must not depend on `requireTenantAdminDb()` as its new authorization model.

The existing legacy tenant-admin shipping route may remain temporarily for compatibility during implementation, but new Store Management behavior must use the unified trusted Store context.

## 9. Checkout Flow

Checkout displays only active shipping methods from the current trusted tenant database, ordered by `sort_order`.

Each option may display:

- logo, when present
- name
- price

The customer submits only the selected shipping-method ID as the shipping selection.

The browser is not authoritative for:

- shipping name
- shipping price
- address requirement
- active state
- display order
- logo identity

Server flow:

```text
trusted tenant
    -> active cart
    -> server-calculated item subtotal
    -> submitted shipping_method_id
    -> reload active shipping method from tenant DB
    -> obtain server-side price
    -> obtain server-side requires_address
    -> validate required address
    -> calculate shipping total
    -> calculate order total
    -> create order
```

If the method does not exist or is inactive, checkout fails closed.

## 10. Price Authority

Shipping prices use ShopNest's server-authoritative integer money representation.

The management form may display an ILS decimal value, but server-side validation must normalize and persist it using the existing ShopNest money convention.

The server must reject:

- negative prices
- invalid decimal precision
- malformed values
- missing required price
- unsafe numeric values

The checkout must never accept an authoritative shipping amount from the browser.

## 11. Order Snapshot

An order must preserve the shipping details that were authoritative at checkout time.

At minimum the order snapshot stores:

- shipping method name
- charged shipping price
- whether an address was required, when useful for historical behavior

The live `shipping_methods` record may still be referenced by ID for operational convenience, but historical display and totals must never depend on its current values.

Example:

```text
Order placed:
DHL = 50 ILS

Merchant later changes:
DHL = 60 ILS

Existing order remains:
DHL = 50 ILS
```

No separate shipping-price history table is required.

## 12. Fulfillment Simplification

The current implementation couples fulfillment behavior to fixed shipping types such as:

- `home_delivery`
- `pickup_point`
- `store_pickup`

Those fixed types are not part of the new shipping-method model.

The MVP must not infer fulfillment workflow from method names.

`requires_address=false` means only that checkout does not require a delivery address.

It must not automatically mean a specific fulfillment state.

Existing fulfillment behavior that depends on `shippingMethodType` must be reviewed and decoupled safely as part of the implementation.

Do not introduce a new shipping-type enum merely to preserve the old coupling.

## 13. Management UI

The page must follow `docs/ADMIN_UI_STANDARDS.md`.

Requirements include:

- 44px normal management controls
- shared management inputs/buttons/selects where applicable
- RTL/LTR-safe layout
- Server Components by default
- Client Components only for genuine browser interactivity
- same-page mutation behavior for activate/deactivate/reorder where appropriate
- no unnecessary redirect back to the same page
- visible validation errors
- disabled/pending state for mutations

The shipping logo picker should reuse or adapt the existing managed image-upload interaction.

## 14. Validation

All shipping mutations require complete server-side validation.

### Name

- required
- trimmed
- explicit max length
- empty string rejected

### Price

- required
- non-negative
- maximum two decimal places for ILS input
- normalized to ShopNest's persisted integer money representation

### Requires Address

- boolean
- defaults to true for creation

### Active

- boolean

### Sort Order

- server-controlled during create/reorder
- client-submitted reorder IDs must be verified against the complete current Store list
- duplicates and unknown IDs rejected

### Logo

- optional
- use existing supported ShopNest image MIME/size/content validation
- server-controlled tenant media path
- replacing/removing must not permit arbitrary file deletion

## 15. Failure Behavior

Fail closed when:

- Store authorization fails
- tenant resolution fails
- tenant is unavailable for Store operations
- shipping method ID is invalid
- shipping method belongs to another tenant
- checkout method is inactive
- image validation fails
- image path cannot be safely resolved
- reorder payload contains missing, duplicate, or unknown IDs
- price input is invalid

No operation may fall back to a different Store or tenant.

## 16. Testing

Focused regression coverage must include:

- Owner can manage own Store shipping
- Manager can manage assigned Store shipping
- unauthorized Owner cannot manage another Store
- Manager cannot manage an unassigned Store
- tampered Store ID fails closed
- active methods appear at checkout
- inactive methods do not appear
- persisted order is respected
- price is calculated server-side
- browser-supplied shipping price is ignored/not accepted
- invalid method ID fails
- cross-tenant method ID fails
- address required when `requires_address=true`
- address not required when `requires_address=false`
- zero-price shipping works
- later price/name changes do not change existing order snapshot
- logo upload validation
- logo replacement/removal stays tenant-bound
- checkout displays logo when present
- checkout works without a logo
- reorder rejects duplicates and unknown IDs
- management form validation follows the project field-contract rules
- related checkout/order/inventory/payment tests remain green

## 17. Migration Strategy

Use a proper tenant-schema migration.

Because there is no production shipping/order data that requires preservation, the migration may simplify/remove the experimental shipping fields rather than carry compatibility indefinitely.

However:

- do not drop the entire tenant schema
- do not reset Docker volumes
- do not destroy unrelated Store data
- migration must work against existing DEV tenant schemas
- provisioning of a new tenant must produce the new schema
- migration/provisioning must remain repeatable according to the existing ShopNest migration model

Any cleanup of existing DEV shipping/order fixture rows must be explicit and limited to what the migration requires.

## 18. Implementation Principle

Do not rewrite checkout or Store Management.

Reuse the existing foundations:

- tenant schema isolation
- Store Management Context
- shipping ordering logic where still applicable
- checkout transaction boundary
- order snapshot pattern
- media storage/validation infrastructure
- shared management UI controls

Replace only the parts of the experimental shipping model that conflict with this approved design.

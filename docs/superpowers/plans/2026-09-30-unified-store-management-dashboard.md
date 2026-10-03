# Unified Store Management Dashboard Plan

Date: 2026-09-30

Status: Product direction agreed; implementation not started.

Standing engineering rules: **read and follow `docs/DEVELOPMENT_GUIDELINES.md` before working on this plan.**

## 1. Goal

Unify merchant-owner and store-manager operations into one ShopNest management experience while preserving strict tenant isolation and server-side authorization.

Target product model:

```text
ShopNest-owned domain
    -> authentication
    -> dashboard / management

Merchant custom domain
    -> public customer storefront
```

The merchant/store team should not need to understand that ShopNest currently has separate Merchant and Tenant Admin interfaces.

The final experience should feel like one professional SaaS control panel, similar in separation of management vs storefront to platforms such as Shopify/Wix.

## 2. Dependency and Branching

At the time this plan was written:

- PR #47: `Merchant custom-domain management`
- Branch: `feature/merchant-custom-domain-management`
- PR state: Draft/Open
- Head when this planning branch was created: `78e49294d7a5f89b6acb69b81adb79ecb0d65a0d`

Unified Dashboard implementation must **not** be mixed into PR #47.

This plan is intentionally stored on a separate planning branch that is stacked on the current PR #47 head. Before implementation begins:

1. Re-check current PR #47 and `master`.
2. Prefer completing/merging PR #47 first if it is ready and approved.
3. Create or rebase a dedicated feature branch for Unified Dashboard onto the correct base.
4. Do not merge any PR without explicit approval.

## 3. Current Architecture

### 3.1 Merchant / Store Owner

Current control-plane model:

- `public.merchant_accounts`
- `public.organizations`
- `public.organization_memberships`
- `public.stores`

Current login/workspace:

- `/login`
- `/dashboard`

Current code:

- `src/app/(merchant)/dashboard/`
- `src/lib/merchant-auth/`
- `src/lib/merchant-stores/`

Current Merchant Dashboard already provides the management shell and merchant/store lifecycle features such as business profile, stores, subscriptions/readiness, policies, and custom-domain management.

### 3.2 Tenant Admin / Store Manager

Current model:

- `public.admin_users`
- role `tenant_admin`
- `public.admin_user_tenants`

Current routes:

- `/[tenant]/admin`
- `/[tenant]/admin/categories`
- `/[tenant]/admin/subcategories`
- `/[tenant]/admin/products`
- `/[tenant]/admin/shipping`
- `/[tenant]/admin/payments`
- `/[tenant]/admin/orders`

Current server authorization/data access is centered on:

- `requireTenantAdmin()`
- `requireTenantAdminDb()`

Current code:

- `src/app/[tenant]/admin/`
- `src/lib/admin-auth/core.ts`
- `src/lib/admin-auth/server.ts`

### 3.3 ShopNest Super Admin

Super Admin remains a separate platform/control-plane role.

Current route:

- `/admin`

Current role:

- `super_admin`

This plan does not merge Super Admin into the merchant/store dashboard.

## 4. Product Decision: One Store Management UI

Owner and Manager should use the same ShopNest dashboard shell.

The UI should adapt to permissions, but server-side authorization is authoritative.

Target routes may follow this shape:

```text
/dashboard
/dashboard/stores/:storeId
/dashboard/stores/:storeId/overview
/dashboard/stores/:storeId/orders
/dashboard/stores/:storeId/products
/dashboard/stores/:storeId/categories
/dashboard/stores/:storeId/inventory
/dashboard/stores/:storeId/customers
/dashboard/stores/:storeId/shipping
/dashboard/stores/:storeId/domain
/dashboard/stores/:storeId/payments
/dashboard/stores/:storeId/settings
/dashboard/stores/:storeId/team
```

Exact route names may be adjusted during implementation review, but the management experience remains on the ShopNest domain.

## 5. Roles for the First Version

Keep the first version intentionally small.

### Owner

The organization/store owner.

Expected access:

- Overview
- Orders
- Products
- Categories / Subcategories
- Inventory
- Customers
- Shipping
- Storefront operational settings
- Domain management
- Payment-provider configuration
- Subscription / plan
- Billing
- Organization/business settings
- Store settings
- Team/manager management
- Store lifecycle operations

Owner-only sensitive operations include:

- custom-domain add/change/remove/replacement/rollback
- payment-provider credentials
- plan/subscription changes
- billing
- organization ownership/settings
- delete Store
- create/remove Store
- add/remove managers
- other lifecycle/security settings

### Manager

Operational manager of a Store.

Expected access:

- Overview
- Orders
- Products
- Categories / Subcategories
- Inventory
- Customers
- Shipping
- normal store operations
- limited storefront settings if explicitly approved

Manager must not receive Owner-only privileges.

In particular, Manager must not be authorized for:

- custom domains
- payment-provider credentials
- subscription/plan
- billing
- organization ownership/settings
- Store deletion/lifecycle
- team/permission administration

Future roles such as Orders Staff or Catalog Staff are out of scope for the initial implementation.

## 6. Authorization Model

### 6.1 Principle

The central architectural task is to introduce a trusted Store Management Context that can resolve an authenticated principal to a specific Store/Tenant/DB safely.

A conceptual flow:

```text
authenticated principal
    -> principal type / membership
    -> authorization for requested Store
    -> trusted Store control-plane row
    -> trusted tenant_id
    -> trusted Tenant row
    -> trusted schema
    -> tenant DB handle
    -> requested operation
```

### 6.2 Owner authorization

Owner access must be derived from trusted control-plane relationships.

Conceptually:

```text
merchant session
    -> merchant_accounts.id
    -> organization_memberships
    -> organizations
    -> stores.organization_id
    -> stores.tenant_id
    -> tenants
    -> tenant schema
```

A client-supplied `storeId` is only a lookup input. It is not proof of ownership.

### 6.3 Manager authorization

The current Tenant Admin assignment model should be evaluated for reuse.

A safe incremental implementation may keep Manager authentication/account storage separate internally while mapping it into the same Store Management Context.

Do not collapse `merchant_accounts` and `admin_users` merely for UI consistency.

The desired UX is one dashboard; internal identity storage can remain separate until there is a strong reason to unify it.

### 6.4 Unified login decision

Owner and Manager use the same ShopNest sign-in entry point:

```text
/login
    -> Merchant Owner authentication first
    -> eligible Store Manager authentication if Merchant authentication does not match
    -> /dashboard
```

Internal identity/session storage remains separate. A successful workspace login must clear the other workspace session type so the browser does not carry simultaneous Owner and Manager identities.

For the first version:

- Manager continues to use `public.admin_users` credentials internally.
- Manager must be a `tenant_admin` account with an explicit Store-level Manager assignment.
- A Manager account with legacy `admin_user_tenants` assignments is not eligible for the unified Manager context, preventing bypass through the broader legacy Tenant Admin routes.
- Super Admin is not eligible for the normal Store Management dashboard through this path.
- Merchant password reset remains the existing Owner flow in Phase 1. Manager self-service password recovery is deferred to the Team/Manager management phase rather than weakening or conflating the existing auth domains.

### 6.5 Permission checks

Permission enforcement must exist at all relevant boundaries:

- page/server component
- Server Action
- route handler/API
- service/repository mutation
- sensitive reads

Menu visibility is only presentation.

Direct URL access, modified forms, replayed actions, and Store ID tampering must still fail safely.

## 7. Shared Store-Management Layer

Current tenant-admin operations are coupled to `requireTenantAdminDb()`.

The target is to separate three concerns:

1. Authentication/principal resolution
2. Store authorization + trusted tenant DB resolution
3. Store business operation

For example, instead of product creation being inherently a Tenant Admin action, the product business service should receive an already-authorized Store Management Context.

Conceptual shape:

```ts
type StoreManagementContext = {
  principal: ...
  store: ...
  tenant: ...
  permissions: ...
  db: TenantDb
}
```

The exact type/API must be designed against current code before implementation.

The important invariant is that neither a Merchant Owner nor Manager can supply a schema/tenant binding that bypasses trusted server resolution.

## 8. Route and UX Direction

### 8.1 Shared shell

Both Owner and Manager should use the same dashboard visual shell.

Example Owner navigation:

```text
ShopNest
sex shop

Overview
Orders
Products
Inventory
Customers
Shipping
----------------
Domains
Payments
Plan & Billing
Store Settings
Team
```

Example Manager navigation:

```text
ShopNest
sex shop

Overview
Orders
Products
Inventory
Customers
Shipping
Store Settings
```

The unavailable Owner-only areas should not be shown to Manager, but hidden navigation is not the security control.

### 8.2 Multiple Stores

If a Merchant owns multiple Stores, the dashboard should provide a clean Store selector/switcher.

Store selection must resolve to an authorized Store server-side.

Do not persist an arbitrary client-selected tenant/schema as authority.

### 8.3 Custom-domain storefront

When a Store has a primary custom domain:

- customers use the custom domain
- management remains on ShopNest
- platform storefront paths may redirect to the primary custom domain according to the domain routing rules
- management routes remain on the ShopNest domain

Do not host Merchant/Manager management UI on the customer's custom domain.

## 9. Incremental Implementation Phases

### Phase 0 — Current-state audit and detailed design

Before coding:

- inspect current `master`, PR #47, and relevant feature branches
- inspect current Merchant and Tenant Admin auth/session code
- inspect control-plane schemas and migrations
- inspect existing catalog/order/inventory/payment services
- identify business logic currently embedded directly in admin page/actions
- identify reusable components vs auth-coupled components
- define the exact Store Management Context API
- define permission names/semantics for Owner and Manager
- decide whether the existing `admin_user_tenants` model can safely represent Manager-to-Store assignments or needs a new Store-level relationship

Deliverable: a reviewed implementation design before code changes.

### Phase 1 — Store Management Context and authorization foundation

Build the trusted authorization/context layer first.

Requirements:

- Owner can resolve only owned Stores.
- Manager can resolve only assigned Store(s).
- Store must resolve to trusted `tenant_id`.
- Tenant must resolve to trusted schema.
- invalid Store / cross-org / cross-tenant requests fail closed.
- suspended/disabled tenant behavior remains correct.
- permission checking supports Owner vs Manager.
- no catalog/order mutation migration yet.

This phase should be test-heavy.

### Phase 2 — Catalog migration

Move/adapt:

- Products
- Categories
- Subcategories

Goals:

- expose pages under unified dashboard routes
- reuse business logic rather than copy it
- remove direct dependence of shared catalog logic on Tenant Admin session
- preserve image handling and tenant media isolation
- preserve inventory initialization/adjustment invariants
- keep old Tenant Admin catalog routes working during migration

### Phase 3 — Orders and Inventory

Move/adapt:

- Orders
- order detail
- Inventory
- stock thresholds/alerts where applicable

Requirements:

- preserve tenant schema isolation
- preserve concurrency/idempotency
- avoid exposing cross-tenant order IDs
- Manager can perform only approved operational mutations
- Owner retains full operational access

### Phase 4 — Shipping and payment operational views

Move/adapt:

- Shipping
- payment operational/store-facing views

Separate operational payment visibility from Owner-only provider configuration.

Manager must not gain access to Cardcom/provider secrets or sensitive payment configuration merely because payment pages are migrated.

### Phase 5 — Integrate existing Merchant control-plane features

Bring the already Merchant-oriented features into the store workspace coherently:

- Domains
- Subscription / plan
- Billing
- Business / Organization
- Store settings
- Policies
- lifecycle/readiness
- Team / Manager management

Owner-only permissions must be explicit.

### Phase 6 — Old Tenant Admin path deprecation/repurposing

Only after unified dashboard acceptance:

- decide whether `/[tenant]/admin` should redirect, remain a compatibility path, or be retained for a separate staff use case
- do not remove it before migration is proven
- preserve a rollback path until unified behavior is stable

## 10. Database Strategy

Avoid tenant-business-data movement.

Catalog/orders/inventory remain in the existing tenant schemas.

Potential control-plane changes should be introduced only if necessary for Store Manager assignments/permissions.

Before adding a new table, evaluate whether current:

- `admin_users`
- `admin_user_tenants`
- `stores`
- `tenants`

can safely represent the required relationship.

If current Manager assignment is tenant-slug based but product requirements are Store based, explicitly analyze the 1:1 or future 1:n Store/Tenant assumptions before reusing it.

Any DB change must have a migration and tests.

## 11. Security and Regression Tests

Minimum authorization test matrix:

### Owner

- Owner can access own Store.
- Owner can access operational tenant data for own Store.
- Owner cannot access another Organization's Store.
- Owner cannot change a Store/Tenant binding through request tampering.

### Manager

- Manager can access assigned Store.
- Manager cannot access another Store.
- Manager can access approved operational pages/actions.
- Manager cannot access Domain settings.
- Manager cannot access billing/subscription.
- Manager cannot read or mutate payment-provider credentials.
- Manager cannot add/remove managers.
- Manager cannot delete Store or perform Owner lifecycle operations.
- Manager cannot bypass permission checks by directly invoking a Server Action.

### Tenant safety

- manipulated Store ID fails.
- manipulated tenant slug fails.
- manipulated schema cannot redirect tenant DB access.
- stale/deleted/unprovisioned Store state fails appropriately.
- suspended/disabled Tenant fails according to existing policy.
- cross-tenant IDs never leak data.

### Existing behavior

- Super Admin remains working.
- existing Tenant Admin remains working during migration.
- existing Merchant Dashboard remains working.
- custom-domain storefront routing remains working.
- global APIs remain unavailable through untrusted custom hostnames.
- checkout/order/inventory/payment regression suites remain green.

## 12. Acceptance Strategy

Each phase should have:

1. focused automated tests
2. related subsystem tests
3. broader regression suite
4. production build
5. DEV acceptance
6. STAGING acceptance appropriate to the phase

Do not claim the entire Unified Dashboard complete based on navigation/UI alone.

Acceptance must cover real authorization and mutations.

## 13. DEV Acceptance Fixture

At plan creation time, DEV includes a useful Store fixture:

- Store id: `4`
- display name: `sex shop`
- slug: `sex-shop`
- tenant id: `2`
- tenant schema: `tenant_4`
- Merchant owner account: `owner@sex-shop.co.il`
- custom storefront domain: `shopnest-test2.excelapp.co.il`

Treat these values as current DEV fixtures only, not hard-coded application assumptions. Re-check runtime state before tests.

A separate Manager test identity should be created/assigned intentionally when Phase 1 requires it.

Do not reuse Super Admin as the Manager acceptance identity.

## 14. Non-Goals for the Initial Unified Dashboard

Do not expand the first implementation into:

- complex fine-grained RBAC
- arbitrary custom roles
- full identity-table unification
- moving tenant business data into `public`
- rewriting checkout
- redesigning Cardcom
- redesigning custom-domain lifecycle
- merging Super Admin with Merchant/Manager
- removing old Tenant Admin routes before migration is accepted

## 15. Main Risks

### Authorization regression

The largest risk is replacing tenant-admin auth with a more convenient Store route that accidentally allows cross-store or cross-tenant access.

Mitigation: build Store Management Context first and require it for every migrated operation.

### UI-only permissions

A unified menu can create a false sense of security.

Mitigation: permissions enforced server-side at every sensitive boundary.

### Business logic duplication

Copying Tenant Admin pages/actions into Merchant Dashboard could create two divergent implementations.

Mitigation: extract/reuse business services and repositories; keep authentication separate from business operation.

### Payment secret exposure

Moving Payments into a common navigation could accidentally give Manager provider credentials.

Mitigation: distinguish operational payment data from Owner-only provider configuration.

### Premature removal of old Admin

Replacing the old path before feature parity makes rollback difficult.

Mitigation: migrate incrementally and keep compatibility until acceptance.

## 16. First Work Item in the Next Development Session

The next session should not start coding immediately.

It should:

1. Read `docs/DEVELOPMENT_GUIDELINES.md`.
2. Read this plan.
3. Check current GitHub state, especially PR #47 and `master`.
4. Inspect the current implementations referenced above.
5. Validate or refine the Store Management Context design.
6. Determine whether Manager assignment requires a control-plane schema change.
7. Produce a concise Phase 1 implementation proposal and test matrix.
8. Wait for explicit approval before implementation.

Once approved, implementation should proceed incrementally with focused tests and explicit checkpoints.

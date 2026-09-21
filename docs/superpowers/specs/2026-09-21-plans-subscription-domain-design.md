# ShopNest Plans and Subscription Domain Design

Date: 2026-09-21
Status: Proposed scope for PR #39
Repository: shaharShvarts/shopnest
Target branch: feature/plans-subscription-domain

## 1. Purpose

PR #39 introduces the control-plane domain model for ShopNest plans and merchant subscriptions.

This PR creates the durable commercial-entitlement model needed by later readiness and activation work. It does not integrate a billing provider, charge a merchant, provision a tenant, or activate a store.

Subscription state and Store lifecycle state remain separate state machines.

## 2. Existing state

ShopNest currently has two plan-like concepts that must not become the long-term subscription model:

- `public.tenants.plan` is a legacy/effective-plan snapshot for provisioned tenants.
- the public marketing site presents placeholder plan choices, but final pricing and limits are intentionally undecided.

The existing super-admin `/admin/plans` page groups provisioned tenants by the legacy `tenants.plan` enum. PR #39 must not silently reinterpret that field as subscription authority.

## 3. Domain model

### plans

A global control-plane catalog of commercial plan identities.

Initial fields:

- id
- code
- name
- status
- created_at
- updated_at

Plan codes are stable machine identifiers. Display names may change.

Initial catalog may include the currently presented ShopNest tiers, but PR #39 must not encode final prices, quotas, or provider product IDs.

### subscriptions

A merchant commercial-entitlement record.

Fields:

- id
- organization_id
- store_id nullable
- tenant_id nullable
- plan_id
- status
- trial_ends_at nullable
- current_period_start nullable
- current_period_end nullable
- cancel_at nullable
- created_at
- updated_at

A subscription may exist before Tenant provisioning, therefore `tenant_id` is nullable.

For merchant onboarding, a Store-scoped subscription is associated with the owning Organization and Store. Organization ownership is always derived server-side.

## 4. Subscription states

Initial states:

- pending
- trialing
- active
- past_due
- cancelled
- expired

These states describe commercial entitlement only.

They do not directly mutate Store lifecycle state in PR #39.

Examples:

- subscription = pending, store = draft
- subscription = active, store = draft
- subscription = past_due, store = provisioned

Future policy may decide when a commercial state suspends a Store. That policy is explicitly deferred.

## 5. Plan catalog

PR #39 may seed stable catalog rows required for development and later readiness work.

Catalog data is structural, not final pricing policy.

The following are explicitly deferred:

- final monthly/annual prices
- quotas and limits
- transaction fees
- provider price/product identifiers
- tax/VAT policy
- coupons/discounts
- free/trial policy
- upgrade/downgrade proration

## 6. Merchant behavior

For an owned pre-provisioning Store, the merchant may select or change a plan through the authenticated global merchant dashboard.

Rules:

- merchant identity comes from the verified merchant session
- Store ownership is resolved through Organization membership
- browser-supplied Organization, Tenant, schema, subscription owner, or entitlement state is never trusted
- only allowed plan codes from the active server-side catalog may be selected
- merchant plan selection creates/updates the Store-scoped subscription record
- merchant actions do not set subscription to `active`, `trialing`, `past_due`, or other billing-result states based on browser input
- no Tenant or schema is created

The merchant-facing selection is therefore a requested commercial choice, not proof of payment or billing success.

## 7. Server authority

Authoritative writes must preserve:

Store -> Organization -> Merchant membership

and:

Subscription -> Organization + Store + Plan

A Store cannot be attached to a subscription belonging to another Organization.

A Tenant, when later linked, must match the Store's trusted Tenant relation. PR #39 does not perform that link.

## 8. Relationship to Store readiness

PR #40 will consume subscription information in the readiness engine.

PR #39 only provides durable data and safe read/write boundaries.

No `ready_for_activation`, `activation_requested`, provisioning, or routing state is changed here.

## 9. Legacy tenant.plan

`public.tenants.plan` remains untouched in this PR as a compatibility/effective-plan snapshot.

It is not used as the source of truth for merchant subscription ownership.

Migration/synchronization policy between a subscription and `tenants.plan` belongs to later activation/provisioning work.

## 10. Super-admin behavior

PR #39 may expose plan/subscription data to the control plane for inspection, but it must not redesign the existing super-admin tenant management page or replace its legacy plan field yet.

If an admin mutation surface is added, it must require existing super-admin authorization and must not create billing-provider state.

## 11. Database constraints

Required invariants:

- plan.code unique
- plan.status constrained to known values
- subscription.status constrained to known values
- subscription.plan_id references plans
- subscription.organization_id references organizations
- optional subscription.store_id references stores
- optional subscription.tenant_id references tenants
- Store-scoped subscription Organization must match Store Organization, enforced transactionally in repository logic and covered by tests
- one current Store-scoped subscription per Store for the onboarding flow
- indexes for Organization, Store, Tenant, Plan lookup

Browser validation is advisory only.

## 12. In scope

- control-plane plan table
- control-plane subscription table
- enums/types/constraints
- control-plane migration
- repository/service boundary for merchant Store plan selection
- Store-scoped plan selection/read UI in the merchant dashboard
- EN/HE translations
- regression/security tests
- DEV database migration + acceptance
- STAGING database migration + acceptance

## 13. Out of scope

- Stripe/Cardcom/other SaaS billing provider
- collecting money from merchants
- final pricing
- invoices/receipts for ShopNest SaaS billing
- plan quotas/feature enforcement
- automatic trial start
- renewal jobs
- webhook handling
- cancellation settlement
- Store lifecycle transitions
- readiness computation
- Tenant/schema provisioning
- dynamic tenant routing
- custom domains
- customer checkout/payment changes
- production Cardcom enablement

## 14. Acceptance criteria

Before READY TO MERGE:

- branch starts from current master after PR #38
- Draft PR exists
- migration is additive and preserves existing tenants/stores
- existing `tenants.plan` behavior remains compatible
- merchant cannot select a plan for another Organization's Store
- browser cannot set subscription status/ownership/Tenant/schema
- only active catalog plans can be selected
- no tenant/schema is created
- focused plan/subscription tests pass
- existing merchant Store/Organization/auth tests pass
- full GitHub Actions pass
- DEV migration + UI acceptance pass
- STAGING migration + UI acceptance pass
- explicit user approval before merge

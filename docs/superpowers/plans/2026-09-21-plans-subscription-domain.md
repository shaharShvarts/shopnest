# PR #39 Plans and Subscription Domain Implementation Plan

Date: 2026-09-21
Branch: feature/plans-subscription-domain
Base: master

## Task 1 — Add RED domain and route tests

Add focused tests for:

- plan catalog types/statuses
- subscription status model
- Store/Organization ownership
- plan selection rejects inactive/unknown plans
- browser cannot submit Organization/Tenant/schema/subscription status authority
- one Store-scoped subscription per Store
- merchant plan UI remains tenant-independent

Confirm RED before implementation.

## Task 2 — Add control-plane schema

Add Drizzle control-plane schema modules for:

- plans
- subscriptions

Add required enums, foreign keys, indexes, unique constraints, and exports.

Keep `controlPlaneTenants.plan` unchanged.

## Task 3 — Generate/add control-plane migration

Create an additive migration for the new domain tables.

Do not reset DEV/STAGING volumes.

Seed stable plan catalog identities in an idempotent way suitable for development and later readiness work, without final pricing metadata.

## Task 4 — Add subscription repository/service boundary

Implement server-owned operations to:

- list active plans
- read current Store subscription
- select/change the plan for an owned Store

Derive merchant, Organization, and Store ownership server-side.

Do not allow browser control of subscription status, tenant id, schema, organization id, or merchant id.

## Task 5 — Add merchant plan selection UI

Integrate plan selection into the existing owned Store dashboard surface.

Display:

- selected plan or not selected
- available active plans
- commercial status where useful

Do not imply that selecting a plan activates billing or publishes the Store.

## Task 6 — Translations and UX

Add aligned Hebrew/English labels and explanatory copy.

The UI must make clear that plan selection is part of setup and does not activate the Store.

## Task 7 — Regression and security review

Run:

- merchant auth
- merchant Organization
- merchant Store
- plan/subscription focused tests
- routing
- control-plane tests
- full CI-equivalent suite
- production build

Review raw/dynamic SQL surfaces and tenant-isolation boundaries.

## Task 8 — DEV acceptance

On DEV:

1. apply control-plane migration
2. confirm catalog rows
3. select a plan for an owned draft Store
4. reload and confirm persistence
5. change plan and confirm the same Store subscription is updated rather than duplicated
6. verify subscription ownership matches Store Organization
7. verify tenant_id remains NULL
8. verify no tenant/schema was created
9. verify Store remains draft/not routable

## Task 9 — STAGING acceptance

Repeat migration and merchant plan-selection smoke flow on STAGING without resetting volumes.

Verify existing control-plane and merchant routes remain healthy.

## Task 10 — READY TO MERGE review

Confirm:

- no merchant billing provider
- no final pricing policy
- no Store activation/readiness/provisioning
- no dynamic tenant registry work
- legacy tenant.plan remains compatible
- CI/build green
- DEV/STAGING acceptance complete

Stop for explicit user approval before merge.

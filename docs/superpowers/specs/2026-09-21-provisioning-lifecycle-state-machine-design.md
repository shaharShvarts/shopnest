# ShopNest Provisioning Lifecycle / State Machine Design

Date: 2026-09-21
Status: Proposed scope for PR #41
Repository: shaharShvarts/shopnest
Target branch: feature/provisioning-lifecycle-state-machine
Base: master after PR #40
Base commit: f92e1ea71a337ce0afa1e86682e789eb9c031b57

## 1. Purpose

PR #41 introduces the authoritative Store provisioning lifecycle state machine in the ShopNest control plane.

This PR defines and persists legal Store lifecycle states and transitions. It does not provision a Tenant schema, publish a storefront, change trusted tenant routing, or perform activation orchestration.

The state machine is the contract that later PRs use:

- PR #42 — Dynamic Trusted Tenant Registry Resolution
- PR #43 — Activation Orchestration

## 2. Core principle

Store lifecycle state is server-controlled.

Browser input may request an operation in a later PR, but it may never directly choose a lifecycle state, Tenant id, schema name, provisioning result, or readiness result.

Readiness and lifecycle are separate concepts:

- readiness answers whether the current Store configuration satisfies mandatory requirements
- lifecycle records where the Store is in the activation/provisioning process

A persisted lifecycle state is never a substitute for recalculating readiness immediately before activation/provisioning.

## 3. Lifecycle states

PR #41 standardizes these Store lifecycle states:

- `draft`
- `ready_for_provisioning`
- `activation_requested`
- `provisioning`
- `provisioning_failed`
- `provisioned`

Meaning:

### draft

The Store exists in the control plane and is not currently ready to start activation.

`tenant_id` must be null.

### ready_for_provisioning

The Store has most recently passed the server-authoritative readiness evaluator and may be offered an activation action by a later PR.

`tenant_id` must be null.

This state does not automatically start provisioning.

### activation_requested

The merchant has explicitly requested activation through an authorized server flow.

PR #41 defines the state but does not expose the merchant activation command/UI; PR #43 owns activation orchestration.

`tenant_id` must be null.

### provisioning

A trusted server-side orchestrator has started a provisioning attempt.

Only server-side orchestration may enter this state.

`tenant_id` remains null until the trusted Tenant record is finalized.

### provisioning_failed

A provisioning attempt failed safely.

The Store is not public and must not be treated as an active Tenant.

`tenant_id` must remain null.

Only safe diagnostic metadata may be persisted.

### provisioned

Provisioning completed and the Store is bound to exactly one trusted control-plane Tenant.

`tenant_id` must be non-null.

## 4. Allowed transitions

The pure state-machine layer must allow only explicitly defined transitions.

Initial transition graph:

```
draft
  -> ready_for_provisioning

ready_for_provisioning
  -> draft
  -> activation_requested

activation_requested
  -> draft
  -> ready_for_provisioning
  -> provisioning

provisioning
  -> provisioned
  -> provisioning_failed

provisioning_failed
  -> draft
  -> activation_requested
  -> ready_for_provisioning
```

No other transition is legal.

In particular:

- `draft -> provisioning` is illegal
- `ready_for_provisioning -> provisioned` is illegal
- `provisioning_failed -> provisioned` is illegal
- `provisioned -> draft` is illegal
- browser-supplied state jumps are illegal

PR #41 does not define suspension/closure of already-live tenants. Those policies belong to a later explicit lifecycle policy rather than being inferred from subscription catalog changes.

## 5. Readiness interaction

PR #40 remains the readiness authority.

A Store may enter `ready_for_provisioning` only from a server-computed readiness result where `ready === true`.

If readiness later regresses before activation begins, the Store may return from `ready_for_provisioning` or `activation_requested` to `draft`. A failed provisioning Store may also return to `draft` when its current readiness is no longer satisfied.

Activation and provisioning must still recalculate readiness in PR #43 immediately before any provisioning side effect. Therefore a stale persisted `ready_for_provisioning` value never authorizes provisioning by itself.

PR #41 must not trust:

- browser-provided ready flags
- browser-provided requirement states
- browser-provided lifecycle status
- browser-provided Tenant id
- browser-provided schema name

## 6. Persistence changes

The existing `stores.status` PostgreSQL enum currently contains:

- draft
- ready_for_provisioning
- provisioned

PR #41 should avoid repeated PostgreSQL enum churn while lifecycle naming is still evolving.

Preferred migration:

1. convert `stores.status` from the existing PostgreSQL enum to a bounded `varchar`
2. add a database CHECK constraint covering the six PR #41 states
3. preserve all existing rows without resetting DEV/STAGING
4. remove the obsolete `store_status` enum only after the column no longer depends on it

Add provisioning lifecycle metadata to `stores`:

- `activation_requested_at timestamptz null`
- `provisioning_started_at timestamptz null`
- `provisioned_at timestamptz null`
- `last_provisioning_attempt_at timestamptz null`
- `provisioning_attempt_count integer not null default 0`
- `last_provisioning_error_code varchar(...) null`

The error code field stores only bounded safe machine-readable codes. It must not contain secrets, raw provider responses, SQL, stack traces, or arbitrary exception messages.

## 7. Database invariants

The database must enforce lifecycle/Tenant consistency.

At minimum:

- `provisioned` requires `tenant_id IS NOT NULL`
- all other PR #41 states require `tenant_id IS NULL`
- `provisioning_attempt_count >= 0`
- `provisioned_at` may be non-null only when status is `provisioned`
- provisioning failure metadata must not make the Store look provisioned
- existing delete/slug consistency constraints remain intact

Application code adds stronger transition rules on top of these database invariants.

## 8. State-machine module

Introduce a dedicated server/domain module, conceptually:

`src/lib/store-lifecycle/core.ts`

Responsibilities:

- export lifecycle state types/constants
- define the allowed transition graph
- validate transitions
- expose pure helpers for transition intent
- reject illegal jumps deterministically
- keep transition logic testable without database access

Suggested API shape:

```
canTransitionStore(from, to)
assertStoreTransition(from, to)
```

No browser values are authoritative merely because they match a valid state string.

## 9. Repository / server boundary

Introduce an owner-scoped lifecycle repository/service in the control plane.

Merchant-visible operations must resolve ownership through:

authenticated Merchant
-> owner Organization membership
-> Store

System-only transitions must not be callable through a browser-provided Tenant/schema selector.

The lifecycle write path should use row locking / optimistic concurrency where appropriate so two simultaneous transition requests cannot silently overwrite one another.

The repository must update `updated_at` consistently and return the resulting authoritative Store lifecycle snapshot.

## 10. Provisioning attempt semantics

PR #41 defines metadata semantics but does not run the provisioner.

When a trusted orchestrator later enters `provisioning`:

- increment `provisioning_attempt_count`
- set `last_provisioning_attempt_at`
- set `provisioning_started_at`
- clear the previous safe error code

On `provisioning_failed`:

- persist only a bounded safe error code
- leave `tenant_id` null
- do not expose a partially created schema as an active Store

On `provisioned`:

- require a trusted Tenant id supplied by server orchestration
- set `provisioned_at`
- preserve the one-Store-to-one-Tenant unique constraint

PR #43 will own the actual orchestration and retry sequence.

## 11. Idempotency and concurrency

State transitions must be safe under retries.

Expected behavior:

- retrying the same completed transition must not create duplicate Tenant links
- illegal stale transitions fail closed
- concurrent transitions use a locked/current row rather than trusting stale browser state
- provisioning attempt counters change only when a real trusted provisioning attempt starts

PR #41 tests the state machine and repository behavior without creating Tenant schemas.

## 12. Merchant UI scope

PR #41 may display the richer lifecycle status in the existing Store detail page.

It must not add an operational “Activate now” button that starts provisioning.

If readiness is currently incomplete, the existing readiness checklist remains the source of corrective guidance.

Any activation-request UI/command belongs to PR #43 so that the user action and server orchestration are reviewed together.

## 13. Out of scope

PR #41 must not:

- call `provisionTenant()`
- create a PostgreSQL tenant schema
- insert/finalize a new trusted Tenant as part of merchant activation
- modify dynamic tenant routing
- remove the current trusted tenant registry safeguards
- publish a storefront
- add custom-domain/DNS automation
- call Cloudflare
- charge a subscription
- add production payment-provider behavior
- infer activation from a browser return
- make inactive Plan catalog status retroactively suspend a live Store

## 14. Security invariants

Non-negotiable:

- lifecycle mutation is server-authoritative
- merchant ownership is checked server-side
- Tenant/schema identity is never accepted from browser input
- readiness is recalculated by trusted server code
- illegal transitions fail closed
- provisioning diagnostics contain no secrets
- no tenant schema is opened for pre-provisioning Store lifecycle updates
- SQL values remain parameterized / Drizzle-bound
- dynamic identifiers are not introduced by this PR

## 15. Migration rules

Create journaled control-plane migration `0011_...`.

Requirements:

- no destructive reset
- preserve existing Store rows
- test migration against the current schema
- journal entry required
- migration must not alter tenant schemas
- migration must not require `docker compose down -v`
- enum-to-varchar conversion must preserve current values transactionally

## 16. Testing

Required automated coverage:

- exact lifecycle states
- allowed transitions
- illegal transitions
- DB lifecycle/Tenant consistency
- provisioning attempt metadata semantics
- owner-scoped Store mutation
- browser authority fields are ignored/rejected
- no tenant-schema access in lifecycle repository
- migration is journaled and preserves existing values
- existing Store/readiness behavior remains compatible

Acceptance:

- CI passes
- migration succeeds in DEV
- existing draft Store remains intact
- existing Store detail page renders correct lifecycle status
- illegal transition tests fail closed
- STAGING migration succeeds without reset
- existing Store/policy/subscription data remains intact

## 17. Handoff to PR #42 and PR #43

PR #42 consumes trusted `public.tenants` records for dynamic routing. It does not use Store lifecycle status as a schema selector.

PR #43 consumes the PR #41 lifecycle service and PR #40 readiness evaluator to implement the real activation flow:

1. authorized merchant requests activation
2. lock Store
3. verify legal transition
4. recalculate readiness
5. revalidate slug
6. transition to `activation_requested`
7. start trusted provisioning
8. transition to `provisioning`
9. run the existing safe Tenant provisioner
10. finalize trusted Tenant mapping
11. transition to `provisioned`
12. on failure, transition to `provisioning_failed`

The PR #41 state machine therefore remains the authoritative lifecycle guard while PR #43 owns side effects.

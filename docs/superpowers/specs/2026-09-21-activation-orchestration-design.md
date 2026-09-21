# ShopNest Activation Orchestration Design

Date: 2026-09-21
Status: Proposed scope for the roadmap Activation Orchestration step
Repository: shaharShvarts/shopnest
Target branch: feature/activation-orchestration
Base: master after merged GitHub PR #43
Base commit: 760b53fc27ba252776ded9eeaeb1822ede0ab823

## 1. Purpose

Implement the trusted server-side flow that turns an activation-eligible merchant Store into a provisioned ShopNest Tenant.

The roadmap originally labels this work PR #43. GitHub numbering moved because the copy-only CTA follow-up used #42 and Dynamic Trusted Tenant Registry became GitHub PR #43. This implementation is expected to be GitHub PR #44.

This PR owns the orchestration side effects that PR #41 and PR #43 deliberately deferred:

- authorized merchant activation request
- fresh server-authoritative readiness checks
- trusted lifecycle transitions
- deterministic tenant schema identity
- existing safe tenant provisioner invocation
- trusted public.tenants finalization
- Store-to-Tenant and Subscription-to-Tenant binding
- tenant-registry cache invalidation
- safe failure/retry behavior

## 2. Existing contracts reused

Reuse without weakening:

- PR #40 Store readiness evaluator is the activation eligibility authority
- PR #41 Store lifecycle state machine is the lifecycle authority
- PR #43 dynamic public.tenants registry is the runtime routing authority
- scripts/lib/tenant-provisioning.mjs remains the schema/migration provisioner
- Store ownership is Merchant -> owner Organization membership -> Store
- public.tenants is created only for a provisioned technical Tenant
- browser input never supplies a schema name, Tenant id, readiness result, lifecycle result, or plan entitlement state

No alternative provisioning path is introduced.

## 3. Activation flow

Initial orchestration is synchronous server-side orchestration on the self-hosted ShopNest runtime. A background job/queue may be added later without changing the domain contract.

Flow:

1. authenticated merchant requests activation for an owned Store
2. load the authoritative lifecycle state
3. if already provisioned, return idempotent success
4. if already provisioning, return in-progress instead of starting a new lifecycle attempt
5. run the server-authoritative readiness evaluator
6. synchronize readiness state
7. reject if readiness is not currently ready
8. transition to activation_requested
9. recalculate readiness again immediately before provisioning
10. if readiness regressed, fail closed and return the Store to a non-provisioning state through the lifecycle service
11. transition to provisioning; this increments the trusted attempt metadata
12. load and validate the trusted provisioning context from the control plane
13. revalidate canonical Store slug and Tenant-registry uniqueness
14. derive a deterministic server-only schema identity
15. run the existing safe Tenant provisioner
16. atomically finalize the Tenant mapping, Subscription binding, and Store provisioned transition
17. clear the process-local registry cache for the activated slug
18. return the canonical active Storefront path

Any failure after the provisioning attempt starts records only a bounded safe machine-readable error code.

## 4. Readiness remains a hard gate

This PR does not mark currently unavailable readiness domains complete.

Current readiness intentionally keeps shipping, payments, invoicing, and products unavailable. Therefore a normal DEV/STAGING merchant Store remains not activatable until those domains have real server-authoritative implementations.

The activation UI may be present, but it must be disabled or unavailable when readiness.ready is false. The server action always recalculates readiness and cannot be bypassed by changing HTML or request payloads.

Tests use injected/fake readiness collaborators to exercise the orchestration success path without adding a production readiness bypass.

There is no environment variable, query parameter, hidden form field, or DEV-only production code path that forces readiness=true.

## 5. Tenant schema identity

The PostgreSQL schema name is not derived from the browser-visible Store slug.

For a Store id N, the initial deterministic schema identity is:

tenant_N

Example:

Store id 42
slug: panda-pop
schema: tenant_42

Properties:

- deterministic for retry/idempotency
- server-controlled
- bounded PostgreSQL identifier
- independent of a merchant-editable slug
- cannot resolve to public, information_schema, or pg_* system schemas

The schema is validated through the same safe schema rules used by the trusted tenant registry/provisioner before any dynamic identifier is used.

The Store continues to own the public slug; public.tenants owns the canonical slug -> schema mapping.

## 6. Provisioning context

The trusted provisioning context is loaded from the control plane after the Store enters provisioning.

It includes only server-derived values:

- Store id
- Organization id
- Store slug
- Store display name
- deterministic schema name
- Store-scoped Subscription id
- active selected Plan identity

The repository verifies:

- Store exists and is not deleted
- Store status is provisioning or already provisioned for idempotency
- Store tenant_id is null before first finalization
- Store slug is canonical
- no conflicting public.tenants slug exists
- no conflicting public.tenants schema_name exists
- Subscription belongs to the same Organization and Store
- Subscription tenant_id is null before first finalization
- Subscription status is allowed by readiness policy
- selected Plan is still active

## 7. Legacy tenants.plan compatibility

The long-term commercial authority remains public.subscriptions -> public.plans.

public.tenants.plan is a legacy/effective compatibility snapshot whose current enum only supports small, medium, and large. The Plan catalog also contains free, whose final activation/entitlement policy is intentionally not defined yet.

This PR must not silently map free to small or invent free-tier capabilities.

Activation therefore fails closed with a safe PLAN_NOT_PROVISIONABLE error when the selected Plan cannot be represented by the current Tenant runtime plan contract. small, medium, and large may be copied exactly into public.tenants.plan.

A later explicit commercial-policy change may make free provisionable and update the legacy/runtime representation.

## 8. Atomic finalization

Schema creation/migration and control-plane finalization cannot share one PostgreSQL transaction because the existing provisioner owns its own connection/transaction.

After schema provisioning succeeds, control-plane finalization is one transaction that:

1. locks the Store row
2. verifies the Store is still in provisioning, or recognizes an already-completed matching result
3. verifies no conflicting Tenant slug/schema mapping
4. inserts or reuses the exact matching public.tenants row
5. binds the Store-scoped Subscription to that Tenant
6. applies the PR #41 provisioning -> provisioned transition
7. binds stores.tenant_id to the same Tenant
8. commits all control-plane visibility together

The Tenant row is not visible to runtime routing until the transaction commits. The registry cache is cleared only after a successful commit.

If control-plane finalization fails, the Store is not marked provisioned. An already-created schema may remain as a non-routable orphan and is safely reused by a retry because schema identity and migration history are deterministic.

Automatic destructive schema cleanup is out of scope.

## 9. Idempotency and concurrency

Required behavior:

- repeated activation after completed provisioning returns the existing Store/Tenant result
- repeated activation while provisioning does not increment another lifecycle attempt
- concurrent merchant activation requests converge on one Store lifecycle
- provisionTenant uses its existing PostgreSQL advisory lock for the deterministic schema
- migration history/hash checks make repeated schema provisioning safe
- Store/Tenant/Subscription unique constraints and row locks prevent duplicate finalization
- a matching already-finalized Tenant may be reused only when slug, schema, Store, and Subscription relationships agree exactly
- any mismatch fails closed

No retry may attach a Store to another Tenant or another Store's schema.

## 10. Failure handling

Persist only safe codes such as:

- READINESS_REGRESSED
- INVALID_STORE_SLUG
- TENANT_IDENTITY_CONFLICT
- PLAN_NOT_PROVISIONABLE
- SCHEMA_PROVISIONING_FAILED
- TENANT_FINALIZATION_FAILED

Raw exception text, SQL, stack traces, database URLs, passwords, provider responses, and secrets are never written to Store business tables.

If an error occurs while the Store is still provisioning, transition to provisioning_failed.

If another concurrent request already completed the exact Store/Tenant finalization, do not overwrite the provisioned state with failure.

A provisioning_failed Store may be retried only through the existing legal lifecycle/readiness path.

## 11. Merchant UI

The existing Store detail page gains an Activation section.

Behavior:

- readiness incomplete -> explain that activation is blocked; no enabled activation submit
- ready_for_provisioning -> enabled Activate action
- activation_requested/provisioning -> disabled/in-progress state
- provisioning_failed -> show safe retry guidance and safe error code translation
- provisioned -> show the canonical Storefront link

The browser submits only Store id through the authenticated server action. It never supplies Tenant id, schema name, target lifecycle state, readiness=true, or active Tenant status.

Because current production readiness has unavailable blocking domains, the normal UI remains fail-closed until those domains are implemented.

## 12. Merchant/admin identity boundary

This PR does not duplicate Merchant credentials into admin_users and does not copy password hashes between identity systems.

Existing Organization membership remains the merchant ownership authority in /dashboard. Store -> Tenant binding makes the technical Tenant belong to that Store.

Automatic tenant-admin credential unification is a separate identity/authorization decision. This PR must not create a second unsynchronized login principal merely to make /<tenant>/admin immediately usable by the Merchant account.

## 13. Readiness mutation races

Activation performs a second readiness evaluation immediately before starting the trusted provisioning attempt.

Current real Stores cannot pass readiness while the four onboarding domains remain unavailable, so no production readiness mutation race is enabled by this PR.

As each currently unavailable readiness domain becomes writable in later work, its mutation path must honor Store provisioning locks or otherwise preserve the invariant that activation eligibility cannot be changed underneath finalization.

This PR must not weaken existing lifecycle locks.

## 14. Out of scope

- implementing shipping onboarding
- implementing merchant payment onboarding
- implementing invoicing onboarding
- implementing product onboarding
- final free/trial commercial policy
- changing customer payment/Cardcom behavior
- custom domains
- trusted Host routing
- DNS or Cloudflare API calls
- background queue infrastructure
- automatic destructive rollback/drop-schema
- merchant/admin identity unification
- production subscription billing provider
- suspension/closure policy for already-live Stores

## 15. Security invariants

Non-negotiable:

- authenticated merchant ownership checked server-side
- readiness recalculated server-side
- browser input never selects schema/Tenant/status/plan entitlement
- schema identity generated server-side from trusted Store id
- dynamic schema identifier passes strict validation
- Store slug is revalidated before provisioning
- Tenant slug/schema uniqueness rechecked before and during finalization
- public.tenants is the only runtime route authority
- no active Tenant mapping is committed without matching Store finalization
- failed activation never creates a routable Tenant
- values use Drizzle/parameterized queries
- no secrets in provisioning diagnostics
- registry DB/cache failures fail closed

## 16. Testing

Automated coverage must include:

- deterministic safe schema identity
- unauthorized/wrong-owner activation rejection
- readiness false -> no provisioning side effect
- readiness regression before provisioning -> no schema side effect
- legal activation_requested -> provisioning transition
- successful provisioner call -> atomic Tenant/Subscription/Store finalization
- active Tenant row uses exact trusted Store slug and deterministic schema
- unsupported Plan fails closed
- provisioner failure -> provisioning_failed with safe code
- finalization failure -> provisioning_failed with safe code
- idempotent already-provisioned retry
- concurrent/in-progress retry does not create another attempt
- Tenant slug conflict fails closed
- Tenant schema conflict fails closed
- registry cache is cleared after successful finalization
- no browser schema/Tenant/status authority
- existing tenant-registry/routing tests remain green
- production build passes

DEV acceptance:

- branch is deployed without destructive reset
- no control-plane migration unless implementation proves one is required
- existing global merchant/admin routes still work
- existing registry-test Tenant remains routable
- ordinary Store with incomplete readiness cannot activate
- activation action cannot be forced by form/request tampering
- no unexpected Tenant row/schema is created by a blocked activation

STAGING acceptance is required before READY TO MERGE.

## 17. PR discipline

This remains one Activation Orchestration PR.

Do not add custom-domain or Cloudflare work.

Do not merge until:
- CI is green on the final HEAD
- DEV acceptance passes
- STAGING acceptance passes
- final diff/security review passes
- the user explicitly approves the merge

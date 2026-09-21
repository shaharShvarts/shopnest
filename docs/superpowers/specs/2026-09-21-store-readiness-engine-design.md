# ShopNest Store Readiness Engine Design

Date: 2026-09-21
Status: Proposed scope for PR #40
Repository: shaharShvarts/shopnest
Target branch: feature/store-readiness-engine
Base: master after PR #39

## 1. Purpose

PR #40 introduces a server-authoritative Store readiness engine and merchant-facing checklist.

Readiness answers one question:

> Is this pre-provisioning Store currently eligible to move toward activation?

Readiness does not provision a Tenant, create a schema, publish a Store, change routing, or charge the merchant.

## 2. Required readiness requirements

The readiness result exposes these stable machine keys:

- store_profile
- shipping
- payments
- invoicing
- policies
- products
- subscription

Each requirement is evaluated from trusted server-side data.

No browser-supplied `ready`, `complete`, requirement status, Tenant id, schema name, Organization id, or Store owner value is authoritative.

## 3. Result model

Conceptual result:

```
StoreReadinessResult
- storeId
- ready
- evaluatedAt
- requirements[]
  - key
  - status
  - blocking
  - reason
```

Initial requirement statuses:

- complete
- incomplete
- unavailable
- not_applicable

`ready=true` only when every blocking requirement is `complete` or an explicitly server-authorized `not_applicable`.

`unavailable` means the authoritative subsystem/data required to satisfy the requirement does not yet exist or cannot currently be evaluated safely. It must fail closed for activation.

The engine is computed on demand. PR #40 does not persist a browser-editable overall readiness flag.

## 4. Ownership and authorization

Merchant-facing readiness is available only for Stores owned through the authenticated Merchant -> owner Organization membership -> Store chain.

The browser supplies only the Store route id. Organization ownership is resolved server-side.

Readiness evaluation stays in the control plane and must not open a tenant schema for a pre-provisioning Store.

## 5. Store profile requirement

`store_profile` is complete only when the authoritative Store and Organization profile contain the minimum required identity/contact data for the Store's configured market.

For the current model this can include:

- Store display name
- valid reserved Store slug
- Organization display name
- country
- legal/business identity fields required by policy for that country
- customer-contact fields required by policy for that country

The evaluator must be market-aware rather than assuming one global required field set.

Israel is the initial launch market. Exact production legal requirements must be validated against current applicable law before production launch.

## 6. Subscription requirement

For a pre-provisioning Store, `subscription` is complete only when:

- exactly one Store-scoped subscription exists
- subscription Organization matches Store Organization
- subscription has no Tenant link yet
- subscription is in an allowed pre-activation state
- referenced Plan exists and is currently active/selectable

An inactive Plan blocks readiness before activation.

Grandfathering from PR #39 remains intact: if a Plan becomes inactive after a Store is already provisioned/live, that catalog change alone does not suspend or unpublish the Store.

## 7. Policies requirement - hard activation gate

`policies` is always a blocking requirement when applicable for the configured market.

The engine must never mark policies complete from a generic browser checkbox or client-supplied completion flag.

Policy readiness must be based on persisted, merchant-managed, versioned policy documents and authoritative publication state.

The model must support at minimum:

- returns / refunds / cancellation
- privacy
- terms of sale / terms of use
- shipping / delivery
- merchant/business identification and customer contact
- cookie/tracking disclosure where applicable
- additional jurisdiction-specific disclosures required for the configured market

The exact required policy set is determined server-side from configurable market policy, initially for IL.

A required policy is ready only when:

- a persisted current version exists
- required content passes minimum server-side completeness rules
- the version is explicitly published
- the published version belongs to the same Store/Organization boundary

Missing, empty, draft-only, or unpublished mandatory policies block readiness.

PR #40 may introduce the control-plane policy-document persistence required to evaluate this requirement. It must not claim that boilerplate text is legally sufficient.

## 8. Shipping, payments, invoicing, and products

These are blocking readiness keys, but readiness must not invent completion.

For each domain:

- if authoritative pre-provisioning configuration exists, the adapter evaluates it
- if authoritative data is missing because that onboarding subsystem has not been implemented yet, status is `unavailable`
- no generic client-editable "done" checkbox may satisfy the requirement
- tenant-schema data must not be used as a substitute for a pre-provisioning Store that has no Tenant

This makes missing onboarding capabilities visible without weakening the activation gate.

Future implementation work can replace an `unavailable` adapter with a real domain evaluator without changing the stable readiness API.

## 9. Merchant checklist UI

The Store detail/dashboard should expose a checklist that shows every readiness requirement with:

- localized label
- current state
- blocking reason
- clear next-action link when that configuration surface exists

The checklist must distinguish:

- complete
- needs attention
- not yet available in onboarding
- not applicable

The UI is descriptive only. It does not set readiness.

## 10. Store lifecycle interaction

PR #40 does not automatically mutate Store lifecycle state.

In particular:

- `ready=true` does not provision
- `ready=true` does not create a Tenant/schema
- `ready=true` does not publish
- `ready=false` does not suspend an already-live Store

PR #41 will own the provisioning lifecycle/state-machine transition rules.

PR #43 activation orchestration must recalculate readiness immediately before provisioning.

## 11. Persistence

Readiness itself should remain computed unless a later requirement proves a durable snapshot is needed for audit/history.

Any new persistence in PR #40 must represent actual authoritative domain data, not cached truth that can drift.

For policy documents, durable versioned persistence is appropriate because policy content and publication history are business records.

## 12. Security invariants

- merchant session is verified server-side
- Store ownership is derived server-side
- no tenant/schema identifier comes from browser input
- no pre-provisioning readiness evaluation performs tenant-schema access
- no browser completion flag is authoritative
- policy publication is a server-authorized mutation
- cross-Organization policy/readiness access fails closed
- inactive Plan cannot satisfy pre-provisioning subscription readiness
- readiness recomputation is deterministic from authoritative data

## 13. In scope

- readiness core types and evaluator/service boundary
- stable requirement keys/statuses
- control-plane repository queries
- merchant Store readiness checklist UI
- Store profile evaluator
- subscription evaluator
- policy-document model required for a real hard policy gate
- jurisdiction-aware required-policy configuration boundary
- EN/HE translations
- regression/security tests
- additive migration if policy persistence is introduced
- DEV acceptance
- STAGING acceptance

## 14. Out of scope

- Tenant/schema provisioning
- Store activation orchestration
- dynamic tenant registry/routing
- custom-domain automation
- SaaS merchant billing provider
- final pricing/quotas
- automatic suspension of live Stores
- browser-authoritative readiness flags
- pretending missing shipping/payment/invoicing/product onboarding data is complete
- legal advice or hard-coded universal legal requirements

## 15. Acceptance criteria

Before READY TO MERGE:

- branch starts from master after PR #39
- Draft PR exists
- readiness is computed server-side
- stable keys are exactly store_profile, shipping, payments, invoicing, policies, products, subscription
- unknown/missing authoritative onboarding capability fails closed as unavailable
- Store profile evaluation is Organization/Store scoped
- subscription requires an active Plan for pre-provisioning readiness
- retired Plan grandfathering for already-live Stores is preserved
- policies are a hard gate
- required policy set is market-aware/configurable
- policy content is versioned and published server-side
- missing/draft/unpublished required policy blocks readiness
- browser cannot set readiness or requirement states
- no Tenant/schema is created
- no tenant-schema access is introduced for pre-provisioning readiness
- EN/HE checklist renders correctly
- focused readiness tests pass
- existing merchant Store/Organization/subscription/auth tests pass
- full GitHub Actions pass
- DEV acceptance pass
- STAGING acceptance pass
- explicit user approval before merge

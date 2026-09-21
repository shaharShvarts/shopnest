# ShopNest Merchant Acquisition and Onboarding Design

Date: 2026-09-18
Status: Approved design baseline
Repository: shaharShvarts/shopnest
Base commit: 753c178662c5b5be342cd5bedcc36c9e8ca19a45

## 1. Purpose

Define the end-to-end architecture for ShopNest merchant acquisition, registration, onboarding, plan selection, readiness validation, tenant provisioning, activation, and optional custom-domain support.

This design preserves the existing schema-per-tenant isolation model while adding a merchant-facing control-plane workflow that exists before a tenant schema is created.

## 2. Core lifecycle

Visitor
→ Merchant Account
→ Organization / Business
→ Store Onboarding
→ Ready for Activation
→ Activation Requested
→ Provisioning
→ Active Tenant
→ Optional Custom Domain

Registration must not automatically create a tenant schema, public storefront, active tenant route, or DNS/domain configuration.

A merchant workspace may exist before any tenant exists.

## 3. Domain boundaries

### 3.1 Merchant Account

Represents a human merchant identity.

Responsibilities:
- login identity
- email/password and Google authentication
- account status
- sessions

A merchant account is not a tenant, organization, storefront, subscription, or customer account.

### 3.2 Organization / Business

Represents the merchant's business entity.

The model must support:
- one merchant account belonging to multiple organizations
- one organization having multiple merchant members
- one organization owning multiple stores

Initial organization roles:
- owner
- admin

More granular roles may be added later without redesigning identity.

### 3.3 Store Onboarding

Represents a store being configured before activation.

It owns pre-provisioning state such as:
- display name
- requested slug
- branding
- contact/legal details
- shipping setup
- payment setup
- invoicing setup
- policies
- products/setup progress
- selected plan
- readiness state

It must be able to exist with tenant_id = null.

### 3.4 Tenant

Represents a provisioned ShopNest commerce tenant with an actual PostgreSQL schema and trusted routing identity.

The existing public.tenants table remains the registry of provisioned tenants. It must not be overloaded as the registration or onboarding table.

### 3.5 Subscription

Represents the merchant's commercial entitlement.

Subscription state and store lifecycle state are separate state machines.

Examples:
- subscription=active, store=onboarding
- subscription=past_due, store=active or suspended according to policy

The existing tenants.plan field may remain as an effective-plan snapshot during migration, but is not the long-term billing/subscription model.

### 3.6 Domain

Custom domains are separate trusted entities linked to a tenant.

A hostname must never be converted directly into a PostgreSQL schema name.

## 4. Proposed control-plane entities

All pre-provisioning merchant/onboarding data belongs in the public control plane.

### merchant_accounts

Suggested fields:
- id
- email
- display_name
- status
- email_verified_at
- created_at
- updated_at

### merchant_auth_identities

Suggested fields:
- id
- merchant_account_id
- provider
- provider_subject
- password_hash nullable
- created_at

Initial providers:
- password
- google

### merchant_sessions

Suggested fields:
- token_hash
- merchant_account_id
- expires_at
- created_at

### merchant_organizations

Suggested fields:
- id
- display_name
- legal_name
- business_number
- vat_number
- email
- phone
- country
- created_at
- updated_at

### merchant_organization_members

Suggested fields:
- organization_id
- merchant_account_id
- role
- created_at

### store_onboardings

Suggested fields:
- id
- organization_id
- display_name
- requested_slug
- normalized_slug
- state
- selected_plan_id nullable
- tenant_id nullable
- activation_requested_at nullable
- provisioning_started_at nullable
- activated_at nullable
- last_provisioning_error_code nullable
- last_provisioning_attempt_at nullable
- provisioning_attempt_count
- created_at
- updated_at

### store_slug_reservations

Candidate entity for server-side slug reservation.

Suggested fields:
- slug
- store_onboarding_id
- status
- expires_at
- created_at

Exact reservation lifetime and cleanup policy are deferred.

### plans

Candidate future billing entity.

Suggested fields:
- id
- code
- name
- status
- billing_period or equivalent pricing metadata

### subscriptions

Candidate future billing entity.

Suggested fields:
- id
- organization_id
- store_onboarding_id nullable
- tenant_id nullable
- plan_id
- status
- trial_ends_at nullable
- current_period_start nullable
- current_period_end nullable
- cancel_at nullable
- created_at
- updated_at

### store_domains

Suggested fields:
- id
- tenant_id
- hostname
- type
- status
- verification_token
- verified_at nullable
- is_primary
- created_at
- updated_at

## 5. Store lifecycle

Recommended lifecycle:

- draft
- onboarding
- ready_for_activation
- activation_requested
- provisioning
- active
- provisioning_failed
- suspended
- closed

The lifecycle must not be represented by a single is_active boolean.

ready_for_activation means the server-side readiness evaluator currently finds all mandatory requirements satisfied.

activation_requested means the merchant explicitly requested publication.

The readiness evaluator must never start provisioning merely because the store becomes ready.

## 6. Readiness model

Readiness is computed server-side from authoritative data.

Required readiness keys:
- store_profile
- shipping
- payments
- invoicing
- policies
- products
- subscription

The `policies` requirement is a hard activation gate. A Store must not become ready for activation unless all legal/customer-facing policy documents required for its configured market are present, published, and pass server-side completeness checks.

The policy model must support, at minimum:
- returns / refunds / cancellation policy
- privacy policy
- terms of sale / terms of use
- shipping / delivery policy
- merchant/business identification and customer-contact details
- additional jurisdiction-specific disclosures or policies required for the configured market
- cookie/tracking disclosure where applicable

The exact legally required set must be jurisdiction-aware and configurable rather than hard-coded as one universal list. Israel is the initial launch market, but production readiness must be checked against current applicable law before launch.

Policy content must be merchant-managed and versioned. Readiness must use authoritative persisted policy state, never browser-supplied `complete` flags. Missing or unpublished mandatory policy content must block activation.

A readiness result should expose machine-readable per-requirement state plus an overall ready boolean.

Example conceptual shape:

StoreReadinessResult
- ready: boolean
- requirements:
  - store_profile
  - shipping
  - payments
  - invoicing
  - policies
  - products
  - subscription

Activation must recalculate readiness immediately before provisioning.

Browser-supplied ready flags are never authoritative.

Minimum product count, if required, must be configurable policy rather than hard-coded business logic where practical.

## 7. Slug handling

requested_slug is not an active tenant slug.

Server-side flow:
1. normalize
2. validate syntax
3. reject reserved platform routes/names
4. check active tenant uniqueness
5. check pending reservation uniqueness
6. create or update reservation
7. revalidate immediately before provisioning

Slug uniqueness must be enforced transactionally with database constraints, not only frontend checks.

Reserved routes include current and future platform routes such as:
- admin
- api
- login
- signup
- pricing
- contact
- about
- media

The final reserved-name set must be maintained server-side.

## 8. Merchant workspace routing

Before activation, merchant onboarding must use a global non-tenant route.

Preferred route family:

/dashboard
/dashboard/store
/dashboard/products
/dashboard/shipping
/dashboard/payments
/dashboard/billing
/dashboard/domain
/dashboard/activate

The merchant dashboard must not require a tenant schema to exist.

Existing tenant administration remains at /<tenant>/admin after activation.

A future unified dashboard may be considered separately.

## 9. Public acquisition site

Initial public route direction:

/
 /features
 /pricing
 /examples
 /faq
 /login
 /signup

Homepage sections:
1. Hero
2. Why ShopNest
3. Capabilities
4. How it works
5. Pricing
6. Demo/sample stores
7. FAQ
8. Final CTA

Primary product message:
Create an account, configure the store, and publish only when the store is ready.

Shopify may be used only as information-architecture/product-flow inspiration. ShopNest must not copy Shopify branding, text, visual assets, or layout.

## 10. Existing structures to reuse

Reuse:
- getControlPlaneDb()
- control-plane migration mechanism
- migration journal/hash checks
- existing safe tenant provisioner
- slug normalization concepts
- schema safety validation
- schema-per-tenant DB isolation
- existing tenant admin authorization after activation
- payment-provider abstraction for store payment configuration
- customer-auth design patterns where useful, but not customer identity records
- Cloudflare/Nginx perimeter protections
- existing /admin super-admin control plane

## 11. Existing structures not to overload

Do not turn public.tenants into:
- signup records
- merchant businesses
- subscriptions
- onboarding records
- slug reservations
- custom domains

Do not turn customer_accounts into merchant identities.

Do not turn admin_user_tenants into organization membership.

Do not treat tenants.plan as the complete subscription/billing model.

Do not create per-tenant commerce tables before tenant provisioning.

## 12. Merchant auth direction

Merchant identity should be modeled separately from current admin_users during the initial rollout.

Reason:
- admin_users currently serves super_admin and tenant_admin
- password_hash is currently required
- Google merchant identity introduces a different identity abstraction
- overloading admin_users would expand PR scope into a broad auth refactor

A later unification of principals may be evaluated as a separate architectural change.

Customer auth remains separate from merchant/admin auth.

## 13. Tenant provisioning

Reuse the existing provisioner rather than replacing it.

The existing provisioner already:
- validates schema names
- rejects public
- uses a PostgreSQL advisory lock
- creates schema transactionally
- sets and verifies search_path
- applies journaled migrations
- checks migration hashes
- rolls back on failure

Introduce an application-level orchestration service around it.

Conceptual provisioning flow:
1. lock onboarding record
2. verify state == activation_requested
3. recalculate readiness
4. revalidate slug/reservation
5. set state = provisioning
6. run existing schema provisioner
7. create/finalize trusted public.tenants record
8. create merchant ownership/admin binding
9. set onboarding state = active

Provisioning must be idempotent and safe to retry.

If provisioning fails:
- do not mark the tenant active
- set onboarding state to provisioning_failed
- retain safe diagnostic metadata
- do not persist secrets or raw sensitive stack data in business tables

## 14. Dynamic tenant registry direction

Current runtime routing still depends on a static CONFIGURED_TENANT_SLUGS allowlist.

This is intentionally fail-closed today, but blocks merchant self-service provisioning.

The long-term trusted flow should become:

request path / trusted hostname
→ format validation
→ trusted server-side tenant registry lookup
→ active-status check
→ canonical slug/schema mapping
→ tenant context
→ schema-scoped DB access

Migration must be incremental:
1. preserve current static registry
2. introduce trusted DB-backed tenant resolution with cache
3. verify isolation and failure behavior
4. remove the requirement that every tenant must be source-code-listed

Browser input and Host headers never directly select database schemas.

## 15. Custom-domain architecture

Trusted flow:

hostname
→ normalize
→ store_domains lookup
→ tenant_id
→ public.tenants
→ canonical trusted tenant context
→ tenant DB

Never:

hostname
→ derive schema
→ SET search_path

Domain lifecycle may include:
- pending_verification
- verified
- active
- failed
- removed

Cloudflare automation must remain a later separate review after the data model and security boundaries are proven.

## 16. Security invariants

Non-negotiable:
- preserve tenant isolation
- never accept a DB schema name from browser input
- never trust requested tenant slug until validated server-side
- registration does not implicitly authorize tenant access
- merchant ownership is verified server-side
- merchant/admin auth remains separate from customer auth
- provisioning is server-controlled
- plan/payment state is not browser-authoritative
- activation eligibility is recalculated server-side
- custom domains resolve through trusted mapping
- payment success is provider-verified
- payment secrets/client credentials are never stored in plaintext
- secrets do not enter logs or Git
- provisioning/security/payment failures fail closed

### 16.1 SQL injection defense

SQL injection prevention is a platform-wide requirement, not a single-PR feature.

Requirements:
- use parameterized queries or Drizzle query builders for values
- never concatenate user input into executable SQL
- never derive schema/table/column identifiers directly from browser input
- dynamic identifiers require strict server-side validation/allowlisting
- tenant schema selection is resolved from trusted server-side context only
- provisioning keeps strict schema-name validation and rejects public
- any raw SQL added in future PRs requires explicit injection-surface review

### 16.2 Prompt injection defense

Prompt injection prevention is a platform-wide requirement for any present or future AI capability.

Untrusted text from merchants, customers, products, files, imports, URLs, support messages, or third-party sources must be treated as data, not privileged instruction.

Requirements:
- untrusted content cannot override system/developer policy
- AI is not granted secrets or privileged tools by default
- AI-generated requests never bypass normal authorization
- all side-effecting actions use normal server-side permission and validation checks
- prompt/output content cannot become the source of truth for tenant identity, authorization, pricing, payment state, subscription state, activation state, or trusted configuration
- external content instructions must not be treated as trusted operational commands

Platform invariant:

> Untrusted input must never become executable SQL, privileged instruction, tenant identity, authorization decision, or trusted configuration without explicit validation at the appropriate server boundary.

## 17. Migration rules

All new control-plane tables use proper journaled migrations.

Requirements:
- migration history remains hash/idempotency safe
- test against an existing database
- test clean/provisioned database creation where practical
- do not require destructive resets of DEV/STAGING
- do not recommend docker compose down -v unless data destruction is explicitly intended and confirmed

Prefer designs that minimize PostgreSQL enum churn while lifecycle naming is still evolving.

## 18. Error handling

Critical flows must fail closed.

Examples:
- duplicate slug race → transaction/unique-constraint failure, no activation
- readiness changed before activation → activation rejected
- provisioning retry → idempotent resume/retry behavior, no duplicate tenant
- unknown tenant → 404/fail closed
- invalid tenant/schema mapping → refuse DB access
- custom-domain lookup ambiguity → refuse routing
- payment/provider verification failure → no activation based on browser state
- missing authorization → no merchant/tenant mutation

## 19. Testing strategy

Each implementation PR must include relevant regression tests.

Required categories as applicable:
- unit tests for validators/state transitions
- auth/authorization tests
- tenant-isolation tests
- slug collision/race behavior
- provisioning idempotency tests
- migration tests
- failure/rollback tests
- SQL injection regression tests for raw/dynamic-query surfaces
- prompt-injection/tool-abuse tests for AI-enabled surfaces
- DEV acceptance
- STAGING acceptance for DB/deployment/auth/routing changes

## 20. PR sequence

Planned sequence:

PR #34 — Public ShopNest Marketing & Acquisition Foundation
PR #35 — Merchant Identity & Authentication Foundation
PR #36 — Organization / Business Model
PR #37 — Store Onboarding / Draft Model and Slug Request
PR #38 — Merchant Dashboard Shell
PR #39 — Plans and Subscription Domain Model
PR #40 — Readiness Engine / Checklist, including mandatory Store legal-policy readiness
PR #41 — Provisioning Lifecycle / State Machine
PR #42 — Dynamic Trusted Tenant Registry Resolution
PR #43 — Activation Orchestration
PR #44 — Domain Model and Trusted Host Resolution
PR #45 — Cloudflare / Custom-Domain Automation
PR #46 — Accessibility for People with Disabilities / WCAG Hardening

Each PR must remain single-purpose and begin from current master.

PR #46 is specifically about accessibility for people with disabilities across the public marketing site, merchant dashboard, storefront, tenant admin, and control-plane surfaces. The audit and implementation should address visual, motor, hearing, and cognitive accessibility needs, including semantic HTML, full keyboard-only operation, visible focus, form labels and error association, ARIA only where needed, screen-reader behavior and live/status announcements, contrast, touch-target sizing, zoom/reflow, image alternative text, captions/transcripts for media where applicable, reduced-motion support, and Hebrew RTL accessibility. Automated accessibility checks should be added where practical, with manual keyboard and screen-reader acceptance before READY TO MERGE.

## 21. PR #34 approved scope

PR #34 is limited to the public marketing/acquisition foundation.

In scope:
- public marketing header/navigation
- responsive landing shell
- Hero
- Why ShopNest
- capabilities/features
- How it works
- pricing presentation placeholder/config
- demo stores
- FAQ
- final CTA
- footer
- reusable marketing components
- next-intl compatibility
- accessibility basics
- metadata/SEO foundation
- links/routes for login/signup may exist without merchant account creation

Out of scope:
- merchant_accounts
- Google merchant OAuth
- password signup implementation
- subscriptions
- database provisioning
- tenant creation
- Cloudflare API automation
- custom-domain provisioning
- readiness state machine
- dynamic tenant routing changes
- production payment enablement

No control-plane migration should be required for PR #34.

## 22. PR #34 acceptance criteria

Before READY TO MERGE:
- branch from current master
- PR created as Draft
- exact scope and out-of-scope documented
- no tenant isolation regression
- no tenant DB access from public marketing routes
- existing /admin global control plane remains intact
- existing /<tenant> storefront/admin routes remain intact
- build passes
- relevant automated tests pass
- responsive desktop/mobile behavior checked
- DEV acceptance completed
- no new SQL injection surface
- no AI/prompt-execution surface introduced
- final diff reviewed
- fresh mergeability/status checked

Do not merge until explicit user approval.

## 23. Deferred decisions

Not required for PR #34:
- exact SaaS billing provider
- final pricing/limits
- exact free/trial policy
- exact minimum product count
- final merchant role matrix beyond owner/admin
- final slug-reservation TTL
- final subscription suspension behavior
- final custom-domain verification/Cloudflare mutation workflow
- whether tenant admin eventually moves into a unified /dashboard experience

These items are deferred intentionally and must not block the public marketing foundation.

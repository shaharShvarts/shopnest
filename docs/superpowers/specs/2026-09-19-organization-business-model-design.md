# ShopNest Organization / Business Model Design

Date: 2026-09-19
Status: Approved design for PR #36
Repository: shaharShvarts/shopnest
Target branch: feature/organization-business-model

## 1. Purpose

PR #36 adds the Organization / Business ownership layer between merchant identity and future stores.

The intended domain relationship is:

Merchant Account
→ Organization Membership
→ Organization / Business
→ Store (PR #37)

A merchant account represents a person. An organization represents the business entity that owns or operates stores. A store is a separate commerce entity and is intentionally out of scope for this PR.

This preserves the approved onboarding architecture and prevents merchant identity, business ownership, and tenant/store provisioning from being conflated.

## 2. Scope

PR #36 includes:

- control-plane Organization persistence
- control-plane Organization Membership persistence
- owner membership creation
- merchant authorization through membership
- merchant dashboard flow for creating the first organization
- viewing the current organization
- editing organization profile fields
- transactional creation of organization plus owner membership
- tests covering authorization, isolation, migration, and regression behavior

PR #36 does not create stores, tenants, schemas, subscriptions, payment-provider configuration, invoice-provider configuration, branding, promotions, or provisioning state.

## 3. Domain model

### 3.1 Merchant Account

Represents the human identity that authenticates to ShopNest.

Existing merchant authentication remains unchanged.

A merchant account is not:
- a business
- a store
- a tenant
- a subscription
- a payment account

### 3.2 Organization / Business

Represents the business entity associated with one or more merchants.

An organization may eventually:
- have multiple merchant members
- own multiple stores
- hold billing/subscription relationships
- hold business/legal metadata

For PR #36, the UI manages only the merchant's first organization, while the database model must not prevent future multi-organization membership.

### 3.3 Organization Membership

Represents the relationship between a merchant account and an organization.

Initial role implemented in PR #36:
- owner

The schema should allow additional roles later without redesigning the relationship. Future roles such as admin are explicitly deferred.

## 4. Control-plane tables

All Organization data belongs in the public control plane. No tenant schema is used.

### organizations

Required fields:

- id
- display_name
- legal_name nullable
- business_number nullable
- vat_number nullable
- email nullable
- phone nullable
- country not null, default "IL"
- created_at
- updated_at

Rules:

- display_name is required
- display_name is not globally unique
- organization identity is the internal id, not its display name
- business_number and vat_number are metadata only in PR #36
- no business-number verification or uniqueness policy is introduced yet
- country defaults to Israel for the initial rollout

### organization_memberships

Required fields:

- organization_id
- merchant_account_id
- role
- created_at

Rules:

- the creator receives role=owner
- unique constraint on (organization_id, merchant_account_id)
- the browser never supplies the authoritative merchant_account_id
- the browser never supplies the authoritative role
- membership is resolved from the authenticated merchant session and server-side authorization

## 5. Organization creation flow

Organization creation begins explicitly from the merchant dashboard. Signup does not create an organization automatically.

If the authenticated merchant has no organization membership, /dashboard presents a Create your business action.

The creation form supports:

- Business name — required
- Legal name — optional
- Business number — optional
- VAT number — optional
- Business email — optional
- Business phone — optional
- Country — default Israel

Creation must happen atomically:

1. resolve and verify the current merchant session
2. validate organization form input
3. begin control-plane transaction
4. insert organization
5. insert organization_membership using the authenticated merchant id and role=owner
6. commit
7. return to the merchant dashboard

If organization creation or membership creation fails, the transaction rolls back so no orphan organization remains.

## 6. Organization view and edit flow

After creation, the merchant dashboard shows the merchant's organization and owner role.

PR #36 allows editing:

- display name
- legal name
- business number
- VAT number
- email
- phone
- country

Editing does not allow:

- changing membership role
- changing merchant_account_id
- transferring ownership
- deleting the organization
- inviting members
- creating additional organizations through the UI

All edits require server-side owner authorization for the target organization.

## 7. Routing

Use the global merchant workspace, not tenant-prefixed routes.

Recommended route family:

- /dashboard
- /dashboard/business
- /dashboard/business/new
- /dashboard/business/edit

These routes must not require a tenant slug or tenant schema.

Existing tenant routes such as /<tenant>/admin remain separate and unchanged.

## 8. Authorization model

Authorization flow:

authenticated merchant session
→ membership lookup
→ organization
→ role check

Security requirements:

- unauthenticated users cannot create, view, or edit organizations
- a merchant cannot edit an organization without a membership
- PR #36 mutations require owner membership
- merchant_account_id comes only from the verified merchant session
- role=owner is assigned server-side during creation
- organization identifiers from the browser are treated only as lookup input and never as authorization proof
- no tenant schema or browser-provided schema selector participates in this flow

The implementation must fail closed if membership cannot be verified.

## 9. Multi-organization direction

The data model must support:

- one merchant account belonging to multiple organizations
- one organization containing multiple merchant accounts

The PR #36 UI intentionally does not expose:

- creation of a second organization
- organization switching
- member invitations
- admin membership

This keeps the current product flow simple while avoiding a schema redesign later.

## 10. Store separation

Organization name and store name are distinct concepts.

Example:

Organization:
Shahar Commerce Ltd.

Stores:
- Panda Pop
- Gift Shop
- Dvorik Collection

PR #36 contains no store table or store creation behavior.

PR #37 will introduce the Store Onboarding / Draft model, including store display name and requested slug.

## 11. Deferred store-management capabilities

Future merchant-management work will cover store-level functionality including:

- store logo
- branding
- editable storefront content
- promotional content
- discounts
- coupons
- campaign start/end dates
- store settings

These do not belong in PR #36.

## 12. Deferred payment and invoicing integrations

Future provider integration work must support Israeli providers including:

- Cardcom
- iCount
- Morning
- EZcount
- Grow

Payment processing and invoice/receipt generation remain separate capabilities even when one provider offers both.

The future architecture should use provider abstractions rather than coupling ShopNest business logic to a single provider.

Provider credentials must remain encrypted and isolated by the appropriate store/tenant/provider/environment boundary.

No provider implementation or credential handling is added in PR #36.

## 13. Database and migration rules

PR #36 uses the existing journaled control-plane migration mechanism.

Requirements:

- new tables are created in public control-plane schema
- migration history remains idempotent and hash-safe
- migration must work on existing DEV and STAGING databases
- no destructive reset is required
- do not use docker compose down -v
- no tenant migrations are required for this PR
- control-plane exports are updated through the existing schema structure

## 14. Error handling

Expected fail-closed behavior:

- missing merchant session → authentication redirect/rejection
- missing membership → forbidden/rejected
- non-owner membership → rejected for PR #36 mutations
- invalid form data → validation response, no database write
- organization insert failure → rollback
- membership insert failure → rollback
- duplicate membership constraint violation → no duplicate relationship
- attempted cross-organization edit → rejected
- no fallback to tenant/public legacy commerce tables

## 15. Testing strategy

PR #36 must include regression coverage for at least:

- control-plane schema/migration presence
- organization creation
- organization plus owner membership created atomically
- display_name required
- display_name does not need to be unique
- duplicate membership prevented
- unauthenticated create blocked
- unauthenticated edit blocked
- merchant cannot edit another organization's data
- owner can view own organization
- owner can edit own organization
- browser-supplied merchant id is ignored/not accepted as authority
- browser-supplied role is ignored/not accepted as authority
- no tenant database access in organization flows
- merchant auth regressions remain green
- customer auth regressions remain green
- admin auth regressions remain green
- control-plane tests remain green
- production build passes

Manual acceptance:

DEV:
- merchant with no organization sees Create your business
- creating business creates organization and owner membership
- dashboard shows organization
- edit updates organization fields
- second organization is not exposed in UI

STAGING:
- control-plane migration succeeds
- create/view/edit smoke flow passes
- existing merchant/customer/admin/tenant routes remain unaffected

## 16. Explicitly out of scope

PR #36 does not include:

- Store creation
- Store slug
- tenant creation
- tenant schema provisioning
- dynamic tenant registry
- subscription or billing
- payment-provider setup
- invoice-provider setup
- Cardcom expansion
- iCount integration
- Morning integration
- EZcount integration
- Grow integration
- store logo
- store branding
- storefront content management
- promotions
- discounts
- coupons
- organization deletion
- ownership transfer
- invitations
- admin membership UI
- organization switcher
- production email changes

## 17. Follow-up roadmap

Current sequence:

- PR #36 — Organization / Business Model
- PR #37 — Store Onboarding / Draft Model and Slug Request
- PR #38 — Merchant Dashboard / Store Management Shell
- PR #39 — Plans and Subscription Domain Model
- PR #40 — Readiness Engine / Checklist
- PR #41 — Provisioning Lifecycle / State Machine
- PR #42 — Dynamic Trusted Tenant Registry Resolution
- PR #43 — Activation Orchestration
- PR #44 — Domain Model and Trusted Host Resolution
- PR #45 — Cloudflare / Custom-Domain Automation

Additional later work:

- Store Branding & Content
- Promotions / Discounts / Coupons
- Israeli Payment & Invoicing Provider Framework
- Cardcom integration expansion
- iCount integration
- Morning integration
- EZcount integration
- Grow integration
- Git hygiene review
- full repository-history secret scan
- automated secret scanning in CI (for example, gitleaks)

## 18. Acceptance criteria

Before PR #36 is READY TO MERGE:

- branch is based on current master
- PR is created as Draft
- organization and membership schema matches this design
- only owner role is behaviorally implemented
- create/view/edit flow works from merchant dashboard
- organization creation is transactional
- authorization is membership-based and server-side
- no browser-provided merchant id or role is trusted
- no tenant DB access is introduced
- no store/tenant/provisioning behavior is introduced
- migration succeeds on existing DEV
- relevant automated tests pass
- npm run build passes
- DEV browser acceptance passes
- STAGING migration and smoke acceptance pass
- final diff is reviewed
- fresh mergeability/status is checked
- merge occurs only after explicit user approval

# ShopNest Store Onboarding / Draft Model Design

Date: 2026-09-20
Status: Approved written spec for PR #37
Repository: shaharShvarts/shopnest
Target branch: feature/store-onboarding-draft-model

## 1. Purpose

PR #37 introduces Store as the merchant-facing commerce entity between Organization and Tenant.

The approved domain relationship is:

Merchant Account
→ Organization Membership
→ Organization / Business
→ Store
→ Tenant
→ PostgreSQL schema

A Store is the business/customer-facing shop a merchant manages. A Tenant is the technical runtime and isolation resource. A PostgreSQL schema is the tenant's data-isolation boundary.

This separation prevents merchant onboarding from prematurely provisioning infrastructure and keeps tenant isolation server-controlled.

## 2. Scope

PR #37 includes:

- public control-plane Store persistence
- Store ownership through Organization
- multiple Stores per Organization
- draft Store creation before Tenant provisioning
- globally unique requested Store slug
- automatic slug suggestion from Store name
- reserved-slug protection
- Store view/edit flow
- basic merchant Store list and first-store onboarding entry point
- Store soft-delete with a 10-second Undo window
- controlled slug release after delete finalization
- one-to-one Store-to-Tenant linkage in the data model
- removal of the three legacy static tenant slugs from the trusted registry
- safe cleanup of obsolete legacy tenant seed rows where they are demonstrably unused
- automated tests and DEV/STAGING acceptance

PR #37 does not provision a Tenant or PostgreSQL schema. It does not activate a Store for storefront traffic.

## 3. Domain model

### 3.1 Organization

Organization remains the business/legal/commercial ownership entity introduced in PR #36.

One Organization may own multiple Stores.

Organization authorization remains membership-based. PR #37 does not introduce Store-level membership.

### 3.2 Store

Store is the merchant-facing commerce entity.

Examples:

Organization:
Shahar Commerce Ltd.

Stores:
- Panda Pop
- Gift Shop
- Dvorik Collection

Store owns the merchant-facing name and requested public slug.

Store does not own:
- schema_name
- tenant runtime status
- tenant plan
- tenant suspension state
- database isolation mechanics

Those remain Tenant concerns.

### 3.3 Tenant

Tenant remains the technical runtime/isolation resource in public.tenants.

A Store may exist before a Tenant exists.

The relationship is optional one-to-one:

Organization 1 → N Store
Store 0..1 → 1 Tenant

Each Store may reference at most one Tenant. Each Tenant may be linked from at most one Store.

### 3.4 PostgreSQL schema

The schema remains an implementation detail of Tenant isolation.

Store does not duplicate schema_name.

The browser must never choose or authorize a tenant schema.

## 4. Store lifecycle

The Store lifecycle is:

draft
→ ready_for_provisioning
→ provisioned

PR #37 creates every new Store as draft.

The ready_for_provisioning state exists in the model for future onboarding/readiness work, but PR #37 does not expose a user action that moves a Store into that state.

The provisioned state represents a Store with a linked Tenant.

PR #37 does not implement provisioning. The future provisioning flow will be responsible for creating/linking the Tenant and schema and transitioning Store state under server-controlled rules.

## 5. Control-plane schema

Create public.stores in the existing control-plane schema.

Required fields:

- id — primary key
- organization_id — required FK to public.organizations.id
- display_name — required, varchar(160)
- slug — required, varchar(63)
- status — required Store status, default draft
- tenant_id — nullable FK to public.tenants.id
- deleted_at — nullable timestamp with time zone
- delete_finalizes_at — nullable timestamp with time zone
- slug_released_at — nullable timestamp with time zone
- created_at — required timestamp with time zone
- updated_at — required timestamp with time zone

Store status values:

- draft
- ready_for_provisioning
- provisioned

### 5.1 Organization foreign key

organization_id must not use cascading delete.

Deleting an Organization must not silently delete its Stores. Organization deletion is out of scope, and the Store relationship should fail closed if future code attempts destructive Organization deletion without an explicit policy.

### 5.2 Tenant foreign key

tenant_id is nullable because Store is created before provisioning.

tenant_id must be unique when present. PostgreSQL uniqueness semantics allow multiple NULL values, so many unprovisioned Stores are valid while a Tenant can be linked to only one Store.

The Tenant foreign key must not silently cascade-delete or detach a provisioned Store. Destructive Tenant removal requires a future explicit lifecycle policy.

### 5.3 State constraints

Database/application invariants:

- draft requires tenant_id IS NULL
- ready_for_provisioning requires tenant_id IS NULL in PR #37
- provisioned requires tenant_id IS NOT NULL
- deleted_at and delete_finalizes_at are either both NULL or both non-NULL
- slug_released_at may be set only for a deleted Store
- normal merchant delete is allowed only when tenant_id IS NULL
- a Store with tenant_id IS NOT NULL cannot be deleted through the PR #37 merchant flow

These rules must be enforced server-side even if the browser bypasses UI controls.

## 6. Store slug model

Store.slug is the future public path identity, for example:

Panda Pop
→ panda-pop
→ shopnest.co.il/panda-pop

### 6.1 Format

The slug policy follows the existing safe tenant-slug shape:

- lowercase ASCII letters
- digits
- hyphens between segments
- no leading or trailing hyphen
- no consecutive separator-only segments
- resulting schema-compatible representation must not exceed PostgreSQL identifier constraints needed by future provisioning

Canonical shape:

^[a-z0-9]+(?:-[a-z0-9]+)*$

Store creation should suggest a slug automatically from display_name, but the merchant may edit the slug before provisioning. The automatic suggestion is ASCII-only and deterministic. If a display name cannot produce a valid ASCII slug (for example, a Hebrew-only name), the slug field remains empty and the merchant must enter a valid slug manually; PR #37 does not introduce transliteration rules.

### 6.2 Global uniqueness

Store slugs are globally unique across ShopNest, not merely unique inside an Organization.

Two Organizations cannot simultaneously own active/reserved Stores with the same slug.

### 6.3 Reserved slugs

System/global route names can never be Store slugs.

The reserved set must cover current global routes and infrastructure prefixes, including at least:

- admin
- api
- dashboard
- login
- signup
- forgot-password
- reset-password
- features
- pricing
- examples
- faq
- media
- static
- _next

The implementation should centralize this rule so Store validation and routing tests do not maintain conflicting lists.

### 6.4 Slug lock after provisioning

Before tenant linkage, Store.slug is editable.

After tenant_id is set, Store.slug is locked.

The UI must explain the reason rather than merely disabling the field. Example intent:

"The store address is locked after the store is activated because it is connected to the tenant and the store's data structure."

The server must independently enforce the lock.

## 7. Soft delete, Undo, and slug release

Deletion follows the platform UX principle of immediate action plus Undo where the operation is safely reversible.

A normal Store delete is allowed only when tenant_id IS NULL.

### 7.1 Delete

On delete:

- set deleted_at = now
- set delete_finalizes_at = now + 10 seconds
- leave slug_released_at = NULL
- remove the Store from normal merchant queries immediately
- show a Toast with Undo for 10 seconds

The Store row is not physically deleted.

### 7.2 Undo

Undo is valid only while the 10-second window remains open.

Undo clears:

- deleted_at
- delete_finalizes_at

slug_released_at remains NULL.

Undo uses updated_at as the optimistic concurrency token. The delete response returns the Store's post-delete updated_at value, and Undo succeeds only if the current row still has that same updated_at value. A stale Undo must not overwrite a newer mutation.

### 7.3 Finalization

After delete_finalizes_at has passed, the deletion is final from the user's perspective.

PR #37 does not add a background worker or timer.

Finalization is opportunistic:

- normal reads treat an expired deleted Store as deleted whether or not slug_released_at has been persisted yet
- Store/slug operations that need the slug state may finalize eligible expired deletions transactionally
- finalization sets slug_released_at = now
- once released, the slug may be used by a new Store

Undo after expiry must fail and must never revive a finalized Store.

### 7.4 Partial uniqueness

Because historical Store rows remain after deletion, a simple UNIQUE(slug) constraint is not sufficient.

Use a partial unique index equivalent to:

unique slug
WHERE slug_released_at IS NULL

This means:

- active Store → slug reserved
- Store inside Undo window → slug reserved
- expired Store not yet finalized → create/reuse flow first finalizes it transactionally
- finalized deleted Store → slug reusable
- historical deleted row remains available for audit/history

There is no Trash/Restore UI in PR #37.

## 8. Merchant authorization

Every Store operation derives authority from the authenticated merchant session.

Authorization chain:

verified Merchant session
→ Organization Membership
→ role = owner
→ Store.organization_id matches the authorized Organization
→ action-specific invariant

Requirements:

- browser-supplied merchant_account_id is never trusted
- browser-supplied organization_id is never authorization proof
- browser-supplied tenant_id is never accepted as authority
- browser-supplied schema is never accepted
- a Store id alone never authorizes access
- cross-Organization Store reads/writes fail closed
- PR #37 behaviorally supports owner role only
- there is no store_memberships table in PR #37

The current first-Organization UI model remains acceptable, while the Store data model allows multiple Stores for that Organization.

## 9. Store operations

### 9.1 Create

Create flow:

1. resolve verified merchant session
2. resolve owner Organization membership
3. validate display_name and slug
4. normalize slug
5. reject reserved slug
6. transactionally finalize any expired deleted Store that blocks the requested slug, if eligible
7. enforce global slug uniqueness
8. insert Store with status=draft and tenant_id=NULL
9. return the created Store

Creation never creates a Tenant or schema.

### 9.2 Read/list

Normal Store queries:

- are scoped through the merchant's authorized Organization
- exclude soft-deleted Stores
- do not require tenant context
- do not access tenant schemas

### 9.3 Edit

Before tenant linkage:

- display_name editable
- slug editable

After tenant linkage:

- display_name may remain editable
- slug is locked

Edit must re-run slug normalization, reserved-name validation, uniqueness rules, authorization, and concurrency checks. Mutations that can race use an expected updated_at precondition from the last server-observed Store state; that value is a concurrency check only and never an authorization signal.

### 9.4 Delete

Delete requires:

- authenticated merchant
- owner membership
- Store belongs to that Organization
- tenant_id IS NULL
- Store is not already finalized deleted

Delete is soft-delete only.

### 9.5 Undo

Undo requires:

- same authorization chain
- delete window has not expired
- optimistic concurrency precondition still matches
- Store has not been finalized

## 10. Merchant UI

PR #37 intentionally includes the basic Store-management UI needed to exercise the Store model. This supersedes the earlier roadmap split that deferred the entire Store management shell to PR #38; later roadmap items may be renumbered or narrowed accordingly.

### /dashboard

If the Organization has no active Stores:

- show an empty state
- primary action: "Create your first store"

If at least one Store exists:

- show a My Stores summary
- provide Add store

### /dashboard/stores

Show all non-deleted Stores for the authorized Organization.

Each Store entry shows:

- display_name
- slug / future URL
- lifecycle status
- View
- Edit
- Delete only when tenant_id IS NULL

### /dashboard/stores/new

Creation form fields:

- Store name
- slug

Behavior:

- Store name is required
- slug is suggested automatically from Store name
- merchant can edit slug
- URL preview updates as slug changes
- example preview: shopnest.co.il/panda-pop
- validation covers format, reserved names, and availability

The preview is text/UI only. It does not imply the storefront is routable before provisioning.

### /dashboard/stores/[id]

Show:

- Store name
- slug / future URL
- status
- Tenant information when tenant_id exists
- clear indication that an unprovisioned Store is not yet live

### /dashboard/stores/[id]/edit

Before provisioning:

- Store name editable
- slug editable

After tenant linkage:

- Store name editable
- slug shown locked
- explanatory text shown for the lock

### Delete UX

On eligible delete:

- Store disappears from the visible list immediately
- Toast offers Undo for 10 seconds
- Undo restores it if the server accepts the concurrency/expiry checks

For a Store linked to a Tenant:

- normal delete is unavailable
- UI explains why deletion is blocked
- server also rejects the operation

## 11. Legacy tenant cleanup

The existing static trusted tenant registry currently contains:

- panda-pop
- dvorik-collection
- gift-shop

DEV and STAGING have already been manually reset so the corresponding tenant schemas and control-plane tenant rows are absent.

PR #37 removes these three slugs from the static configured tenant registry.

Consequences:

- /panda-pop, /gift-shop, and /dvorik-collection return 404 until a future provisioning/routing flow activates a real Tenant
- creating a Store named Panda Pop with slug panda-pop does not make /panda-pop routable in PR #37
- Store creation and tenant routing remain separate concerns

### 11.1 Fresh-database cleanup

Historical migration 0000 seeded the three legacy tenant rows. Do not edit that already-applied historical migration.

A new journaled control-plane migration may clean those exact seed rows so a fresh database that runs all migrations ends in the new clean state.

The cleanup must be fail-safe and must not cascade-delete live tenant ownership/auth data:

- match only the exact known legacy seed slugs/schema names
- delete only when the corresponding tenant schema does not exist
- do not delete when dependent/live references make the row operational
- if safe cleanup cannot be proven, leave the row and surface the condition for manual handling rather than deleting data

The migration never drops tenant schemas.

Production deployment is outside PR #37 acceptance. Before any production rollout, verify separately that none of the removed static slugs represent a live production tenant.

## 12. Routing boundary

PR #37 does not implement dynamic Store/Tenant routing.

The current middleware continues to derive trusted tenant context only from server-controlled tenant resolution.

Store.slug is a requested/future public identity, not a routing authority.

A Store record must never cause middleware to trust a schema directly.

Future provisioning/routing work will:

- create Tenant
- create/migrate tenant schema
- link Store.tenant_id
- transition Store to provisioned
- expose the Tenant through a dynamic trusted tenant registry
- make the Store URL routable

Those actions are explicitly deferred.

## 13. Immediate-action + Undo platform principle

PR #37 establishes the Store deletion behavior as the first implementation of the wider ShopNest UX principle:

- normal reversible edits/deletes should feel immediate
- Undo should be offered when the operation is safely reversible
- physical asset/data cleanup should be deferred when Undo is supported
- stale Undo must not overwrite newer state
- irreversible operations such as payment capture or infrastructure provisioning must not pretend to support Undo

PR #37 does not refactor Product deletion or other existing hard-delete flows.

The existing Product hard-delete behavior is a separate follow-up design/task.

## 14. Error handling

Expected fail-closed behavior:

- missing merchant session → authentication redirect/rejection
- missing Organization membership → rejected
- non-owner membership → rejected for PR #37 mutations
- Store from another Organization → not exposed / rejected
- invalid slug format → validation error, no write
- reserved slug → validation error, no write
- active/reserved duplicate slug → conflict, no partial write
- tenant-linked Store delete → rejected
- tenant-linked Store slug edit → rejected
- stale mutation/Undo → conflict, no overwrite
- Undo after 10-second expiry → rejected
- finalization race → handled transactionally so only one live/reserved Store can own a slug
- database failure → transaction rollback
- no fallback to browser-provided tenant/schema context

## 15. Migration rules

PR #37 uses the existing journaled control-plane migration mechanism.

Requirements:

- create public Store schema through a new control-plane migration
- do not rewrite historical migration files
- preserve migration hash/journal integrity
- migration is idempotent through the existing migration runner
- no tenant-schema migration is required
- no tenant/schema provisioning is performed
- no docker compose down -v or environment reset is part of implementation
- DEV/STAGING data reset already occurred separately and is not repeated automatically
- production data is not reset or deleted as part of PR acceptance

## 16. Automated testing

Add focused Store model/repository/action/route tests covering at least:

- Store belongs to an Organization
- one Organization can own multiple Stores
- owner can create Store
- unauthenticated Store create blocked
- non-owner Store mutation blocked
- cross-Organization read blocked
- cross-Organization edit blocked
- new Store is draft
- new Store has tenant_id=NULL
- display_name required
- slug normalized
- slug globally unique while reserved
- reserved system slugs rejected
- automatic slug suggestion behavior
- Store slug editable before tenant linkage
- Store slug locked after tenant linkage
- tenant_id unique across Stores
- provisioned state requires tenant_id
- draft/ready state cannot hold tenant_id in PR #37
- tenant-linked Store cannot be deleted
- soft-delete hides Store from normal queries immediately
- Undo works inside 10 seconds
- Undo fails after 10 seconds
- stale Undo/mutation cannot overwrite newer state
- slug remains unavailable during Undo window
- expired deletion can be finalized transactionally
- slug becomes reusable after finalization
- legacy configured tenant slugs are removed
- legacy URLs fail closed until future provisioning
- Store creation does not create Tenant
- Store creation does not create schema
- Store flows do not use browser-supplied schema/tenant authority
- control-plane migration works on a clean database
- legacy seed cleanup refuses to delete operational/live tenant rows

All existing regression suites remain required.

GitHub Actions must run the existing full test suite and production build before merge.

## 17. Manual acceptance

### DEV

Starting from the clean DEV environment:

1. merchant signs up/logs in
2. merchant creates Business/Organization
3. dashboard shows Create your first store
4. create Store with display name "Panda Pop"
5. slug suggestion is panda-pop
6. URL preview shows shopnest.co.il/panda-pop
7. Store is created as draft
8. Store appears in My Stores
9. edit name and slug before provisioning
10. delete Store
11. Store disappears immediately and Toast offers Undo
12. Undo inside 10 seconds restores Store
13. delete again
14. wait more than 10 seconds
15. same slug becomes reusable through the normal create flow

Database verification:

- Store references the expected Organization
- status=draft for newly created Store
- tenant_id IS NULL
- no new public.tenants row was created
- no tenant schema was created

Routing verification:

- /panda-pop remains 404 because provisioning/dynamic registry are not part of PR #37

### STAGING

After DEV acceptance:

- apply control-plane migration
- repeat create/view/edit/delete/Undo flow
- verify no Tenant/schema is created by Store creation
- verify legacy Storefront slugs remain unroutable
- verify global merchant routes remain healthy

## 18. CI and merge gate

Before PR #37 is READY TO MERGE:

- feature branch is based on current master
- PR remains Draft until implementation/acceptance is complete
- new Store tests pass
- all existing GitHub Actions tests pass
- production build passes
- DEV manual acceptance passes
- STAGING migration and smoke acceptance pass
- final diff is reviewed
- fresh mergeability/status is checked
- merge occurs only after explicit user approval

The local Ubuntu DEV host currently uses a distro Node 22 build with process.features.typescript=false. Local .mts verification may therefore use tsx. GitHub Actions remains authoritative and uses its configured Node 22 environment.

## 19. Explicitly out of scope

PR #37 does not include:

- automatic Tenant creation
- PostgreSQL schema creation
- tenant migrations for new Store
- provisioning orchestration
- readiness checklist UI/action
- user-visible Mark ready action
- dynamic trusted tenant registry
- storefront activation
- custom domains
- Cloudflare automation
- subscription billing
- payment-provider setup
- Cardcom production rollout
- invoice-provider setup
- Store-level membership
- Organization switching
- Store logo/branding/content management
- promotions/discounts/coupons
- Product delete Undo refactor
- background delete-finalization worker
- Trash/Restore screen
- hard deletion of Store history
- production deployment/reset

## 20. Follow-up direction

After PR #37, the next architecture work should build on the new separation rather than collapse Store back into Tenant.

Expected follow-up capabilities include:

- merchant Store management shell expansion where still needed
- plans/subscription domain model
- readiness engine/checklist
- provisioning lifecycle/state machine
- dynamic trusted Tenant registry
- activation orchestration
- domain model/trusted host resolution
- custom-domain automation
- platform-wide immediate-action + Undo framework
- Product soft-delete/Undo migration

The exact PR numbering after #37 may be revised because basic Store management UI is now intentionally included in PR #37.

## 21. Acceptance criteria

PR #37 is complete only when all of the following are true:

- public.stores exists in the control plane
- Store is owned by Organization, not Merchant directly
- Organization can own multiple Stores
- Store can exist without Tenant
- new Store starts as draft
- Store slug is globally unique while reserved
- reserved system slugs are rejected
- Store name suggests an editable slug before provisioning
- slug is locked after Tenant linkage
- Store-to-Tenant relationship is one-to-one
- no browser-provided tenant/schema authority is trusted
- normal delete is permitted only before Tenant linkage
- delete is soft and immediate in UI
- Undo is available for 10 seconds
- stale Undo cannot overwrite newer state
- slug remains reserved during Undo window
- slug is reusable only after finalization
- historical deleted Store row is retained
- no background worker is required
- the three legacy static tenant slugs are removed
- fresh migration state does not recreate usable legacy tenants
- safe legacy cleanup cannot cascade-delete live data
- Panda Pop can be recreated as a new Store with no legacy data
- Store creation does not create Tenant/schema
- /panda-pop remains unroutable until future provisioning
- full automated regression suite passes in GitHub Actions
- production build passes
- DEV acceptance passes
- STAGING acceptance passes
- production is not modified without separate rollout approval
- merge occurs only after explicit user approval

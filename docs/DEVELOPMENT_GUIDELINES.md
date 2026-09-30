# ShopNest Development Guidelines

This document is the standing working agreement for ShopNest development. New development sessions should read this document before proposing or implementing changes.

It contains project-wide principles, security boundaries, workflow rules, tooling expectations, testing standards, and collaboration conventions. Feature-specific design and implementation details belong in dedicated specs/plans and should reference this document instead of repeating it.

## 1. Project Overview

ShopNest is a multi-tenant ecommerce SaaS.

Primary stack:

- Next.js 15 App Router
- TypeScript
- PostgreSQL 17
- Drizzle ORM
- node-postgres
- Docker / Docker Compose
- Nginx
- next-intl
- schema-per-tenant isolation using PostgreSQL `search_path`

Repository:

- GitHub: `shaharShvarts/shopnest`
- Default branch: `master`

The platform separates control-plane data from tenant business data. Tenant data such as catalog, orders, inventory, checkout, customer activity, and payment state lives in tenant-specific schemas. Control-plane data lives in `public`.

## 2. Core Engineering Principles

These rules apply to all features unless an approved design explicitly strengthens them.

### 2.1 Tenant isolation is non-negotiable

- Never trust a browser-supplied tenant slug, tenant ID, schema name, organization ID, or store ownership claim as authority.
- Resolve tenant/store/schema authority on the server from trusted control-plane records.
- A user authorized for one tenant must never be able to access or mutate another tenant.
- Tenant schema selection must come from trusted server-side resolution.
- Do not weaken schema-per-tenant isolation to simplify UI or routing.
- Cross-tenant behavior must fail closed.

### 2.2 Server authority

- Prices and payment amounts are server-authoritative.
- Inventory state is server-authoritative.
- Store ownership and permissions are server-authoritative.
- Payment state transitions are server-authoritative.
- Browser values are inputs to validate, not authority to trust.

### 2.3 Fail closed for security-sensitive paths

Authentication, authorization, tenant resolution, payments, domain ownership, inventory, checkout, and lifecycle operations must reject ambiguous or unverifiable states.

Do not silently fall back to a less secure path.

### 2.4 Prefer incremental changes

- Avoid large rewrites when existing behavior can be safely refactored in stages.
- Preserve working paths during migrations when practical.
- Build rollback points into large changes.
- Keep unrelated concerns out of the same PR.

## 3. Application Architecture Conventions

### 3.1 Next.js

- Prefer Server Components by default.
- Use Client Components only where client state/interactivity is required.
- Use Server Actions for mutations where they fit the App Router model.
- Keep authorization checks on the server.
- Do not rely on hidden buttons or client-side routing as permission enforcement.

### 3.2 Validation

- Use Zod at trust boundaries.
- Validate request/form/API inputs before business logic.
- Normalize identifiers such as email addresses consistently before comparisons.

### 3.3 Database access

- Prefer Drizzle ORM for reads, writes, and transactions.
- Raw SQL is acceptable only when there is a concrete reason, such as PostgreSQL advisory locks or features not represented safely by Drizzle.
- Keep transactions narrow and explicit.
- Concurrency-sensitive workflows must use locking/idempotency appropriate to the invariant being protected.

### 3.4 Tenant database access

Trusted resolution should follow a pattern equivalent to:

```text
authenticated principal
    -> authorized Store / Tenant relationship
    -> trusted control-plane record
    -> tenant_id / tenant slug
    -> trusted schema
    -> tenant database handle
```

Never construct tenant DB access from a client-provided schema.

## 4. Authentication and Authorization Boundaries

ShopNest currently has distinct account/security domains. Do not merge them casually.

### Merchant / Store Owner

- Control-plane account: `public.merchant_accounts`
- Organization membership: `public.organization_memberships`
- Merchant login: `/login`
- Merchant workspace: `/dashboard`

Merchant ownership is organization/store based.

### Tenant Admin / Store Manager

- Account model currently uses `public.admin_users`
- Tenant assignment currently uses `public.admin_user_tenants`
- Role: `tenant_admin`
- Existing tenant administration currently lives under `/[tenant]/admin`

Tenant Admin authorization must remain tenant-bound.

### ShopNest Super Admin

- Role: `super_admin`
- Platform administration: `/admin`
- This is a ShopNest control-plane role, not a merchant/store owner role.

Super Admin must remain logically separate from normal merchant/store management unless an approved design explicitly defines otherwise.

### Authorization rule

Hiding a menu item is not authorization.

Every protected page, Server Action, route handler, API, repository mutation, and sensitive service must verify authorization server-side.

## 5. Checkout, Orders, Reservations, and Inventory

The following invariants must be preserved:

- Prices and totals come from server-side product/order state.
- Never trust browser-supplied payment amount.
- Preserve reservation/order/inventory bindings.
- Prevent double inventory decrement.
- Preserve concurrency safety.
- Payment confirmation must use the existing transactional inventory path.
- Late verified payment after reservation/order invariants are no longer valid must become a review state such as `review_required`, not silently consume stock.
- Idempotency must be maintained for payment confirmation and other retryable workflows.

## 6. Payment Provider Rules

Payment-provider integrations, including Cardcom, are security-sensitive.

- Provider credentials and secrets never belong in browser-accessible code.
- Do not log secrets.
- Payment initiation must derive order/store/tenant/amount from trusted server state.
- Payment verification must validate provider results server-side.
- Return/callback flows must preserve verified ownership and tenant binding.
- Fail closed when provider verification is ambiguous or incomplete.
- Sandbox success does not imply production readiness.

## 7. Custom Domains and Routing

Custom domains are customer-facing storefront domains.

The management/control plane stays on ShopNest-owned hosts.

Rules:

- A custom hostname must resolve through the trusted domain registry.
- Unknown/untrusted custom domains must fail closed.
- Do not expose global management/auth/provider APIs through untrusted custom hostnames.
- Platform-path storefront traffic may redirect to the primary custom domain when appropriate.
- Management routes should not be moved to merchant custom domains merely for convenience.
- Domain lifecycle transitions must preserve locking, tenant binding, provider cleanup, and rollback invariants.

## 8. Data and Migration Rules

- Use migrations for persistent schema changes.
- Never manually patch production/staging schemas as a substitute for a migration.
- Preserve control-plane vs tenant-schema boundaries.
- Avoid unnecessary data migrations when a routing/auth/UI refactor can reuse existing data.
- Migration scripts must be repeatable/safe according to the project migration model.
- Before migration changes, inspect current migration history and actual runtime schema.

## 9. Testing Standards

Security-sensitive work should be developed with TDD where practical.

Testing sequence:

1. Add/adjust focused regression test.
2. Observe the intended failure when proving a bug or missing invariant.
3. Implement the smallest safe change.
4. Run focused tests.
5. Run related subsystem suites.
6. Run broader regression suites.
7. Run production build.
8. Perform environment smoke/acceptance where required.

Do not treat a successful build as a substitute for tests.

Typical areas requiring explicit regression coverage:

- tenant isolation
- ownership/authorization
- cross-store tampering
- schema resolution
- checkout concurrency
- inventory idempotency
- payment verification
- domain lifecycle races
- session invalidation
- route redirects / fail-closed behavior

## 10. Git and Pull Request Workflow

- Use feature branches only.
- Keep each PR focused on one coherent change.
- Do not mix unrelated architectural work into an existing feature PR.
- Never use `git reset --hard` as a routine workflow step.
- Never force-push unless explicitly approved and justified.
- Never merge a PR without explicit user approval.
- Do not mark a PR ready for review or merge simply because CI is green.
- Confirm DEV/STAGING acceptance requirements when the PR requires them.
- Before starting a new feature, inspect current branch, open PRs, and dependency order.
- When a feature depends on an unmerged PR, treat it as a stacked dependency explicitly.

Commit messages should describe the behavior/invariant changed, not only the file edited.

## 11. DEV and STAGING Safety

### DEV

DEV is the primary interactive validation environment.

When running commands:

- Verify the current directory and compose file.
- Use the correct `.env.dev`.
- Avoid destructive DB operations unless explicitly approved.
- Do not assume a command succeeded; inspect output/status.

### STAGING

STAGING validates deployability and integration behavior.

Typical acceptance can include:

- image build
- migration
- container restart
- health/runtime check
- Nginx/public-host smoke
- feature-specific acceptance when required

Do not claim full E2E acceptance when only deployment smoke was performed.

### Production

Production changes require explicit readiness and approval. Never promote sandbox/test assumptions into production behavior automatically.

## 12. Destructive Operations

Never perform any of the following without explicit approval:

- dropping databases/schemas/tables
- deleting Docker volumes
- bulk deleting user/store/order data
- hard-deleting records merely to clean DEV
- rewriting Git history
- destructive migration rollback
- changing DNS/provider state with irreversible impact

Prefer inspection, backups, soft-delete semantics, and reversible steps.

## 13. Tooling Expectations

For repository work:

- Prefer the connected GitHub tools for current repository state, branches, PRs, files, commits, and CI.
- Read the current source before making claims about implementation.
- Do not rely solely on conversation memory when live repository state can be checked.
- Use GitHub source as the authority for current code.

For server/runtime work:

- Use Docker Compose commands appropriate to the target environment.
- Use PostgreSQL/psql for targeted diagnostics when needed.
- Keep commands minimal and scoped.
- Avoid secret values in visible command output.

For public/external information:

- Use web research only when external/current public information is actually relevant.
- Internal ShopNest implementation questions should be grounded primarily in repository/company sources.

## 14. Interactive Working Style

When guiding the user through server or terminal work:

- Respond in Hebrew unless the user asks otherwise.
- Keep code identifiers, file names, commands, and technical names in English.
- Prefer one operational command/block at a time.
- Wait for the user's output before issuing the next operational step.
- Never invent command output.
- Never claim a deployment, migration, test, or fix is complete without evidence.
- If a command fails, diagnose the actual error before changing multiple unrelated things.
- Avoid very large command dumps when the task can be done interactively.

For design/review work, larger structured answers are acceptable.

## 15. Documentation Rules

- Project-wide rules belong in this document.
- Feature-specific requirements belong in dedicated design/plan documents.
- Do not duplicate standing rules in every feature plan; reference this document.
- Update documentation when a product decision changes.
- If code and docs disagree, inspect the current implementation and explicitly reconcile the discrepancy rather than silently assuming one is correct.

## 16. Current Reference Documents

Relevant existing documentation includes:

- `docs/TECHNICAL_SPEC.md`
- `docs/multi-tenancy.md`
- `docs/control-plane.md`
- `docs/admin-authentication.md`
- `docs/catalog-management.md`
- `docs/inventory.md`
- `docs/payments.md`
- `docs/dev-deployment.md`
- `docs/staging-deployment.md`
- feature specs/plans under `docs/superpowers/`

These documents provide domain-specific detail. This file defines the standing development workflow and engineering guardrails.

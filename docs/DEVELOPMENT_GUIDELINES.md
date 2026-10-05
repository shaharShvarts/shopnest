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

### 3.2 Validation and form contracts

Validation is a mandatory architectural rule, not an optional feature-level improvement.

Every user-controlled input must have an explicit contract that is enforced in **both** places below:

1. **Browser/UI constraints** for immediate feedback and to prevent obviously invalid input.
2. **Server-side Zod validation** at the trust boundary before business logic, authorization-sensitive mutation logic, or persistence.

Client-side validation is never sufficient by itself. Browser requests can be forged or bypass UI controls.

For every form field, choose the input control and Zod schema according to the actual domain type. Do not default to a generic text field.

Examples:

- integer count / quota -> integer-only control and `z.number().int()` or equivalent coercion
- decimal money / rate -> decimal-only control with explicit precision rules and a Zod schema that enforces them
- boolean -> checkbox/switch/select with a boolean-specific schema
- email -> `type="email"` plus normalized Zod email validation
- URL / hostname / slug / code -> domain-specific parser or regex, not unrestricted text
- enum/status -> select/radio plus `z.enum(...)`
- free text -> explicit min/max length and trimming rules
- IDs -> positive integer/UUID schema as appropriate
- date/time -> explicit date/time format and range validation
- file/image -> explicit MIME, size, count, and content validation where required

Field contracts must define, as applicable:

- required vs optional
- empty-string behavior
- type
- minimum / maximum
- integer vs decimal
- decimal precision
- allowed characters / format
- normalization
- enum membership
- uniqueness assumptions
- cross-field invariants

A field must not be silently treated as optional merely because an empty string was submitted. If the business meaning is "free", "zero", "none", or "disabled", require the explicit semantic value such as `0` or `false` instead of accepting an empty field.

Money values must not be accepted as arbitrary strings or JavaScript floating-point values. Parse validated decimal input into integer minor units before persistence. Define allowed precision explicitly (for example, ILS prices allow at most two decimal places).

Server Actions, Route Handlers, APIs, CLI/admin mutations, and other trust boundaries must parse the complete input object with Zod before passing values into service/repository code. Do not validate only one or two fields ad hoc while leaving the rest as raw `FormData`.

Dynamic fields such as entitlements must also be validated according to their registered domain type. For example, an integer entitlement must reject fractions and invalid negatives; a boolean entitlement must accept only its defined boolean representation.

When adding or changing a form, the implementation checklist is mandatory:

1. Define the domain type and semantics of every field.
2. Select the correct HTML/control type and client constraints.
3. Define or reuse the matching Zod schema.
4. Normalize values deliberately.
5. Parse the full mutation payload server-side before business logic.
6. Add regression tests for valid values, invalid type/format, boundary values, and required-field behavior.

Do not rely on manual QA to discover mismatched field types. Code review and tests must treat a generic or incorrectly typed field as a defect.

Normalize identifiers such as email addresses consistently before comparisons.

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
- form field type contracts
- required vs optional field behavior
- integer vs decimal boundaries
- server-side Zod rejection of forged/invalid payloads

For any form or mutation touched by a PR, review all fields in that form as a unit. Do not validate only the newly added field and leave neighboring fields with weaker contracts.

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

### 13.1 Local DEV execution, worktrees, TypeScript tests, and Drizzle CLI

These rules capture the current DEV-server behavior so new development sessions do not rediscover it.

#### Feature worktrees

Substantial feature work should run from an isolated Git worktree when practical.

Current server layout convention:

```text
/srv/shopnest/dev                         primary DEV checkout
/srv/shopnest/worktrees/<feature-name>   isolated feature worktree
```

A new worktree needs its own dependency install, for example `npm install`.

Worktree-local scratch state and environment links must not be committed.

#### TypeScript tests on the DEV host

The current DEV host uses Node.js `v22.22.1`. Its installed Node build can fail on commands that rely on:

```text
node --experimental-strip-types
```

with:

```text
ERR_NO_TYPESCRIPT
```

This is an environment/runtime limitation, not evidence that the application test itself is failing.

For `.mts` tests on this host, use the repository's established `tsx` pattern, for example:

```bash
npx --yes tsx --test tests/shipping.test.mts
```

When adding or modernizing package scripts for `.mts` tests, prefer `tsx --test` rather than depending on native Node TypeScript stripping on this DEV server.

#### `.env.dev` and worktrees

`.env.dev` is intentionally not tracked by Git, so a newly created worktree does not receive it automatically.

A local DEV worktree may reference the primary DEV environment file with a symlink:

```bash
ln -s /srv/shopnest/dev/.env.dev .env.dev
```

Never commit `.env.dev`, its secret values, API tokens, passwords, or other credentials.

The current DEV environment exposes the PostgreSQL password as:

```text
DEV_DB_PASSWORD
```

The application database resolver, including `drizzle.config.ts`, expects either `DATABASE_URL` or the complete `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, and `DB_PASSWORD` set. Merely sourcing `.env.dev` is therefore not sufficient for host-side Drizzle commands.

#### Docker DB hostname vs host-side DB hostname

Inside `docker-compose.dev.yml`, the web container receives:

```text
DB_HOST=db-dev
DB_PORT=5432
DB_USER=shopnest
DB_NAME=shopnest
DB_PASSWORD=${DEV_DB_PASSWORD}
```

`db-dev` is a Docker-network service hostname and is valid from containers on the Compose network.

The DEV PostgreSQL service publishes `5432:5432`, so commands run directly from the Ubuntu host/worktree should use the host-facing address instead:

```text
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=shopnest
DB_NAME=shopnest
DB_PASSWORD=${DEV_DB_PASSWORD}
```

For a host-side Drizzle command, load `.env.dev` and explicitly map the DB variables without printing their values:

```bash
set -a
. ./.env.dev
set +a

DB_HOST=127.0.0.1 \
DB_PORT=5432 \
DB_USER=shopnest \
DB_NAME=shopnest \
DB_PASSWORD="$DEV_DB_PASSWORD" \
npm run db:generate
```

Do not copy secrets into source files or invent a second environment-file format just to satisfy a CLI command.

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

## 14.1 Management UI consistency

All ShopNest management surfaces, including the ShopNest Control Plane, Merchant Dashboard, and Store Manager screens, must follow `docs/ADMIN_UI_STANDARDS.md`.

Management UI consistency is an engineering requirement, not a page-by-page cosmetic preference.

New management controls must reuse approved shared components and patterns where available. In particular, management selects must use the shared RTL/LTR-safe select control rather than browser-native arrow styling.

When a repeated management pattern requires local CSS in more than one place, prefer extracting or extending a shared component instead of copying styles.

## 15. Documentation Rules

- Project-wide rules belong in this document.
- Feature-specific requirements belong in dedicated design/plan documents.
- Do not duplicate standing rules in every feature plan; reference this document.
- Update documentation when a product decision changes.
- If code and docs disagree, inspect the current implementation and explicitly reconcile the discrepancy rather than silently assuming one is correct.

## 16. Current Reference Documents

Relevant existing documentation includes:

- `docs/TECHNICAL_SPEC.md`
- `docs/ADMIN_UI_STANDARDS.md`
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

## 16. Business Model, Plans, Entitlements, and Upgrade Visibility

ShopNest is a subscription SaaS. The commercial model is based on plans/packages that will be priced over time, with the possibility of paid add-ons that unlock individual capabilities outside a package.

This is a product-wide architectural rule, not only a billing-page concern.

### 16.1 Capabilities are entitlements

Features that can differ by commercial tier must be modeled as server-authoritative entitlements/limits rather than scattered UI conditionals.

Examples include:

- number of Store Managers
- custom domains
- media/image storage quota
- product or catalog limits
- advanced analytics
- payment-provider capabilities
- automation/integration features
- other future premium capabilities

Plan entitlement data should be centralized so the same source of truth can drive authorization, limits, UI messaging, Super Admin configuration, billing, and future add-ons.

### 16.2 Keep premium features visible

When a Store does not currently have access to a premium feature, the default product behavior is **not** to hide that feature completely.

Owners and Managers should normally be able to discover that the capability exists.

The UI should present the feature in an appropriate locked, disabled, read-only, or quota-exhausted state and explain:

- what the feature does
- why it is unavailable for the current Store
- which plan or entitlement enables it
- the relevant limit on the current plan
- the larger limit available on higher plans when applicable
- whether a paid add-on can unlock the capability separately, when such an add-on exists

The purpose is product discovery and transparent upgrade awareness. The UI must not misrepresent availability or allow client-side bypass of an entitlement.

Examples:

- A Store on a free plan may see the custom-domain capability disabled, with a message explaining which plan includes custom domains and, if supported commercially, that the feature can also be purchased as an add-on.
- A Store that has consumed all included Manager seats should see its current usage and limit, such as `2 / 2 Managers`, together with the higher limits available on larger plans and the existence of an unlimited tier where applicable.
- Media storage should show current usage, included quota, and higher storage availability instead of making additional storage capabilities invisible.

### 16.3 Limits must be server-enforced

Upgrade messaging is a UI concern; entitlement enforcement is a server/security concern.

Every plan-gated mutation must re-check the effective entitlement on the server immediately before the protected operation.

Do not rely on:

- disabled buttons
- hidden controls
- browser-supplied plan identifiers
- browser-supplied quota values
- stale client state

Concurrency-sensitive quotas must be enforced transactionally where necessary so concurrent requests cannot exceed a limit.

### 16.4 Limit semantics

For numeric entitlements, use explicit, documented semantics.

For limits that support an unlimited state, ShopNest may use:

- `0` = feature unavailable / zero included units
- positive integer = maximum included units
- `-1` = unlimited

The database should reject other negative values.

For Store Manager limits specifically:

- the Store Owner is not counted as a Manager seat
- each Store Manager assignment consumes one Manager seat for that Store
- the same Manager assigned to two Stores consumes one seat in each Store
- removing an assignment releases that Store's seat

### 16.5 Downgrades must preserve data

A plan downgrade must not silently delete customer data or revoke records merely to satisfy a lower quota.

If current usage is above the new limit:

- preserve existing data/assignments unless an approved feature-specific rule says otherwise
- block creation/addition that would increase usage further
- clearly show that the Store is over its included limit
- provide a path to reduce usage or upgrade

For example, if a Store has three Managers and moves to a plan that includes two, keep the existing three assignments active but prevent adding another Manager until usage is within the limit or the Store upgrades.

### 16.6 Add-ons and effective entitlements

The architecture must leave room for paid add-ons.

A Store's effective entitlement should be resolvable from trusted server-side commercial state, conceptually:

```text
base plan entitlement
    + active purchased add-ons
    + approved promotional/administrative overrides, if supported
    = effective Store entitlement
```

Do not hard-code UI logic that assumes a feature can only come from a particular plan. The same capability may later be granted by a higher plan, a standalone add-on, a promotion, or an administrative override.

### 16.7 Entitlement-aware UI

Reusable UI patterns should be preferred for plan-gated features so ShopNest communicates limits consistently.

Useful states include:

- available
- locked by plan
- quota available
- quota exhausted
- over quota after downgrade
- unlimited
- available through add-on

Upgrade messaging should be informative and specific. It should identify concrete capabilities and limits rather than using vague generic upsell text.

### 16.8 Commercial configuration must not weaken authorization

Plans and add-ons decide whether a capability is commercially available; they do not replace identity, ownership, role, tenant, or Store authorization.

A request must satisfy both:

```text
authorization permission
AND
effective commercial entitlement
```

For example, a Store Owner may have `team.manage` permission but still be prevented from adding a Manager if the Store's effective Manager limit is zero or exhausted. A Store Manager without `team.manage` remains forbidden even if the Store's plan includes Manager seats.


## 14. New feature / major-change conversation handoff

A new ChatGPT conversation must be started before beginning:

- a new feature
- a new architectural subsystem
- a substantial cross-cutting change
- work that requires a new feature/fix branch
- a major continuation that would otherwise depend on a long previous conversation

Before implementation begins, prepare a short continuation prompt for the new conversation.

The continuation prompt must include:

1. The feature/change name and goal.
2. The branch that must be used.
3. The relevant project documents that must be read first.
4. The existing implementation/files/modules that must be inspected before changes.
5. Critical architectural invariants that must be preserved, including tenant isolation, server authority, authorization boundaries, and fail-closed behavior where relevant.
6. Decisions already made that should not be rediscovered or silently changed.
7. The exact point from which development should continue.
8. The instruction to use one terminal command at a time and wait for output before the next command.
9. The instruction not to claim tests, build, migration, or deployment success without fresh command output.
10. The instruction never to merge a PR without explicit user approval.

The prompt should be concise. It is a handoff/index into the repository and project documentation, not a replacement for those documents.

The new conversation must read the referenced documents and inspect the current implementation before proposing or writing code.

If the next feature depends on unfinished work from the current branch, finish or explicitly document that dependency before switching branches.

This handoff step is part of the development workflow, not an optional convenience.

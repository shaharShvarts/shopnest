# ShopNest control plane

The first platform administration area is served at `/shopnest/admin`. It is
separate from tenant administration routes such as `/gift-shop/admin` and has no
tenant request context. Its layout, navigation, pages, queries, and mutations all
use the existing server-side `shopnest_admin_session` authentication boundary.
Only an active `super_admin` is accepted; no tenant assignment is required.

An authenticated super admin who opens `/` is redirected to the control plane.
Anonymous visitors and tenant admins are not redirected to privileged data. The
existing root storefront remains visible to them.

## Data model and migration

Control-plane migration `0004_faithful_wallflower.sql` extends `public.tenants`:

- `plan` uses the `tenant_plan` PostgreSQL enum: `small`, `medium`, or `large`,
  with `small` as the safe default for existing records;
- `featured` is a non-null boolean defaulting to false;
- `featured_rank` is optional, positive when present, and must be null for an
  unfeatured store;
- `support_notes` is optional platform-internal text.

Run the established migration command before deploying this revision:

```bash
npm run control-plane:migrate
```

Create the first platform administrator without a tenant assignment:

```bash
node --env-file=.env scripts/admin-create.mjs admin@example.com --role super_admin
```

The command prompts for the password and clears tenant assignments when an
existing account is promoted to `super_admin`.

The migration is additive and does not move, copy, or rewrite tenant commerce
tables. Plan pricing and enforcement limits are deliberately undefined.

## Routes

- `/shopnest/admin` — platform dashboard and aggregate metrics
- `/shopnest/admin/stores` — registered store list
- `/shopnest/admin/stores/<slug>` — store detail and settings
- `/shopnest/admin/plans` — current plan assignments
- `/shopnest/admin/featured` — ordered featured-store candidates

The store detail action can update status, plan, featured eligibility/rank, and
support notes. It re-authenticates the current session as `super_admin`, validates
the mutation with Zod, resolves the store from `public.tenants`, and verifies that
its slug/schema pair matches the server-side configured tenant registry. It does
not impersonate tenant users or accept schema/role/permission fields from the
browser.

## Metrics and isolation

The dashboard reports registered, active, suspended/disabled stores, total order
count, paid revenue, today's orders, today's paid revenue, and per-store last
order activity. "Today" uses UTC. Deleted orders are excluded; revenue includes
only orders whose tenant-local `payment_status` is `paid`.

Each registered store is matched against the static server allowlist and its
canonical schema before opening the existing schema-scoped Drizzle connection.
Queries never interpolate a request-provided identifier and never fall back to
`public`. Results remain attached to the store whose validated connection
produced them.

Aggregation is intentionally partial on failure: the page names stores whose
schema could not be trusted or whose query failed, marks totals as partial, and
continues showing independently verified stores. It never converts a failed
tenant into zero or attributes another tenant's result to it.

## Deferred work

Subscription billing, plan limits/pricing, public-homepage rendering, payment
provider operations, onboarding, policy editing, impersonation, audit logs,
alerts, and richer analytics are outside this foundation. Featured metadata is
stored but the public homepage is unchanged. Support notes must not contain
credentials or payment secrets.

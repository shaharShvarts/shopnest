# ShopNest Dynamic Trusted Tenant Registry Resolution Design

Date: 2026-09-21
Status: Proposed scope for the roadmap Dynamic Trusted Tenant Registry step
Repository: shaharShvarts/shopnest
Target branch: feature/dynamic-trusted-tenant-registry
Base: master after merged PR #42 copy-only follow-up
Base commit: 79db2f35a5bdec16b4240baea2f80f3909c7e8b1

## 1. Purpose

Replace runtime dependence on the source-code static tenant allowlist with trusted server-side resolution from the control-plane `public.tenants` registry.

This step is the roadmap item originally described as PR #42. GitHub PR numbering moved because a small copy-only PR used #42, so the implementation PR will use the next available GitHub number.

This PR does not provision tenants, create schemas, activate Stores, or add domains.

## 2. Trusted resolution flow

Runtime tenant routing becomes:

request path
-> parse first path segment
-> validate canonical tenant-slug syntax
-> server-side lookup in `public.tenants`
-> require tenant status = `active`
-> validate trusted stored schema name
-> construct canonical tenant context
-> set trusted internal request headers
-> schema-scoped tenant DB access

The request slug identifies a lookup key only. It never becomes a schema name.

## 3. Runtime boundary

ShopNest is pinned to Next.js 15.5.x. Node.js Middleware runtime is stable in Next.js 15.5 and is required here because trusted tenant resolution uses the PostgreSQL control-plane connection.

`src/middleware.ts` therefore runs with `runtime: "nodejs"`.

The middleware must overwrite/remove tenant context headers supplied by the client. Browser headers remain untrusted.

## 4. Registry authority

The only runtime source of tenant routing authority in this PR is `public.tenants`.

A registry row is routable only when:
- slug is canonical and valid
- status is `active`
- schema_name is a bounded safe PostgreSQL identifier
- schema_name is not a reserved/system schema

Store lifecycle state is not a schema selector in this PR.

## 5. Cache

Resolution uses a short process-local TTL cache to avoid a control-plane query on every request.

Requirements:
- cache key is the normalized slug
- positive and negative results may be cached
- cache lifetime is intentionally short
- repository errors are not converted into cached not-found results
- DB failure fails closed
- no stale-cache fallback is used after lookup failure

Initial TTL: 5 seconds.

This bounds propagation delay for active/suspended/disabled state changes while avoiding unnecessary DB load.

## 6. Tenant context validation

Server-side `getTenant()` must re-resolve the tenant slug through the trusted registry and verify that the middleware schema header exactly matches the trusted registry schema.

Client-side navigation helpers must not depend on a static tenant list. They only scope navigation under the already trusted server-provided tenant base path.

Cross-tenant authorization remains server-side. Client navigation helpers are not an authorization boundary.

## 7. Tenant database access

`getDbForTenant()` must stop using `resolveConfiguredTenant()`.

Tenant DB access is allowed only for a tenant context produced by the trusted registry boundary. Runtime checks reject untrusted plain tenant objects.

Schema names continue to be used only after strict server-side validation.

## 8. Control-plane DB dependency

The control-plane DB constructor is split from the tenant DB module so middleware tenant-registry resolution does not create a circular dependency through `getTenant()`.

Existing imports of `getControlPlaneDb()` from `src/drizzle/db.ts` remain compatible through re-export.

## 9. Out of scope

This PR must not:
- create a Tenant row
- create a PostgreSQL schema
- call the tenant provisioner
- change Store lifecycle state
- add an Activate button
- implement activation orchestration
- add custom domains
- derive tenant identity from Host headers
- call Cloudflare
- change billing/subscription behavior
- introduce a control-plane migration

The next activation-orchestration step owns creation/finalization of new tenant registry rows and Store-to-Tenant binding.

## 10. Security invariants

- browser input never selects a schema
- Host headers never select a schema
- unknown tenant -> 404
- inactive tenant -> 404
- malformed registry row -> fail closed
- DB lookup failure -> fail closed
- spoofed tenant/schema request headers are overwritten or removed
- tenant DB access rejects untrusted tenant objects
- all registry values are queried with Drizzle/parameterized values
- dynamic SQL identifiers are not constructed from browser input

## 11. Testing

Required automated coverage:
- canonical active registry row resolves
- inactive tenant does not resolve
- unsafe schema mapping is rejected
- malformed/noncanonical slug is rejected
- positive/negative cache behavior and expiry
- lookup errors fail closed and are not cached as not-found
- middleware uses Node.js runtime and trusted registry resolver
- spoofed headers are replaced
- tenant context revalidates slug/schema against the registry
- client tenant navigation no longer depends on the static configured tenant list
- tenant DB access rejects untrusted tenant objects
- existing platform/global routes remain tenant-independent
- production build passes

DEV acceptance:
- existing global merchant/admin routes still work
- unknown Store slug returns 404
- an active trusted `public.tenants` row routes successfully when its schema exists
- suspended/disabled tenant route fails closed
- tenant admin/storefront isolation remains intact

STAGING acceptance is required before merge because this changes routing and DB trust boundaries.

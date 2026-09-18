# ShopNest route and navigation acceptance audit

## Root cause and correction

The public `/` page previously lived in the customer route group and inherited
the cart, account, catalog, search, and footer navigation. The root layout supplied
an empty tenant context for tenantless requests; `TenantLink` then emitted bare
storefront URLs. `LEGACY_ROUTE_SEGMENTS` admitted several of those URLs, so the
storefront shell could render before a child page rejected the missing tenant.
Rewriting tenant pages onto the same tenantless page tree also made layout/context
reuse during client navigation an unnecessary risk.

Storefront pages now live physically in `src/app/[tenant]/(storefront)`. The new
`src/app/page.tsx` is a public platform homepage, without storefront navigation or
database access. The root layout no longer owns tenant state. The `[tenant]`
layout validates route params against server-authoritative request context and
provides a tenant-keyed context to storefront and tenant-admin pages. Page URLs
stay prefixed; only tenant API and media handlers retain internal rewrites.

`TenantProvider` and tenant path construction reject missing/invalid context.
String, object, and `as` URLs in `TenantLink` are scoped; cross-tenant destinations,
external URLs, and encoded separator escapes are rejected. Explicit platform
links use Next.js `Link`, not `TenantLink`. Request-scoped `getDb()` now rejects
missing tenant context before creating any database client; the separate lazy
control-plane getter is unchanged.

## Complete application route inventory

`<tenant>` means a configured slug such as `panda-pop`. Schema names are derived
server-side, never taken from browser navigation, query fields, or form fields.
Unknown tenant slugs return 404. Missing tenant tables never fall back to public.
Storefront pages require an active control-plane tenant: unavailable stores return
403, while infrastructure/missing-schema errors fail instead of serving public
data. Listed 200 responses assume the corresponding tenant/data is provisioned.
Page redirects normally use 307; server-action redirects use 303. Unsupported
handler methods return 405. Authentication below refers to the page/handler, not
permission to perform every mutation reachable from it.

| Route pattern | Scope | Authentication requirement | Expected HTTP behavior |
| --- | --- | --- | --- |
| `/` | Platform | None | 200 public marketing page; no cart/catalog/account shell or tenant DB access |
| `/features` | Platform | None | 200 public ShopNest feature overview |
| `/pricing` | Platform | None | 200 public plan overview; no billing implementation |
| `/examples` | Platform | None | 200 public sample-store directory |
| `/faq` | Platform | None | 200 public merchant acquisition FAQ |
| `/login` | Platform | None | 200 merchant sign-in; authenticated merchants redirect to `/dashboard` |
| `/signup` | Platform | None | 200 merchant registration; successful signup creates only a merchant account/session and redirects to `/dashboard` |
| `/forgot-password` | Platform | None | 200 merchant password-reset request; submission is non-enumerating |
| `/reset-password` | Platform | Valid one-use reset token required to change password | 200 reset form or invalid-link state; successful reset invalidates merchant sessions |
| `/dashboard` | Platform | Active merchant session | 200 merchant workspace; anonymous/expired/disabled sessions redirect to `/login` |
| `/admin` | Platform | Active super admin | 200; anonymous redirects to `/admin/login`; wrong role 403 |
| `/admin/login` | Platform | None | 200 global sign-in; successful super-admin action redirects to `/admin` |
| `/admin/stores` | Platform | Active super admin | 200 registry; anonymous redirect / wrong role 403 |
| `/admin/stores/[slug]` | Platform | Active super admin | 200 trusted store detail; unknown store 404; anonymous redirect / wrong role 403 |
| `/admin/plans` | Platform | Active super admin | 200; anonymous redirect / wrong role 403 |
| `/admin/featured` | Platform | Active super admin | 200; anonymous redirect / wrong role 403 |
| `/<tenant>` | Tenant storefront | None | 200 active store homepage |
| `/<tenant>/categories` | Tenant storefront | None | 200 active catalog |
| `/<tenant>/categories/[id]/products` | Tenant storefront | None | 200 category products; invalid/inaccessible category 404 |
| `/<tenant>/categories/[id]/subcategories/[subcategoryId]` | Tenant storefront | None | 200 matching subcategory; invalid, unrelated, or inaccessible entity 404 |
| `/<tenant>/products/[id]/details` | Tenant storefront | None | 200 visible product; invalid/inaccessible product 404 |
| `/<tenant>/carts` | Tenant storefront | Guest or customer cart identity | 200 current owner's cart/empty state; no other owner's cart |
| `/<tenant>/checkout` | Tenant storefront | Guest or customer commerce identity | 200 checkout; server action validates identity, inventory, shipping and payment configuration |
| `/<tenant>/checkout/payment/[id]` | Tenant storefront | Matching payment owner | 200 read-only payment status; invalid ID, absent attempt, or wrong owner 404; query parameters cannot mark paid |
| `/<tenant>/account` | Tenant storefront | Customer session | 200 account; anonymous redirects to same-tenant account login |
| `/<tenant>/account/login` | Tenant storefront | None | 200 sign-in; signed-in customer redirects to same-tenant account |
| `/<tenant>/account/register` | Tenant storefront | None | 200 registration; signed-in customer redirects to same-tenant account |
| `/<tenant>/account/orders` | Tenant storefront | Customer session | 200 customer's tenant orders; anonymous same-tenant login redirect |
| `/<tenant>/account/orders/[id]` | Tenant storefront | Customer owning the order | 200 owned tenant order; invalid/not-owned order 404; anonymous same-tenant login redirect |
| `/<tenant>/forgot-password` | Tenant storefront | None | 200 request form; submission remains non-enumerating |
| `/<tenant>/reset-password` | Tenant storefront | No session; valid reset token required to reset | 200 form or invalid-link state; invalid/expired token cannot change a password |
| `/<tenant>/search` | Tenant storefront | None | 200 search/results/validation state; query remains within current tenant |
| `/<tenant>/shipping` | Tenant storefront | None to view | 200 shipping page; submitted changes use server-validated cart context |
| `/<tenant>/privacy-policy` | Tenant storefront | None | 200 tenant privacy page |
| `/<tenant>/admin` | Tenant admin | Assigned tenant admin or allowed super admin | 200 dashboard; anonymous same-tenant admin-login redirect; unauthorized 403; unknown tenant 404 |
| `/<tenant>/admin/login` | Tenant admin | None | 200 sign-in for a registered tenant; absent registry entry 404; sign-in authorization remains enforced |
| `/<tenant>/admin/categories` | Tenant admin | Assigned tenant admin or allowed super admin | 200 authorized listing; otherwise redirect/403/404 as above |
| `/<tenant>/admin/categories/new` | Tenant admin | Assigned tenant admin or allowed super admin | 200 form; server action validates authorization and input |
| `/<tenant>/admin/categories/[id]/edit` | Tenant admin | Assigned tenant admin or allowed super admin | 200 authorized tenant entity; invalid/missing entity 404 |
| `/<tenant>/admin/subcategories` | Tenant admin | Assigned tenant admin or allowed super admin | 200 authorized listing; otherwise redirect/403/404 |
| `/<tenant>/admin/subcategories/new` | Tenant admin | Assigned tenant admin or allowed super admin | 200 form; server action validates authorization and input |
| `/<tenant>/admin/subcategories/[id]/edit` | Tenant admin | Assigned tenant admin or allowed super admin | 200 authorized tenant entity; invalid/missing entity 404 |
| `/<tenant>/admin/products` | Tenant admin | Assigned tenant admin or allowed super admin | 200 authorized listing; otherwise redirect/403/404 |
| `/<tenant>/admin/products/new` | Tenant admin | Assigned tenant admin or allowed super admin | 200 form; server action validates authorization and input |
| `/<tenant>/admin/products/[id]/edit` | Tenant admin | Assigned tenant admin or allowed super admin | 200 authorized tenant entity; invalid/missing entity 404 |
| `/<tenant>/admin/orders` | Tenant admin | Assigned tenant admin or allowed super admin | 200 tenant orders; otherwise redirect/403/404 |
| `/<tenant>/admin/orders/[id]` | Tenant admin | Assigned tenant admin or allowed super admin | 200 tenant order; invalid/missing order 404; fulfillment action reauthorizes |
| `/<tenant>/admin/payments` | Tenant admin | Assigned tenant admin or allowed super admin | 200 tenant settings; every mutation/test reauthorizes; live payments remain fail-closed |
| `/<tenant>/admin/shipping` | Tenant admin | Assigned tenant admin or allowed super admin | 200 tenant shipping settings; otherwise redirect/403/404 |
| `/<tenant>/admin/shipping/new` | Tenant admin | Assigned tenant admin or allowed super admin | 200 form; action reauthorizes and validates |
| `/<tenant>/admin/shipping/[id]/edit` | Tenant admin | Assigned tenant admin or allowed super admin | 200 tenant method; invalid/missing method 404 |
| `/<tenant>/account/google/start` (GET) | API | Active tenant; no customer session required | Redirect to Google; unavailable/failed configuration redirects to same-tenant login; unknown tenant 404 / inactive 403 |
| `/<tenant>/api/cart/add` (POST) | API | Guest/session or customer identity | 200 cart mutation; invalid input/identity 400, missing product 404, stock conflict 409, unexpected error 500 |
| `/<tenant>/api/reservations` (GET) | API | Session cookie | 200 availability; invalid input 400, absent session 401, absent product 404; POST 405 |
| `/<tenant>/api/subcategories` (GET) | API | Authorized tenant admin | 200 tenant results; invalid category ID 400, absent category 404, unauthorized 401/403/404 |
| `/<tenant>/api/payments/[id]/callback` (POST) | API | Provider verification and tenant-bound payment attempt; no browser login | Verified result 200; invalid callback 400/413, absent payment 404, unsupported provider 501, unverifiable/unavailable 503; never trusts browser success flags |
| `/<tenant>/media/[kind]/[filename]` (GET) | API | Known tenant; no login | 200 typed tenant file; invalid kind/name or missing file 404; no arbitrary schema/path selection |
| `/api/customer-auth/google/callback` (GET) | API (global) | One-use OAuth state and browser binding | Redirect to state-bound tenant callback/login; invalid state redirects to platform `/`; forged tenant headers are discarded |
| `/api/iCount/payment` (POST) | API (global, retired) | None | 410; never invokes a payment provider |

Framework `/_next/*`, favicon and root public assets are not application pages.
Root commerce aliases (`/categories`, `/carts`, `/checkout`, `/products`, `/account`,
`/search`, `/shipping`, `/privacy-policy`, password routes and nested variants)
return 404 before a storefront shell renders. Root commerce APIs and root media
also return 404. `/shopnest/admin/*` remains absent. The nonexistent tenant
`/admin/users` navigation item was removed. Tenant-prefixed global OAuth callback
and retired-payment aliases are rejected; use their canonical global URLs.

## Navigation audit

| Surface | Result |
| --- | --- |
| Platform homepage and super-admin navigation | Plain `Link`/explicit global redirects; no tenant provider or prefix helper. Store detail's explicit tenant-admin link uses the trusted store slug. |
| Customer header, footer, cart, checkout, account/password links | `TenantLink` within the physical tenant layout; no empty tenant fallback. |
| Category, product, subcategory cards and breadcrumbs | All local destinations pass through `TenantLink`; media resolves against the current tenant. |
| Search forms | Server-generated `tenantPath('/search')`; physical route retains query string through GET and client navigation. |
| Router push/replace | Category form and product return navigation use `tenant.path`; language selection only refreshes the current URL. No bare storefront push/replace found. |
| Tenant admin navigation and form redirects | `TenantLink`/`NavLink`, `tenantPath`, or authorized tenant base path. Removed dead Customers destination. |
| Server actions | Stay on physical tenant routes; authorization/identity checks are preserved. Request DB access cannot silently select public. Global admin mutations retain explicit `/admin` redirects. |
| Customer authentication callbacks | Existing callback validator rejects other tenants, external origins, and admin paths; successful login/register/reset destinations retain the authoritative tenant prefix. |
| Google OAuth | Global callback uses validated, stored one-use state for tenant selection; it does not take tenant/schema from browser headers. |
| Payment return/provider callbacks | Existing server-built URLs use tenant base paths. Return page is read-only and owner-checked; callback verification and payment fail-closed behavior are unchanged. |
| Media | Existing tenant URL validator rejects other tenants and traversal; nested dotted URLs now pass middleware. Only actual root static assets bypass application routing. |
| Middleware headers | Every application request gets a new internal-path header; tenant/schema headers are overwritten for valid tenant paths and removed for global paths. |

## Regression tests and validation

`npm run routing:test` executes the tenant resolver and actual middleware,
TenantLink, TenantProvider, tenant layout, and public page with controlled
dependencies. Cases cover every listed storefront/admin destination, query/hash
retention, repeated navigation, object/`as` URLs, unknown tenants, cross-tenant
destinations, forged schema/slug/internal-path headers, dotted paths, and global
control-plane links. Database initialization tests also prove missing request
tenant context fails before any client/pool is created. Existing storefront,
admin, customer-auth, inventory, shipping and payment tests follow the moved files.

Local validation: secret-free production build, TypeScript, ESLint, route and
navigation regression tests, storefront/admin/customer-auth suites, tenant
provisioning unit tests, payment tests, and `git diff --check`. The standalone
PostgreSQL integration test (`tests/payment-db.test.mjs`) needs a disposable test
database and cannot run here without DB settings. Do not aim it at accepted STAGING.
The local production-server HTTP smoke checks verify `/` and `/admin/login` are
200, all tested root storefront aliases/unknown tenants are 404, and forged tenant
headers cannot make those aliases act as tenant routes. No database was needed for
these checks. Tenant data/browser acceptance must be repeated on STAGING.

## STAGING acceptance after deploying this branch

Use the existing deployment runbook; keep canonical Compose resources and secrets
unchanged. After rebuilding/recreating the web container, verify on the public host:

1. Open `/` in a fresh browser tab: platform content, no catalog/cart/account shell.
2. `/categories`, `/carts`, `/checkout`, `/account`, `/shipping`, and `/search` must
   return 404 without a storefront shell. `/admin/login` stays global.
3. Open `/panda-pop`, then use header, footer, cards and breadcrumbs through every
   listed storefront page. Repeat with client-side navigation and browser back;
   every address retains `/panda-pop` and search query parameters persist.
4. Sign in as a tenant customer; test account links, owned orders, logout and
   password links. Repeat with a second tenant and confirm no cart/order/media data
   from the first is visible. Unknown tenant URLs must return 404.
5. Verify anonymous tenant-admin redirect, authorized tenant-admin CRUD navigation,
   and super-admin `/admin/*` navigation. No `/shopnest/admin` or `/admin/users` link.
6. Verify existing tenant media, read-only payment return status, and disabled or
   sandbox-only provider behavior. Do not enable production Cardcom.

Docker, nginx, DEV/STAGING ports, environment files and secret variable names are
unchanged by this routing fix. No server data, containers, or volumes are modified
by the code audit itself.

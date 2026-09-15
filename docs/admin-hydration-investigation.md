# Tenant admin hydration and dead Users route investigation

Base: master `169c5eef31f2ac27c5c926b9883ca8c1ff746c0a` (includes merged PR #26).
Branch: `fix/admin-hydration-and-dead-users-route`.

## Confirmed dead-route cause

Before PR #26, `src/app/[tenant]/admin/layout.tsx` rendered
`<NavLink href="/admin/users">Customers</NavLink>`. `NavLink` delegates to
`TenantLink`, which correctly adds the current tenant prefix. There was no
`src/app/[tenant]/admin/users/page.tsx`. The link therefore exposed a nonexistent
destination such as `/panda-pop/admin/users`; Next Link prefetch can request its
RSC payload with an `_rsc` query parameter and receive 404. The query parameter
does not create a route. This was an application navigation defect.

Commit `257f64be4959c0bfb84da1c0efa75aebd6a60eaa`, merged through PR #26,
already removed this exact link. A full application-source search on the base
finds no `/admin/users` references. The remaining repository references are the
historical explanations in `docs/route-audit.md`. There is no intentional Users
route to implement. The new regression checks every rendered admin navigation
destination against physical pages and scans application source for reintroduction.

## Hydration result and remaining evidence

The reported production #418 has **not been reproduced** on current master.
Its exact mismatch root cause is **not established**. The dead-link 404 alone
does not establish a hydration mismatch, and this change does not claim otherwise.

The added test server-renders and hydrates the real root layout, tenant layout,
admin layout, dashboard, TenantProvider, NavLink, TenantLink, LanguageSelector,
Radix controls, and toast provider with React DOM and jsdom. It checks both
configured tenants, both supported locales, and dashboard/product pathnames.
All eight combinations hydrate with no recoverable errors or console errors;
rendered navigation retains the same tenant prefix and targets existing pages.
The language selector's cookie read occurs in an effect, after initial hydration.
The root layout alone owns html/body, and tenant page routes are not rewritten
to tenantless pages under PR #26.

Test boundaries substitute authentication, request headers, router pathname,
server translations, and build-generated font/CSS handling. The Next Intl client
provider receives explicit locale/timeZone as it does across its server boundary.
This is a component hydration regression, not a deployed Next RSC/browser session
or a database-backed products-page test. It does not prove that the reported
STAGING failure is fixed. No speculative production change was made.

To finish the #418 investigation, obtain the exact failing URL, its browser
hydration diagnostic/component stack, and a reproducible authenticated session
or failing server/client markup. The STAGING URL and trace were requested during
this investigation. Keep the PR draft until this evidence identifies the cause.

## Validation

- `npm run build`: passed without database/payment credentials.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/eslint/bin/eslint.js src tests scripts next.config.ts`:
  passed; one existing anonymous-default-export warning in `next.config.ts`.
- Admin auth, admin UI/hydration, control plane, tenant resolver/navigation,
  tenant provisioning, customer auth, Google auth: 133 tests passed.
- Payment suite with `--conditions=react-server`: 107 tests passed.
- `git diff --check`: passed.

`npm run admin-ui:test` now includes the hydration/navigation regression.
The standalone PostgreSQL payment integration test requires a disposable database
and was not run. No application routing, authentication, tenant isolation, payment
logic, deployment configuration, or PR #25 content was changed.

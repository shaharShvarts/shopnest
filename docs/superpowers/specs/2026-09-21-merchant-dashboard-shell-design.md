# ShopNest Merchant Dashboard Shell Design

Date: 2026-09-21
Status: Proposed scope for PR #38
Repository: shaharShvarts/shopnest
Target branch: feature/merchant-dashboard-shell

## 1. Purpose

PR #38 adds a consistent authenticated merchant workspace shell around the global `/dashboard` route family.

PR #37 already delivered the Store onboarding UI, so PR #38 is intentionally narrower than the original roadmap placeholder. It must not duplicate Store CRUD or begin provisioning work.

The goal is to make the merchant workspace feel like one product surface while preserving the existing control-plane authorization boundaries.

## 2. Current state

The merchant routes already exist:

- `/dashboard`
- `/dashboard/business`
- `/dashboard/business/new`
- `/dashboard/business/edit`
- `/dashboard/stores`
- `/dashboard/stores/new`
- `/dashboard/stores/[id]`
- `/dashboard/stores/[id]/edit`

Each page currently renders its own page-level framing. There is no shared merchant dashboard layout/navigation.

## 3. In scope

PR #38 includes:

- shared authenticated `/dashboard` layout
- ShopNest merchant-workspace branding
- responsive merchant navigation
- navigation destinations:
  - Overview → `/dashboard`
  - Business → `/dashboard/business`
  - Stores → `/dashboard/stores`
- active-navigation indication
- merchant identity summary in the shell
- logout available from the shared shell
- RTL/LTR-safe responsive behavior
- consistent dashboard content width/spacing
- dashboard overview cleanup so shell-level UI is not duplicated
- accessibility basics for navigation and interactive controls
- translations for new shell labels
- route/regression tests
- DEV and STAGING acceptance

## 4. Explicitly out of scope

PR #38 does not add or change:

- Store persistence or Store lifecycle rules
- Store provisioning
- Tenant creation
- PostgreSQL schema creation
- dynamic tenant registry
- Store activation
- plans or subscriptions
- readiness checklist/state machine
- billing
- custom domains
- Cloudflare automation
- tenant-admin migration into `/dashboard`
- customer authentication
- payment/Cardcom behavior
- production rollout

No database migration is expected.

## 5. Authorization and trust boundaries

The shell is global/control-plane UI.

Requirements:

- `/dashboard/*` remains protected by verified merchant session.
- The layout may protect the route family, but individual data pages and server actions continue to authorize their own operations.
- Merchant id, Organization id, Store id, Tenant id, role, or schema from browser input must never become authorization proof.
- The shell must not access tenant schemas.
- No tenant selector or schema selector is introduced.
- Existing Organization/Store repository authorization remains unchanged.

## 6. Layout behavior

Create a shared dashboard layout under the merchant route group.

Desktop intent:

- persistent workspace header/side navigation
- ShopNest brand
- Overview / Business / Stores
- merchant display name and email
- logout action
- content area for the child route

Mobile intent:

- compact responsive navigation
- all current destinations remain directly reachable
- no hover-only controls
- no layout overflow in Hebrew/RTL

The shell should use existing design tokens and avoid introducing a second visual system.

## 7. Route behavior

The existing URLs remain unchanged.

- `/dashboard` renders the overview inside the shell.
- `/dashboard/business` keeps existing Organization behavior.
- `/dashboard/business/new` remains available when no Organization exists.
- `/dashboard/business/edit` keeps owner authorization.
- `/dashboard/stores` still redirects merchants without an Organization to `/dashboard/business/new`.
- Store detail/edit/create behavior remains unchanged.

The navigation may link to Business and Stores even when onboarding is incomplete; existing server-side redirects remain the authority.

## 8. Dashboard overview

The overview remains a summary surface, not a second management UI.

It may show:

- greeting
- merchant account summary
- Organization summary / Create Business CTA
- Store summary / Create or Manage Stores CTA

PR #38 should remove UI that is now duplicated by the shared shell, especially duplicate ShopNest framing and the standalone logout card.

## 9. Accessibility

Required:

- semantic `nav`
- keyboard-accessible links/actions
- visible focus behavior through existing styles
- active route conveyed in more than color alone
- minimum touch-target sizing consistent with existing UI
- logical DOM order in RTL and LTR

## 10. Tests

Add focused regression coverage proving:

- a shared dashboard layout exists
- layout requires merchant authentication
- shell contains Overview / Business / Stores navigation
- shell does not import tenant DB/context helpers
- logout is available from the shell
- dashboard page no longer owns standalone shell/logout framing
- existing Store and Organization routes remain global/control-plane routes
- English/Hebrew shell translation keys stay aligned

Existing merchant auth, Organization, Store, routing, tenant, payment, and security suites must remain green.

## 11. DEV acceptance

Verify on `dev.shopnest.co.il`:

1. anonymous `/dashboard` redirects to merchant login;
2. authenticated merchant sees the shared shell;
3. Overview / Business / Stores navigation works;
4. no-Organization flow still routes correctly;
5. Organization view/edit works;
6. Store list/create/view/edit/delete/Undo still works;
7. logout works from a nested dashboard route;
8. Hebrew RTL and desktop/mobile layout are usable;
9. no tenant Store becomes routable as a side effect.

## 12. STAGING acceptance

Repeat the shell/navigation/auth smoke flow on STAGING without touching volumes or enabling provisioning.

## 13. Acceptance criteria

Before READY TO MERGE:

- branch starts from current master after PR #37
- Draft PR exists
- no database migration
- no provisioning/tenant/schema creation
- no dynamic tenant routing
- focused dashboard-shell tests pass
- relevant merchant regression suites pass
- full GitHub Actions pass
- production build passes
- DEV acceptance passes
- STAGING acceptance passes
- final diff contains only dashboard-shell/refactor/test/docs changes
- explicit user approval before merge

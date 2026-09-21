# PR #38 Merchant Dashboard Shell Implementation Plan

Date: 2026-09-21
Branch: feature/merchant-dashboard-shell
Base: master

## Task 1 — Add RED shell contract tests

Add focused tests for:

- `src/app/(merchant)/dashboard/layout.tsx`
- merchant session protection
- Overview / Business / Stores links
- logout presence
- no tenant DB/context imports
- bilingual shell labels
- dashboard page no longer renders its own standalone logout section

Run focused tests and confirm RED before implementation.

## Task 2 — Add shared dashboard shell

Create:

- `src/app/(merchant)/dashboard/layout.tsx`
- a small reusable dashboard navigation component only if active-route UI requires client pathname state

Rules:

- authenticate using the existing merchant-auth server boundary
- preserve page/action-level authorization
- do not query tenant schemas
- use existing design tokens
- make desktop/mobile and RTL/LTR behavior intentional

## Task 3 — Move shared identity/logout UI into the shell

The shell should render:

- ShopNest workspace identity
- merchant display name/email
- logout action

Reuse the existing logout server action unless a minimal relocation is required for clean imports.

Do not change logout/session semantics.

## Task 4 — Simplify dashboard overview

Refactor `src/app/(merchant)/dashboard/page.tsx` to keep only overview content:

- greeting
- account summary
- Organization summary/onboarding CTA
- Store summary/onboarding CTA

Remove shell-level duplication now supplied by the layout.

Do not change Organization/Store repository behavior.

## Task 5 — Preserve nested merchant pages

Verify the existing business and Store pages render correctly inside the shell.

Only remove duplicated outer framing where needed for visual consistency. Do not alter their domain actions or authorization.

## Task 6 — Translations and accessibility

Add aligned English/Hebrew keys for:

- overview
- business
- stores
- merchant workspace/navigation labels as needed

Check semantic navigation, keyboard use, active-route indication and touch targets.

## Task 7 — Route audit and regression

Update `docs/route-audit.md` to state that `/dashboard/*` uses the shared authenticated merchant shell.

Run focused suites:

- merchant auth
- merchant Organization
- merchant Store
- routing/navigation

Then run full CI-equivalent test suite and `npm run build`.

## Task 8 — DEV acceptance

Deploy the PR branch to DEV without resetting volumes.

Verify:

- auth redirect
- shell on all dashboard pages
- Overview / Business / Stores navigation
- Organization flows
- Store CRUD/delete/Undo regression
- logout from nested route
- Hebrew RTL
- responsive behavior

## Task 9 — STAGING acceptance

Deploy the same reviewed branch to STAGING without resetting volumes and repeat the smoke flow.

## Task 10 — READY TO MERGE review

Final review must confirm:

- no migration
- no Tenant/schema provisioning
- no dynamic registry work
- no billing/readiness implementation
- no payment changes
- no tenant-isolation regression
- GitHub Actions success
- DEV/STAGING acceptance complete

Stop for explicit user approval before merge.

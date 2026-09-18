# Merchant Identity & Authentication Foundation Design

**Date:** 2026-09-18  
**Target PR:** #35  
**Branch:** `feature/merchant-auth-foundation`

## Goal

Introduce a third, independent ShopNest identity domain for merchants. PR #35 provides real merchant signup, login, logout, session handling, password recovery, and a protected global dashboard without creating organizations, stores, tenants, subscriptions, or provisioning resources.

The merchant identity layer lives in the global control plane and is intentionally separate from both customer authentication and platform/tenant administration.

## Approved Product Decisions

- Signup supports **email + password + display name + phone number**.
- Signup automatically authenticates the merchant and redirects to `/dashboard`.
- Email verification is **not required for login** in PR #35. `email_verified_at` remains nullable for future sensitive-action policies.
- Phone is required by the signup UI, normalized server-side to **E.164**, and is **not unique**.
- Email is unique only within `merchant_accounts`. The same email may independently exist in `customer_accounts`.
- Password minimum length is **12 characters**. No artificial uppercase/number/symbol composition rules.
- Merchant sessions last **24 hours**. No Remember Me in PR #35.
- Forgot Password / Reset Password are included.
- Password reset links use a delivery abstraction. DEV/STAGING use capture behavior; no production mail provider is introduced.
- The initial dashboard is deliberately minimal: display name, email, phone, account status, logout, and a message that store setup follows later.

## Architecture

### Identity Domains

ShopNest will have three separate authentication domains:

1. **Customer identity**
   - `customer_accounts`
   - storefront shopping/account ownership
   - existing `shopnest_customer_session`

2. **Merchant identity**
   - new `merchant_accounts`
   - global merchant workspace
   - new `shopnest_merchant_session`

3. **Administrative identity**
   - `admin_users`
   - super-admin and tenant-admin authorization
   - existing `shopnest_admin_session`

No session or principal from one domain authorizes another domain.

### Why a Separate Merchant Domain

Merchant identity is not the same security role as a storefront customer or a platform/tenant administrator. Reusing either existing table would couple onboarding and business ownership to unrelated authorization semantics.

The merchant domain therefore follows the proven account/session patterns already used in ShopNest while keeping its own tables, cookies, repositories, and authorization boundary.

## Control-Plane Data Model

### `merchant_accounts`

Proposed fields:

- `id` — primary key
- `email`
- `email_normalized` — required, unique
- `password_hash` — required for PR #35
- `display_name` — required
- `phone_e164` — nullable at the schema level, required by the public signup flow
- `email_verified_at` — nullable
- `status` — `active | disabled`
- `created_at`
- `updated_at`

The schema keeps `phone_e164` nullable so future trusted account-creation paths, imports, or OAuth flows are not forced to invent a phone number. The PR #35 signup service still requires one.

### `merchant_sessions`

- UUID primary key
- `token_hash` — unique SHA-256 hash; raw token never stored
- `merchant_id` — FK to `merchant_accounts`, cascade delete
- `expires_at`
- `created_at`
- index on `expires_at`

TTL: 24 hours.

### `merchant_password_resets`

- UUID primary key
- `merchant_id` — FK
- `token_hash` — unique
- `expires_at`
- `consumed_at` — nullable
- `created_at`

Reset token TTL: 30 minutes.

A successful password reset invalidates all existing merchant sessions.

## Authentication Core

Create a dedicated `src/lib/merchant-auth/` module family.

Recommended responsibilities:

- `core.ts`
  - normalize email
  - validate password length
  - normalize/validate phone
  - register merchant
  - authenticate merchant
  - create/resolve/logout session
  - issue/consume password-reset tokens

- `password.mjs`
  - reuse the same secure password hashing strategy already used by customer auth, without sharing account tables

- `drizzle-repository.ts`
  - control-plane persistence only
  - Drizzle/query-builder access
  - no dynamic SQL or browser-derived identifiers

- `server.ts`
  - cookie access
  - current merchant resolution
  - require-merchant page helper
  - server-only repository instance

- password reset delivery abstraction
  - generic interface in the merchant-auth layer
  - DEV/STAGING capture implementation
  - no production mail provider in this PR

## Signup Flow

Route: `/signup`

Inputs:

- display name
- email
- phone number
- password

Server-side flow:

1. Normalize email using NFKC + trim + lowercase.
2. Validate password length >= 12.
3. Normalize phone to E.164.
4. Reject invalid email/phone/password with field-safe validation errors.
5. Check normalized merchant email uniqueness.
6. Hash password.
7. Create merchant account.
8. Create 24-hour merchant session.
9. Set merchant session cookie.
10. Redirect to `/dashboard`.

Signup does **not** create:

- organization
- store draft
- tenant
- schema
- subscription
- plan entitlement
- domain mapping
- tenant-admin assignment

## Login Flow

Route: `/login`

Inputs:

- email
- password

Behavior:

1. Normalize email server-side.
2. Lookup merchant only in `merchant_accounts`.
3. Require `status = active`.
4. Verify password.
5. Return a generic invalid-credentials response for all authentication failures.
6. Create a fresh 24-hour session.
7. Set merchant cookie.
8. Redirect to `/dashboard`.

No customer or admin session is consulted to authenticate a merchant.

## Logout Flow

Logout:

- hashes the presented merchant cookie token
- removes the server-side merchant session
- clears the merchant cookie
- redirects to a public route

Logout must not modify customer/admin sessions.

## Merchant Session Cookie

Proposed cookie name:

`shopnest_merchant_session`

Attributes:

- `HttpOnly`
- `SameSite=Lax`
- `Secure` when HTTPS is in use
- path `/`
- expiration aligned with the 24-hour server-side session

Only the token hash is stored in PostgreSQL.

## Password Recovery

### Forgot Password

Route: `/forgot-password`

Behavior:

- accepts email
- always returns the same accepted response regardless of account existence
- generates a cryptographically strong random token
- stores only the token hash
- token expires after 30 minutes
- sends via the delivery abstraction

Delivery errors must not reveal whether an account exists.

### Reset Password

Route: `/reset-password`

Behavior:

- accepts reset token + new password
- requires >= 12 characters
- token must be valid, unused, and unexpired
- updates password hash
- marks reset token consumed
- deletes all existing merchant sessions
- user signs in again after reset

## Dashboard

Route: `/dashboard`

This is a global merchant route, not a tenant route.

Access:

- anonymous merchant session -> redirect to `/login`
- valid active merchant -> render dashboard
- expired/disabled session -> session deleted and redirect to `/login`

Initial content:

- greeting / display name
- email
- normalized phone
- account status
- logout
- informational note that business/store setup is a later step

Out of scope:

- organization creation
- store creation
- plan selection
- onboarding checklist
- tenant links
- tenant DB access
- inventory/catalog management

## Phone Normalization

Phone input is validated and normalized at the server boundary.

Canonical persisted format: E.164.

Example:

`050-1234567` -> `+972501234567`

The implementation must reject malformed values rather than silently inventing country information when normalization is ambiguous. Israel-local normalization may use the application’s configured default market only where the transformation is deterministic.

Phone is not a login identifier and is not unique in PR #35.

## Security Invariants

1. Merchant identity never authorizes customer or admin operations.
2. Customer/admin sessions never authorize merchant dashboard access.
3. Merchant authentication remains global and control-plane only.
4. No merchant auth route opens a tenant DB connection.
5. Browser input never supplies a database schema or trusted tenant identifier.
6. SQL values use Drizzle/query-builder parameterization.
7. Dynamic DB identifiers are not derived from signup/login inputs.
8. Passwords are never stored or logged in plaintext.
9. Session and reset tokens are never stored in plaintext.
10. Authentication errors do not disclose whether an email exists.
11. Signup does not provision a tenant or schema.
12. Email verification state is recorded but does not grant extra authorization in PR #35.
13. Future sensitive actions must independently enforce verification/readiness requirements.
14. Untrusted input cannot become executable SQL, privileged instruction, tenant identity, authorization decision, or trusted configuration.

## Prompt-Injection Boundary

PR #35 introduces no AI/LLM execution path.

Merchant-entered display name, email, and phone are plain untrusted application data. They must never be interpreted as instructions for privileged tools or future AI workflows. If later surfaced to an AI subsystem, that subsystem must treat them as untrusted content.

## Error Handling

Public auth responses should distinguish safe validation errors from sensitive authentication state.

Safe examples:

- invalid phone format
- password below minimum length
- malformed email

Sensitive cases use generic messaging:

- duplicate/unavailable signup account
- wrong login password
- unknown login email
- unknown forgot-password email
- invalid/expired reset token

Server logs may capture internal error categories but must not log passwords, raw session tokens, or raw reset tokens.

## Migration Strategy

Add one journaled control-plane migration for merchant auth tables/enums/indexes.

Requirements:

- additive only
- idempotent under the existing migration framework
- no destructive reset
- no tenant-schema migration
- no changes to existing customer/admin tables
- migration must work on both existing DEV/STAGING databases and a clean control plane

## Testing Strategy

### Core unit tests

Cover:

- email normalization
- password minimum enforcement
- phone E.164 normalization/rejection
- duplicate merchant email handling
- successful registration
- valid/invalid authentication
- disabled merchant rejection
- session creation/hash/expiry
- logout
- forgot-password account-enumeration resistance
- reset-token expiry/consumption
- successful reset invalidates sessions

### Repository / control-plane tests

Cover:

- merchant tables created by migrations
- uniqueness only on merchant normalized email
- phone is not unique
- merchant FK cascade behavior
- session lookup uses hash
- no tenant DB path is used

### Route tests

Cover:

- `/signup` creates merchant + session and redirects to `/dashboard`
- `/login` succeeds/fails generically
- `/dashboard` redirects when unauthenticated
- merchant session grants only merchant dashboard access
- logout invalidates merchant session
- forgot/reset flows do not enumerate accounts
- existing customer and admin auth remain isolated

### Regression suite

Run existing:

- routing
- control-plane
- admin-auth
- customer auth
- storefront responsive/build tests
- full production build

Because Ubuntu’s packaged Node currently lacks built-in TypeScript stripping support, DEV/STAGING verification may use `tsx --test` for `.mts` suites until test-runner portability is fixed separately.

## Route Classification

Global public routes:

- `/signup`
- `/login`
- `/forgot-password`
- `/reset-password`

Global protected route:

- `/dashboard`

These first-segment routes must be explicitly classified as platform routes so tenant middleware never interprets them as tenant slugs.

## Alternatives Considered

### Reuse `customer_accounts`

Rejected. A person may independently be both a shopper and a merchant. Customer ownership semantics must not become merchant authorization semantics.

### Reuse `admin_users`

Rejected. Merchant self-service identity is not an administrative role. Reuse would couple acquisition/onboarding to platform/tenant-admin authorization and make pre-tenant merchants awkward or unsafe.

### Add Google OAuth in PR #35

Deferred. Email/password establishes the merchant identity boundary first. Google merchant OAuth can be added later against the same merchant account/identity model with a smaller review surface.

## Explicitly Out of Scope for PR #35

- Google merchant OAuth
- email verification delivery/requirement
- organization/business entities
- organization membership
- store onboarding/drafts
- slug reservation
- tenant creation
- tenant schema provisioning
- tenant-admin assignment
- subscription/billing
- plan enforcement
- activation/readiness
- custom domains
- Cloudflare automation
- production Cardcom rollout

## Success Criteria

PR #35 is complete when:

- a visitor can create a merchant account with display name, email, phone, and password
- signup auto-logs in and reaches `/dashboard`
- returning merchants can log in and log out
- protected dashboard access is session-backed and isolated from customer/admin auth
- password recovery works through the delivery abstraction
- reset invalidates existing merchant sessions
- no tenant/store/organization is created during auth
- all new and relevant regression tests pass
- DEV acceptance confirms signup/login/logout/reset/dashboard behavior

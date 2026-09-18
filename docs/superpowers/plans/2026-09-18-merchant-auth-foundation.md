# Merchant Identity & Authentication Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate global merchant identity domain with real signup, login, logout, 24-hour sessions, password recovery, and a protected `/dashboard`, without creating organizations, stores, tenants, subscriptions, or provisioning resources.

**Architecture:** Merchant authentication lives entirely in the control plane and uses dedicated merchant tables, cookie, repository, core auth logic, and route protection. It follows proven ShopNest customer-auth patterns where appropriate but shares no account/session authorization state with customer or admin auth.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, PostgreSQL 17, Drizzle ORM, Node crypto/scrypt auth utilities, next-intl, Zod, Node test runner / `tsx --test` for Ubuntu DEV/STAGING verification.

**Spec:** `docs/superpowers/specs/2026-09-18-merchant-identity-authentication-design.md`

## Global Constraints

- Merchant identity is a third independent auth domain; it must not reuse `customer_accounts`, `customer_sessions`, `admin_users`, or `admin_sessions`.
- Signup fields are email, password, display name, and phone.
- Signup auto-logs in and redirects to `/dashboard`.
- Email verification is not required for login in PR #35; `email_verified_at` remains nullable.
- Phone is required by signup UI, stored in canonical E.164 form, and is not unique.
- Merchant email is unique only within `merchant_accounts`.
- Password minimum length is 12 characters.
- Merchant session TTL is exactly 24 hours; no Remember Me.
- Session and reset tokens are random opaque browser tokens; only SHA-256 hashes are persisted.
- Forgot/reset password is included; reset TTL is 30 minutes.
- Successful password reset invalidates all existing merchant sessions.
- DEV/STAGING password reset uses a capture delivery implementation; no production email provider is added.
- `/dashboard` is global and merchant-only.
- Signup/auth must not create organizations, store drafts, tenants, schemas, subscriptions, plans, domains, or tenant-admin assignments.
- All persistence uses Drizzle/query-builder parameterization; no browser input may become SQL identifiers, tenant identity, schema selection, authorization state, or trusted configuration.
- Public auth errors must not reveal whether an account exists.
- PR #35 introduces no Google merchant OAuth and no AI/LLM execution surface.
- Control-plane migration must be additive, journaled by the existing migration runner, safe on existing DEV/STAGING databases, and require no destructive reset.

---

## File Map

**Create**
- `src/drizzle/control-schema/merchantAccount.ts` — merchant account schema.
- `src/drizzle/control-schema/merchantSession.ts` — merchant session schema.
- `src/drizzle/control-schema/merchantPasswordReset.ts` — merchant reset-token schema.
- `src/drizzle/control-migrations/0006_merchant_identity.sql` — additive merchant auth migration.
- `src/lib/merchant-auth/core.ts` — pure merchant auth/session/reset logic.
- `src/lib/merchant-auth/password.mjs` — merchant password hashing/verifying wrapper using the existing secure pattern.
- `src/lib/merchant-auth/phone.ts` — deterministic E.164 normalization/validation.
- `src/lib/merchant-auth/drizzle-repository.ts` — control-plane persistence.
- `src/lib/merchant-auth/cookie.ts` — merchant cookie policy.
- `src/lib/merchant-auth/server.ts` — server-only current merchant / require merchant helpers.
- `src/lib/merchant-auth/password-reset-delivery.ts` — delivery interface + DEV/STAGING capture.
- `src/app/(marketing)/_actions/merchant-auth.ts` — public signup/login/forgot/reset server actions.
- `src/app/(merchant)/dashboard/page.tsx` — protected merchant dashboard.
- `src/app/(merchant)/dashboard/_actions.ts` — logout action.
- `src/app/(marketing)/forgot-password/page.tsx` — forgot password form.
- `src/app/(marketing)/reset-password/page.tsx` — reset form.
- `tests/merchant-auth.test.mts` — merchant auth core/cookie/delivery/isolation tests.
- `tests/merchant-auth-routes.test.mts` — route/action source and access boundary tests.

**Modify**
- `src/drizzle/control-plane-schema.ts` — export merchant schemas.
- `src/drizzle/control-schema/shared.ts` — add merchant status enum.
- `src/app/(marketing)/signup/page.tsx` — replace placeholder with real signup form.
- `src/app/(marketing)/login/page.tsx` — replace placeholder with real login form.
- `src/lib/tenant-routing/core.ts` — classify `forgot-password`, `reset-password`, and `dashboard` as platform routes.
- `src/messages/en.json` — merchant auth/dashboard copy.
- `src/messages/he.json` — matching merchant auth/dashboard copy.
- `docs/route-audit.md` — record new public/protected merchant routes.
- `package.json` — add `merchant-auth:test`.
- `tests/control-plane.test.mts` — migration/additivity assertions.
- `tests/route-navigation.test.mjs` — platform route expectations and tenant fail-closed regression.

---

### Task 1: Lock Merchant Auth Contracts and Control-Plane Schema

**Files:**
- Create: `tests/merchant-auth.test.mts`
- Create: `src/drizzle/control-schema/merchantAccount.ts`
- Create: `src/drizzle/control-schema/merchantSession.ts`
- Create: `src/drizzle/control-schema/merchantPasswordReset.ts`
- Create: `src/drizzle/control-migrations/0006_merchant_identity.sql`
- Modify: `src/drizzle/control-schema/shared.ts`
- Modify: `src/drizzle/control-plane-schema.ts`
- Modify: `tests/control-plane.test.mts`
- Modify: `package.json`

**Interfaces:**
- Produces: `merchantAccounts`, `merchantSessions`, `merchantPasswordResetTokens`, `MerchantStatus`.
- Produces: `merchant-auth:test` script.
- Consumes: existing `getControlPlaneDb()` and journaled SQL migration runner.

- [ ] **Step 1: Write failing schema/security tests**

Add tests that read the new schema/migration targets and initially fail because they do not exist. The assertions must require:

```ts
test("merchant identity uses dedicated control-plane tables", async () => {
  const schema = await readFile("src/drizzle/control-plane-schema.ts", "utf8");
  assert.match(schema, /merchantAccount/);
  assert.match(schema, /merchantSession/);
  assert.match(schema, /merchantPasswordReset/);
});

test("merchant migration is additive and keeps phone non-unique", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0006_merchant_identity.sql",
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "merchant_accounts"/);
  assert.match(sql, /CREATE TABLE "merchant_sessions"/);
  assert.match(sql, /CREATE TABLE "merchant_password_reset_tokens"/);
  assert.match(sql, /email_normalized[sS]*UNIQUE/);
  assert.doesNotMatch(sql, /UNIQUE[sS]*phone_e164|phone_e164[sS]*UNIQUE/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/);
});
```

Also assert merchant FKs cascade from account to session/reset rows and that no tenant schema/table is referenced.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx --yes tsx --test tests/merchant-auth.test.mts tests/control-plane.test.mts
```

Expected: FAIL because merchant schema/migration files and exports are absent.

- [ ] **Step 3: Add merchant status enum and Drizzle schemas**

Add in `shared.ts`:

```ts
export const merchantStatuses = ["active", "disabled"] as const;
export type MerchantStatus = (typeof merchantStatuses)[number];
export const merchantStatusEnum = pgEnum("merchant_status", merchantStatuses);
```

Define `merchantAccounts` with:
- serial primary key
- `email varchar(320) not null`
- `emailNormalized varchar(320) not null unique`
- `passwordHash varchar(255) not null`
- `displayName varchar(160) not null`
- `phoneE164 varchar(32)` nullable
- `emailVerifiedAt timestamptz` nullable
- merchant status default active
- timestamps

Define `merchantSessions` and `merchantPasswordResetTokens` with UUID PKs, hashed tokens, FKs, expiry timestamps, and expiry indexes.

- [ ] **Step 4: Export schemas and add additive migration**

Export the three schema files from `control-plane-schema.ts`.

Create `0006_merchant_identity.sql` matching the Drizzle schema. It must create the enum/tables/indexes only and contain no destructive statements.

- [ ] **Step 5: Add test script**

Add to `package.json`:

```json
"merchant-auth:test": "node --experimental-strip-types --test tests/merchant-auth.test.mts tests/merchant-auth-routes.test.mts"
```

Runtime on Ubuntu DEV/STAGING may use `npx --yes tsx --test ...` until the separate test-runner portability issue is addressed.

- [ ] **Step 6: Run schema tests GREEN**

Run:

```bash
npx --yes tsx --test tests/merchant-auth.test.mts tests/control-plane.test.mts
```

Expected: PASS for the new schema/migration assertions.

- [ ] **Step 7: Commit**

```bash
git add src/drizzle/control-schema src/drizzle/control-migrations/0006_merchant_identity.sql src/drizzle/control-plane-schema.ts tests/merchant-auth.test.mts tests/control-plane.test.mts package.json
git commit -m "feat: add merchant identity control-plane schema"
```

---

### Task 2: Implement Merchant Auth Core, Passwords, Phone Normalization, and Sessions

**Files:**
- Create: `src/lib/merchant-auth/core.ts`
- Create: `src/lib/merchant-auth/password.mjs`
- Create: `src/lib/merchant-auth/phone.ts`
- Create: `src/lib/merchant-auth/cookie.ts`
- Modify: `tests/merchant-auth.test.mts`

**Interfaces:**
- Produces:
  - `MERCHANT_SESSION_TTL_MS = 24 * 60 * 60 * 1000`
  - `MERCHANT_PASSWORD_MIN_LENGTH = 12`
  - `MERCHANT_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000`
  - `normalizeMerchantEmail(email: string): string`
  - `normalizeMerchantPhone(input: string, defaultCountry?: "IL"): string`
  - `registerMerchant(repository, input)`
  - `authenticateMerchant(repository, email, password)`
  - `createMerchantSession(repository, merchantId, options?)`
  - `resolveMerchantSession(repository, token, now?)`
  - `logoutMerchant(repository, token)`
  - `hashMerchantSessionToken(token)`
  - cookie option helpers.
- Consumes: repository interface defined in `core.ts`.

- [ ] **Step 1: Extend failing tests for core behavior**

Add explicit tests for:
- NFKC + trim + lowercase email normalization.
- password length 11 rejected; 12 accepted.
- Israel local `050-1234567` -> `+972501234567`.
- already-E.164 `+972501234567` remains unchanged.
- malformed/ambiguous phone rejected.
- duplicate normalized merchant email returns `account_unavailable`.
- disabled merchant cannot authenticate.
- successful session stores only a 64-char SHA-256 hash.
- session expires after exactly 24 hours.
- expired session is deleted.
- cookie is HttpOnly, SameSite=Lax, path `/`, expiry matches DB expiry, Secure follows HTTPS/forwarded protocol.

Use a focused in-memory `FakeMerchantRepository` implementing the exact `MerchantAuthRepository` interface.

- [ ] **Step 2: Run and verify RED**

```bash
npx --yes tsx --test tests/merchant-auth.test.mts
```

Expected: FAIL because merchant auth core modules do not exist.

- [ ] **Step 3: Implement password hashing wrapper**

Follow the existing customer-auth secure scrypt pattern. Expose:

```js
export async function hashMerchantPassword(password) { ... }
export async function verifyMerchantPassword(password, storedHash) { ... }
```

Do not invent a weaker hash or store raw passwords.

- [ ] **Step 4: Implement phone normalization**

`normalizeMerchantPhone` must:
- remove presentation separators safely
- accept explicit valid `+` E.164 numbers
- for deterministic Israeli local mobile format beginning `05`, remove the trunk `0` and prepend `+972`
- reject invalid lengths, alphabetic content, malformed plus signs, and ambiguous national numbers
- return only `+<digits>`

Do not call an external service.

- [ ] **Step 5: Implement core auth/session logic**

Create merchant types and repository interface analogous to customer auth but merchant-specific. Registration must validate password and phone before persistence.

Session generation:

```ts
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(now.getTime() + MERCHANT_SESSION_TTL_MS);
```

No caller-controlled expiry is accepted.

- [ ] **Step 6: Implement cookie policy**

Expose a cookie-options helper that aligns cookie expiry with the server-owned session expiry and computes `secure` from actual HTTPS / forwarded protocol, following the existing customer cookie pattern.

- [ ] **Step 7: Run GREEN**

```bash
npx --yes tsx --test tests/merchant-auth.test.mts
```

Expected: PASS for normalization/password/session/cookie tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/merchant-auth tests/merchant-auth.test.mts
git commit -m "feat: add merchant authentication core"
```

---

### Task 3: Implement Drizzle Repository and Password Recovery

**Files:**
- Create: `src/lib/merchant-auth/drizzle-repository.ts`
- Create: `src/lib/merchant-auth/password-reset-delivery.ts`
- Create: `src/lib/merchant-auth/server.ts`
- Modify: `src/lib/merchant-auth/core.ts`
- Modify: `tests/merchant-auth.test.mts`

**Interfaces:**
- Produces:
  - `DrizzleMerchantAuthRepository`
  - `MERCHANT_SESSION_COOKIE = "shopnest_merchant_session"`
  - `getCurrentMerchant()`
  - `requireMerchantPage()`
  - `requestMerchantPasswordReset(...)`
  - `resetMerchantPassword(...)`
  - `MerchantPasswordResetDelivery`
  - `createMerchantPasswordResetDelivery()`
- Consumes: merchant control-plane tables and core repository interface.

- [ ] **Step 1: Add failing repository/reset tests**

Cover:
- account lookup only queries merchant tables.
- registration persists normalized email/E.164 phone.
- session lookup joins only merchant session/account tables.
- forgot-password always returns `{ accepted: true }`.
- unknown email creates no token but produces same external result.
- token is stored hashed, not raw.
- reset token expiry is enforced.
- token is single-use.
- successful reset changes password and deletes all merchant sessions.
- delivery exception is swallowed from public response.
- source isolation assertions reject references to `customerAccounts`, `customerSessions`, `adminUsers`, `getDbForTenant`, `getTenant`, and `sql.raw`.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/merchant-auth.test.mts
```

Expected: FAIL on missing repository/reset/server modules.

- [ ] **Step 3: Implement Drizzle repository**

Use `getControlPlaneDb()` only.

Required methods include:
- `findMerchantByNormalizedEmail`
- `createMerchantWithPassword`
- `createSession`
- `findSessionByTokenHash`
- `deleteSessionByTokenHash`
- `deleteSessionsForMerchant`
- `issuePasswordResetToken`
- `consumePasswordResetToken`

Use transactions and row locking for reset-token consumption. On successful reset, update password, mark token consumed, and delete all merchant sessions in the same transaction.

- [ ] **Step 4: Implement reset core functions**

Use a 32-byte random base64url token, SHA-256 persistence hash, 30-minute expiry, and generic accepted response.

The public request function must never expose account existence.

- [ ] **Step 5: Implement delivery abstraction**

Define:

```ts
export interface MerchantPasswordResetDelivery {
  deliverPasswordReset(input: { email: string; resetUrl: string }): Promise<void>;
}
```

Provide:
- development/staging capture implementation compatible with the project’s existing dev-capture pattern
- unconfigured implementation that fails closed for unsupported production delivery
- no raw token logging beyond the explicitly controlled DEV/STAGING capture mechanism

- [ ] **Step 6: Implement server helpers**

`server.ts` owns the singleton Drizzle repository, cookie read, current merchant resolution, and page requirement.

`requireMerchantPage()` redirects unauthenticated/expired/disabled sessions to `/login`.

- [ ] **Step 7: Run GREEN**

```bash
npx --yes tsx --test tests/merchant-auth.test.mts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/merchant-auth tests/merchant-auth.test.mts
git commit -m "feat: add merchant auth persistence and recovery"
```

---

### Task 4: Wire Public Signup, Login, Forgot, Reset, and Logout Actions

**Files:**
- Create: `src/app/(marketing)/_actions/merchant-auth.ts`
- Create: `src/app/(merchant)/dashboard/_actions.ts`
- Modify: `src/app/(marketing)/signup/page.tsx`
- Modify: `src/app/(marketing)/login/page.tsx`
- Create: `src/app/(marketing)/forgot-password/page.tsx`
- Create: `src/app/(marketing)/reset-password/page.tsx`
- Create: `tests/merchant-auth-routes.test.mts`
- Modify: `src/messages/en.json`
- Modify: `src/messages/he.json`

**Interfaces:**
- Produces server actions:
  - `signupMerchantAction(previousState, formData)`
  - `loginMerchantAction(previousState, formData)`
  - `requestMerchantPasswordResetAction(previousState, formData)`
  - `resetMerchantPasswordAction(previousState, formData)`
  - `logoutMerchantAction()`
- Consumes merchant core/repository/server/cookie helpers.

- [ ] **Step 1: Write failing route/action tests**

Assert source behavior:
- signup form fields: display name, email, phone, password.
- no schema/tenant/plan/store/org fields exist in signup action.
- signup calls `registerMerchant`, creates session, sets only merchant cookie, redirects `/dashboard`.
- login rotates any existing merchant session before creating a new one.
- login error is generic for unknown email/wrong password.
- forgot response copy is generic.
- reset does not auto-authorize through customer/admin session.
- logout deletes merchant session and merchant cookie only.
- actions contain no `getDbForTenant`, `getTenant`, `customerAccounts`, `adminUsers`, `sql.raw`.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/merchant-auth-routes.test.mts
```

Expected: FAIL because routes/actions are still placeholders or absent.

- [ ] **Step 3: Add aligned i18n contract**

Add matching English/Hebrew merchant auth keys for:
- signup labels/errors/CTA
- login labels/generic invalid credentials
- forgot-password accepted message
- reset-password labels/success/error
- dashboard greeting/account fields/logout/future-store message

Keep the same key structure in both locales.

- [ ] **Step 4: Implement server actions with Zod validation**

Validate on the server:
- email syntax
- display name non-empty and bounded
- password min 12
- phone through `normalizeMerchantPhone`

Map safe validation errors to fields. Map duplicate account/login failures to generic non-enumerating messages.

On signup success:
1. register merchant
2. create merchant session
3. set `shopnest_merchant_session`
4. redirect `/dashboard`

- [ ] **Step 5: Replace signup/login placeholders with accessible forms**

Use semantic labels, password autocomplete attributes, mobile-friendly controls, min 44px tap targets, and preserve Hebrew RTL behavior through the existing root layout.

Login includes links to signup and forgot-password. Signup includes link to login.

- [ ] **Step 6: Add forgot/reset forms**

Forgot page accepts email and always renders the same accepted outcome after submission.

Reset page accepts token from query string plus new password; invalid/expired/used tokens return a generic reset failure.

- [ ] **Step 7: Implement logout action**

Delete the current merchant session by hashed token, clear the merchant cookie, and redirect to `/login`.

- [ ] **Step 8: Run GREEN**

```bash
npx --yes tsx --test tests/merchant-auth.test.mts tests/merchant-auth-routes.test.mts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/(marketing) src/app/(merchant) src/messages tests/merchant-auth-routes.test.mts
git commit -m "feat: add merchant signup and login flows"
```

---

### Task 5: Add Protected Merchant Dashboard and Platform Route Classification

**Files:**
- Create: `src/app/(merchant)/dashboard/page.tsx`
- Modify: `src/lib/tenant-routing/core.ts`
- Modify: `tests/route-navigation.test.mjs`
- Modify: `tests/merchant-auth-routes.test.mts`
- Modify: `docs/route-audit.md`

**Interfaces:**
- Produces: global protected `/dashboard`.
- Consumes: `requireMerchantPage()`.
- Tenant router must classify `/forgot-password`, `/reset-password`, and `/dashboard` as platform routes.

- [ ] **Step 1: Add failing routing/dashboard tests**

Require:
- `resolveTenantRoute("/dashboard")` => legacy/platform, never tenant.
- same for forgot/reset routes.
- unknown paths still fail closed.
- dashboard source calls `requireMerchantPage()`.
- dashboard contains no tenant context/tenant DB imports.
- dashboard does not accept customer/admin principal.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/route-navigation.test.mjs tests/merchant-auth-routes.test.mts
```

Expected: FAIL until route classification/dashboard are implemented.

- [ ] **Step 3: Extend platform route allowlist**

Add the three first segments to the existing explicit server-side reserved/platform route set. Do not introduce dynamic tenant resolution in this PR.

- [ ] **Step 4: Implement minimal dashboard**

Render:
- display name
- email
- normalized phone
- account status
- logout control
- note that business/store setup follows in a later phase

No org/store/tenant/plan controls.

- [ ] **Step 5: Update route audit**

Document:
- `/forgot-password` — public merchant recovery request
- `/reset-password` — public token-based merchant password reset
- `/dashboard` — authenticated merchant global workspace

- [ ] **Step 6: Run GREEN**

```bash
npx --yes tsx --test tests/route-navigation.test.mjs tests/merchant-auth-routes.test.mts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/(merchant)/dashboard src/lib/tenant-routing/core.ts tests/route-navigation.test.mjs tests/merchant-auth-routes.test.mts docs/route-audit.md
git commit -m "feat: protect merchant dashboard"
```

---

### Task 6: Migration Verification, Regression Suite, Draft PR, and DEV Acceptance

**Files:**
- Modify only if verification exposes a scoped defect.
- Create Draft PR after automated verification.

**Interfaces:**
- Consumes the completed PR #35 branch.
- Produces verified migration + application behavior ready for review.

- [ ] **Step 1: Verify branch scope before migration**

Run:

```bash
git status
git diff --stat master...HEAD
git diff --name-only master...HEAD
```

Confirm there are no tenant-schema migrations, payment changes, provisioning changes, subscription code, Google merchant OAuth, or organization/store creation.

- [ ] **Step 2: Run control-plane migration in DEV**

On DEV with the normal environment loaded:

```bash
npm run control-plane:migrate
```

Expected:
- `0006_merchant_identity.sql` applies exactly once.
- existing control-plane data remains intact.
- re-running reports/behaves idempotently through the existing journal/hash mechanism.

Do **not** use `docker compose down -v` or reset the database.

- [ ] **Step 3: Verify merchant schema in PostgreSQL**

Check:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'merchant_accounts',
    'merchant_sessions',
    'merchant_password_reset_tokens'
  )
ORDER BY table_name;
```

Expected: exactly three rows.

Verify normalized email uniqueness and absence of phone uniqueness using catalog/index inspection.

- [ ] **Step 4: Run merchant and routing tests**

Ubuntu DEV/STAGING verification:

```bash
npx --yes tsx --test tests/merchant-auth.test.mts tests/merchant-auth-routes.test.mts
npx --yes tsx --test tests/tenant.test.mts tests/route-navigation.test.mjs
```

Expected: 0 failures.

- [ ] **Step 5: Run auth/control-plane regressions**

```bash
npx --yes tsx --test tests/customer-auth.test.mts
npx --yes tsx --test tests/admin-auth.test.mts
npx --yes tsx --test tests/control-plane.test.mts
```

Expected: 0 failures.

- [ ] **Step 6: Run UI/build regressions**

```bash
npx --yes tsx --test tests/storefront-responsive.test.mts
npx --yes tsx --test tests/marketing-site.test.mts
npm run build
```

Expected: tests pass and Next production build completes.

- [ ] **Step 7: Open Draft PR**

Create Draft PR against `master` titled:

`Add merchant identity and authentication foundation`

Body must state:
- dedicated merchant identity domain
- signup/login/logout/reset/dashboard included
- auto-login after signup
- phone E.164
- 24h sessions
- tenant/customer/admin isolation
- migration details
- explicit out-of-scope list from the spec
- verification results

Do not mark Ready for Review yet.

- [ ] **Step 8: DEV browser acceptance**

Verify with a fresh browser/session:

1. `/signup` accepts display name/email/Israeli phone/password >= 12.
2. signup redirects directly to `/dashboard`.
3. dashboard shows normalized phone and merchant profile.
4. logout returns to login and dashboard becomes inaccessible.
5. wrong password and unknown email display the same login error.
6. duplicate signup does not reveal sensitive internal account state beyond a generic unavailable-account response.
7. forgot-password returns the same accepted response for known and unknown email.
8. DEV capture provides a reset link for the known account.
9. reset succeeds once; replay fails.
10. pre-reset merchant session is invalid after reset.
11. new password can log in; old password cannot.
12. customer account login still works independently.
13. tenant admin and global super-admin login still work independently.
14. no tenant/schema/store/org/subscription is created by merchant signup.

- [ ] **Step 9: Final review gate**

Before any READY TO MERGE claim:
- fetch fresh PR metadata and head SHA
- verify mergeability
- review changed filenames/diff against scope
- run the verification-before-completion process with fresh evidence
- request code review
- resolve all Critical/Important findings

Only after these gates may PR #35 be marked READY TO MERGE. Actual merge still requires the user’s explicit merge instruction.

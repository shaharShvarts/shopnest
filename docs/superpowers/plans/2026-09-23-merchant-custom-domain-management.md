# Merchant Custom-Domain Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the merchant-facing, user-driven custom-domain lifecycle: TXT ownership verification, direct CNAME preflight, Cloudflare provisioning/status checks, zero-downtime replacement, 24-hour retirement/rollback, safe removal, and trusted redirects.

**Architecture:** Keep pre-provider state in `store_domain_claims` and create `store_domains` bindings only after TXT plus direct CNAME verification. Add a lifecycle service around the existing Cloudflare provisioning/sync/removal services so provider readiness cannot bypass Store/Tenant authorization or candidate/primary/retiring state. Extend trusted routing to understand primary and retiring bindings, and keep every DNS/provider check explicitly user-triggered with server-side 60-second reservations.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, PostgreSQL 17, Drizzle ORM, `node:dns/promises`, `node:test` via `tsx`, Cloudflare for SaaS, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-23-merchant-custom-domain-management-design.md`

## Global Constraints

- Merchant route: `/dashboard/stores/[id]/domain`.
- Ownership claim lifetime: exactly 24 hours.
- TXT, CNAME, and Cloudflare manual checks: server-enforced 60-second minimum interval.
- Required direct CNAME target: `customers.shopnest.co.il`.
- Exact subdomains only; no apex domains and no wildcards.
- No worker, cron reconciliation, or automatic polling.
- One primary custom domain per Store; at most one transient candidate.
- Cloudflare Free-compatible; retain the configurable hostname cap, default 100.
- Activation requires Cloudflare hostname `active`, SSL `active`, active Tenant, valid Store binding, and current merchant eligibility.
- Replacement keeps the old domain active until cutover; old domain then HTTP 302 redirects for exactly 24 hours.
- Rollback is Super Admin/operator only and is symmetric.
- Removing the only custom domain makes `shopnest.co.il/<slug>` serve immediately with no redirect.
- Tenant, schema, provider ID/status, lifecycle role, redirect target, and retirement timestamps are never browser-authoritative.
- Host never derives a database schema.
- Plaintext ownership tokens are never persisted.
- Local routing is disabled before destructive Cloudflare cleanup; cleanup failure never restores routing.
- No merge before tests, production build, DEV acceptance, STAGING acceptance, security review, and explicit user approval.

## Review Focus

- Concurrent manual-check clicks: only one real DNS/provider request may reserve a 60-second window.
- Stale candidate readiness: cutover must re-read Store, Tenant, plan, candidate, and current primary under lock.
- Expired retirement plus Cloudflare delete failure: local routing must remain disabled and retryable.
- Platform slug redirects: do not convert POST/API/media traffic into unsafe 302 GETs.
- Migration: preserve PR #46 active rows even when old `is_primary=false`; fail rather than guess if a Tenant has multiple active rows.

## File Structure

- `src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql` — lifecycle/cooldown migration and backfill.
- `src/drizzle/control-schema/storeDomain.ts` — candidate/primary/retiring state.
- `src/drizzle/control-schema/storeDomainClaim.ts` — CNAME and manual-check timestamps.
- `src/lib/domain-claims/*` — TXT/CNAME verification and cooldown reservations.
- `src/lib/cloudflare-saas/domain-provisioning*` — provisioning gate after TXT+CNAME only.
- `src/lib/custom-domain-lifecycle/*` — manual provider checks, cutover, retirement, rollback, cleanup.
- `src/lib/cloudflare-saas/domain-removal*` — lifecycle-aware local-first delete.
- `src/lib/domain-registry/*` and `src/middleware.ts` — primary/retiring routing and 302 redirects.
- `src/lib/merchant-domains/*` — owned Store domain read model.
- `src/app/(merchant)/dashboard/stores/[id]/domain/*` — merchant UI/actions.
- `src/app/admin/stores/[slug]/page.tsx` and `src/app/admin/_actions/stores.ts` — Super Admin rollback.
- `scripts/domain-rollback.mts` and `scripts/domain-lifecycle-smoke.mts` — operator/acceptance tools.

---

### Task 1: Persist lifecycle and cooldown state

**Files:**
- Create: `src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql`
- Modify: `src/drizzle/control-migrations/meta/_journal.json`
- Modify: `src/drizzle/control-schema/storeDomain.ts`
- Modify: `src/drizzle/control-schema/storeDomainClaim.ts`
- Test: `tests/control-plane.test.mts`

**Interfaces:**
- Produces `StoreDomainLifecycleRole = "candidate" | "primary" | "retiring"`.
- Produces claim fields `cnameVerifiedAt`, `lastTxtCheckAt`, `lastCnameCheckAt`.
- Produces domain fields `lifecycleRole`, `cnameVerifiedAt`, `lastManualCheckAt`, `retireAt`, `redirectToDomainId`.

- [ ] **Step 1: Write failing migration/schema tests**

```ts
test("merchant domain migration adds lifecycle and cooldown fields", async () => {
  const [migration, domainSchema, claimSchema] = await Promise.all([
    readFile("src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql", "utf8"),
    readFile("src/drizzle/control-schema/storeDomain.ts", "utf8"),
    readFile("src/drizzle/control-schema/storeDomainClaim.ts", "utf8"),
  ]);
  assert.match(migration, /last_txt_check_at/);
  assert.match(migration, /last_cname_check_at/);
  assert.match(migration, /cname_verified_at/);
  assert.match(migration, /lifecycle_role/);
  assert.match(migration, /retire_at/);
  assert.match(migration, /redirect_to_domain_id/);
  assert.match(migration, /multiple active custom domains/i);
  assert.match(domainSchema, /candidate.*primary.*retiring/s);
  assert.match(claimSchema, /lastTxtCheckAt/);
  assert.match(claimSchema, /lastCnameCheckAt/);
});

test("removed hostnames can be rebound but bound hostnames stay unique", async () => {
  const migration = await readFile(
    "src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql",
    "utf8"
  );
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "store_domains_hostname_unique"/);
  assert.match(migration, /store_domains_hostname_bound_unique/);
  assert.match(migration, /WHERE "status" <> 'removed'/);
});
```

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/control-plane.test.mts
```

Expected: FAIL because migration 0015 and fields do not exist.

- [ ] **Step 3: Add the migration**

Use additive columns, a fail-fast duplicate-active check, safe role backfill, partial unique indexes, and self-reference:

```sql
ALTER TABLE public.store_domain_claims
  ADD COLUMN IF NOT EXISTS cname_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_txt_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cname_check_at timestamptz;

ALTER TABLE public.store_domains
  ADD COLUMN IF NOT EXISTS lifecycle_role varchar(32),
  ADD COLUMN IF NOT EXISTS cname_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_manual_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS retire_at timestamptz,
  ADD COLUMN IF NOT EXISTS redirect_to_domain_id integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT tenant_id
    FROM public.store_domains
    WHERE status = 'active'
    GROUP BY tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'multiple active custom domains exist for one tenant';
  END IF;
END
$$;

UPDATE public.store_domains
SET lifecycle_role = CASE
      WHEN status = 'removed' THEN NULL
      WHEN status = 'active' THEN 'primary'
      ELSE 'candidate'
    END,
    is_primary = (status = 'active')
WHERE lifecycle_role IS NULL;

ALTER TABLE public.store_domains
  DROP CONSTRAINT IF EXISTS store_domains_hostname_unique;

DROP INDEX IF EXISTS store_domains_primary_tenant_unique;

CREATE UNIQUE INDEX store_domains_hostname_bound_unique
  ON public.store_domains(hostname)
  WHERE status <> 'removed';

CREATE UNIQUE INDEX store_domains_primary_tenant_unique
  ON public.store_domains(tenant_id)
  WHERE lifecycle_role = 'primary' AND status <> 'removed';

CREATE UNIQUE INDEX store_domains_candidate_tenant_unique
  ON public.store_domains(tenant_id)
  WHERE lifecycle_role = 'candidate' AND status <> 'removed';

CREATE INDEX store_domains_retire_at_idx
  ON public.store_domains(retire_at)
  WHERE lifecycle_role = 'retiring' AND status <> 'removed';
```

Also add checks: lifecycle role is one of candidate/primary/retiring; removed rows have null role and `is_primary=false`; `is_primary` equals primary-role truth; retiring requires `retire_at` and `redirect_to_domain_id`; redirect target cannot equal row id. Add FK `redirect_to_domain_id -> store_domains.id ON DELETE SET NULL`.

Keep legacy `verification_token` physically for this release because it is currently NOT NULL. Stop treating it as an ownership secret.

- [ ] **Step 4: Update Drizzle schema and migration journal**

Add exact fields/types matching the SQL. Remove `.unique()` from `hostname` and define the partial uniqueness in the table callback.

Append journal entry:

```json
{
  "idx": 15,
  "version": "7",
  "when": 1790197200000,
  "tag": "0015_merchant_custom_domain_lifecycle",
  "breakpoints": true
}
```

- [ ] **Step 5: Run GREEN**

```bash
npx --yes tsx --test tests/control-plane.test.mts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql src/drizzle/control-migrations/meta/_journal.json src/drizzle/control-schema/storeDomain.ts src/drizzle/control-schema/storeDomainClaim.ts tests/control-plane.test.mts
git commit -m "feat: add merchant domain lifecycle schema"
```

---

### Task 2: Add transactionally rate-limited TXT and direct-CNAME verification

**Files:**
- Modify: `src/lib/domain-claims/core.ts`
- Modify: `src/lib/domain-claims/drizzle-repository.ts`
- Modify: `src/lib/domain-claims/server.ts`
- Test: `tests/domain-claims.test.mts`

**Interfaces:**
- Produces `DOMAIN_MANUAL_CHECK_COOLDOWN_MS = 60_000`.
- Produces `verifyCname(merchantId, storeId, hostname, now)`.
- Extends resolver with `resolveCname(name): Promise<string[]>`.

- [ ] **Step 1: Write failing cooldown and direct-CNAME tests**

```ts
test("second TXT check inside 60 seconds does no second DNS lookup", async () => {
  const now = new Date("2026-09-23T20:00:00Z");
  const repository = claimRepositoryWithPendingClaim(now);
  let lookups = 0;
  const service = new DomainOwnershipClaimService(repository, {
    resolveTxt: async () => { lookups += 1; return []; },
    resolveCname: async () => [],
    resolveSoa: async () => { throw Object.assign(new Error("no soa"), { code: "ENODATA" }); },
  } as any);

  assert.equal((await service.verifyClaim(10, 20, "shop.example.com", now)).kind, "pending");
  const second = await service.verifyClaim(
    10, 20, "shop.example.com", new Date(now.getTime() + 1_000)
  );
  assert.equal(second.kind, "cooldown");
  assert.equal(lookups, 1);
});

test("CNAME must point directly and only to customers.shopnest.co.il", async () => {
  const repository = claimRepositoryWithVerifiedClaim();
  const good = new DomainOwnershipClaimService(repository, {
    resolveTxt: async () => [],
    resolveCname: async () => ["customers.shopnest.co.il."],
    resolveSoa: async () => ({}),
  } as any);
  assert.equal((await good.verifyCname(10, 20, "shop.example.com")).kind, "verified");

  const wrong = new DomainOwnershipClaimService(repository.fresh(), {
    resolveTxt: async () => [],
    resolveCname: async () => ["edge.example.net"],
    resolveSoa: async () => ({}),
  } as any);
  assert.equal((await wrong.verifyCname(10, 20, "shop.example.com")).kind, "pending");
});
```

Add a repository concurrency test where two reservations race; exactly one returns ready.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/domain-claims.test.mts
```

Expected: FAIL.

- [ ] **Step 3: Add contracts and direct-target logic**

In `core.ts`:

```ts
export const DOMAIN_MANUAL_CHECK_COOLDOWN_MS = 60_000;
export const SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET =
  "customers.shopnest.co.il";

export type ClaimCheckReservation =
  | { kind: "ready"; claim: StoreDomainClaimRecord }
  | { kind: "cooldown"; claim: StoreDomainClaimRecord; nextAllowedAt: Date };

export interface TxtResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolveSoa(name: string): Promise<unknown>;
}
```

Reserve TXT/CNAME checks **before** DNS I/O. A cooldown response returns without performing DNS.

Direct CNAME success is only:

```ts
const answers = await this.resolver.resolveCname(hostname);
const direct =
  answers.length === 1
    ? answers[0]!.trim().toLowerCase().replace(/\.$/, "")
    : "";
const matched = direct === SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET;
```

- [ ] **Step 4: Implement locked repository reservations**

Under `SELECT ... FOR UPDATE`:
1. authorize owned Store and current claim;
2. reject expired/wrong status;
3. calculate `lastCheck + 60_000`;
4. return cooldown if future;
5. persist the relevant `last_*_check_at=now` before returning ready.

Add `markCnameVerified({ id, now })` without consuming the claim.

- [ ] **Step 5: Wire Node DNS**

```ts
import { resolveCname, resolveSoa, resolveTxt } from "node:dns/promises";

const resolver = { resolveTxt, resolveCname, resolveSoa };
```

- [ ] **Step 6: Run GREEN and commit**

```bash
npx --yes tsx --test tests/domain-claims.test.mts
git add src/lib/domain-claims tests/domain-claims.test.mts
git commit -m "feat: verify domain DNS with cooldowns"
```

---

### Task 3: Gate Cloudflare creation on TXT plus direct CNAME

**Files:**
- Modify: `src/lib/cloudflare-saas/domain-provisioning.ts`
- Modify: `src/lib/cloudflare-saas/domain-provisioning-repository.ts`
- Test: `tests/cloudflare-domain-provisioning.test.mts`

**Interfaces:**
- Consumes claim `verifiedAt` and `cnameVerifiedAt`.
- Produces error `CNAME_NOT_VERIFIED`.
- Every new binding starts as `lifecycleRole="candidate"` and `isPrimary=false`.

- [ ] **Step 1: Write failing tests**

```ts
test("provider creation is blocked until CNAME verification is persisted", async () => {
  const repository = provisioningRepository({
    claimStatus: "verified",
    verifiedAt: new Date(),
    cnameVerifiedAt: null,
  });
  const service = new CloudflareDomainProvisioningService(
    repository, provider(), 100, "customers.shopnest.co.il"
  );
  await assert.rejects(
    () => service.provisionVerifiedClaim(10, 20, "shop.example.com"),
    (error: any) => error.code === "CNAME_NOT_VERIFIED"
  );
  assert.equal(repository.reserveCalls, 0);
});
```

Also test:
- new row is candidate/not primary;
- removed hostname can be rebound;
- non-removed hostname bound to another Tenant still fails.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/cloudflare-domain-provisioning.test.mts
```

- [ ] **Step 3: Require CNAME in both early and locked preflight**

Add `cnameVerifiedAt` to both repository selects. Throw:

```ts
throw new CloudflareDomainProvisioningError(
  "CNAME_NOT_VERIFIED",
  "Direct ShopNest CNAME verification is required before provisioning"
);
```

The locked reservation is the security boundary.

- [ ] **Step 4: Create candidates only**

Insert:

```ts
.values({
  tenantId: claim.tenantId,
  hostname: input.hostname,
  type: "custom",
  status: "pending_verification",
  verificationToken: "legacy-claim-" + claim.claimId,
  verifiedAt: claim.verifiedAt,
  cnameVerifiedAt: claim.cnameVerifiedAt,
  lifecycleRole: "candidate",
  isPrimary: false,
  provider: "cloudflare",
  activationRequestedAt: input.now,
  createdAt: input.now,
  updatedAt: input.now,
})
```

The legacy token value contains no ownership token. Stop generating a separate verification secret for `store_domains`.

When searching existing bindings by hostname, ignore `status='removed'` so the hostname can be safely rebound.

- [ ] **Step 5: Preserve existing quota/idempotency safeguards and run GREEN**

```bash
npx --yes tsx --test tests/cloudflare-domain-provisioning.test.mts
npm run cloudflare-saas:test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cloudflare-saas/domain-provisioning.ts src/lib/cloudflare-saas/domain-provisioning-repository.ts tests/cloudflare-domain-provisioning.test.mts
git commit -m "feat: gate domain provisioning on cname"
```

---

### Task 4: Add manual provider checks and atomic first/replacement cutover

**Files:**
- Create: `src/lib/custom-domain-lifecycle/core.ts`
- Create: `src/lib/custom-domain-lifecycle/drizzle-repository.ts`
- Create: `src/lib/custom-domain-lifecycle/server.ts`
- Modify: `src/lib/cloudflare-saas/domain-sync.ts`
- Modify: `src/lib/cloudflare-saas/domain-sync-repository.ts`
- Create: `tests/custom-domain-lifecycle.test.mts`
- Modify: `tests/cloudflare-domain-sync.test.mts`

**Interfaces:**
- Produces `checkOwnedCandidate(merchantId, storeId, now)`.
- Produces `DOMAIN_PROVIDER_CHECK_COOLDOWN_MS = 60_000`.
- Produces `DOMAIN_RETIREMENT_MS = 86_400_000`.

- [ ] **Step 1: Write failing lifecycle tests**

Cover:
- first ready candidate -> primary;
- replacement -> old primary retiring, new primary;
- retire deadline exactly +24h;
- concurrent provider checks -> one Cloudflare sync call;
- Store/Tenant/plan changes between initial read and locked cutover -> no swap.

Example:

```ts
test("replacement cutover retires old primary for exactly 24 hours", async () => {
  const now = new Date("2026-09-23T21:00:00Z");
  const repo = lifecycleRepo({
    primary: primaryDomain(1, "old.example.com"),
    candidate: readyCandidate(2, "new.example.com"),
  });
  await lifecycleService(repo, syncReady()).checkOwnedCandidate(7, 42, now);
  assert.equal(repo.primary.id, 2);
  assert.equal(repo.retiring.id, 1);
  assert.equal(repo.retiring.retireAt.toISOString(), "2026-09-24T21:00:00.000Z");
  assert.equal(repo.retiring.redirectToDomainId, 2);
});
```

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/custom-domain-lifecycle.test.mts tests/cloudflare-domain-sync.test.mts
```

- [ ] **Step 3: Reserve provider check before Cloudflare I/O**

Repository method `reserveOwnedCandidateCheck` must:
- join merchant ownership, Store, Tenant, subscription, and plan;
- require provisioned Store, active Tenant, active Medium/Large plan, subscription pending/trialing/active;
- lock candidate;
- enforce `last_manual_check_at + 60s`;
- persist `last_manual_check_at=now` before returning ready.

- [ ] **Step 4: Keep sync provider-focused**

`CloudflareDomainSyncService` may continue setting routing status `active` when provider+Tenant are ready, but it must never set lifecycle role or `isPrimary`. Candidate remains non-routable until lifecycle cutover.

- [ ] **Step 5: Implement atomic cutover**

Use a per-Tenant advisory transaction lock:

```ts
await tx.execute(
  sql$SELECT pg_advisory_xact_lock(hashtext('shopnest_domain_lifecycle'), ${tenantId})$
);
```

Under the lock, re-read Store/Tenant/plan/subscription/candidate/current primary.

Require:
- candidate role candidate;
- candidate status active;
- Cloudflare provider hostname status active;
- SSL active;
- Tenant active;
- Store provisioned/not deleted;
- Medium/Large entitlement still valid.

First activation:
`candidate -> primary`, `isPrimary=true`.

Replacement in one transaction:
- old primary -> retiring, `isPrimary=false`, `retireAt=now+24h`, redirect to candidate id;
- candidate -> primary, `isPrimary=true`, retirement metadata null.

Any failed re-read aborts the whole transaction.

- [ ] **Step 6: Clear all domain-registry cache after activation/cutover**

```ts
getDomainRegistryService().clear();
```

No scheduling or polling.

- [ ] **Step 7: Run GREEN and commit**

```bash
npx --yes tsx --test tests/custom-domain-lifecycle.test.mts tests/cloudflare-domain-sync.test.mts
npm run cloudflare-saas:test
git add src/lib/custom-domain-lifecycle src/lib/cloudflare-saas/domain-sync.ts src/lib/cloudflare-saas/domain-sync-repository.ts tests/custom-domain-lifecycle.test.mts tests/cloudflare-domain-sync.test.mts
git commit -m "feat: add atomic custom domain cutover"
```

---

### Task 5: Add removal, lazy cleanup, and symmetric rollback

**Files:**
- Modify: `src/lib/cloudflare-saas/domain-removal.ts`
- Modify: `src/lib/cloudflare-saas/domain-removal-repository.ts`
- Modify: `src/lib/custom-domain-lifecycle/core.ts`
- Modify: `src/lib/custom-domain-lifecycle/drizzle-repository.ts`
- Modify: `src/lib/custom-domain-lifecycle/server.ts`
- Modify: `tests/cloudflare-domain-removal.test.mts`
- Modify: `tests/custom-domain-lifecycle.test.mts`

**Interfaces:**
- Produces `cleanupExpiredRetiringForOwnedStore`.
- Produces `cleanupExpiredRetiringForTenantSlug`.
- Produces `rollbackRetiringDomainForAdmin`.

- [ ] **Step 1: Write failing tests**

Test local-first removal order, expired retirement cleanup failure/retry, rollback expiry, and symmetric swap.

```ts
test("provider delete failure never re-enables expired retiring domain", async () => {
  const repo = retirementRepo(expiredRetiringDomain());
  const provider = failingDeleteProvider();
  await assert.rejects(() => lifecycleService(repo, provider).cleanupExpiredRetiringForOwnedStore(7, 42));
  assert.equal(repo.domain.status, "removed");
  assert.equal(repo.domain.lifecycleRole, null);
  assert.equal(repo.domain.providerHostnameId, "cf-old");
});
```

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/cloudflare-domain-removal.test.mts tests/custom-domain-lifecycle.test.mts
```

- [ ] **Step 3: Make removal local-first and lifecycle-aware**

Before provider delete, atomically set:

```ts
{
  status: "removed",
  lifecycleRole: null,
  isPrimary: false,
  retireAt: null,
  redirectToDomainId: null,
  providerLastErrorCode: null,
  providerLastErrorAt: null,
  updatedAt: input.now,
}
```

Keep `providerHostnameId` until provider delete succeeds or returns 404.

- [ ] **Step 4: Implement lazy expired-retirement cleanup**

Under Tenant lifecycle lock:
1. find retiring row with `retireAt <= now`;
2. mark it removed locally first;
3. clear registry cache;
4. delete Cloudflare hostname;
5. success/404 clears provider metadata;
6. other error records `CLOUDFLARE_DELETE_ERROR` and keeps provider id for later retry.

Page load, manual check, removal action, and Admin domain load call this service; no worker exists.

- [ ] **Step 5: Implement symmetric rollback**

Input:

```ts
rollbackRetiringDomain(input: {
  tenantSlug: string;
  restoreHostname: string;
  now: Date;
}): Promise<{
  restoredHostname: string;
  retiringHostname: string;
}>;
```

Under the lifecycle lock:
- retiring row must exist and `retireAt > now`;
- it must redirect to current primary;
- restore old -> primary;
- current primary -> retiring for a fresh 24h, redirecting to restored old;
- clear registry cache.

- [ ] **Step 6: Run GREEN and commit**

```bash
npx --yes tsx --test tests/cloudflare-domain-removal.test.mts tests/custom-domain-lifecycle.test.mts
npm run cloudflare-saas:test
git add src/lib/cloudflare-saas/domain-removal.ts src/lib/cloudflare-saas/domain-removal-repository.ts src/lib/custom-domain-lifecycle tests/cloudflare-domain-removal.test.mts tests/custom-domain-lifecycle.test.mts
git commit -m "feat: add domain retirement and rollback"
```

---

### Task 6: Extend trusted routing for primary and retiring domains

**Files:**
- Modify: `src/lib/domain-registry/core.ts`
- Modify: `src/lib/domain-registry/drizzle-repository.ts`
- Modify: `src/lib/domain-registry/server.ts`
- Modify: `src/middleware.ts`
- Modify: `tests/domain-registry.test.mts`
- Modify: `tests/tenant.test.mts`
- Modify: `tests/route-navigation.test.mjs`

**Interfaces:**
- Produces `TrustedDomainResolution = tenant | redirect`.
- Produces `resolvePrimaryDomainForTenantSlug(slug)`.

- [ ] **Step 1: Write failing registry tests**

```ts
test("candidate cannot route even when status is active", () => {
  assert.equal(
    trustedDomainFromRegistryRecord({ ...ACTIVE_RECORD, lifecycleRole: "candidate" }, Date.now()),
    null
  );
});

test("retiring domain redirects only inside its retirement window", () => {
  const now = new Date("2026-09-23T22:00:00Z").getTime();
  assert.deepEqual(
    trustedDomainFromRegistryRecord({
      ...ACTIVE_RECORD,
      lifecycleRole: "retiring",
      retireAt: new Date("2026-09-24T22:00:00Z"),
      redirectTargetHostname: "new.example.com",
    }, now),
    { kind: "redirect", hostname: "store.example", targetHostname: "new.example.com" }
  );
});
```

Also test expired retiring -> null.

- [ ] **Step 2: Add redirect-safety tests**

Assert:
- platform GET/HEAD storefront navigation can 302 to primary custom host;
- POST does not 302;
- tenant API/media handlers do not 302;
- retiring custom Host 302 preserves path/query;
- redirect target comes from control-plane registry, not request data.

- [ ] **Step 3: Run RED**

```bash
npm run domain-registry:test
npm run routing:test
```

- [ ] **Step 4: Implement registry union**

```ts
export type TrustedDomainResolution =
  | { kind: "tenant"; hostname: string; tenant: TrustedTenant }
  | { kind: "redirect"; hostname: string; targetHostname: string };
```

Primary requires status active + role primary + active trusted Tenant.

Retiring requires status active + role retiring + unexpired `retireAt` + redirect target that is an active primary for the same Tenant.

Add `findPrimaryByTenantSlug` and cache it with the existing 5-second TTL. `clear()` clears both caches.

- [ ] **Step 5: Implement middleware behavior**

For non-platform Host:
- tenant result -> existing rewrite;
- redirect result -> HTTP 302 to `https://<target><same pathname><same query>`.

For platform path-mode Tenant:
- only GET/HEAD;
- only when `!isTenantHandlerPath(internalPath)`;
- if active primary exists, HTTP 302 to its HTTPS host preserving internal path/query;
- otherwise continue current path-mode behavior.

Do not redirect global callbacks or mutate POST semantics.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run domain-registry:test
npm run routing:test
npx --yes tsx --test tests/tenant.test.mts
git add src/lib/domain-registry src/middleware.ts tests/domain-registry.test.mts tests/tenant.test.mts tests/route-navigation.test.mjs
git commit -m "feat: route primary and retiring custom domains"
```

---

### Task 7: Build merchant domain read model, actions, and UI

**Files:**
- Create: `src/lib/merchant-domains/core.ts`
- Create: `src/lib/merchant-domains/drizzle-repository.ts`
- Create: `src/lib/merchant-domains/server.ts`
- Create: `src/app/(merchant)/dashboard/stores/[id]/domain/page.tsx`
- Create: `src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts`
- Create: `src/app/(merchant)/dashboard/stores/[id]/domain/DomainManager.tsx`
- Modify: `src/app/(merchant)/dashboard/stores/[id]/page.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/he.json`
- Create: `tests/merchant-domain-routes.test.mts`
- Modify: `tests/merchant-store-routes.test.mts`

**Interfaces:**
- Produces `MerchantDomainView`.
- Server actions: start claim, TXT check, CNAME check+provision, provider check, remove primary.

- [ ] **Step 1: Write failing route/auth tests**

```ts
test("merchant domain actions derive authority server-side", async () => {
  const actions = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts", "utf8"
  );
  assert.match(actions, /requireMerchantPage\(\)/);
  assert.match(actions, /parseStoreId/);
  assert.doesNotMatch(
    actions,
    /tenantId:\s*formData|schemaName:\s*formData|providerHostnameId:\s*formData|lifecycleRole:\s*formData/
  );
});

test("merchant domain client never polls DNS or Cloudflare", async () => {
  const ui = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/domain/DomainManager.tsx", "utf8"
  );
  assert.doesNotMatch(ui, /setInterval\([^,]+,\s*(?:5000|5_000|300000|300_000)/);
});
```

Add translation parity and cross-Store isolation tests.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/merchant-domain-routes.test.mts tests/merchant-store-routes.test.mts
```

- [ ] **Step 3: Implement owned read model**

```ts
export type MerchantDomainView = {
  storeId: number;
  storeSlug: string;
  platformUrl: string;
  currentPrimary: { hostname: string } | null;
  retiring: {
    hostname: string;
    redirectToHostname: string;
    retireAt: string;
  } | null;
  candidate: {
    hostname: string;
    providerHostnameStatus: string | null;
    providerSslStatus: string | null;
    nextProviderCheckAt: string | null;
  } | null;
  claim: {
    hostname: string;
    status: "pending_verification" | "verified";
    expiresAt: string;
    verifiedAt: string | null;
    cnameVerifiedAt: string | null;
    nextTxtCheckAt: string | null;
    nextCnameCheckAt: string | null;
  } | null;
};
```

Repository queries only through owned Store/organization/Tenant. Before returning state, server calls lazy cleanup for that Store.

- [ ] **Step 4: Implement narrow server actions**

All actions begin with authenticated merchant and parsed Store id.

CNAME action:
1. verify direct CNAME;
2. only when verified call `provisionVerifiedClaim`;
3. revalidate page.

Provider action calls `checkOwnedCandidate` and accepts no provider identity/status.

Removal action resolves and verifies owned primary server-side before calling removal.

- [ ] **Step 5: Preserve plaintext token secrecy across UI behavior**

Start/reissue action returns `dnsName`, `dnsValue`, `expiresAt` directly to the client and does not persist plaintext.

After refresh, if a pending claim exists but the client no longer has the plaintext token, display:

English: `For security, ShopNest does not store the verification code. Create a new code to display the TXT value again.`

Hebrew: `מטעמי אבטחה ShopNest אינו שומר את קוד האימות. צור קוד חדש כדי להציג שוב את ערך ה-TXT.`

The reissue action cancels/replaces the old pending claim and returns a fresh token.

- [ ] **Step 6: Build two-step UI and countdown-only timers**

Show:
- current active Store address;
- clear statement that unfinished setup changes nothing;
- TXT Name/Value copy controls and 24h token countdown;
- DNS registrar/provider instructions;
- 60s disabled check buttons with countdown;
- direct CNAME `customers.shopnest.co.il`;
- Cloudflare hostname and SSL states;
- no automatic network checks;
- active TXT-cleanup guidance only after full activation;
- replacement message that current domain stays live until cutover;
- remove action for current primary.

A one-second client timer is allowed only to redraw countdown text, never to call a server action.

- [ ] **Step 7: Add translations and Store-detail link**

Create matching `MerchantDomain` objects in `en.json` and `he.json`. Include keys for setup intro, DNS-provider help, safe abandonment, TXT/CNAME instructions, propagation warning, statuses, cooldown, SSL, remove, replacement, and token reissue.

Add `manageDomain` to `MerchantStore` in both locales and link provisioned Store detail to `/dashboard/stores/<id>/domain`.

- [ ] **Step 8: Run GREEN and commit**

```bash
npx --yes tsx --test tests/merchant-domain-routes.test.mts tests/merchant-store-routes.test.mts tests/domain-claims.test.mts tests/custom-domain-lifecycle.test.mts
git add src/lib/merchant-domains 'src/app/(merchant)/dashboard/stores/[id]/domain' 'src/app/(merchant)/dashboard/stores/[id]/page.tsx' src/messages/en.json src/messages/he.json tests/merchant-domain-routes.test.mts tests/merchant-store-routes.test.mts
git commit -m "feat: add merchant custom domain manager"
```

---

### Task 8: Add Super Admin rollback, operator fallback, and acceptance tooling

**Files:**
- Modify: `src/app/admin/stores/[slug]/page.tsx`
- Modify: `src/app/admin/_actions/stores.ts`
- Modify: `src/lib/custom-domain-lifecycle/server.ts`
- Create: `scripts/domain-rollback.mts`
- Create: `scripts/domain-lifecycle-smoke.mts`
- Modify: `package.json`
- Create: `tests/custom-domain-admin.test.mts`
- Create: `tests/domain-lifecycle-smoke.test.mts`
- Modify: `tests/admin-auth.test.mts`

**Interfaces:**
- Admin action calls `rollbackRetiringDomainForAdmin(tenantSlug, restoreHostname, now)` after `requireSuperAdmin()`.
- CLI: `npm run domain:rollback -- --tenant-slug <slug> --restore-hostname <hostname>`.
- Smoke: one explicit action per invocation; never polls.

- [ ] **Step 1: Write failing Admin/CLI tests**

```ts
test("rollback action re-authorizes super admin", async () => {
  const source = await readFile("src/app/admin/_actions/stores.ts", "utf8");
  const start = source.indexOf("rollbackCustomDomainAction");
  assert.ok(start >= 0);
  const action = source.slice(start);
  assert.match(action, /requireSuperAdmin\(\)/);
  assert.match(action, /rollbackRetiringDomainForAdmin/);
});

test("operator rollback never accepts schema or provider id arguments", async () => {
  const source = await readFile("scripts/domain-rollback.mts", "utf8");
  assert.match(source, /--tenant-slug/);
  assert.match(source, /--restore-hostname/);
  assert.doesNotMatch(source, /--schema|--provider-id/);
});
```

Smoke test must assert no `setInterval`, infinite loop, or five-minute timer.

- [ ] **Step 2: Run RED**

```bash
npx --yes tsx --test tests/custom-domain-admin.test.mts tests/domain-lifecycle-smoke.test.mts tests/admin-auth.test.mts
```

- [ ] **Step 3: Add Super Admin rollback action/UI**

Action:

```ts
export async function rollbackCustomDomainAction(formData: FormData) {
  await requireSuperAdmin();
  const tenantSlug = z.string().trim().min(1).max(63).parse(formData.get("tenantSlug"));
  const restoreHostname = validateClaimHostname(formData.get("restoreHostname"));
  await getCustomDomainLifecycleService().rollbackRetiringDomainForAdmin(
    tenantSlug,
    restoreHostname,
    new Date()
  );
  revalidatePath("/admin/stores/" + tenantSlug);
  redirect("/admin/stores/" + tenantSlug + "?domainRollback=1");
}
```

Store Admin page shows current primary, retiring hostname/deadline, and rollback form only while unexpired. Page load also invokes lazy cleanup for expired retirement.

- [ ] **Step 4: Add operator rollback CLI**

CLI accepts exactly tenant slug and restore hostname, loads server env, validates hostname, executes one rollback, prints restored/retiring hostnames, exits non-zero on typed failure.

Package script:

```json
"domain:rollback": "npx --yes tsx --conditions=react-server scripts/domain-rollback.mts"
```

- [ ] **Step 5: Add one-action smoke helper**

Actions: `start-claim`, `check-txt`, `check-cname`, `check-provider`, `remove`, `show`.

Required `--store-id` and `--action`; hostname required only for hostname-specific actions. Execute one action then exit.

Add:

```json
"domain-lifecycle:smoke": "npx --yes tsx --conditions=react-server scripts/domain-lifecycle-smoke.mts",
"merchant-domain:test": "npx --yes tsx --test tests/domain-claims.test.mts tests/cloudflare-domain-provisioning.test.mts tests/cloudflare-domain-sync.test.mts tests/cloudflare-domain-removal.test.mts tests/custom-domain-lifecycle.test.mts tests/domain-registry.test.mts tests/merchant-domain-routes.test.mts tests/custom-domain-admin.test.mts tests/domain-lifecycle-smoke.test.mts"
```

- [ ] **Step 6: Run feature and regression suites**

```bash
npm run merchant-domain:test
npm run cloudflare-saas:test
npm run domain-registry:test
npm run routing:test
npm run merchant-auth:test
npm run merchant-subscription:test
npm run control-plane:test
npm run admin-auth:test
npm run build
```

Expected: all PASS; build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/stores/[slug]/page.tsx src/app/admin/_actions/stores.ts src/lib/custom-domain-lifecycle/server.ts scripts/domain-rollback.mts scripts/domain-lifecycle-smoke.mts package.json tests/custom-domain-admin.test.mts tests/domain-lifecycle-smoke.test.mts tests/admin-auth.test.mts
git commit -m "feat: add custom domain operator controls"
```

- [ ] **Step 8: DEV migration and acceptance**

Run migration:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml exec -T web-dev npm run control-plane:migrate
docker compose --env-file .env.dev -f docker-compose.dev.yml exec -T db-dev psql -U shopnest -d shopnest -c "
SELECT lifecycle_role, status, hostname, cname_verified_at, last_manual_check_at, retire_at
FROM public.store_domains
ORDER BY id;
"
```

Verify existing PR #46 active domain becomes primary even if old `is_primary=false`.

Then manually verify:
1. TXT claim/reissue and 60s cooldown.
2. TXT verification.
3. direct CNAME verification.
4. Cloudflare hostname created only after CNAME passes.
5. manual provider check; no polling.
6. first activation and platform slug 302.
7. replacement with old domain live until cutover.
8. old domain 302 after cutover.
9. Admin rollback and symmetric 302.
10. removal restores platform slug immediately.
11. unknown Host still 404/fail-closed.

- [ ] **Step 9: STAGING migration and acceptance**

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T web-staging npm run control-plane:migrate
```

Before provider mutation, verify existing staging domain rows and Store/Tenant bindings remain intact. Repeat the approved test-host flow. Do not redesign production fallback-origin topology and do not introduce arbitrary Nginx `default_server` changes in this PR.

- [ ] **Step 10: Final branch gate**

```bash
git status --short
npm run merchant-domain:test
npm run cloudflare-saas:test
npm run domain-registry:test
npm run routing:test
npm run build
```

Expected: clean tree, all PASS, build PASS. Request whole-branch review. Do not merge without explicit user approval.

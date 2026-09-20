# Organization / Business Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the control-plane Organization / Business ownership layer for authenticated merchants, including create/view/edit of the first business with server-authoritative owner membership and no tenant/store provisioning.

**Architecture:** Add two public control-plane tables (`organizations` and `organization_memberships`), a focused merchant-organization domain/repository boundary, and global merchant-dashboard routes. Creation is serialized and transactional in the Drizzle repository so concurrent first-business submissions cannot create duplicate organizations, while the schema itself remains future-ready for multiple organizations per merchant. All authorization comes from the verified merchant session plus server-side membership lookup; tenant databases are never touched.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, PostgreSQL 17, Drizzle ORM, Zod, next-intl, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-19-organization-business-model-design.md`

## Global Constraints

- Organization data lives only in the public control plane; no tenant schema access.
- Merchant identity, Organization, Store, Tenant, subscription, payment, and invoicing remain separate domains.
- `display_name` is required and is not globally unique.
- Optional organization fields: `legal_name`, `business_number`, `vat_number`, `email`, `phone`; `country` defaults to `IL`.
- PR #36 behaviorally implements only the `owner` role.
- The data model must permit future multiple organizations per merchant and multiple merchants per organization.
- The browser must never be authoritative for `merchant_account_id`, membership role, or organization authorization.
- Organization creation must atomically create the organization plus owner membership.
- The current UI manages only the authenticated merchant's first organization and must not expose creation of a second one.
- No organization deletion, ownership transfer, invitations, admin-role UI, store creation, slug, tenant provisioning, billing, payment-provider, invoicing-provider, branding, content, or promotions.
- Migrations must be additive, journaled, safe on existing DEV/STAGING databases, and require no destructive reset.
- Do not use `docker compose down -v`.
- Merge only after explicit user approval.

## Review Focus

- Concurrent/double first-business submissions must produce one organization, not two; repository creation must serialize on the merchant row and re-check membership inside the transaction.
- Whitespace-only or overlong business names must fail validation without any database write.
- Extra form fields such as `merchantAccountId`, `role`, or `organizationId` must not influence ownership or authorization.
- A merchant with no owner membership for an organization must not be able to update it, even if they know its numeric id.
- Blank optional fields must normalize to `null`, while malformed nonblank email and malformed country codes must fail validation rather than being silently stored.

## File Map

**Create**
- `src/drizzle/control-schema/organization.ts` — Organization profile persistence.
- `src/drizzle/control-schema/organizationMembership.ts` — merchant-to-organization membership relation.
- `src/drizzle/control-migrations/0007_organization_business.sql` — additive public control-plane migration.
- `src/lib/merchant-organizations/core.ts` — types, validation, repository contract, owner-role policy.
- `src/lib/merchant-organizations/drizzle-repository.ts` — transactional control-plane persistence and membership authorization.
- `src/lib/merchant-organizations/server.ts` — server-only repository accessor.
- `src/app/(merchant)/dashboard/business/_actions.ts` — create/edit server actions.
- `src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx` — shared create/edit form.
- `src/app/(merchant)/dashboard/business/page.tsx` — business view.
- `src/app/(merchant)/dashboard/business/new/page.tsx` — first-business creation page.
- `src/app/(merchant)/dashboard/business/edit/page.tsx` — owner edit page.
- `tests/merchant-organization.test.mts` — domain, repository-boundary, and isolation tests.
- `tests/merchant-organization-routes.test.mts` — action/UI authorization and routing tests.

**Modify**
- `src/drizzle/control-plane-schema.ts` — export Organization schemas.
- `src/drizzle/control-migrations/meta/_journal.json` — register migration 0007.
- `src/app/(merchant)/dashboard/page.tsx` — first-business dashboard state.
- `src/messages/en.json` and `src/messages/he.json` — aligned business workspace copy.
- `tests/control-plane.test.mts` — migration/additivity assertions.
- `tests/merchant-auth-routes.test.mts` — preserve merchant-only dashboard boundary.
- `package.json` — add organization test script.

---

### Task 1: Add Organization control-plane schema and migration

**Files:**
- Create: `src/drizzle/control-schema/organization.ts`
- Create: `src/drizzle/control-schema/organizationMembership.ts`
- Modify: `src/drizzle/control-plane-schema.ts`
- Create: `src/drizzle/control-migrations/0007_organization_business.sql`
- Modify: `src/drizzle/control-migrations/meta/_journal.json`
- Modify: `tests/control-plane.test.mts`

**Interfaces:**
- Consumes: existing `merchantAccounts.id` from `src/drizzle/control-schema/merchantAccount.ts`.
- Produces: `organizations` and `organizationMemberships` Drizzle tables exported from `@/drizzle/control-plane-schema`.

- [ ] **Step 1: Write failing migration/schema tests**

Add to `tests/control-plane.test.mts`:

```ts
test("organization migration is additive, control-plane only, and future-ready", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0007_organization_business.sql",
    "utf8"
  );

  assert.match(sql, /CREATE TABLE "organizations"/);
  assert.match(sql, /"display_name" varchar\(160\) NOT NULL/);
  assert.match(sql, /"country" varchar\(2\) DEFAULT 'IL' NOT NULL/);
  assert.match(sql, /CREATE TABLE "organization_memberships"/);
  assert.match(sql, /"merchant_account_id" integer NOT NULL/);
  assert.match(sql, /"organization_id" integer NOT NULL/);
  assert.match(sql, /"role" varchar\(32\) DEFAULT 'owner' NOT NULL/);
  assert.match(
    sql,
    /PRIMARY KEY\("organization_id","merchant_account_id"\)|PRIMARY KEY\("merchant_account_id","organization_id"\)/
  );
  assert.doesNotMatch(sql, /UNIQUE[^\n]*display_name|DROP TABLE|DELETE FROM|TRUNCATE|search_path/);
});

test("organization migration is registered after merchant identity", async () => {
  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) => candidate.tag === "0007_organization_business"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 7);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx --yes tsx --test tests/control-plane.test.mts
```

Expected: FAIL because `0007_organization_business.sql` and the journal entry do not exist.

- [ ] **Step 3: Add the Drizzle table definitions**

Create `src/drizzle/control-schema/organization.ts`:

```ts
import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  legalName: varchar("legal_name", { length: 200 }),
  businessNumber: varchar("business_number", { length: 64 }),
  vatNumber: varchar("vat_number", { length: 64 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  country: varchar("country", { length: 2 }).notNull().default("IL"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

Create `src/drizzle/control-schema/organizationMembership.ts`:

```ts
import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { merchantAccounts } from "./merchantAccount";
import { organizations } from "./organization";

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    merchantAccountId: integer("merchant_account_id")
      .notNull()
      .references(() => merchantAccounts.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.merchantAccountId],
    }),
  ]
);
```

Append exports to `src/drizzle/control-plane-schema.ts`:

```ts
export * from "@/drizzle/control-schema/organization";
export * from "@/drizzle/control-schema/organizationMembership";
```

Do not add a PostgreSQL enum for membership roles in this PR. A `varchar(32)` keeps the relationship schema extensible for future roles without coupling the database shape to the initial `owner`-only behavior.

- [ ] **Step 4: Add the journaled additive migration**

Create `src/drizzle/control-migrations/0007_organization_business.sql`:

```sql
CREATE TABLE "organizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "legal_name" varchar(200),
  "business_number" varchar(64),
  "vat_number" varchar(64),
  "email" varchar(320),
  "phone" varchar(64),
  "country" varchar(2) DEFAULT 'IL' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "organization_memberships" (
  "organization_id" integer NOT NULL,
  "merchant_account_id" integer NOT NULL,
  "role" varchar(32) DEFAULT 'owner' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_memberships_organization_id_merchant_account_id_pk"
    PRIMARY KEY("organization_id","merchant_account_id")
);--> statement-breakpoint
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_merchant_account_id_merchant_accounts_id_fk"
  FOREIGN KEY ("merchant_account_id")
  REFERENCES "public"."merchant_accounts"("id")
  ON DELETE cascade ON UPDATE no action;
```

Append this exact entry to `src/drizzle/control-migrations/meta/_journal.json` after `0006_merchant_identity`:

```json
{
  "idx": 7,
  "version": "7",
  "when": 1789819200000,
  "tag": "0007_organization_business",
  "breakpoints": true
}
```

The current control-migration history intentionally has hand-maintained additive migrations after snapshot `0004`; do not run Drizzle generation in this task because it could synthesize unrelated diffs from the stale snapshot chain.

- [ ] **Step 5: Run the control-plane test and verify GREEN**

Run:

```bash
npx --yes tsx --test tests/control-plane.test.mts
```

Expected: PASS, including the two new organization migration tests.

- [ ] **Step 6: Commit the schema/migration slice**

```bash
git add src/drizzle/control-schema/organization.ts   src/drizzle/control-schema/organizationMembership.ts   src/drizzle/control-plane-schema.ts   src/drizzle/control-migrations   tests/control-plane.test.mts
git commit -m "feat: add organization control-plane schema"
```

---

### Task 2: Add the merchant-organization domain contract and validation

**Files:**
- Create: `src/lib/merchant-organizations/core.ts`
- Create: `tests/merchant-organization.test.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: authenticated merchant ids as numbers.
- Produces:
  - `OrganizationRole = "owner"`
  - `OrganizationProfile`
  - `MerchantOrganization`
  - `OrganizationRepository`
  - `organizationProfileSchema`
  - `parseOrganizationProfile(input: unknown): OrganizationProfile`
  - `canMutateOrganization(role: string): boolean`

- [ ] **Step 1: Write failing domain tests**

Create `tests/merchant-organization.test.mts` with the initial tests:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canMutateOrganization,
  parseOrganizationProfile,
} from "../src/lib/merchant-organizations/core.ts";

test("organization profile requires a nonblank display name and normalizes optional blanks", () => {
  assert.throws(
    () => parseOrganizationProfile({ displayName: "   ", country: "IL" }),
    /invalid_organization_profile/
  );

  assert.deepEqual(
    parseOrganizationProfile({
      displayName: "  Shahar Commerce  ",
      legalName: " ",
      businessNumber: "",
      vatNumber: "  ",
      email: "",
      phone: " ",
      country: "il",
    }),
    {
      displayName: "Shahar Commerce",
      legalName: null,
      businessNumber: null,
      vatNumber: null,
      email: null,
      phone: null,
      country: "IL",
    }
  );
});

test("organization profile rejects malformed email, country, and overlong names", () => {
  for (const input of [
    { displayName: "Business", email: "not-an-email", country: "IL" },
    { displayName: "Business", email: "", country: "ISR" },
    { displayName: "x".repeat(161), email: "", country: "IL" },
  ]) {
    assert.throws(
      () => parseOrganizationProfile(input),
      /invalid_organization_profile/
    );
  }
});

test("organization profile strips browser supplied authority fields", () => {
  const parsed = parseOrganizationProfile({
    displayName: "Business",
    country: "IL",
    merchantAccountId: 999,
    organizationId: 999,
    role: "owner",
  });

  assert.deepEqual(parsed, {
    displayName: "Business",
    legalName: null,
    businessNumber: null,
    vatNumber: null,
    email: null,
    phone: null,
    country: "IL",
  });
});

test("only owner can mutate organizations in PR 36", () => {
  assert.equal(canMutateOrganization("owner"), true);
  assert.equal(canMutateOrganization("admin"), false);
  assert.equal(canMutateOrganization(""), false);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npx --yes tsx --test tests/merchant-organization.test.mts
```

Expected: FAIL because `src/lib/merchant-organizations/core.ts` does not exist.

- [ ] **Step 3: Implement the focused domain contract**

Create `src/lib/merchant-organizations/core.ts`:

```ts
import { z } from "zod";

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .default("")
    .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .optional()
  .default("")
  .refine((value) => value === "" || z.string().email().safeParse(value).success)
  .transform((value) => value || null);

export const organizationProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  legalName: optionalText(200),
  businessNumber: optionalText(64),
  vatNumber: optionalText(64),
  email: optionalEmail,
  phone: optionalText(64),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .default("IL"),
}).strip();

export type OrganizationRole = "owner";

export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;

export type MerchantOrganization = OrganizationProfile & {
  id: number;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateFirstOrganizationResult =
  | { kind: "created"; organization: MerchantOrganization }
  | { kind: "already_exists"; organization: MerchantOrganization };

export interface OrganizationRepository {
  findFirstForMerchant(merchantId: number): Promise<MerchantOrganization | null>;
  createFirstWithOwner(
    merchantId: number,
    profile: OrganizationProfile
  ): Promise<CreateFirstOrganizationResult>;
  updateOwned(
    merchantId: number,
    organizationId: number,
    profile: OrganizationProfile
  ): Promise<MerchantOrganization | null>;
}

export function parseOrganizationProfile(input: unknown): OrganizationProfile {
  const parsed = organizationProfileSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_organization_profile");
  return parsed.data;
}

export function canMutateOrganization(role: string) {
  return role === "owner";
}
```

- [ ] **Step 4: Add a repeatable test script**

Add to `package.json` scripts:

```json
"merchant-organization:test": "node --experimental-strip-types --test tests/merchant-organization.test.mts tests/merchant-organization-routes.test.mts"
```

The route test file is added in Task 4. Until then, run the focused file directly with `tsx`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npx --yes tsx --test tests/merchant-organization.test.mts
```

Expected: PASS.

- [ ] **Step 6: Commit the domain contract**

```bash
git add src/lib/merchant-organizations/core.ts   tests/merchant-organization.test.mts   package.json
git commit -m "feat: add merchant organization domain"
```

---

### Task 3: Implement the control-plane repository with atomic first-business creation

**Files:**
- Create: `src/lib/merchant-organizations/drizzle-repository.ts`
- Create: `src/lib/merchant-organizations/server.ts`
- Modify: `tests/merchant-organization.test.mts`

**Interfaces:**
- Consumes: `OrganizationRepository`, `OrganizationProfile`, `MerchantOrganization`, `merchantAccounts`, `organizations`, `organizationMemberships`, `getControlPlaneDb()`.
- Produces:
  - `DrizzleOrganizationRepository implements OrganizationRepository`
  - `getMerchantOrganizationRepository(): OrganizationRepository`

- [ ] **Step 1: Add failing repository-boundary tests**

Append to `tests/merchant-organization.test.mts`:

```ts
import { readFile } from "node:fs/promises";

test("organization persistence stays control-plane only and first creation is serialized", async () => {
  const source = await readFile(
    "src/lib/merchant-organizations/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /\.transaction\(/);
  assert.match(source, /merchantAccounts/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /organizationMemberships/);
  assert.match(source, /role:\s*"owner"/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|sql\.raw|search_path/
  );
});

test("repository update requires owner membership in addition to organization id", async () => {
  const source = await readFile(
    "src/lib/merchant-organizations/drizzle-repository.ts",
    "utf8"
  );

  const updateStart = source.indexOf("async updateOwned");
  assert.ok(updateStart >= 0);
  const updateSource = source.slice(updateStart);
  assert.match(updateSource, /merchantAccountId/);
  assert.match(updateSource, /organizationId/);
  assert.match(updateSource, /role/);
  assert.match(updateSource, /owner/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx --yes tsx --test tests/merchant-organization.test.mts
```

Expected: FAIL because the Drizzle repository file does not exist.

- [ ] **Step 3: Implement the Drizzle repository**

Create `src/lib/merchant-organizations/drizzle-repository.ts` following this structure:

```ts
import { and, asc, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  merchantAccounts,
  organizationMemberships,
  organizations,
} from "@/drizzle/control-plane-schema";
import type {
  CreateFirstOrganizationResult,
  MerchantOrganization,
  OrganizationProfile,
  OrganizationRepository,
} from "./core";

const selection = {
  id: organizations.id,
  displayName: organizations.displayName,
  legalName: organizations.legalName,
  businessNumber: organizations.businessNumber,
  vatNumber: organizations.vatNumber,
  email: organizations.email,
  phone: organizations.phone,
  country: organizations.country,
  role: organizationMemberships.role,
  createdAt: organizations.createdAt,
  updatedAt: organizations.updatedAt,
};

function asMerchantOrganization(
  row: Omit<MerchantOrganization, "role"> & { role: string }
): MerchantOrganization | null {
  if (row.role !== "owner") return null;
  return { ...row, role: "owner" };
}

export class DrizzleOrganizationRepository implements OrganizationRepository {
  async findFirstForMerchant(merchantId: number) {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizationMemberships.organizationId, organizations.id)
      )
      .where(eq(organizationMemberships.merchantAccountId, merchantId))
      .orderBy(asc(organizationMemberships.createdAt), asc(organizations.id))
      .limit(1);

    return row ? asMerchantOrganization(row) : null;
  }

  createFirstWithOwner(
    merchantId: number,
    profile: OrganizationProfile
  ): Promise<CreateFirstOrganizationResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [merchant] = await tx
        .select({ id: merchantAccounts.id })
        .from(merchantAccounts)
        .where(eq(merchantAccounts.id, merchantId))
        .limit(1)
        .for("update");

      if (!merchant) throw new Error("merchant_missing");

      const [existingRow] = await tx
        .select(selection)
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizationMemberships.organizationId, organizations.id)
        )
        .where(eq(organizationMemberships.merchantAccountId, merchantId))
        .orderBy(asc(organizationMemberships.createdAt), asc(organizations.id))
        .limit(1);

      if (existingRow) {
        const existing = asMerchantOrganization(existingRow);
        if (!existing) throw new Error("unsupported_membership_role");
        return { kind: "already_exists", organization: existing };
      }

      const [organization] = await tx
        .insert(organizations)
        .values(profile)
        .returning({
          id: organizations.id,
          displayName: organizations.displayName,
          legalName: organizations.legalName,
          businessNumber: organizations.businessNumber,
          vatNumber: organizations.vatNumber,
          email: organizations.email,
          phone: organizations.phone,
          country: organizations.country,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        });

      await tx.insert(organizationMemberships).values({
        organizationId: organization.id,
        merchantAccountId: merchantId,
        role: "owner",
      });

      return {
        kind: "created",
        organization: { ...organization, role: "owner" },
      };
    });
  }

  updateOwned(
    merchantId: number,
    organizationId: number,
    profile: OrganizationProfile
  ): Promise<MerchantOrganization | null> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [membership] = await tx
        .select({ role: organizationMemberships.role })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.merchantAccountId, merchantId),
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.role, "owner")
          )
        )
        .limit(1)
        .for("update");

      if (!membership) return null;

      const [organization] = await tx
        .update(organizations)
        .set({ ...profile, updatedAt: new Date() })
        .where(eq(organizations.id, organizationId))
        .returning({
          id: organizations.id,
          displayName: organizations.displayName,
          legalName: organizations.legalName,
          businessNumber: organizations.businessNumber,
          vatNumber: organizations.vatNumber,
          email: organizations.email,
          phone: organizations.phone,
          country: organizations.country,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        });

      return organization
        ? { ...organization, role: "owner" }
        : null;
    });
  }
}
```

Important review point: locking the merchant row before checking membership serializes simultaneous first-business submissions for the same merchant without imposing a uniqueness constraint that would block the future multi-organization model.

- [ ] **Step 4: Add the server-only repository accessor**

Create `src/lib/merchant-organizations/server.ts`:

```ts
import "server-only";

import { DrizzleOrganizationRepository } from "./drizzle-repository";

const repository = new DrizzleOrganizationRepository();

export function getMerchantOrganizationRepository() {
  return repository;
}
```

- [ ] **Step 5: Run the organization tests and verify GREEN**

Run:

```bash
npx --yes tsx --test tests/merchant-organization.test.mts
```

Expected: PASS.

- [ ] **Step 6: Commit repository implementation**

```bash
git add src/lib/merchant-organizations/drizzle-repository.ts   src/lib/merchant-organizations/server.ts   tests/merchant-organization.test.mts
git commit -m "feat: add organization persistence"
```

---

### Task 4: Add secure create/edit server actions and route-boundary regression tests

**Files:**
- Create: `src/app/(merchant)/dashboard/business/_actions.ts`
- Create: `tests/merchant-organization-routes.test.mts`

**Interfaces:**
- Consumes: `requireMerchantPage()`, `getMerchantOrganizationRepository()`, `organizationProfileSchema`.
- Produces:
  - `OrganizationActionState`
  - `createOrganizationAction(state, formData)`
  - `updateOrganizationAction(state, formData)`

- [ ] **Step 1: Write failing route/action security tests**

Create `tests/merchant-organization-routes.test.mts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("organization actions derive identity and ownership from the merchant session", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/business/_actions.ts",
    "utf8"
  );

  assert.match(source, /requireMerchantPage\(\)/);
  assert.match(source, /getMerchantOrganizationRepository/);
  assert.match(source, /organizationProfileSchema/);
  assert.match(source, /createFirstWithOwner/);
  assert.match(source, /findFirstForMerchant/);
  assert.match(source, /updateOwned/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["']merchantAccountId|formData\.get\(["']role|formData\.get\(["']organizationId/
  );
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|schemaName|tenantSlug|TENANT_SCHEMA_HEADER/
  );
});

test("organization form parsing strips browser supplied ownership fields", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/business/_actions.ts",
    "utf8"
  );
  assert.match(source, /organizationProfileSchema\.safeParse/);
  assert.match(source, /Object\.fromEntries\(formData\)/);
  assert.doesNotMatch(source, /merchantAccountId:\s*parsed|role:\s*parsed/);
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
npx --yes tsx --test tests/merchant-organization-routes.test.mts
```

Expected: FAIL because the action file does not exist.

- [ ] **Step 3: Implement action state and create action**

Create `src/app/(merchant)/dashboard/business/_actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { organizationProfileSchema } from "@/lib/merchant-organizations/core";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";

export type OrganizationActionState = {
  success: false;
  message?: "invalidBusinessDetails" | "businessUnavailable";
  errors?: Record<string, string[] | undefined>;
};

export async function createOrganizationAction(
  _state: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const merchant = await requireMerchantPage();
  const parsed = organizationProfileSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidBusinessDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  await getMerchantOrganizationRepository().createFirstWithOwner(
    merchant.id,
    parsed.data
  );

  redirect("/dashboard/business");
}
```

The repository handles the already-existing case atomically; the action intentionally redirects to the existing business rather than creating another one.

- [ ] **Step 4: Implement edit action with server-side organization resolution**

Append:

```ts
export async function updateOrganizationAction(
  _state: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const merchant = await requireMerchantPage();
  const parsed = organizationProfileSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidBusinessDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const repository = getMerchantOrganizationRepository();
  const current = await repository.findFirstForMerchant(merchant.id);
  if (!current) redirect("/dashboard/business/new");

  const updated = await repository.updateOwned(
    merchant.id,
    current.id,
    parsed.data
  );

  if (!updated) {
    return { success: false, message: "businessUnavailable" };
  }

  redirect("/dashboard/business");
}
```

This deliberately avoids accepting `merchantAccountId`, `role`, or `organizationId` from the form.

- [ ] **Step 5: Run route tests and verify GREEN**

Run:

```bash
npx --yes tsx --test tests/merchant-organization-routes.test.mts
```

Expected: PASS.

- [ ] **Step 6: Commit secure server actions**

```bash
git add src/app/'(merchant)'/dashboard/business/_actions.ts   tests/merchant-organization-routes.test.mts
git commit -m "feat: add organization actions"
```

---

### Task 5: Add create/view/edit merchant business UI and dashboard integration

**Files:**
- Create: `src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx`
- Create: `src/app/(merchant)/dashboard/business/new/page.tsx`
- Create: `src/app/(merchant)/dashboard/business/edit/page.tsx`
- Create: `src/app/(merchant)/dashboard/business/page.tsx`
- Modify: `src/app/(merchant)/dashboard/page.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/he.json`
- Modify: `tests/merchant-organization-routes.test.mts`
- Modify: `tests/merchant-auth-routes.test.mts`

**Interfaces:**
- Consumes: Task 4 actions, `requireMerchantPage()`, `getMerchantOrganizationRepository()`, `MerchantOrganization`.
- Produces: protected merchant routes `/dashboard/business`, `/dashboard/business/new`, `/dashboard/business/edit`.

- [ ] **Step 1: Add failing UI/routing tests**

Append to `tests/merchant-organization-routes.test.mts`:

```ts
test("merchant business pages are global, protected, and tenant-independent", async () => {
  const [dashboard, business, create, edit] = await Promise.all([
    readFile("src/app/(merchant)/dashboard/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/business/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/business/new/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/business/edit/page.tsx", "utf8"),
  ]);

  for (const source of [dashboard, business, create, edit]) {
    assert.match(source, /requireMerchantPage\(\)/);
    assert.doesNotMatch(
      source,
      /getDbForTenant|getTenant\(|TenantLink|tenantSlug|schemaName/
    );
  }

  assert.match(dashboard, /findFirstForMerchant/);
  assert.match(dashboard, /\/dashboard\/business\/new/);
  assert.match(dashboard, /\/dashboard\/business/);
  assert.match(create, /OrganizationForm/);
  assert.match(edit, /OrganizationForm/);
  assert.match(business, /\/dashboard\/business\/edit/);
});

test("business form exposes profile fields but no authority fields", async () => {
  const form = await readFile(
    "src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx",
    "utf8"
  );

  for (const name of [
    "displayName",
    "legalName",
    "businessNumber",
    "vatNumber",
    "email",
    "phone",
    "country",
  ]) {
    assert.match(form, new RegExp(`name=["']${name}["']`));
  }

  assert.doesNotMatch(
    form,
    /name=["'](?:merchantAccountId|organizationId|role)["']/
  );
});

test("merchant organization translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.deepEqual(
    Object.keys(en.MerchantOrganization).sort(),
    Object.keys(he.MerchantOrganization).sort()
  );
});
```

Update the existing merchant-dashboard protection test in `tests/merchant-auth-routes.test.mts` so it still asserts merchant-only protection after the dashboard begins loading organization data.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
npx --yes tsx --test   tests/merchant-organization-routes.test.mts   tests/merchant-auth-routes.test.mts
```

Expected: FAIL because the business pages/form/translations do not exist.

- [ ] **Step 3: Add aligned English/Hebrew translation namespaces**

Add the same keys under `MerchantOrganization` in both message files.

English values:

```json
"MerchantOrganization": {
  "business": "Business",
  "createBusiness": "Create your business",
  "createBusinessDetail": "Add the business that will own and manage your future ShopNest stores.",
  "businessName": "Business name",
  "legalName": "Legal name",
  "businessNumber": "Business number",
  "vatNumber": "VAT number",
  "businessEmail": "Business email",
  "businessPhone": "Business phone",
  "country": "Country code",
  "countryHint": "Use the two-letter country code. Israel is IL.",
  "creating": "Creating business...",
  "create": "Create business",
  "editing": "Saving...",
  "save": "Save business",
  "invalidBusinessDetails": "Please correct the business details.",
  "businessUnavailable": "This business is not available for your account.",
  "owner": "Owner",
  "role": "Role",
  "editBusiness": "Edit business",
  "backToDashboard": "Back to dashboard",
  "noBusinessTitle": "You haven't created a business yet.",
  "noBusinessDetail": "Create your business before starting store setup.",
  "storeSetupNext": "Store setup will be added in the next onboarding stage."
}
```

Hebrew values:

```json
"MerchantOrganization": {
  "business": "עסק",
  "createBusiness": "יצירת העסק שלך",
  "createBusinessDetail": "הוספת העסק שיחזיק וינהל את חנויות ShopNest העתידיות שלך.",
  "businessName": "שם העסק",
  "legalName": "שם משפטי",
  "businessNumber": "מספר עסק",
  "vatNumber": "מספר עוסק / מע״מ",
  "businessEmail": "אימייל העסק",
  "businessPhone": "טלפון העסק",
  "country": "קוד מדינה",
  "countryHint": "יש להשתמש בקוד מדינה בן שתי אותיות. ישראל היא IL.",
  "creating": "העסק נוצר...",
  "create": "יצירת עסק",
  "editing": "שומר...",
  "save": "שמירת העסק",
  "invalidBusinessDetails": "יש לתקן את פרטי העסק.",
  "businessUnavailable": "העסק הזה אינו זמין עבור החשבון שלך.",
  "owner": "בעלים",
  "role": "תפקיד",
  "editBusiness": "עריכת העסק",
  "backToDashboard": "חזרה ללוח הבקרה",
  "noBusinessTitle": "עדיין לא יצרת עסק.",
  "noBusinessDetail": "יש ליצור עסק לפני שמתחילים בהגדרת החנות.",
  "storeSetupNext": "הגדרת החנות תתווסף בשלב האונבורדינג הבא."
}
```

- [ ] **Step 4: Build the shared client form**

Create `src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx` as a client component using `useActionState`. It receives:

```ts
type OrganizationFormProps = {
  mode: "create" | "edit";
  organization?: MerchantOrganization | null;
};
```

Use:

```ts
const action =
  mode === "create" ? createOrganizationAction : updateOrganizationAction;
const [state, formAction, pending] = useActionState(action, { success: false });
```

Render inputs with these exact authority boundaries:

```tsx
<input name="displayName" required maxLength={160} defaultValue={organization?.displayName ?? ""} />
<input name="legalName" maxLength={200} defaultValue={organization?.legalName ?? ""} />
<input name="businessNumber" maxLength={64} defaultValue={organization?.businessNumber ?? ""} />
<input name="vatNumber" maxLength={64} defaultValue={organization?.vatNumber ?? ""} />
<input name="email" type="email" maxLength={320} defaultValue={organization?.email ?? ""} />
<input name="phone" type="tel" maxLength={64} defaultValue={organization?.phone ?? ""} />
<input name="country" required minLength={2} maxLength={2} defaultValue={organization?.country ?? "IL"} />
```

Do not render hidden inputs for merchant id, organization id, or role. Show `state.message` and field errors from the action.

- [ ] **Step 5: Add protected create/view/edit pages**

`new/page.tsx`:

```tsx
export default async function NewBusinessPage() {
  const merchant = await requireMerchantPage();
  const repository = getMerchantOrganizationRepository();
  const existing = await repository.findFirstForMerchant(merchant.id);
  if (existing) redirect("/dashboard/business");
  return <OrganizationForm mode="create" />;
}
```

`edit/page.tsx`:

```tsx
export default async function EditBusinessPage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(merchant.id);
  if (!organization) redirect("/dashboard/business/new");
  return <OrganizationForm mode="edit" organization={organization} />;
}
```

`business/page.tsx` must:
- call `requireMerchantPage()`
- load `findFirstForMerchant(merchant.id)`
- redirect to `/dashboard/business/new` when absent
- render display name, optional business details, owner role, Edit Business link, and the translated `storeSetupNext` note
- never reference tenant context

- [ ] **Step 6: Integrate the first-business state into `/dashboard`**

Modify `src/app/(merchant)/dashboard/page.tsx` to:
1. keep `requireMerchantPage()`
2. load `findFirstForMerchant(merchant.id)`
3. when absent, show `noBusinessTitle`, `noBusinessDetail`, and a normal Next `Link` to `/dashboard/business/new`
4. when present, show organization display name, `Owner`, and link to `/dashboard/business`
5. retain merchant account information and logout
6. remove the old `storeSetupLater` placeholder in favor of the organization-aware message

- [ ] **Step 7: Run focused UI/routing tests and verify GREEN**

Run:

```bash
npx --yes tsx --test   tests/merchant-organization-routes.test.mts   tests/merchant-auth-routes.test.mts
```

Expected: PASS.

- [ ] **Step 8: Commit the merchant business UI**

```bash
git add src/app/'(merchant)'/dashboard   src/messages/en.json   src/messages/he.json   tests/merchant-organization-routes.test.mts   tests/merchant-auth-routes.test.mts
git commit -m "feat: add merchant business workspace"
```

---

### Task 6: Verify regression coverage, migration safety, and production build

**Files:**
- Modify only if a real regression requires a scoped fix: files already introduced by Tasks 1–5.
- No unrelated refactoring.

**Interfaces:**
- Consumes: complete PR #36 implementation.
- Produces: verified branch ready for DEV acceptance, not yet merge-ready.

- [ ] **Step 1: Run the new organization suites**

Run:

```bash
npx --yes tsx --test   tests/merchant-organization.test.mts   tests/merchant-organization-routes.test.mts
```

Expected: all organization tests PASS.

- [ ] **Step 2: Run merchant-auth and control-plane regressions**

Run:

```bash
npx --yes tsx --test   tests/merchant-auth.test.mts   tests/merchant-auth-routes.test.mts   tests/control-plane.test.mts
```

Expected: PASS.

- [ ] **Step 3: Run customer/admin/routing regressions required by the spec**

Run:

```bash
npx --yes tsx --test   tests/customer-auth.test.mts   tests/admin-auth.test.mts   tests/tenant.test.mts   tests/route-navigation.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Verify no tenant/database boundary regression in the diff**

Run:

```bash
git diff master...HEAD --   src/lib/merchant-organizations   src/app/'(merchant)'/dashboard   src/drizzle/control-schema   src/drizzle/control-plane-schema.ts
```

Review must confirm:
- no `getDbForTenant`
- no `getTenant()`
- no schema header/browser schema selection
- no Store/Tenant/provisioning code
- no provider credentials or new secrets

- [ ] **Step 5: Run a production build**

Run:

```bash
npm run build
```

Expected: successful Next.js production build.

- [ ] **Step 6: Check whitespace and branch status**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no unexpected uncommitted files.

- [ ] **Step 7: Route failures back through TDD instead of patching during verification**

If any verification command fails, stop Task 6, return to the task that owns the failing behavior, add or reuse a failing regression test, make the smallest fix, commit it in that owning task's scope, then restart Task 6 from Step 1. Do not make an untested verification-only patch and do not create an empty commit.

---

### Task 7: Deploy and accept PR #36 in DEV, then STAGING

**Files:**
- No source files expected unless acceptance reveals a reproducible defect.
- Runtime files `.env.dev` and `.env.staging` remain private and uncommitted.

**Interfaces:**
- Consumes: verified feature branch and journaled control-plane migration.
- Produces: DEV and STAGING acceptance evidence for PR review.

- [ ] **Step 1: Build the DEV web image on the feature branch**

On the server:

```bash
cd /srv/shopnest/dev
git checkout feature/organization-business-model
git pull --ff-only origin feature/organization-business-model

docker compose --env-file .env.dev -f docker-compose.dev.yml   build web-dev
```

Expected: build succeeds.

- [ ] **Step 2: Apply only the control-plane migration in DEV**

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml   run --rm --no-deps web-dev npm run control-plane:migrate
```

Expected: `Control plane ready.` No tenant migration is required.

- [ ] **Step 3: Recreate only DEV web**

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml   up -d --no-deps --force-recreate web-dev
```

Then:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml ps
```

Expected: DEV DB remains healthy and web is up.

- [ ] **Step 4: Perform DEV browser acceptance**

Using an authenticated merchant account:
1. Open `https://dev.shopnest.co.il/dashboard`.
2. Verify a merchant with no organization sees **Create your business**.
3. Open the create form.
4. Submit a whitespace-only business name and verify validation prevents creation.
5. Create a business with a valid display name and optional fields.
6. Verify the dashboard now shows the organization and role Owner.
7. Open `/dashboard/business` and verify business details.
8. Edit the display name and optional fields and verify they persist.
9. Refresh and confirm the updated values remain.
10. Confirm there is no UI to create a second organization.
11. Confirm existing tenant storefront/admin routes still work.

- [ ] **Step 5: Verify DEV rows directly in the control plane**

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml exec -T db-dev psql -U shopnest -d shopnest -c '
SELECT id, display_name, country FROM public.organizations ORDER BY id;
SELECT organization_id, merchant_account_id, role
FROM public.organization_memberships
ORDER BY organization_id, merchant_account_id;
'
```

Expected: one organization row for the accepted flow and one matching `owner` membership; no tenant schema changes are required by PR #36.

- [ ] **Step 6: Create the PR as Draft after DEV acceptance**

Use title:

```text
Add organization business model
```

PR body must summarize:
- public control-plane organization/membership tables
- transactional first-business creation
- server-authoritative owner membership
- create/view/edit merchant dashboard flow
- explicit out-of-scope Store/Tenant/provisioning/provider work
- automated test/build results
- DEV acceptance evidence

Do not mark Ready for Review yet.

- [ ] **Step 7: Apply the merged-or-approved feature revision to STAGING for acceptance**

Use the existing STAGING deployment workflow, without deleting volumes:

```bash
cd /srv/shopnest/staging
git fetch origin
git checkout feature/organization-business-model
git pull --ff-only origin feature/organization-business-model

docker compose --env-file .env.staging -f docker-compose.staging.yml   build web-staging

docker compose --env-file .env.staging -f docker-compose.staging.yml   run --rm --no-deps web-staging npm run control-plane:migrate

docker compose --env-file .env.staging -f docker-compose.staging.yml   up -d --no-deps --force-recreate web-staging
```

Expected: migration and web startup succeed; no tenant migration runs.

- [ ] **Step 8: Perform STAGING smoke acceptance**

At `https://staging.shopnest.co.il`:
1. Login with a merchant test account.
2. Create a business.
3. Verify owner role.
4. Edit the business.
5. Logout/login and confirm persistence.
6. Verify merchant auth, customer auth, global admin, and one tenant admin/storefront still load normally.

- [ ] **Step 9: Return STAGING checkout to master after acceptance**

After evidence is collected and before normal STAGING operation resumes:

```bash
cd /srv/shopnest/staging
git checkout master
git pull --ff-only origin master
```

Do not rebuild master until the user explicitly chooses to return the running STAGING application to master or after the PR is merged.

- [ ] **Step 10: Run final branch review before Ready for Review**

Check:
- final diff against `master`
- PR mergeability
- test/build status
- no secrets or `.env` files
- no tenant/store/provisioning scope creep
- no organization deletion/transfer/member-management scope creep

Only after these checks and explicit user approval should the Draft PR be marked Ready for Review. Merge requires a separate explicit user instruction.

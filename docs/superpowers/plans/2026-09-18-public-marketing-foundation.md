# Public ShopNest Marketing & Acquisition Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal platform homepage with a responsive, localized public ShopNest acquisition experience and supporting public informational routes, without introducing merchant signup logic, tenant DB access, provisioning, or control-plane migrations.

**Architecture:** Keep the public marketing surface entirely tenantless under `src/app`, using server-rendered Next.js App Router pages and shared presentational components. Marketing copy is localized through the existing `next-intl` message files, while the existing tenant router and admin/control-plane boundaries remain unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, next-intl 4, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-18-merchant-acquisition-onboarding-design.md`

## Global Constraints

- PR #34 is presentation-only and must not add merchant account creation, Google merchant OAuth, password signup logic, subscriptions, provisioning, tenant creation, Cloudflare automation, custom-domain provisioning, readiness logic, dynamic tenant routing, or production payment enablement.
- No control-plane migration is permitted in PR #34.
- Public marketing routes must not access a tenant database or require tenant context.
- Existing `/admin/*`, `/<tenant>/*`, and `/<tenant>/admin/*` behavior must remain intact.
- ShopNest may use Shopify only as product-flow / information-architecture inspiration; do not copy Shopify text, branding, visual assets, or layout.
- Preserve Hebrew/English compatibility through the existing next-intl setup.
- SQL injection prevention remains platform-wide: no user input may become executable SQL or dynamic DB identifiers.
- No AI execution surface is introduced in PR #34; prompt-injection/tool-abuse risk therefore remains zero for this PR.
- Fail closed if any future change would accidentally route a public marketing page into tenant context.

---

## File Map

**Create**
- `src/app/(marketing)/_components/MarketingHeader.tsx` — public navigation and primary CTA.
- `src/app/(marketing)/_components/MarketingFooter.tsx` — public footer.
- `src/app/(marketing)/_components/HeroSection.tsx` — hero/value proposition.
- `src/app/(marketing)/_components/WhyShopNestSection.tsx` — benefit cards.
- `src/app/(marketing)/_components/CapabilitiesSection.tsx` — feature/capability cards.
- `src/app/(marketing)/_components/HowItWorksSection.tsx` — four-step lifecycle explanation.
- `src/app/(marketing)/_components/PricingPreview.tsx` — non-billing marketing presentation for Free/Small/Medium/Large.
- `src/app/(marketing)/_components/DemoStoresSection.tsx` — links to existing sample stores.
- `src/app/(marketing)/_components/FaqSection.tsx` — public FAQ.
- `src/app/(marketing)/_components/FinalCtaSection.tsx` — closing CTA.
- `src/app/(marketing)/features/page.tsx` — public features route.
- `src/app/(marketing)/pricing/page.tsx` — public pricing route.
- `src/app/(marketing)/examples/page.tsx` — public examples route.
- `src/app/(marketing)/faq/page.tsx` — public FAQ route.
- `src/app/(marketing)/login/page.tsx` — informational merchant-login placeholder.
- `src/app/(marketing)/signup/page.tsx` — informational merchant-signup placeholder.
- `tests/marketing-site.test.mts` — source-level regression tests for public routes, tenant isolation, i18n, accessibility, and responsive classes.

**Modify**
- `src/app/page.tsx` — compose the new marketing homepage.
- `src/app/layout.tsx` — replace create-next-app metadata with ShopNest defaults only; preserve locale/dir behavior.
- `src/messages/en.json` — add `Marketing` namespace.
- `src/messages/he.json` — add matching `Marketing` namespace.
- `tests/route-navigation.test.mjs` — add all new public routes to the platform route inventory expectations.
- `docs/route-audit.md` — document new public routes.
- `package.json` — add `marketing:test` script.

---

### Task 1: Lock Public-Route and Localization Contracts

**Files:**
- Create: `tests/marketing-site.test.mts`
- Modify: `tests/route-navigation.test.mjs`
- Modify: `src/messages/en.json`
- Modify: `src/messages/he.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: current tenant router behavior from `src/lib/tenant-routing/core.ts`.
- Produces: a `Marketing` translation namespace used by every marketing component and a `marketing:test` command.

- [ ] **Step 1: Write the failing route/i18n regression test**

Create `tests/marketing-site.test.mts` with tests that:
- read `src/messages/en.json` and `src/messages/he.json`;
- assert both contain the same top-level `Marketing` keys;
- assert the public page source contains no imports from `@/drizzle/db`, `@/lib/tenant-context`, or `@/lib/tenant`;
- assert marketing components use plain `next/link`, never `TenantLink`;
- assert CTA links target `/signup`, `/login`, and `/examples`;
- assert buttons/links expose minimum `min-h-11` tap targets;
- assert responsive layouts include single-column mobile and multi-column desktop classes.

Use this structure:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("marketing translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    read("src/messages/en.json").then(JSON.parse),
    read("src/messages/he.json").then(JSON.parse),
  ]);
  assert.deepEqual(
    Object.keys(en.Marketing).sort(),
    Object.keys(he.Marketing).sort()
  );
});

test("public marketing surface stays tenantless", async () => {
  const sources = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/(marketing)/_components/MarketingHeader.tsx"),
    read("src/app/(marketing)/_components/MarketingFooter.tsx"),
  ]);
  const source = sources.join("\n");
  assert.doesNotMatch(source, /@\/drizzle\/db|@\/lib\/tenant-context|@\/lib\/tenant\b/);
  assert.doesNotMatch(source, /TenantLink/);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/marketing-site.test.mts
```

Expected: FAIL because `Marketing` translations and marketing components do not yet exist.

- [ ] **Step 3: Add the Marketing translation contract**

Add a `Marketing` object to both locale files with identical keys covering:
- nav: whyShopNest, features, pricing, examples, faq, login, startFree
- hero: eyebrow, title, description, primaryCta, secondaryCta
- why: title, subtitle, setupTitle/setupText, localTitle/localText, secureTitle/secureText
- capabilities: title plus storefront/catalog/checkout/payments/inventory/orders/shipping/accounts titles/text
- how: title plus step1..step4 title/text
- pricing: title, subtitle, free/small/medium/large labels and short descriptions, pricingNote
- examples: title, subtitle, pandaPop, giftShop, dvorikCollection, viewStore
- faq: title plus q1/a1 through q5/a5
- finalCta: title, description, button
- footer: tagline, admin
- placeholders: loginTitle/loginText/signupTitle/signupText/backHome

Do not add pricing values or billing promises that are not yet defined.

- [ ] **Step 4: Add the test script**

Add:

```json
"marketing:test": "node --experimental-strip-types --test tests/marketing-site.test.mts"
```

to `package.json`.

- [ ] **Step 5: Update platform route expectations**

Extend the `platform` array in `tests/route-navigation.test.mjs` to include:

```js
"/features",
"/pricing",
"/examples",
"/faq",
"/login",
"/signup"
```

Run:

```bash
npm run routing:test
```

Expected: FAIL until physical pages exist and route inventory is updated.

- [ ] **Step 6: Commit the contract**

```bash
git add tests/marketing-site.test.mts tests/route-navigation.test.mjs src/messages/en.json src/messages/he.json package.json
git commit -m "test: define public marketing contracts"
```

---

### Task 2: Build Shared Public Marketing Components

**Files:**
- Create: `src/app/(marketing)/_components/MarketingHeader.tsx`
- Create: `src/app/(marketing)/_components/MarketingFooter.tsx`
- Create: `src/app/(marketing)/_components/HeroSection.tsx`
- Create: `src/app/(marketing)/_components/WhyShopNestSection.tsx`
- Create: `src/app/(marketing)/_components/CapabilitiesSection.tsx`
- Create: `src/app/(marketing)/_components/HowItWorksSection.tsx`
- Create: `src/app/(marketing)/_components/PricingPreview.tsx`
- Create: `src/app/(marketing)/_components/DemoStoresSection.tsx`
- Create: `src/app/(marketing)/_components/FaqSection.tsx`
- Create: `src/app/(marketing)/_components/FinalCtaSection.tsx`

**Interfaces:**
- Consumes: `getTranslations("Marketing")` from `next-intl/server`.
- Produces: server components with no tenant/database/auth dependencies.

- [ ] **Step 1: Extend the failing test for component structure**

Add assertions that:
- header has `aria-label="ShopNest marketing navigation"`;
- header includes links to `/#why-shopnest`, `/features`, `/pricing`, `/examples`, `/faq`;
- hero contains `id="hero"`;
- why section contains `id="why-shopnest"`;
- pricing section contains `id="pricing"`;
- FAQ uses semantic `<details>` / `<summary>` or equivalent accessible structure;
- demo-store links point to `/panda-pop`, `/gift-shop`, `/dvorik-collection`.

- [ ] **Step 2: Run the test and confirm failure**

Run:

```bash
npm run marketing:test
```

Expected: FAIL with missing-file assertions.

- [ ] **Step 3: Implement the components minimally**

Use server components and `getTranslations("Marketing")`. Use `Link` from `next/link` for navigation. Keep layouts responsive with Tailwind only; do not add client-side resize logic.

Representative header shape:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function MarketingHeader() {
  const t = await getTranslations("Marketing");
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="min-h-11 inline-flex items-center font-bold">
          ShopNest
        </Link>
        <nav aria-label="ShopNest marketing navigation" className="hidden items-center gap-6 lg:flex">
          <Link href="/#why-shopnest">{t("nav.whyShopNest")}</Link>
          <Link href="/features">{t("nav.features")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/examples">{t("nav.examples")}</Link>
          <Link href="/faq">{t("nav.faq")}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="inline-flex min-h-11 items-center px-3">
            {t("nav.login")}
          </Link>
          <Link href="/signup" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-primary-foreground">
            {t("nav.startFree")}
          </Link>
        </div>
      </div>
    </header>
  );
}
```

Hero CTA requirements:
- primary: `/signup`
- secondary: `/examples`
- no claim that signup provisions a live store.

Pricing preview requirements:
- show Free, Small, Medium, Large;
- no numeric price unless explicitly approved later;
- include translation stating final pricing/limits are not yet published.

- [ ] **Step 4: Run marketing tests**

Run:

```bash
npm run marketing:test
```

Expected: component-structure assertions PASS; homepage composition assertions may still fail until Task 3.

- [ ] **Step 5: Commit shared components**

```bash
git add src/app/'(marketing)'/_components tests/marketing-site.test.mts
git commit -m "feat: add public marketing components"
```

---

### Task 3: Compose the Homepage and Public Informational Routes

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/(marketing)/features/page.tsx`
- Create: `src/app/(marketing)/pricing/page.tsx`
- Create: `src/app/(marketing)/examples/page.tsx`
- Create: `src/app/(marketing)/faq/page.tsx`
- Create: `src/app/(marketing)/login/page.tsx`
- Create: `src/app/(marketing)/signup/page.tsx`
- Modify: `docs/route-audit.md`

**Interfaces:**
- Consumes: shared components from Task 2.
- Produces: physical tenantless public pages at `/`, `/features`, `/pricing`, `/examples`, `/faq`, `/login`, `/signup`.

- [ ] **Step 1: Add failing homepage/page-route assertions**

Extend `tests/marketing-site.test.mts` to assert:
- `src/app/page.tsx` imports every homepage section;
- every public route file exists;
- login/signup pages contain no forms, server actions, DB access, OAuth handlers, or password handling;
- route pages contain a return link to `/`.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run marketing:test
npm run routing:test
```

Expected: FAIL because pages and inventory entries are missing.

- [ ] **Step 3: Compose the homepage**

Replace the minimal homepage with:

```tsx
import { CapabilitiesSection } from "./(marketing)/_components/CapabilitiesSection";
import { DemoStoresSection } from "./(marketing)/_components/DemoStoresSection";
import { FaqSection } from "./(marketing)/_components/FaqSection";
import { FinalCtaSection } from "./(marketing)/_components/FinalCtaSection";
import { HeroSection } from "./(marketing)/_components/HeroSection";
import { HowItWorksSection } from "./(marketing)/_components/HowItWorksSection";
import { MarketingFooter } from "./(marketing)/_components/MarketingFooter";
import { MarketingHeader } from "./(marketing)/_components/MarketingHeader";
import { PricingPreview } from "./(marketing)/_components/PricingPreview";
import { WhyShopNestSection } from "./(marketing)/_components/WhyShopNestSection";

export default function PlatformHomePage() {
  return (
    <>
      <MarketingHeader />
      <main>
        <HeroSection />
        <WhyShopNestSection />
        <CapabilitiesSection />
        <HowItWorksSection />
        <PricingPreview />
        <DemoStoresSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </>
  );
}
```

Preserve page-level metadata, updated for the acquisition experience.

- [ ] **Step 4: Implement informational pages**

Each informational page must:
- use the same public header/footer;
- use localized copy;
- stay server-only;
- contain no merchant-account creation behavior.

`/login` text must explicitly say merchant sign-in is not available yet rather than linking to `/admin/login` as if that were merchant auth.

`/signup` text must explicitly say store creation is not active yet and must not imply a tenant is provisioned.

- [ ] **Step 5: Update route inventory**

Add these exact entries to `docs/route-audit.md`:

```md
- `/features` — public ShopNest feature overview
- `/pricing` — public plan overview; no billing implementation
- `/examples` — public sample-store directory
- `/faq` — public merchant acquisition FAQ
- `/login` — merchant-login placeholder; no merchant auth yet
- `/signup` — merchant-signup placeholder; no account creation yet
```

- [ ] **Step 6: Run route and marketing tests**

Run:

```bash
npm run marketing:test
npm run routing:test
```

Expected: PASS.

- [ ] **Step 7: Commit pages and inventory**

```bash
git add src/app/page.tsx src/app/'(marketing)' docs/route-audit.md tests/marketing-site.test.mts
git commit -m "feat: add public acquisition routes"
```

---

### Task 4: Metadata, Accessibility, RTL and Responsive Hardening

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(marketing)/_components/*.tsx`
- Modify: `tests/marketing-site.test.mts`

**Interfaces:**
- Consumes: marketing components/pages from Tasks 2-3.
- Produces: stable SEO defaults, keyboard-friendly navigation, RTL-safe spacing, responsive layouts.

- [ ] **Step 1: Add failing hardening tests**

Add assertions for:
- root metadata title `ShopNest`;
- root metadata description is no longer create-next-app copy;
- no `space-x-` classes in marketing components;
- no `ml-`/`mr-` directional assumptions where logical spacing can be used;
- all major cards/grids use responsive classes;
- FAQ summaries are keyboard-native;
- all CTA links have visible text;
- no `innerWidth`, `matchMedia`, or `ResizeObserver` in the marketing surface.

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run marketing:test
```

Expected: FAIL until metadata/RTL/accessibility details are corrected.

- [ ] **Step 3: Update root metadata**

Change `src/app/layout.tsx` metadata to:

```ts
export const metadata: Metadata = {
  title: {
    default: "ShopNest",
    template: "%s | ShopNest",
  },
  description: "Build and prepare your online store with ShopNest, then publish when it is ready.",
};
```

Do not change existing locale/RTL calculation:

```tsx
<html lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
```

- [ ] **Step 4: Fix responsive/RTL/accessibility issues**

Requirements:
- logical `gap-*`, grid, and flex-wrap spacing rather than LTR-only spacing;
- `min-h-11` on interactive CTAs;
- semantic headings in descending hierarchy;
- one `h1` per page;
- accessible nav labels;
- `details/summary` FAQ;
- no JS viewport branching.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run marketing:test
npm run routing:test
```

Expected: PASS.

- [ ] **Step 6: Commit hardening**

```bash
git add src/app/layout.tsx src/app/'(marketing)'/_components tests/marketing-site.test.mts
git commit -m "feat: harden marketing accessibility and metadata"
```

---

### Task 5: Full Regression Verification and DEV Acceptance

**Files:**
- No feature code should be added in this task unless a regression is found.
- Modify tests only if a real acceptance gap is discovered and the added test directly guards that gap.

**Interfaces:**
- Consumes: completed PR #34 branch.
- Produces: evidence required for READY TO MERGE assessment.

- [ ] **Step 1: Run focused tests**

```bash
npm run marketing:test
npm run routing:test
npm run control-plane:test
npm run admin-auth:test
npm run storefront-ui:test
```

Expected: all PASS.

- [ ] **Step 2: Run the full build**

```bash
npm run build
```

Expected: exit code 0; all public and existing tenant/admin routes compile.

- [ ] **Step 3: Inspect final diff for forbidden scope**

Run:

```bash
git diff master...HEAD -- src/drizzle src/lib/payments src/lib/customer-auth src/lib/admin-auth scripts
```

Expected: no implementation changes in DB/payment/customer-auth/admin-auth/provisioning code.

Run:

```bash
git diff master...HEAD -- src/app src/messages tests docs package.json
```

Confirm only approved marketing, tests, route inventory, metadata, and localized copy changed.

- [ ] **Step 4: Perform DEV acceptance**

Deploy/update the PR branch in DEV and verify:
- `https://dev.shopnest.co.il/` renders the marketing homepage;
- mobile-width and desktop-width layouts are usable;
- Hebrew renders RTL and English renders LTR using the existing locale mechanism;
- `/features`, `/pricing`, `/examples`, `/faq`, `/login`, `/signup` load;
- `/admin/login` remains the platform-admin login;
- `/panda-pop` still resolves as a tenant storefront;
- `/panda-pop/admin` still resolves as tenant admin;
- sample-store links do not lose tenant prefixes after navigation;
- no public marketing page opens a tenant DB connection;
- browser console shows no new runtime errors.

- [ ] **Step 5: Security acceptance**

Verify:
- no forms or server actions exist on `/signup` or `/login`;
- no new SQL or raw query code exists;
- no AI/tool execution integration exists;
- no browser-supplied tenant/schema identifier was added;
- public routes remain `legacy`/tenantless in middleware and do not receive trusted tenant headers.

- [ ] **Step 6: Commit any acceptance-only test fix**

If and only if DEV acceptance exposes a real regression, first add a failing regression test, then make the minimal fix and commit both. Otherwise make no commit in this step.

- [ ] **Step 7: Fetch fresh PR status before READY TO MERGE**

After the Draft PR exists and checks are complete, fetch fresh GitHub PR metadata and verify:
- base is `master`;
- head is `feature/public-marketing-foundation`;
- PR is Draft until acceptance is complete;
- mergeability has no unresolved conflict;
- final diff is still within scope.

Stop at **READY TO MERGE**. Do not merge without explicit user instruction: `MERGE`, `Marge`, or `תמזג`.

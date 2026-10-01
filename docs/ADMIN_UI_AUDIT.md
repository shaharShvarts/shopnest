# ShopNest Management UI Audit

Status: active migration plan  
Standard: `docs/ADMIN_UI_STANDARDS.md`

This audit tracks the migration of existing ShopNest management surfaces to the shared management UI standard.

The scope is intentionally limited to management UX:

- ShopNest Control Plane: `/admin`
- Merchant / Store Owner dashboard: `/dashboard`
- Store Manager management screens

Customer storefront UI is out of scope.

## 1. Audit goals

The migration should remove page-by-page visual drift and replace it with shared, reusable management components.

Target invariants:

- default form-control height: 44px
- shared select behavior with correct RTL/LTR arrow spacing
- common button hierarchy and destructive styling
- common text-input / textarea styling
- consistent cards, page headers, navigation, and form spacing
- consistent focus, hover, disabled, and validation states
- logical direction utilities instead of hard-coded left/right where direction matters
- raw controls are reduced over time in favor of management components

## 2. Foundation already completed

### Shared management select

`src/components/management/ManagementSelect.tsx`

Provides:

- 44px default height
- `appearance-none`
- ShopNest chevron
- logical `end-3` positioning
- logical `ps-3 pe-9` text spacing
- RTL/LTR-safe arrow placement
- standard hover/focus/disabled states

The Control Plane Plans page now uses this component for:

- Plan status
- boolean entitlement state
- supported-feature selection

### Documentation

`docs/ADMIN_UI_STANDARDS.md` is the mandatory management UI standard and is referenced by `docs/DEVELOPMENT_GUIDELINES.md`.

## 3. Audit findings

### A. Control Plane

#### `src/app/admin/plans/page.tsx`

Status: **partially migrated**

Already standardized:

- Plan selects use `ManagementSelect`
- primary save action uses 44px height
- destructive remove-entitlement action uses 44px height
- improved hover/focus styling
- active navigation and Control Plane shell styling improved

Remaining:

- raw text inputs still have page-local classes
- create-Plan inputs still use older local input styling
- integer entitlement control remains custom and should be aligned with management control tokens
- checkbox/status-related controls should move to shared primitives as those primitives are introduced

#### `src/app/admin/stores/[slug]/page.tsx`

Status: **high-priority migration**

Observed drift:

- raw native `select` for Store status
- raw number input
- raw textarea
- local one-off input/select styling
- action link styled separately from shared button language
- form-control dimensions are not explicitly aligned to the 44px standard

Required migration:

- Store status -> `ManagementSelect`
- number/text inputs -> shared ManagementInput
- notes -> shared ManagementTextarea
- normal actions -> shared Button / management action pattern
- preserve checkbox semantics while standardizing label/focus treatment

#### Other Control Plane surfaces

Files to normalize after the Store detail form:

- `src/app/admin/_components/StoreTable.tsx`
- `src/app/admin/featured/page.tsx`
- `src/app/admin/login/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/stores/page.tsx`

These are lower risk because the first audit pass found fewer editable raw form controls, but shell, card, table, links-as-actions, spacing, badge treatment, and responsive behavior still need visual review against the standard.

### B. Merchant / Store management

#### `src/app/(merchant)/dashboard/stores/[id]/domain/DomainManager.tsx`

Status: **high-priority migration**

Observed drift:

- many raw buttons
- many raw inputs
- one button still uses `min-h-10` rather than the 44px standard
- several repeated button styles duplicate the same primary/outline patterns
- Copy action uses a separate 40px control
- domain workflow styling is internally coherent but not yet aligned to shared ShopNest management primitives

Required migration:

- repeated primary actions -> shared management Button pattern
- outline actions -> shared secondary Button pattern
- hostname field -> ManagementInput
- Copy icon action -> documented compact-icon exception or 44px standard where appropriate
- preserve all domain workflow logic; styling migration must not alter cooldown/provisioning/removal behavior

#### `src/app/(merchant)/dashboard/stores/[id]/_components/ManagedProductForm.tsx`

Status: **high-priority migration**

Observed drift:

- 2 raw native `select` controls
- product controls use 48px (`min-h-12`) while management standard is 44px
- raw text/number inputs
- raw textarea
- raw submit button
- local `rounded-xl` control language differs from the Control Plane

Required migration:

- category/subcategory -> `ManagementSelect`
- text/number fields -> ManagementInput
- description -> ManagementTextarea
- save -> shared Button
- migrate from 48px to 44px unless a documented product-form exception is deliberately approved

#### `src/app/(merchant)/dashboard/stores/[id]/_components/ManagedSubcategoryForm.tsx`

Status: **high-priority migration**

Observed drift:

- raw native select
- raw input
- raw submit button

Required migration to the same primitives used by ManagedProductForm.

#### `src/app/(merchant)/dashboard/stores/[id]/_components/ManagedCategoryForm.tsx`

Status: **medium-priority migration**

Observed drift:

- raw input
- raw submit button
- local form-control styling

#### `src/app/(merchant)/dashboard/stores/[id]/team/page.tsx`

Status: **medium/high-priority migration**

Observed drift:

- multiple raw inputs and buttons
- remove action uses `min-h-10` rather than 44px
- create/assign buttons use page-local styles
- back link is independently styled as a button

Positive:

- most editable controls are already close to the 44px standard
- cards are visually consistent within the page

Required migration:

- inputs -> ManagementInput
- create/assign -> shared Button
- remove -> shared destructive/outline action
- back link -> Button with `asChild` or approved link-action primitive
- fix quota display direction separately where mixed numeric RTL output is misleading

#### `src/app/(merchant)/dashboard/stores/_components/StoreForm.tsx`

Status: **medium-priority migration**

Observed drift:

- 4 raw inputs
- raw submit button
- local form-control styles

#### `src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx`

Status: **medium-priority migration**

Observed drift:

- raw input
- raw submit button

Controls are already close to standard dimensions but should reuse shared primitives.

#### `src/app/(merchant)/dashboard/stores/[id]/policies/PolicyDocumentForm.tsx`

Status: **medium-priority migration**

Observed drift:

- raw inputs
- raw textarea
- raw buttons

Most controls already use 44px-like sizing, but behavior/styling should be centralized.

#### Dashboard shell

Files:

- `src/app/(merchant)/dashboard/layout.tsx`
- `src/app/(merchant)/dashboard/_components/DashboardNavigation.tsx`
- `src/app/(merchant)/dashboard/_components/DashboardLanguageSwitcher.tsx`

Status: **shell normalization required**

Observed drift:

- Dashboard language switcher is a raw button while Control Plane uses the shared language selector
- logout/navigation utility controls do not yet share one exact shell pattern with Control Plane
- the two shells may keep different information architecture, but dimensions, interaction states, typography hierarchy, and utility-control treatment should converge

## 4. Shared primitives to add next

The audit confirms the next reusable components should be:

1. **ManagementInput**
   - 44px default height
   - rounded-lg
   - neutral border
   - standard hover/focus/disabled/invalid states
   - supports text, number, email, password, URL, etc.

2. **ManagementTextarea**
   - same border/radius/focus language as ManagementInput
   - content-driven height rather than forced 44px

3. **ManagementField**
   - standard label spacing
   - help text
   - validation/error message
   - optional required marker if product design adopts one

4. **ManagementAction / Button convention**
   - continue using the shared `Button` implementation
   - management screens should explicitly use the 44px management size
   - if repetition remains high, add a management wrapper/variant rather than local classes

5. **ManagementCard / Section**
   - only if repeated card CSS continues to drift during migration

Do not extract abstractions solely for theoretical completeness. Extract where repeated real usage exists.

## 5. Migration order

### Wave 1 — shared controls + Control Plane

1. Add ManagementInput
2. Add ManagementTextarea
3. standardize management Button sizing convention
4. migrate `/admin/stores/[slug]`
5. finish remaining Plan inputs/integer control
6. review Control Plane tables/cards/login

Reason: the Control Plane is smaller and establishes the canonical management language.

### Wave 2 — core Merchant catalog

1. ManagedProductForm
2. ManagedSubcategoryForm
3. ManagedCategoryForm
4. StoreForm

Reason: these are frequent merchant CRUD surfaces and currently contain raw selects/inputs/buttons.

### Wave 3 — Merchant operational screens

1. Team
2. Domain Manager
3. Policies
4. Business / Organization

Reason: these contain many repeated actions and will benefit strongly from the shared primitives established in Waves 1–2.

### Wave 4 — shell convergence and final audit

1. Control Plane shell
2. Merchant Dashboard shell
3. navigation states
4. language/logout utility alignment
5. table/action consistency
6. Hebrew/English visual verification
7. responsive verification

## 6. Regression strategy

UI standardization must not depend only on screenshots.

Add focused source/regression tests for project-wide invariants where practical:

- management select uses logical positioning
- migrated management pages do not introduce raw native selects
- key management forms use shared input/textarea controls
- normal management actions use the 44px convention
- direction-sensitive shared components avoid physical left/right spacing
- shared components expose focus/disabled behavior

Tests should protect the design-system contract without becoming brittle snapshots of every Tailwind class.

## 7. Definition of done

The management UI migration is complete when:

- all active Control Plane forms use shared management controls
- all active Merchant / Store Manager forms use shared management controls
- no management native select is left without an approved exception
- normal management form controls are 44px high unless a documented exception exists
- RTL/LTR-sensitive arrows/icons use logical positioning
- primary/secondary/destructive actions are visually predictable
- both Hebrew and English are manually checked
- relevant regression tests pass
- production build passes

This audit should be updated as each migration wave is completed.

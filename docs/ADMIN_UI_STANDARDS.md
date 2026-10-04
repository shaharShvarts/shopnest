# ShopNest Management UI Standards

This document defines the mandatory visual and interaction standard for all ShopNest management surfaces.

It applies to:

- ShopNest Control Plane under `/admin`
- Merchant / Store Owner dashboard under `/dashboard`
- Store Manager management screens
- New management screens added to either area

It does **not** define the customer storefront design language.

The goal is that users experience one professional ShopNest management product rather than a collection of unrelated screens.

## 1. Core rule

New management UI must reuse the shared management controls and patterns in this document.

Do not create a new raw `button`, `input`, `select`, status control, destructive-action style, card style, or form layout when an approved shared control/pattern already exists.

Legacy management screens should be migrated toward this standard when they are touched. Large unrelated rewrites are not required merely to satisfy visual cleanup, but new inconsistency must not be added.

## 2. Control dimensions

The default interactive form-control height is **44px**.

Use this for:

- primary buttons
- secondary buttons
- destructive outline buttons
- text inputs
- selects
- combobox triggers
- date/time triggers
- other primary form controls

In Tailwind this normally means `h-11`.

Smaller controls are allowed only for genuinely compact secondary actions such as dense table-row icon actions. A normal form action must not silently fall back to 32px or 36px.

Controls aligned on the same row should have the same height unless a deliberate design exception is documented.

## 3. Shape, spacing, and typography

Default management controls:

- radius: `rounded-lg`
- horizontal padding: normally 12-16px
- text: `text-sm`
- weight: medium for actions, normal for field values
- borders: neutral slate
- subtle shadow only where it improves control separation
- visible focus ring
- disabled states must remain readable

Cards and major panels should generally use:

- `rounded-xl` or `rounded-2xl`
- `border-slate-200`
- white background
- subtle shadow where appropriate
- consistent internal spacing

Avoid mixing many unrelated radius sizes, border colors, or control heights on the same screen.

## 4. Buttons

Use the shared `Button` component rather than raw buttons for normal actions.

Management form buttons should normally use 44px height even if the global base Button default is smaller.

Recommended roles:

- Primary/save: dark slate filled button
- Secondary/add/cancel: neutral outline
- Destructive/remove: red text/border with light red hover
- Icon-only: use only where the icon is universally understandable and provide an accessible label

All buttons require:

- hover feedback
- keyboard focus state
- disabled state
- consistent vertical alignment

Destructive actions must not look like primary actions.

## 5. Inputs

Management text/number/price inputs should use the same 44px height, neutral border, rounded-lg shape, focus treatment, and disabled behavior.

Do not introduce a generic raw input style local to a page when a shared management input can be reused.

Field labels should remain visually attached to their control.

Validation errors should be shown close to the field or form area and should not rely on color alone.

## 6. Selects and RTL/LTR behavior

Native browser select arrows are not accepted for management UI because their placement and spacing vary by browser and direction.

Use the shared management select control.

Current shared component:

`src/components/management/ManagementSelect.tsx`

Rules:

- native arrow hidden with `appearance-none`
- ShopNest chevron rendered separately
- chevron positioned using logical CSS/Tailwind positioning: `end-3`
- text padding uses logical sides: `ps-3 pe-9`
- Hebrew/RTL therefore places the arrow on the left with spacing
- English/LTR places the arrow on the right with spacing
- arrow must never touch the control edge

Do not use physical `left/right/pl/pr` positioning for direction-sensitive management controls unless there is a specific visual reason.

## 7. Directionality

Management UI must work in both Hebrew and English.

Prefer logical layout utilities where direction matters:

- `start` / `end`
- `ps` / `pe`
- `ms` / `me`
- `border-s` / `border-e`

Avoid hard-coded left/right assumptions for icons, arrows, inline actions, and field affordances.

Any new reusable control must be visually checked in both RTL and LTR.

## 8. Colors and hierarchy

Management surfaces should use a restrained neutral palette.

Recommended hierarchy:

- shell/header: dark slate
- page background: light slate
- cards: white
- primary text: slate-950
- secondary text: slate-600/500
- borders: slate-200/300
- primary action: slate-900
- destructive: red family
- success/warning/error colors only for semantic state

Do not use bright accent colors merely to decorate normal controls.

Secondary text must retain sufficient contrast. Decorative hierarchy must not make useful text difficult to read.

## 9. Navigation and shell

Control Plane and Merchant Dashboard may have different information architecture, but they should share the same product-quality rules:

- clear active navigation state
- consistent header spacing
- aligned utility controls
- same general control dimensions
- consistent focus/hover behavior
- no unexplained mix of old/new visual styles

Current-section navigation must be visually distinct and expose the appropriate accessibility state such as `aria-current="page"`.

## 10. Forms

A form should read as one coherent system.

Within one form:

- controls should share height and radius
- labels use consistent typography
- spacing between field groups is consistent
- primary action placement is predictable
- destructive actions are visually separate from save actions
- status/boolean selects use the same select component
- loading/disabled states should prevent accidental duplicate submission where relevant

Do not solve individual fields with one-off CSS that conflicts with neighboring fields.

## 10.1 Same-page mutation behavior

Management actions that change data on the **current screen** must preserve the current workspace.

Examples include:

- deleting a row or feature from a list
- changing a plan or status shown on the same page
- assigning or removing a Store Manager
- saving settings whose destination is still the current screen
- activation/check actions that update status in place

For these actions:

- do not use a redirect back to the same route as the success path
- do not rely on a native Server Action form submission that replaces the current route and resets scroll position
- use the shared in-place management mutation pattern or an existing equivalent client interaction
- prevent duplicate submission while pending
- refresh Server Component data with `router.refresh()` after a successful mutation when fresh server data is required
- show success/failure feedback in the current context
- use the existing global `react-toastify` / `ToastProvider` feedback system for management toasts; do not introduce page-local or custom toast implementations when the installed shared provider already covers the need
- preserve scroll position and surrounding UI state

Current shared implementation:

`src/components/management/ManagementMutation.tsx`

It provides:

- `ManagementMutationForm` for same-page forms
- `ManagementMutationButton` for same-page button actions

A redirect remains correct when the action **intentionally changes destination**, for example:

- create form -> newly created Store
- edit form -> list/detail destination
- login/logout
- explicit navigation to another management screen

The rule is not "never redirect"; the rule is **never navigate away and back to the same workspace merely to refresh data**.

Destructive actions that already have a reversible/undo interaction must preserve it when migrated to the shared management UI. Do not replace an existing undo flow with an irreversible one-step delete merely for UI consistency.

## 11. Tables and dense lists

For dense management data:

- maintain consistent row height
- align actions predictably
- use compact controls only where density is needed
- status badges use semantic, reusable styles
- destructive actions should not dominate the row
- horizontal overflow must be handled on small screens

## 12. Accessibility

Every management control must support:

- keyboard interaction
- visible focus
- accessible name
- sufficient text/background contrast
- disabled state that is both visual and functional
- semantic HTML where practical

WCAG contrast compliance is the minimum. Visual hierarchy and readability still matter even when a numeric contrast ratio passes.

## 13. Responsive behavior

Management screens must remain usable at laptop and tablet widths.

Requirements:

- do not rely on fixed widths that cause avoidable overflow
- form rows may stack at smaller breakpoints
- action buttons must remain reachable
- select text and icons must not overlap
- utility/header controls may collapse deliberately

## 14. Implementation policy

For all new management work:

1. Check for an existing shared component first.
2. Reuse the management design tokens/patterns in this document.
3. Test Hebrew and English.
4. Test hover, focus, disabled, validation, and destructive states as relevant.
5. Add or update focused regression tests when a shared control or invariant changes.
6. Run the relevant tests and production build before considering the UI change complete.

If repeated page-specific styling is found, extract a shared component instead of copying the style again.

## 15. Current shared management controls

Current foundation:

- `src/components/ui/button.tsx` — shared Button behavior/variants; normal management actions use `size="management"` for the 44px standard
- `src/components/management/ManagementInput.tsx` — shared 44px management input
- `src/components/management/ManagementTextarea.tsx` — shared management textarea
- `src/components/management/ManagementSelect.tsx` — mandatory management select
- `src/app/components/LanguageSelector.tsx` — shared language selector

Additional management-specific controls should be extracted as repeated patterns become clear, especially:

- form field wrapper
- status badge
- section/card shell
- page header
- destructive confirmation/action pattern

The objective is to reduce CSS drift over time rather than maintain visual consistency through repeated manual inspection.

## 16. Review rule

A management UI change is incomplete if it introduces a visually unique control without a justified reason.

Code review should explicitly check:

- 44px standard control height
- shared controls used where available
- RTL/LTR correctness
- hover/focus/disabled behavior
- consistent destructive styling
- consistency with both Control Plane and Merchant Dashboard

This standard is mandatory for new management UI and the target state for existing management UI.

## 17. Management UI implementation gate

Every new or substantially changed management screen must pass this gate.

### Before implementation

1. Inspect the existing management UI and identify reusable patterns/components before creating new controls.
2. Record which existing ShopNest components/patterns will be reused.
3. Prefer Server Components for page/data/auth/business authority.
4. Use small Client Components when browser interaction genuinely requires them, including:
   - drag and drop
   - image preview/picker interaction
   - toggles with in-place save/pending state
   - reorder interaction
5. Client-side interaction must never become tenant, Store, price, authorization, or persistence authority.

### Shared-pattern requirement

Do not implement a page-local alternative when an approved pattern already exists.

Before adding a new:
- input
- file/image picker
- toggle/status control
- reorder interaction
- toast
- same-page mutation
- destructive action
- form layout

search the existing management implementation first.

If an existing component is close but not reusable enough, adapt or extract it rather than duplicating behavior.

### Test requirement

Tests must protect the product behavior and shared UI contract, not accidentally lock in a temporary implementation.

For example:
- test that reorder uses the approved reorder interaction and server-authoritative mutation
- do not require arbitrary implementation details such as `direction=up`
- test that image management reuses the approved image pattern
- test that same-page actions use the shared mutation/toast behavior
- test that new management UI does not introduce untranslated visible strings

### Visual acceptance requirement

A new or substantially changed management screen is not complete based only on unit tests and `npm run build`.

Before PR approval or merge, visually verify the screen in the running DEV environment:

- Hebrew / RTL
- English / LTR
- normal state
- hover/focus
- disabled/pending state
- validation/failure feedback
- responsive layout where relevant
- image preview/upload behavior where relevant
- same-page mutations preserve the workspace and show shared toast feedback

For significant new management UI, the user must see the resulting screen before merge.

### Review stop conditions

Do not approve or merge a management UI change when any of these are present without an explicit documented exception:

- raw management control where a shared ShopNest control already exists
- browser-native file input exposed as the primary upload UI when the shared image pattern applies
- hard-coded visible strings instead of translations
- same-page mutation that navigates away merely to refresh data
- duplicated toast implementation
- inconsistent 44px controls
- physical left/right positioning that breaks RTL/LTR
- page-specific status/toggle behavior inconsistent with similar ShopNest screens
- manual up/down reorder buttons where the approved interaction is drag-and-drop
- visual acceptance has not been completed

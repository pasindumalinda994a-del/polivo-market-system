# 07 — Brand Design System and App Shells

## Goal

Implement Polivo’s shared visual foundations and reusable application shells for:

- The Next.js web dashboard.
- The Electron desktop application.

Create a consistent, accessible light interface that supports readable financial information and fast keyboard operation.

This phase establishes UI foundations only. Do not implement billing, authentication, database access, or synchronization.

## Before Starting

1. Read root `AGENTS.md` and the six context files.
2. Read `docs/context/progress-tracker.md`.
3. Inspect the current web and desktop applications.
4. Inspect `packages/ui`, existing styles, and test configuration.
5. Read any available Polivo brand guidelines referenced by `ui-context.md`.
6. Verify that phases 01–06 are complete or that remaining limitations are documented.

Use the actual available brand assets and context files.

Do not assume access to previous conversations or unavailable attachments.

If the brand guide is unavailable, use the explicit values in `ui-context.md`. Record missing guidance rather than inventing approved brand specifications.

Check current official documentation for compatible Tailwind and shadcn/ui monorepo configuration before installation.

## Visual Direction

Follow `docs/context/ui-context.md`.

The established direction is:

- Light mode.
- White and pale-gray working surfaces.
- Navy for structure and readable financial information.
- Dark green for primary actions.
- Fresh lime as a limited brand accent.
- Clear borders and restrained elevation.
- Readable tables and compact operational controls.

Prioritize:

- Fast data entry.
- Predictable navigation.
- Visible keyboard focus.
- Clear validation and feedback.
- Consistent spacing.
- Legible numbers.

Avoid decorative gradients, glass effects, heavy shadows, and unnecessary animation.

Reserve any approved brand gradient for the supplied logo artwork.

Do not introduce dark mode in this phase.

## 1. Configure the Shared UI Package

Work inside:

`packages/ui`

Preserve the package name:

`@polivo/ui`

Configure it for reusable React components and shared styles.

Requirements:

- Use React versions compatible with both applications.
- Declare React appropriately as a peer dependency.
- Avoid bundling a second React runtime.
- Provide explicit public exports.
- Provide a public CSS entry point.
- Add working build and type-check scripts.
- Keep generated output out of Git.
- Make clean builds work without pre-existing output.

Use the shared-package build conventions established earlier.

Do not introduce a second build strategy without a concrete need.

### Package Boundaries

The shared UI package must not import:

- Next.js routing or server-only APIs.
- Electron or Node.js APIs.
- Clerk or Supabase SDKs.
- Database packages.
- Application-specific state or API clients.
- Environment variables.

Keep navigation destinations and actions supplied through props or application-level adapters.

Interactive components used by Next.js must preserve the required client boundaries in built output.

Do not mark the entire web application as a client component to accommodate the UI package.

## 2. Configure Tailwind and shadcn/ui

Configure Tailwind for both applications using one compatible version and consistent conventions.

Ensure the Tailwind setup discovers classes used by shared UI components.

Configure shadcn/ui for the actual monorepo structure and public import paths.

Requirements:

- Generate reusable components into `packages/ui`.
- Avoid separate, diverging copies in each application.
- Map theme values to Polivo’s shared tokens.
- Keep component configuration aligned with the installed Tailwind version.
- Preserve accessible behavior from the underlying primitives.
- Follow existing project policy on modifying generated components.

If generated components must remain unchanged, apply customization through theme tokens and wrappers.

Install Lucide icons for consistent interface iconography.

Do not install unrelated component libraries.

## 3. Establish Design Tokens

Create a central stylesheet for shared tokens.

Use exact values from `ui-context.md` where provided.

Cover:

- Page background.
- Surface backgrounds.
- Primary and secondary text.
- Muted text.
- Borders.
- Primary actions.
- Secondary actions.
- Accent colors.
- Success, warning, error, and information states.
- Focus indicators.
- Border radii.
- Shadows.
- Spacing and typography conventions.

Map Tailwind and shadcn/ui semantic tokens to these values.

Requirements:

- Components reference tokens rather than hardcoded colors.
- Application styles do not redefine competing token values.
- Status colors include readable foreground/background combinations.
- Focus indicators remain visible across surfaces.
- Color is not the only way to communicate state.

If a necessary token is missing, choose an accessible implementation value consistent with the existing palette and document it as a recommendation, not an approved brand value.

Do not change supplied brand colors silently.

## 4. Configure Typography and Localization Foundations

Use the approved typeface if its assets are available and permitted for use.

Otherwise, use a documented system-font fallback.

Requirements:

- The desktop application must render correctly without internet access.
- Do not depend on a remote font request at startup.
- Provide fallbacks that support Sinhala and English text.
- Use readable line heights.
- Support long names and mixed-language content.
- Use tabular numerals where available for aligned numeric displays.
- Keep numeric columns right-aligned.

Do not implement financial formatting rules, currency rounding, or a full translation system here.

Use explicitly labeled presentation examples where necessary.

## 5. Create Essential UI Primitives

Add only the components needed for the initial shells and near-term operational screens.

Include:

- Button.
- Input.
- Label.
- Textarea.
- Checkbox.
- Select.
- Dialog.
- Alert dialog.
- Dropdown menu.
- Tabs.
- Tooltip.
- Badge.
- Alert.
- Separator.
- Skeleton.
- Scroll area.
- Table.
- Accessible notification/toast component.

Create a reusable class-name merging utility using the existing convention.

### Interaction Requirements

- Buttons have clear variants and sizes.
- Icon-only buttons have accessible names.
- Disabled states are visually and behaviorally clear.
- Loading buttons preserve their label and prevent duplicate activation.
- Inputs have associated labels.
- Validation messages connect to their fields.
- Dialogs manage focus and return it to the triggering control.
- Tooltips do not replace accessible labels.
- Notifications are announced appropriately.

Do not create a complex data grid, command palette, or billing-specific control in this phase.

## 6. Create Shared Layout and Feedback Components

Build reusable presentation components for:

- Application frame.
- Sidebar navigation.
- Header.
- Page title and action area.
- Main content region.
- Empty state.
- Loading state.
- Error state with an optional retry action.
- Status indicator.
- Readable table container.

Keep these components controlled through props.

Do not embed business permissions or service requests inside them.

### Status Indicators

Support presentation states such as:

- Checking.
- Available.
- Unavailable.
- Pending.
- Error.
- Unknown.

State labels must come from the application.

Do not infer actual connectivity, successful saves, or synchronization from the existence of the UI.

Use short, understandable language.

## 7. Build the Web Dashboard Shell

Integrate the shared package into `apps/web`.

Create a dedicated dashboard layout and an initial dashboard page.

Preserve a minimal public root page for later website implementation.

The dashboard shell should contain:

- Polivo brand area.
- Sidebar.
- Header.
- Main content region.
- Page title.
- An initial empty or placeholder state.

Use supplied logo artwork if available.

If no approved logo asset is available, use a simple text wordmark. Do not design a new logo.

### Navigation

Use only destinations supported by the approved scope.

Represent planned destinations as clearly unavailable until implemented.

Do not create misleading working links to nonexistent pages.

Keep route handling in the Next.js application rather than the shared UI package.

Do not show a fabricated signed-in user, active tenant, or account balance.

Authentication and role-based navigation will be implemented later.

## 8. Build the Desktop Application Shell

Integrate the same UI foundations into the desktop renderer.

Create:

- Brand area.
- Compact sidebar or navigation rail.
- Header.
- Main working region.
- A reserved status area for future service and synchronization information.

Keep the shell suitable for keyboard-first billing screens added later.

For service status, use a truthful label such as:

`Service connection not configured`

Do not show “Connected,” “Saved locally,” or “Synced” without real supporting state.

Do not implement:

- Service discovery.
- API requests.
- Staff login.
- Printer selection.
- Billing shortcuts.
- Financial data.

Preserve Electron security settings and process separation.

Keep native window behavior unless the approved UI context explicitly requires custom window controls.

## 9. Establish Keyboard and Accessibility Behavior

Implement the foundations needed across both applications:

- Logical tab order.
- Visible focus.
- Skip-to-content access.
- Semantic landmarks.
- Accessible navigation labels.
- Correct heading hierarchy.
- Escape behavior for dismissible overlays.
- Focus trapping and restoration in modal dialogs.

Do not globally intercept Enter, Escape, or common browser shortcuts.

Do not register billing shortcuts before the billing workflow exists.

Ensure typing inside inputs, textareas, and editable content is not interrupted by shell behavior.

Honor reduced-motion preferences.

Keep operational animations short and nonessential.

## 10. Support Responsive Layouts

Verify layouts at:

- A typical desktop billing resolution.
- A narrower laptop viewport.
- A mobile web viewport.

Requirements:

- Web navigation collapses accessibly on small screens.
- Desktop content remains usable when the window is resized.
- Long content does not push essential controls off-screen.
- Tables scroll within their own container when necessary.
- Horizontal table scrolling does not cause the entire application to overflow.
- Fixed headers or sidebars do not hide focused controls.

Do not assume that all future billing screens will fit a mobile viewport.

Document any minimum operational viewport recommendation as provisional until the POS workflow is tested.

## 11. Add a Development-Only UI Preview

Provide a lightweight local preview of the shared components.

Include examples of:

- Buttons.
- Form fields.
- Validation states.
- Dialogs.
- Alerts and status indicators.
- Empty and loading states.
- A small table with synthetic content.
- Sinhala and English text.
- Long labels and numeric alignment.

Keep the preview development-only and verify that it is unavailable in production.

Do not add Storybook or another preview platform solely for this phase.

Clearly identify sample values as demonstration content.

## 12. Verify Integration and Critical Interactions

Extend the existing test setup only where it verifies meaningful behavior.

Cover:

- The web dashboard shell renders.
- Keyboard users can reach the main content.
- A dialog receives focus and restores it after closing.
- Responsive navigation can open and close accessibly.
- Planned navigation items do not lead to broken routes.
- The desktop shell renders without privileged renderer access.
- The production application does not expose the development preview.

Update existing smoke tests intentionally if the foundation text changes.

Do not weaken tests merely to accommodate a redesign.

Avoid brittle snapshots of complete generated component markup.

### Visual Review

Inspect the rendered web and desktop interfaces where the environment supports them.

Check:

- Token consistency.
- Text contrast.
- Focus visibility.
- Dialog layout.
- Long text.
- Sinhala glyph rendering.
- Numeric alignment.
- Narrow viewports.
- Table overflow.
- Offline font behavior.

If desktop visual inspection cannot run, report the limitation and the exact manual check needed.

Do not claim accessibility compliance based only on automated tests.

## 13. Document the Design System

Create:

`docs/operations/design-system.md`

Document:

- Token locations.
- Public component imports.
- Shared CSS integration.
- Typography and offline font handling.
- Component variants.
- Accessibility conventions.
- Shared-package build/watch behavior.
- Navigation ownership.
- How to open the development preview.
- How to add future components without duplicating styles.

Keep `ui-context.md` as the canonical visual specification.

Record implementation choices without replacing approved brand guidance.

## Scope Limits

For this phase:

- Do not implement billing or financial calculations.
- Do not implement authentication or authorization.
- Do not connect to the stall service or cloud.
- Do not implement synchronization.
- Do not add real account, tenant, or financial data.
- Do not implement printer workflows.
- Do not build the public marketing website.
- Do not implement dark mode.
- Do not invent new brand artwork.
- Do not deploy, commit, or push automatically.

## Check When Done

Run:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e:web`
- `pnpm test:e2e:desktop`, where supported
- `pnpm check`

Verify that:

- Both applications use the shared UI package.
- Shared styles are present in production builds.
- Next.js client boundaries work correctly.
- React is not duplicated by the UI package.
- Desktop rendering does not depend on online fonts.
- No application reports fabricated connection or save states.
- Electron security settings remain intact.
- The development preview is unavailable in production.

Review `git diff` and `git status --short`.

Report checks that could not run separately from successful checks.

## Update Progress

Update `docs/context/progress-tracker.md` with:

- Shared components and tokens implemented.
- Web and desktop shells completed.
- Brand assets and source specifications used.
- Any recommended values added for missing tokens.
- Accessibility and visual review results.
- Outstanding desktop verification.
- Any missing brand guidance.
- Phase 08, `08-business-domain-and-financial-rules.md`, as the next step.

Preserve the existing tracker format.

Note that unresolved financial rules must be confirmed before their dependent implementation in phase 08.

## Completion Report

Provide:

1. Files and shared components created or updated.
2. Web and desktop shell behavior.
3. Brand sources and any provisional design choices.
4. Automated and visual verification results.
5. Remaining limitations or blockers.
6. Whether phase 08 can begin.
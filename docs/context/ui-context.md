# UI Context

## Theme

Polivo uses a light interface built around trust, simplicity, and freshness. White and pale-gray surfaces form the working area, navy provides structure and readable financial information, and dark green identifies primary actions. Fresh lime is a small brand accent.

The visual direction follows the supplied Polivo Brand Guidelines, version 1.0. Border radii and detailed application layouts below are implementation recommendations where the guide does not prescribe exact values.

- Use the same visual foundations across the web dashboard and desktop application.
- Prioritize fast entry, readable tables, predictable controls, and visible save states.
- Use flat colors for operational controls. Reserve the green gradient for approved logo artwork.
- Avoid decorative gradients, glass effects, heavy shadows, and animations that interrupt billing.
- Use light mode for the initial release. Dark mode requires a separately defined and tested token set.
- Write short, familiar labels. Prefer “Saved locally. Sync pending.” over technical implementation language.
- Treat brand-guide screenshots as visual examples, not complete billing requirements or confirmed business rules.

## Colors

Define these CSS custom properties centrally. All components must reference tokens rather than hardcoded color values. Map Tailwind and shadcn/ui theme values to the same tokens.

| Role | CSS Variable | Value |
| ---- | ------------ | ----- |
| Page background | `--bg-base` | `#F6F8FA` |
| Surface | `--bg-surface` | `#FFFFFF` |
| Navigation background | `--bg-navigation` | `#102F46` |
| Selected row / active item | `--bg-selected` | `#EAF7EE` |
| Primary text | `--text-primary` | `#102F46` |
| Muted text | `--text-muted` | `#526174` |
| Text on dark surfaces | `--text-inverse` | `#FFFFFF` |
| Primary accent / action | `--accent-primary` | `#15803D` |
| Primary action hover | `--accent-primary-hover` | `#166534` |
| Brand highlight | `--brand-lime` | `#4CFF32` |
| Logo base green | `--brand-leaf` | `#079C08` |
| Decorative border / divider | `--border-default` | `#D9E1E8` |
| Input / control border | `--border-control` | `#718096` |
| Keyboard focus | `--focus-ring` | `#2563EB` |
| Focus outline gap | `--focus-gap` | `#FFFFFF` |
| Success text / icon | `--state-success` | `#166534` |
| Success background | `--state-success-bg` | `#DCFCE7` |
| Warning text / icon | `--state-warning` | `#92400E` |
| Warning background | `--state-warning-bg` | `#FEF3C7` |
| Error text / icon | `--state-error` | `#B91C1C` |
| Error background | `--state-error-bg` | `#FEE2E2` |
| Information text / icon | `--state-info` | `#1D4ED8` |
| Information background | `--state-info-bg` | `#DBEAFE` |
| Neutral status text / icon | `--state-neutral` | `#526174` |
| Neutral status background | `--state-neutral-bg` | `#F1F5F9` |
| Disabled background | `--bg-disabled` | `var(--state-neutral-bg)` |
| Disabled text | `--text-disabled` | `var(--text-muted)` |

### Usage Rules

- Use white text on Action Green for primary buttons.
- Use navy text on Fresh Lime. Never use white text on Fresh Lime.
- Use decorative borders for panel separation and stronger control borders for input boundaries.
- Show keyboard focus with a 2 px blue outline and a 2 px white gap.
- Pair every status color with a readable label and an appropriate icon.
- Do not use red for every unpaid balance. Reserve red for errors, destructive actions, or clearly defined exceptional conditions.
- Keep local-save status and cloud-sync status distinct. “Saved locally · Pending sync” must not imply a failed local save.
- Show service connectivity separately from internet connectivity. A disconnected cloud does not necessarily prevent local billing.
- Validate actual foreground/background combinations: target at least 4.5:1 for normal text and 3:1 for large text and meaningful control boundaries.

## Typography

| Role | Font | Variable |
| ---- | ---- | -------- |
| English UI and numbers | Inter | `--font-sans` |
| Sinhala UI | Noto Sans Sinhala | `--font-sinhala` |
| Technical identifiers / diagnostics | System monospace stack | `--font-mono` |

- Use `Inter, "Noto Sans Sinhala", system-ui, sans-serif` as the general interface stack.
- Explicitly apply Noto Sans Sinhala to Sinhala-language text.
- Bundle fonts locally so the desktop interface renders correctly without internet access.
- Use regular, medium, semibold, and bold weights.
- Keep logo lettering as artwork; do not recreate the wordmark using the interface font.
- Use tabular numerals for weights, prices, balances, and totals. Financial values remain in Inter rather than a monospace font.
- Left-align labels and descriptions. Right-align numeric table columns.
- Keep currency and measurement units visible and consistently formatted.
- Use rem units based on a 16 px root and respect user scaling.

| Role | Size / Line Height | Weight |
| ---- | ------------------ | ------ |
| Page title | 28 / 36 px | 600 |
| Section heading | 20 / 28 px | 600 |
| Card heading | 16 / 24 px | 600 |
| Navigation | 15 / 24 px | 500 |
| Body and table data | 16 / 24 px | 400 |
| Input value | 18 / 28 px | 500 |
| Field label | 14 / 20 px | 500 |
| Button | 16 / 24 px | 600 |
| Helper text / status | 14 / 20 px | 400 |
| Secondary metadata | 12 / 18 px | 400 |
| KPI / grand total | 32 / 40 or 36 / 44 px | 700 |

For Sinhala text, use a line height of at least 1.5 times the font size, even where the English scale is tighter. Allow labels to wrap and prevent vowel marks from being clipped.

## Border Radius

Use this proposed application scale consistently. Map the classes to shared radius tokens rather than scattering arbitrary values throughout components.

| Context | Class |
| ------- | ----- |
| Compact badges / shortcut hints | `rounded-sm` |
| Inputs / buttons / dropdown items | `rounded-md` |
| Cards / panels / dropdown menus | `rounded-lg` |
| Modals / overlays | `rounded-xl` |
| Circular avatars / status dots | `rounded-full` |

- Keep billing controls compact and clearly bounded.
- Avoid large pill-shaped inputs and oversized rounded containers.
- Use full rounding only where the shape serves a clear purpose.
- Use borders as the main separator; reserve restrained shadows for elevated menus and overlays.

## Component Library

Use shadcn/ui with Tailwind CSS, as defined in the shared architecture.

- Keep reusable presentation components in `packages/ui/`.
- Use the shadcn CLI to add supported primitives to the configured shared UI location.
- Adapt primitives through shared tokens and composed components.
- Keep financial logic, database access, permissions, and Electron operations outside shared UI components.
- Standardize buttons, fields, dialogs, search selectors, tables, status badges, empty states, and error messages.
- Provide a reusable status display that distinguishes service availability, local save state, and cloud synchronization.
- Show one clear primary action for the current task. Use secondary styling for supporting actions.
- Give inputs persistent labels; placeholders must not be the only label.
- Show validation near the affected field without unexpectedly moving the active control.
- Use inline confirmation for routine saves. Do not interrupt every bill with a success modal.
- Preserve focus when dialogs close, searches finish, or validation fails.
- Use persistent error messaging when staff must act; do not rely solely on disappearing toasts.

## Layout Patterns

- **Application shell:** Use a left navigation sidebar, a top task header, and a light main workspace. A navy sidebar may provide brand structure while operational content remains on white or pale gray.

- **Navigation:** Keep destinations stable and label them clearly. Indicate the active page through shape, text, and color. Use consistent terminology for buyers/traders throughout the application.

- **Desktop billing:** Keep party selection, line entry, transaction rows, totals, and final actions within a stable workspace. Make farmer ownership, vegetable, package weights, price, and amount easy to inspect.

- **Billing table:** Use default row heights of 44–48 px. Keep numeric columns aligned and headers visible for long lists. Allow Sinhala text or zoom to increase row height instead of clipping content.

- **Totals and actions:** Keep the grand total prominent and the primary save action easy to find. Printing or reprinting must not appear to create another sale.

- **Web dashboard:** Use summary cards, filters, and report tables. Display the freshness of synchronized data. Do not show editable financial controls for the initial read-only reporting scope.

- **Search and selection:** Support short-code entry and keyboard selection for farmers, buyers, and vegetables. Keep the selected item visually distinct and preserve entered values during recoverable errors.

- **Keyboard workflow:** Provide predictable tab order, visible focus, and discoverable shortcuts. Final shortcut mappings must be documented; do not invent different mappings on different screens.

- **Spacing:** Use 8, 16, 24, and 32 px steps for primary layout spacing. Keep related fields together and separate different tasks clearly.

- **Dialogs:** Use focused overlays with readable titles and explicit actions. Trap focus while open and return it to the initiating control when closed. Avoid nested dialogs in billing workflows.

- **Responsive behavior:** Collapse navigation and rearrange dashboard content on smaller screens. Preserve financial detail through deliberate table scrolling or structured record views rather than hiding critical values.

- **Zoom and accessibility:** Verify keyboard-only operation, 200% text zoom, long Sinhala labels, and actual stall monitors. Sticky headers and action areas must not obscure focused controls.

- **Logo placement:** Use the full horizontal logo on white with clear space of at least one-quarter of the symbol height. Start at 140 px width for the full logo and 24–32 px for the symbol, increasing size if details lose clarity.

- **Logo on dark surfaces:** Place the current logo in a white container until an approved reverse master is available. Do not stretch, recolor, rotate, or add shadows to the artwork.

- **Thermal bills:** Use a dedicated black-only print layout, with transaction details larger than decorative branding. Test the actual printer, paper width, Sinhala rendering, and driver. Use an approved monochrome logo master rather than relying on grayscale conversion of the gradient.

## Icons

Use Lucide React as the proposed shared interface icon set.

- Use consistent stroke-based icons rather than mixing icon families.
- Use `h-4 w-4` for inline indicators and `h-5 w-5` for standard buttons and navigation.
- Maintain an adequate interactive target around small icons; icon dimensions are not button dimensions.
- Pair icons with text for financial actions, connection states, and synchronization statuses.
- Give icon-only buttons accessible names and visible tooltips.
- Mark purely decorative icons as hidden from assistive technology.
- Never use an icon alone to distinguish “saved locally,” “pending sync,” and “synced.”
- Use the approved Polivo symbol for brand recognition; do not substitute a generic leaf icon.
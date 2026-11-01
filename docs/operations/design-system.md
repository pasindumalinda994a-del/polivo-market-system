# Design System

Shared visual foundations for the Polivo web dashboard and desktop application live in `@polivo/ui`. Canonical brand rules remain in `docs/context/ui-context.md`. This document records how the package is wired in the monorepo.

## Package location

- Package: `packages/ui` (`@polivo/ui`)
- Build: `tsc` → `dist/` (same convention as `@polivo/contracts`)
- Public CSS: `@polivo/ui/styles.css` → `packages/ui/src/styles/globals.css`
- React and React DOM are peer dependencies so applications supply a single runtime

```powershell
pnpm --filter @polivo/ui build
pnpm dev:ui
```

Root `pnpm build` and `pnpm typecheck` build `@polivo/ui` before the applications.

## Tokens

Polivo CSS custom properties are defined in `packages/ui/src/styles/globals.css` using the exact values from `ui-context.md` (page/surface/navigation backgrounds, text, accents, borders, focus, and status colors).

Tailwind v4 and shadcn-style semantic tokens (`--primary`, `--destructive`, `--ring`, and related) map to those Polivo variables.

Provisional implementation values (not brand-approved) currently include:

- `--bg-secondary` / `--bg-secondary-hover` for secondary actions
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` for elevated menus and overlays
- Border radius scale mapped to `rounded-sm` through `rounded-xl`

Do not change supplied brand hex values silently. Prefer wrappers and tokens over editing generated primitives for product-specific look.

## Typography and offline fonts

- Stack: `Inter, "Noto Sans Sinhala", system-ui, sans-serif`
- Sinhala text: apply `.font-sinhala` (`Noto Sans Sinhala` first)
- Numeric alignment: `.tabular-nums` / `.text-numeric`
- Fonts ship from `@fontsource/inter` and `@fontsource/noto-sans-sinhala` and are imported by the shared stylesheet so the desktop renderer does not depend on a network font request

Logo artwork was not available in the repository for this phase. Applications use a text wordmark (`BrandMark`) until approved assets are added.

## Public imports

```ts
import {
  Button,
  AppShell,
  PageHeader,
  StatusIndicator,
  // ...
} from "@polivo/ui";
```

```css
@import "tailwindcss";
@import "@polivo/ui/styles.css";

@source "../../../../packages/ui/src/**/*.{ts,tsx}";
@source "../**/*.{ts,tsx}";
```

Each application compiles Tailwind locally:

- Web: `@tailwindcss/postcss` via `apps/web/postcss.config.mjs`
- Desktop renderer: `@tailwindcss/vite` in `apps/desktop/electron.vite.config.ts`

Keep `@source` paths pointed at `packages/ui/src` so utility classes used by shared components are discovered.

## Component variants

Essential primitives follow shadcn/ui **new-york** patterns with Lucide icons:

Button, Input, Label, Textarea, Checkbox, Select, Dialog, Alert Dialog, Dropdown Menu, Tabs, Tooltip, Badge, Alert, Separator, Skeleton, Scroll Area, Table, and Sonner-based toast (`Toaster` / `toast`).

Layout and feedback components are prop-driven and must not embed permissions, API clients, or Electron APIs:

- `AppShell`, `SidebarNav`, `AppHeader`, `PageHeader`, `BrandMark`, `SkipLink`
- `EmptyState`, `LoadingState`, `ErrorState`, `StatusIndicator`, `TableContainer`

Status indicator tones (`checking`, `available`, `unavailable`, `pending`, `error`, `unknown`) are presentation-only. Labels come from the application. Do not infer connectivity or save success from the presence of the component.

## Accessibility conventions

- Visible focus uses the shared focus ring and white gap tokens
- Skip-to-content is included in `AppShell`
- Dialogs trap focus and restore it to the trigger on close
- Icon-only buttons require accessible names
- Loading buttons keep their label and set `aria-busy`
- Inputs pair with `Label`; validation messages reference fields with `aria-describedby`
- Honor `prefers-reduced-motion`
- Color is never the only status signal; pair with text and icons

## Navigation ownership

Route handling stays in each application. `@polivo/ui` receives navigation items as props (`href`, `available`, `active`, labels). Planned destinations that are not implemented must be marked unavailable rather than linking to missing pages.

## Development UI preview

Open the local preview while the web app is in development mode:

```powershell
pnpm dev:web
```

Then visit `http://localhost:3000/dev/ui`.

The route returns 404 in production builds. Sample values on that page are demonstration content only.

## Adding future components

1. Prefer adding shared primitives to `packages/ui` rather than copying markup into each app.
2. Reference Polivo tokens / Tailwind theme colors; avoid hardcoded hex in components.
3. Mark interactive modules with `"use client"` so Next.js Server Components can import them as client boundaries.
4. Rebuild or watch `@polivo/ui` after TypeScript changes (`pnpm --filter @polivo/ui build` or `pnpm dev:ui`).
5. Keep Next.js, Electron, Clerk, Supabase, database packages, and environment variables out of `@polivo/ui`.

## Desktop billing layout reference

Operational desktop billing screens should follow the familiar three-pane Seller Bill pattern documented in `docs/context/desktop-billing-layout.md` (source wireframe: `inspiration Layouts/Seller Bill Wireframr.png`). That guide covers top module navigation, paid/unpaid side lists, and the dense center bill workspace. It does not replace token or component rules in this file or in `ui-context.md`.

## Related docs

- Visual specification: `docs/context/ui-context.md`
- Desktop billing layout: `docs/context/desktop-billing-layout.md`
- Local commands: `docs/operations/local-development.md`
- Implementation guide: `docs/implementation/07-brand-design-system-and-app-shells.md`

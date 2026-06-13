## Goal

Borrow Profit Navigator's **structure** (sidebar shell, card shapes, stat-card pattern, spacing rhythm, hover/transition feel) and apply it across the KORAUTO app, but keep the palette strictly **black & white** (white surfaces, black text, gray borders). No dark mode, no gradients, no color accents — matches your existing Core memory.

Profit Navigator uses TanStack Router; KORAUTO is Next.js with a single monolithic `Dashboard.tsx` that switches `view` state. I will NOT swap routers — I will recreate the look using your existing structure.

---

## Phase 1 — Global design tokens & primitives

**Files:** `app/globals.css`, `tailwind.config.ts` (if exists), new `components/ui/GlassCard.tsx`, new `components/ui/StatCard.tsx`

- Define a strict monochrome token set:
  - `--bg`: `#ffffff` · `--surface`: `#ffffff` · `--surface-2`: `#fafafa`
  - `--text`: `#0a0a0a` · `--text-muted`: `#6b7280`
  - `--border`: `#e5e7eb` · `--border-strong`: `#d1d5db`
  - `--ring`: `#0a0a0a` (focus)
  - Radii: `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-2xl: 20px`
  - Shadows: `--shadow-card: 0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)`
- Port PN's animations recolored to mono: `fade-up`, `shimmer` (gray), `liquid-hover` (lift + border darken, no glow).
- Build `Card` / `StatCard` primitives (white bg, 1px border, 16px radius, soft shadow, hover lift).

## Phase 2 — App shell (sidebar + header)

**Files:** new `components/AppShell.tsx`, edit `components/Dashboard.tsx` to render through it.

- Replace top tab bar with a **collapsible left sidebar** (icon + label), mirroring PN's `app-sidebar.tsx` layout but in white/black.
- Sticky 56px top header: sidebar trigger on the left, page title, profile menu on the right.
- Keep mobile single-row tab bar (Core memory: mobile nav density) — sidebar is desktop-only, mobile keeps current bottom nav.
- Wire existing `view` state into sidebar menu items; preserves all routing logic and Core "no internal page reloads" rule.

## Phase 3 — Tab-by-tab polish pass

For each main tab (Car Sold, Shipped, Autosallon, Inspections, Mechanic, Balance, Per Pages, Libri, Ankesa Dogana, Settings, Records):

- Headers: consistent 24px page title + 12px muted subtitle.
- Section cards wrapped in new `Card` primitive (uniform radius, padding, border).
- Tables: uniform 40px row height, sticky headers, divider color, hover row, empty state component.
- Buttons: 3 sizes (sm 32px / md 40px / lg 48px), 3 variants (primary=black, secondary=white+border, ghost). Focus rings.
- Inputs: 40px height (matches Core compact-modal rule), uniform border + focus state.
- Modals: standardized header/body/footer, consistent padding (20px), close affordance, escape behavior.

## Phase 4 — Detail polish

- Replace ad-hoc `bg-slate-*` and `text-slate-*` with semantic tokens (only neutral grays remain).
- Standardize spacing scale (4/8/12/16/20/24/32).
- Lucide icon size unified at 16px in dense rows, 18px in headers.
- Loading skeletons use mono shimmer.

---

## Out of scope (will not touch)

- 🔒 PDF engine (Invoice/Contract Document/Modal, pdfUtils, EditablePreviewModal, PDF CSS).
- Business logic, calculations, RLS, edge functions, sync strategy.
- Mobile bottom nav structure (Core memory).
- Root container overflow rules (Core memory).
- Adding any color other than B&W + neutral gray.

---

## Delivery model

Because this touches the whole app, I'll ship in the 4 phases above, **one phase per turn**, and you preview between each. That way if Phase 2's sidebar feels wrong we fix it before Phase 3 rewrites every tab against it.

Phase 1 first — confirm and I start there.

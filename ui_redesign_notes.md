# UI Redesign Notes

## Visual tokens
- 8px spacing rhythm retained through `p-2/p-3/p-4` and `gap-2/gap-3` usage.
- Radius scale standardized around `rounded-xl` and `rounded-2xl`.
- Neutral premium surface stack uses `bg-white`, `bg-slate-50`, subtle border `border-slate-200`, and soft shadows.
- Typography uses strong hierarchy: title (`text-2xl font-black`), section labels (`uppercase tracking`), body (`text-sm`), metadata (`text-xs`).

## Navigation restoration
- Restored top-level nav order and behavior to `Dashboard → Reports → Settings` in `AppLayout`.
- Added exact route-based active state via `NavLink` with `end` matching for `/`.
- Added desktop top navigation and mobile bottom navigation for responsive parity.

## Motion + interaction
- Navigation interactions animate with transform/opacity friendly transitions.
- Existing global reduced-motion media query remains active and disables transitions/animations when preferred.
- Mobile bottom tab active state has subtle contrast without layout shift.

## Balance Due view
- Uses existing `calculateBalance` formula from Dashboard.
- New aggregation separates:
  - Sold subtotal
  - Shipped subtotal excluding sold IDs (no double counting)
  - Grand total = sold + shipped-only
- Added search, shipped/sold filter, and balance sort.
- Added status/date columns for clearer auditing.

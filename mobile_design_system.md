# Mobile Design System (<=768px)

## Tokens
- **Spacing (8px grid):** 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem.
- **Typography:**
  - Title: `clamp(0.95rem, 2.5vw, 1.125rem)`
  - Body: `0.875rem` to `1rem`
  - Caption: `0.6875rem` to `0.75rem`
- **Radius:** 0.75rem / 1rem / 1.5rem for controls/cards/sheets.
- **Shadows:** subtle layered shadows (`shadow-lg`, `shadow-2xl`) only on elevated surfaces.

## Core mobile shell primitives
- `data-mobile-shell="true"` root marker for QA selectors.
- `app-topbar` sticky top app bar using safe-area inset handling.
- `app-content` scroll container with adaptive padding.
- `app-mobile-nav` bottom quick-nav with safe-area bottom padding.

## Component rules used
- `ui-control` minimum tappable sizes with smooth transition and active feedback.
- `mobile-nav-item` / `mobile-nav-item-active` for bottom tab actions.
- Bottom-sheet action panel for sold-car long-press actions:
  - transform/opacity animation
  - safe-area-aware bottom padding
  - no absolute fragile content positioning

## Responsiveness + safety constraints
- Mobile-only behavior gated via `md:hidden` patterns.
- `min-width: 0` and `overflow-wrap: anywhere` retained to prevent clipping.
- Dynamic viewport + safe area insets are respected (`100dvh`, `env(safe-area-inset-*)`).
- Motion remains compatible with global `prefers-reduced-motion` rules already present in stylesheet.

## QA guardrails
- Mobile E2E checks assert shell and key actions visibility.
- Long-press interactions verified with dedicated mobile behavior test coverage.
- Visual snapshots run across multiple phone widths.

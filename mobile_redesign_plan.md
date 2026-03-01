# Mobile Redesign Plan

## Phase 1 — Mobile UX audit

### Dashboard / Sales list (mobile)
- Critical actions were split across crowded headers and row overflow controls, making **Add Sale** and **More actions** hard to reach one-handed.
- Fixed-position elements and sticky areas had inconsistent spacing from safe-area insets; content could sit too close to the home indicator.
- Dense table semantics were difficult to scan on small widths and larger font scales.

### Add Sale flow
- Add flow relied on a modal/sheet that could collide with keyboard + viewport height changes.
- Primary save/close controls were reachable but not consistently protected from bottom safe-area overlap.

### Edit Sale / Car details
- Sale details modal lacked a dedicated mobile action bar for primary actions (Edit, Documents, PDF operations).
- Document access required scrolling deep into content, causing action discoverability issues.

### Documents / PDF actions
- Attachment rows exposed preview actions but not a clear mobile-first action menu with Preview/Download/Print.
- PDF preview controls were concentrated in header action cluster; in narrow viewports they could wrap or become hard to tap.

### Download / Print
- Download/Print actions existed but were not always persistent in mobile viewport while reviewing a document.

### Reports / Settings
- Mobile navigation existed but needed stronger shell behavior (safe area + fixed bottom nav behavior).

## Phase 2 — New mobile navigation blueprint
- Keep desktop layout behavior unchanged.
- Build a mobile shell pattern with:
  - Safe-area-aware top bar.
  - Fixed bottom nav with adaptive padding.
  - Content area reserving bottom space to avoid hidden controls.
  - Persistent mobile FAB for Add Sale.
- Add reusable sticky bottom action bars for mobile details + PDF screens.

## Phase 3 — Component plan
- `MobileShell` behavior via global shell styles (`app-shell`, `app-topbar`, `app-content`, `app-mobile-nav`).
- `mobile-sticky-actions` utility for 3-action bottom bars with 44px+ targets.
- Mobile documents action sheet per attachment with: Preview / Download / Print / Close.
- Mobile sale detail sticky action bar with: Edit / Documents / PDF.
- Mobile PDF preview sticky action bar with: Download / Print / Close.

## Phase 4 — Action mapping (old -> new placement)
- **Add Sale**: old floating action button -> retained as mobile-only FAB with better safe-area offset.
- **Edit Sale**: old deep actions -> new sticky bottom action on sale details modal.
- **Documents**: old inline file taps -> new explicit `Actions` button per document + bottom sheet.
- **PDF Preview**: old header controls only -> new persistent sticky mobile bottom bar.
- **Download/Print**: old top action cluster -> kept on desktop and duplicated in sticky mobile bar for guaranteed reachability.

## Phase 5 — Adaptive rules implemented
- Fluid spacing with `clamp()` and relative spacing for shell paddings.
- Safe area insets applied to top bar, bottom nav, content, and sticky actions.
- `100dvh` usage for full-screen modal behavior.
- Tap targets normalized to >=44px in mobile sticky bars and action sheet controls.

## Phase 6 — QA targets
- Validate no overlap between top bar/content/bottom nav and sticky action bars.
- Validate critical actions visible at widths: 320, 360, 390, 414, 430.
- Validate mobile PDF action availability without requiring scroll.
- Run build and Playwright mobile tests for reachability and viewport bounds.

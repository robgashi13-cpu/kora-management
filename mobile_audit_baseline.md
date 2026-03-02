# Mobile Baseline Audit

## Scope audited
- Dashboard / Cars sold mobile cards
- Invoices tab and PDF tab
- Settings, Record, Balance Due, Transport tabs
- Global shell (header, drawer, floating actions)

## Findings by screen

### 1) Dashboard (Cars Sold + active lists)
- Sold-card actions were not exposed by press-and-hold, making desktop-equivalent row tools less discoverable on touch.
- Existing swipe gestures were limited to non-sold rows, so sold items had no compact action affordance on mobile.
- Quick tab switching required opening the side drawer; this adds friction on smaller phones.

### 2) Invoice tab
- Primary actions were available but depended on vertical reach and deep scroll position.
- No persistent mobile quick nav pattern to jump between dashboard/invoice/pdf contexts.

### 3) Documents / PDF preview tab
- Reaching PDF context required multiple taps via menu on phone widths.
- Sticky action affordance existed in content, but global path to PDF tools was not optimized.

### 4) Other tabs (Settings / Record / Balance Due / Transport / Custom Dashboard)
- Functional on mobile, but shell-level navigation consistency depended on drawer interactions.

## Console + warnings baseline
- Existing E2E coverage already includes console-error assertions in main mobile flows.
- No new baseline runtime exception pattern identified in the code audit.

## Reachability risks
- Sold-row tools not directly reachable via long-press workflow.
- Repetitive drawer-open flow for core tabs (dashboard/invoices/pdf) increases chance of unreachable interactions under one-handed usage.

## Baseline priority list
1. Add explicit long-press (>=3s) actions on sold cards with accidental-trigger prevention.
2. Add persistent mobile bottom quick navigation for core tabs.
3. Keep desktop behavior unchanged and preserve existing data/logic/API contracts.

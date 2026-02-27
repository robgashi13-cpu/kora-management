# KORA Management Technical Audit Report

Date: 2026-02-27

## Executive summary

This repository is in a **hybrid transitional state** (mobile-first app + web app), with both Next.js and Vite build paths, Capacitor mobile dependencies, and a very large client-side dashboard component. The current build is functional, but the architecture carries medium-to-high operational risk for production-grade SaaS requirements.

### Severity overview

- **Critical**
  - None detected from static/build-only audit.
- **High**
  1. Hardcoded admin credentials in client code (`ADMIN_PASSWORD`) within `components/Dashboard.tsx`.
  2. Hybrid framework/tooling (Next + Vite + Capacitor artifacts) increases deployment/runtime inconsistency risk.
- **Medium**
  1. 42 lint warnings (hook dependencies, unused vars, image optimization warnings).
  2. Mobile/PWA-style viewport constraints still present (`maximumScale=1`, `userScalable=false`) that are harmful for accessibility.
  3. Global `overflow: hidden` patterns may cause web UX and responsive issues.
  4. Monolithic `Dashboard.tsx` (~3k+ lines) indicates low maintainability and high change risk.
- **Low**
  1. Baseline browser data staleness warnings.
  2. Multiple deprecated transitive packages reported during install.

---

## 1) Stack detection

### Framework
- **Primary runtime framework**: Next.js 16 (App Router) with React 19.
- **Secondary/bundler path still present**: Vite 7 + React SWC plugin.

### Routing system
- Next.js App Router (`app/` directory) with root page and implicit not-found.
- Also includes legacy Vite SPA entrypoint (`src/main.tsx`), indicating dual routing history.

### State management
- No centralized library (Redux/Zustand/etc.) found.
- Predominantly local React state/hooks inside `components/Dashboard.tsx` and related modals.

### Build tool
- `npm run build` => `next build` (primary production path for current scripts/deploy).
- `npm run build:vite` available and successful, indicates parallel legacy web build path.

### Deployment target
- GitHub Actions deploy workflow targets **GitHub Pages** using `./out` artifact.
- `next.config.ts` uses `output: 'export'`, matching static export deployment.

---

## 2) Build/lint/typecheck/install execution results

Commands executed:
- `npm ci`
- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build:vite`

### Results summary

- Install: **pass** with deprecation warnings.
- Next build: **pass**.
- Lint: **pass with warnings** (42 warnings, 0 errors).
- Typecheck: **pass**.
- Vite build: **pass**, bundle sizes produced.

---

## 3) Errors, warnings, deprecated packages, dependency/bundle/security analysis

### Build errors
- No blocking build errors in Next or Vite production builds.

### Warnings observed
1. Baseline browser mapping data stale warning during build.
2. ESLint warnings (42 total), key classes:
   - `@typescript-eslint/no-unused-vars`
   - `react-hooks/exhaustive-deps`
   - `@next/next/no-img-element`

### Deprecated packages observed during install
- `inflight@1.0.6`
- `rimraf@3.0.2`
- `glob@7.2.3`
- `q@1.5.1`
- `@xmldom/xmldom@0.7.13`

(These appear to be transitive dependencies.)

### Large dependency footprint (node_modules top entries by disk size)
- `@next` ~264M
- `next` ~158M
- `@swc` ~72M
- `@napi-rs` ~61M
- `lucide-react` ~44M
- `date-fns` ~39M
- `pdfjs-dist` ~37M
- `@capacitor` ~27M
- `openai` ~13M

### Bundle size breakdown (Vite output)
- `dist/assets/index-CrdK3bJg.js` ~941.22 kB (gzip ~260.99 kB)
- `dist/assets/html2pdf-7roE1POq.js` ~731.97 kB (gzip ~205.68 kB)
- `dist/assets/html2canvas.esm-Ge7aVWlp.js` ~201.40 kB (gzip ~47.48 kB)
- `dist/assets/index.es-Bq9K4ms_.js` ~158.58 kB (gzip ~52.92 kB)
- CSS `index-CxT-Cfbd.css` ~87.81 kB

This indicates heavy client bundle cost, especially PDF/document generation paths.

### Security vulnerabilities
- `npm audit --json` could not complete due registry/API permission issue (`403 Forbidden`), so vulnerability count is **unknown from this run**.

---

## 4) Architecture analysis

### Folder structure observations
- `app/` (Next app router), `components/`, `services/` indicate active Next app.
- `src/`, `legacy_src/`, Vite config and scripts indicate legacy SPA artifacts remain.
- `ios/` and `capacitor.config.ts` indicate mobile app lineage still coupled to web build.

### Component structure
- `components/Dashboard.tsx` is a monolith that appears to own multiple concerns:
  - Auth/profile logic
  - Data orchestration
  - Table rendering
  - Sync logic triggers
  - Modal orchestration
  - Document generation integrations

### Reusable patterns
- Some shared utility/component extraction exists (`pdfUtils`, `useResizableColumns`, modals).
- However, much business logic appears colocated in UI component layer.

### State duplication risk
- Local state-heavy flows + sync pipelines + modal state in large component suggests duplicated and implicit state coupling.
- Presence of both local persistence/mobile storage and Supabase sync paths increases divergence risk.

### Anti-patterns detected
1. **Hardcoded credentials in client UI code**.
2. **Mixed runtime targets** (Next static export + Vite + Capacitor) without clear boundary.
3. **Client-side oversized feature loading** (PDF stack loaded into primary bundle path).
4. **Global CSS overflow locking** likely inherited from app-shell/mobile behavior.
5. **Accessibility-reducing viewport config** (`userScalable: false`).

---

## 5) Refactor roadmap (phase-oriented)

## Phase A — Stabilize platform boundary (High)
1. Choose one web runtime as primary (recommended: Next App Router only).
2. Remove or isolate Vite/legacy entrypoints into archival folder or separate package.
3. Keep Capacitor in isolated mobile package if still needed.
4. Add architecture decision record documenting deployment/runtime boundaries.

## Phase B — Security hardening first (High)
1. Remove all hardcoded credentials from client code.
2. Move auth to server-side validated flow (Supabase Auth or equivalent).
3. Enforce RBAC on backend for sales/documents.
4. Add secure headers policy and input validation middleware.

## Phase C — Layout system modernization (Medium)
1. Introduce unified `AppLayout` (Sidebar + Topbar + Content region).
2. Replace global overflow lock with route/content-level scroll control.
3. Add responsive layout QA for 390/768/1366/1920 breakpoints.

## Phase D — Component/domain decomposition (Medium)
1. Split `Dashboard.tsx` into modules:
   - `features/sales`
   - `features/documents`
   - `features/profiles`
   - `features/sync`
2. Introduce typed domain services and thin view components.
3. Add React Query (or equivalent) for server state and cache invalidation.

## Phase E — Performance optimization (Medium)
1. Lazy-load heavy PDF/document libs (`html2pdf.js`, `pdfjs-dist`).
2. Replace raw `<img>` with optimized image strategy where appropriate.
3. Audit icon imports and date utility imports for tree-shake efficiency.
4. Add bundle analyzer in CI with budget thresholds.

## Phase F — Quality gates & CI (Medium)
1. Enforce `eslint --max-warnings=0` after warning cleanup.
2. Add Playwright E2E for auth/navigation/CRUD/documents/calculations.
3. Add console error assertion and visual regression snapshots.
4. Add `npm audit` and dependency checks in CI (with working registry creds).

---

## 6) Immediate priority fixes

1. Remove hardcoded admin password from client bundle.
2. Eliminate dual-framework ambiguity (decide Next-only web path).
3. Remove accessibility-hostile viewport restrictions.
4. Reduce initial JS by deferring PDF/document code.
5. Resolve lint warnings in hook deps and dead code.


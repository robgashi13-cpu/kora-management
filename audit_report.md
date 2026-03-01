# Production Readiness Audit — KORA Management

Date: 2026-03-01

## 1) Stack Detection

- **Framework/runtime:** React + TypeScript.
- **Routing:** React Router (`BrowserRouter`) introduced in `src/main.tsx`; legacy `Next.js` app directory still exists but is excluded from active web runtime.
- **State management:** Component-local React state in `components/Dashboard.tsx` (very large state surface); no centralized global store.
- **Build tool:** Vite (`vite.config.ts`, npm scripts).
- **Deployment target:** Static SPA deployment (Vercel/Netlify compatible rewrites added via `vercel.json` and `public/_redirects`).

## 2) Command Audit Results

### Install
- Command: `npm ci`
- Result: **FAILED**
- Failure: 403 from npm registry for locked package tarballs (notably Next.js package in legacy lock data).

### Build
- Command: `npm run build`
- Result: **FAILED** (environment not install-complete, `vite` missing).

### Lint
- Command: `npm run lint`
- Result: **PASSED** (with current lightweight root config).

### Typecheck
- Command: `npx tsc --noEmit`
- Result: **FAILED**
- Primary cause during baseline: mixed Next.js/Vite code paths and missing installed dependencies caused thousands of unresolved-type errors.

### Security audit
- Command: `npm audit --package-lock-only --json`
- Result: **FAILED** (403 on advisory endpoint in current environment).

## 3) Build Errors / Warnings / Dependency Risk

### Critical build blockers
1. Mixed Next.js and Vite architecture in one root caused tooling conflicts.
2. `package-lock.json` referenced blocked artifacts in this environment, preventing a clean dependency install.
3. Legacy Next-specific lint/type tooling references were incompatible with target Vite SPA flow.

### Deprecated/transitive warnings observed
- `inflight`, `rimraf@3`, `glob@7`, `q`, `@xmldom/xmldom@0.7.x` warnings observed during install attempt.

### Large dependency risk (qualitative)
Likely heavy runtime contributors:
- `framer-motion`
- `pdfjs-dist`
- `openai`
- `@google/generative-ai`
- Capacitor packages in web bundle context (if imported on web paths)

> Full quantitative bundle breakdown requires successful install + build output.

## 4) Architecture Analysis

## Folder and module structure
- `components/` contains most business logic/UI logic.
- `components/Dashboard.tsx` is a monolithic component responsible for CRUD, auth UX, data sync, table rendering, PDF/export flows, and layout concerns.
- `services/` contains backend integration helpers.
- `src/` acts as web entrypoint.
- `app/` and `legacy_src/` are historical paths still present in repo and caused type/build confusion before refactor.

## Reuse patterns and anti-patterns
- Positive: rich domain typing (`CarSale`, attachment models), reusable modal/components.
- Anti-patterns:
  - Over-centralized UI/business logic in a single mega-component (`Dashboard.tsx`).
  - Mixed platform assumptions (Capacitor + desktop web in same render paths).
  - Global CSS includes app-shell constraints from old app-like UX (`overflow: hidden`, full-height locks) that can impact normal website behavior.

## State duplication risk
- Multiple similar slices managed locally in `Dashboard.tsx` and modal props.
- High coupling between UI state and persistence/network logic increases regression risk.

## 5) Severity Classification

- **Critical**
  - Dependency installation blocked by lockfile/package-path issues in current environment.
  - Mixed framework architecture (Next + Vite) created non-deterministic build path.
- **High**
  - Monolithic dashboard component with high cyclomatic complexity.
  - Missing reliable automated test suite for core flows.
- **Medium**
  - Legacy/unused platform artifacts (Next app dir, mobile-first leftovers).
  - Potentially oversized bundle due heavy feature libraries loaded eagerly.
- **Low**
  - Design system inconsistency (spacing/radius/interaction styles vary by area).

## 6) Refactor Roadmap

1. **Stabilize platform (Critical) — done in this pass (foundation):**
   - Standardize to Vite SPA runtime and remove active Next runtime dependency.
   - Introduce SPA fallback config for production routing.
2. **Layout and navigation (High) — done in this pass (foundation):**
   - Add unified app shell (`AppLayout`) with collapsible sidebar, sticky topbar, content outlet, and 404 route.
3. **Modularization (High):**
   - Split `Dashboard.tsx` into domain modules: `sales-table`, `documents`, `auth`, `sync`, `analytics`.
4. **Security hardening (High):**
   - Move all privileged checks server-side; enforce RBAC on all data/document endpoints.
5. **Performance hardening (Medium):**
   - Code split heavy paths (PDF/document tooling), lazy load modal-heavy routes.
6. **QA + CI (High):**
   - Add Playwright smoke + core flow tests (login, CRUD, calculations, documents).


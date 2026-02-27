# KORA Management Publishability Audit Report

Date: 2026-02-27

## Phase 1 — Stack detection and reproduction

- **Framework:** Next.js 16 + React 19 (`app/` router), with legacy Vite path still present for historical SPA code.
- **Primary build tool:** `next build` (`npm run build`).
- **Secondary build path:** `vite build` (`npm run build:vite`) for legacy artifacts.
- **Routing method:** Next App Router (`app/page.tsx`, `app/layout.tsx`) with static export.
- **Hosting/deploy target:** static site export (`next.config.ts` has `output: 'export'`) suitable for static hosting (e.g. GitHub Pages/CDN).

### Commands executed and outputs

1. `npm ci` ✅
2. `npm run lint` ✅ (42 warnings, 0 errors)
3. `npx tsc --noEmit` ✅
4. `npm test` ❌ (no `test` script defined)
5. `npm run build` ✅
6. Production preview via static server: `python3 -m http.server 3000 --directory out` ✅
7. Browser audit (Playwright in real Chromium) ✅

### Runtime/console/network findings before fixes

- **Console warning (High):** multiple GoTrueClient instances (Supabase auth client duplication).
  - Repro: open home page after static preview.
  - Suspected cause: repeated `createClient` calls with shared storage key.
- **Console error + failed network (High):** 406 on `config_pdf_templates` fetch.
  - Repro: open home page after static preview.
  - Suspected cause: `single()` on a row that may not exist and/or policy returns no rows.

### PDF entry points found

- `components/ContractModal.tsx` — contract preview/download/print.
- `components/InvoiceModal.tsx` — invoice preview/download/print.
- `components/ViewSaleModal.tsx` — sale-level preview/generation actions.
- `components/SaleModal.tsx` — launch points for deposit/shitblerje/marreveshje/invoice flows.
- `components/EditShitblerjeModal.tsx` — preview/download launch points.
- Shared generation pipeline in `components/pdfUtils.ts` (`generatePdf`, `sharePdfBlob`, `printPdfBlob`).

---

## Phase 2/3 — Fixes applied

### 1) Supabase runtime stability and console cleanup

- Added cached Supabase client factory to avoid per-render client creation.
- Disabled session persistence/autorefresh in this app-scoped client creation path.
- Replaced direct `createClient(...)` usage in dashboard sync/config code with cached `createSupabaseClient(...)`.
- Replaced `.single()` with `.maybeSingle()` for config fetches to avoid 406 noise for missing rows.

### 2) Global runtime safety

- Added Next.js global error boundary (`app/error.tsx`) with user-friendly fallback UI and retry action.

### 3) Publishability/accessibility config

- Updated viewport metadata to remove `maximumScale: 1` and `userScalable: false` lock.

---

## Phase 4 — PDF fidelity and quality audit status

### Current behavior verified in code

- In both `ContractModal` and `InvoiceModal`, preview generation stores a single `Blob` (`pdfBlob`).
- Download and print handlers both reuse this same `Blob` (`pdfBlob ?? buildPdfPreview()`), ensuring identical bytes when preview already exists.
- Print path uses the PDF blob directly (`printPdfBlob(blob)`), avoiding HTML re-render at print-time.

### Remaining work (not fully implemented in this patch)

- Full automated PDF visual regression suite across all PDF types/templates.
- Hash-equality E2E assertion between preview source and downloaded bytes.
- CI PDF sanity gate for overlap/clipping/blank page detection.

---

## Phase 5/6/7 status summary

- **Build:** passes.
- **Runtime console errors/warnings on landing page:** cleared (post-fix browser audit shows 0/0/0).
- **UI overlap audit at 390/768/1366/1920:** not fully completed in this patch.
- **Security hardening breadth (headers/CSP/upload sanitization/full RBAC verification):** partially addressed elsewhere in repo, not fully reworked in this patch.
- **Playwright E2E suite required by target acceptance:** not yet added in this patch.

---

## Post-fix verification snapshot

- Lint: pass with warnings (unchanged warning count).
- Typecheck: pass.
- Build: pass.
- Browser runtime (home page):
  - console errors: 0
  - console warnings: 0
  - failed network requests: 0


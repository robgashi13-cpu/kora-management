

## Plan: Fix Auth Login Flow + PDF Tab Layout

### Issues Found

**1. Admin password verification broken on sidebar profile switch**
- When switching to "Robert" from the sidebar, `handlePasswordSubmit` calls `verifyAdminPassword()` in `services/adminAuth.ts`
- This calls `/api/admin-auth` (a Next.js route that doesn't exist in Vite) → returns ERR/404
- Falls back to client-side SHA-256 hash comparison, but the hardcoded hash `IpGYMNibP/9UrCM0pQOCZLBEvOEGCm12DRJ66jLvCp4=` doesn't match `password2`
- Result: admin can never log in via sidebar switch

**2. Sidebar profile switch doesn't use the new Supabase auth**
- The `ProfileSelector` was updated to use the `profile-auth` edge function, but the sidebar's own profile-switching code in `Dashboard.tsx` (lines ~3498-3506, ~1321-1336) still uses the old `verifyAdminPassword` and doesn't call the edge function at all
- Non-admin sidebar switches don't authenticate with Supabase either

**3. PDF tab mobile layout — vertical text stacking**
- On mobile (< md), each row uses `flex items-center` but the Bank amount, Balance Due, and action buttons stack vertically in a column because there's no horizontal arrangement for mobile
- The `flex-wrap` behavior causes labels like "Bank", "Due" + values to flow vertically
- The PDF action buttons (Kontrata, Deposite, Marveshje, Fatura) also stack vertically and overflow

---

### Plan

#### Task 1: Fix sidebar profile switch to use edge function auth

**File: `services/adminAuth.ts`**
- Replace the `verifyAdminPassword` function to call the `profile-auth` edge function instead of `/api/admin-auth`
- For admin: send `{ profileName: "Robert", password }` to the edge function, return true if 200
- Keep the fallback hash check but fix the hash to match `password2`, or simply use the edge function as the primary method

**File: `components/Dashboard.tsx`**
- Update `handlePasswordSubmit` (~line 1321) to:
  1. Call the edge function via `cloudClient` or direct fetch
  2. Set the Supabase session from the response
  3. Then proceed with profile switching
- Update non-admin sidebar switches (~line 3506+) to also call the edge function for proper auth

#### Task 2: Fix PDF tab mobile layout

**File: `components/Dashboard.tsx`** (lines ~5197-5272)
- Restructure the mobile card layout for PDF rows:
  - Use a clean horizontal card layout on mobile instead of the current `flex items-center` that causes vertical stacking
  - Vehicle info + buyer on top row
  - Bank amount + balance side-by-side on a second row
  - Action buttons (Kontrata, Deposite, Marv., Fatura) in a horizontal row at the bottom, using `flex-wrap` with proper `gap` so they flow naturally
  - Ensure text reads left-to-right (horizontal), not stacked vertically
- Keep desktop grid layout unchanged (`md:grid md:grid-cols-[...]`)

### Technical Details

- The edge function URL: `${VITE_SUPABASE_URL}/functions/v1/profile-auth`
- `cloudClient` from `services/cloudAuth.ts` can be used to set the session after edge function returns tokens
- The PDF row mobile restructure only changes Tailwind classes and wrapper divs — no logic or data changes


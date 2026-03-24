-- Migration 20260324120000
-- 1. Restore is_admin_robert() to include Shyqa.
--    Migration 20260402 (fix_critical_security_issues) accidentally reverted the
--    Shyqa admin grant that was introduced in 20260323 (grant_shyqa_admin_profile_access).
--    Since is_admin_robert() is referenced by every RLS policy and the write-RBAC trigger,
--    updating this single function restores full admin visibility and write access for Shyqa
--    across sales, bank_transactions, app_config, and all audit helpers.
--
-- 2. Add missing transport-related columns to the sales table.
--    transport_paid, paid_to_transportusi, and transport_cost are mapped in the app's
--    toRemote() helper but had no corresponding DB columns, causing silent schema-cache
--    retries on every upsert.  Adding dedicated columns removes the retry overhead and
--    ensures the values are always persisted as first-class columns (not only in the
--    JSONB attachments backup).

-- ── 1. Restore Shyqa privileged access ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin_robert()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_profile_name() IN ('Robert', 'Shyqa');
$$;

-- ── 2. Add missing transport columns ─────────────────────────────────────────

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS transport_paid      TEXT,
    ADD COLUMN IF NOT EXISTS paid_to_transportusi TEXT,
    ADD COLUMN IF NOT EXISTS transport_cost      NUMERIC;

-- Refresh PostgREST schema cache so the new columns are immediately usable.
NOTIFY pgrst, 'reload schema';

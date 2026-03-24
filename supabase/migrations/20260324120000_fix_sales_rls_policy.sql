-- Fix "new row violates row-level security policy for table sales"
--
-- Root causes:
-- 1. Migration 20260402100000 re-defined is_admin_robert() to only check 'Robert',
--    reverting the Shyqa admin grant from 20260323110000. Client-side code still
--    treats Shyqa as admin, so Shyqa's sync includes ALL sales. When Shyqa tries
--    to upsert sales owned by other profiles, the WITH CHECK fails.
--
-- 2. INSERT and UPDATE WITH CHECK policies used AND logic (sold_by = profile AND
--    seller_name = profile) while the USING clause correctly used OR. Any sale where
--    sold_by != seller_name (admin-created rows, historical data, dealer names) causes
--    the WITH CHECK to fail even for users who legitimately own the row.

-- Fix 1: Restore Shyqa as admin (was reverted by 20260402100000)
CREATE OR REPLACE FUNCTION public.is_admin_robert()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_profile_name() IN ('Robert', 'Shyqa');
$$;

-- Fix 2: Recreate INSERT policy with OR logic in WITH CHECK
-- The enforce_sales_write_rbac trigger always sets both sold_by and seller_name
-- to the current profile on INSERT for non-admin users, so AND was never needed.
-- Using OR makes the policy robust against any data edge cases.
DROP POLICY IF EXISTS sales_insert_policy ON public.sales;
CREATE POLICY sales_insert_policy
ON public.sales
FOR INSERT
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND (
      COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
      OR COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
    )
  )
);

-- Fix 3: Recreate UPDATE policy with OR logic in WITH CHECK (consistent with USING)
-- The USING clause already uses OR — the WITH CHECK must match so that any row
-- a user can see (USING) they can also save back (WITH CHECK) after the trigger
-- preserves the existing sold_by/seller_name values.
DROP POLICY IF EXISTS sales_update_policy ON public.sales;
CREATE POLICY sales_update_policy
ON public.sales
FOR UPDATE
USING (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND (
      COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
      OR COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
    )
  )
)
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND (
      COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
      OR COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
    )
  )
);

-- Also update sale_is_assigned_to_current_profile to use OR logic explicitly
-- (it calls is_admin_robert() so the Shyqa fix above already propagates,
-- but make the OR logic explicit for clarity and consistency)
CREATE OR REPLACE FUNCTION public.sale_is_assigned_to_current_profile(s public.sales)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.is_admin_robert()
    OR (
      public.current_profile_name() IS NOT NULL
      AND (
        COALESCE(NULLIF(TRIM(s.sold_by), ''), NULLIF(TRIM(s.attachments ->> 'soldBy'), '')) = public.current_profile_name()
        OR COALESCE(NULLIF(TRIM(s.seller_name), ''), NULLIF(TRIM(s.attachments ->> 'sellerName'), '')) = public.current_profile_name()
      )
    );
$$;

NOTIFY pgrst, 'reload schema';

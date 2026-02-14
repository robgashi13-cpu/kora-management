-- Ensure assigned-car visibility is always enforced at the database policy layer.

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS sales_select_policy ON public.sales;
DROP POLICY IF EXISTS sales_update_policy ON public.sales;
DROP POLICY IF EXISTS sales_delete_policy ON public.sales;

CREATE POLICY sales_select_policy
ON public.sales
FOR SELECT
USING (public.sale_is_assigned_to_current_profile(sales));

CREATE POLICY sales_update_policy
ON public.sales
FOR UPDATE
USING (public.sale_is_assigned_to_current_profile(sales))
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
    AND COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
  )
);

CREATE POLICY sales_delete_policy
ON public.sales
FOR DELETE
USING (public.sale_is_assigned_to_current_profile(sales));

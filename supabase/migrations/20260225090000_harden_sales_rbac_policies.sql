-- Harden sales data privacy and role-based write protections.

CREATE OR REPLACE FUNCTION public.current_profile_name()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'profile'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_robert()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_profile_name() = 'Robert';
$$;

CREATE OR REPLACE FUNCTION public.enforce_sales_write_rbac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile text := public.current_profile_name();
BEGIN
  IF public.is_admin_robert() THEN
    RETURN NEW;
  END IF;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Missing profile claim in JWT';
  END IF;

  NEW.sold_by := v_profile;
  NEW.seller_name := v_profile;

  IF TG_OP = 'UPDATE' THEN
    NEW.shipping_name := OLD.shipping_name;
    NEW.shipping_date := OLD.shipping_date;
  ELSE
    NEW.shipping_name := '';
    NEW.shipping_date := '';
  END IF;

  IF NEW.attachments IS NULL THEN
    NEW.attachments := '{}'::jsonb;
  END IF;

  NEW.attachments := jsonb_set(NEW.attachments, '{soldBy}', to_jsonb(v_profile), true);
  NEW.attachments := jsonb_set(NEW.attachments, '{sellerName}', to_jsonb(v_profile), true);
  NEW.attachments := jsonb_set(NEW.attachments, '{shippingName}', to_jsonb(COALESCE(NEW.shipping_name, '')), true);
  NEW.attachments := jsonb_set(NEW.attachments, '{shippingDate}', to_jsonb(COALESCE(NEW.shipping_date, '')), true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_enforce_rbac ON public.sales;
CREATE TRIGGER trg_sales_enforce_rbac
BEFORE INSERT OR UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_write_rbac();

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.sales;
DROP POLICY IF EXISTS sales_select_policy ON public.sales;
DROP POLICY IF EXISTS sales_insert_policy ON public.sales;
DROP POLICY IF EXISTS sales_update_policy ON public.sales;
DROP POLICY IF EXISTS sales_delete_policy ON public.sales;

CREATE POLICY sales_select_policy
ON public.sales
FOR SELECT
USING (
  public.is_admin_robert()
  OR sold_by = public.current_profile_name()
  OR seller_name = public.current_profile_name()
);

CREATE POLICY sales_insert_policy
ON public.sales
FOR INSERT
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND sold_by = public.current_profile_name()
    AND seller_name = public.current_profile_name()
    AND COALESCE(shipping_name, '') = ''
    AND COALESCE(shipping_date, '') = ''
  )
);

CREATE POLICY sales_update_policy
ON public.sales
FOR UPDATE
USING (
  public.is_admin_robert()
  OR sold_by = public.current_profile_name()
  OR seller_name = public.current_profile_name()
)
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND sold_by = public.current_profile_name()
    AND seller_name = public.current_profile_name()
  )
);

CREATE POLICY sales_delete_policy
ON public.sales
FOR DELETE
USING (public.is_admin_robert());

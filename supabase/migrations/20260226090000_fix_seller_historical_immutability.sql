-- Preserve historical seller/sold_by values on updates and auto-assign only on insert.

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

  IF TG_OP = 'INSERT' THEN
    NEW.sold_by := v_profile;
    NEW.seller_name := v_profile;
    NEW.shipping_name := '';
    NEW.shipping_date := '';
  ELSE
    NEW.sold_by := OLD.sold_by;
    NEW.seller_name := OLD.seller_name;
    NEW.shipping_name := OLD.shipping_name;
    NEW.shipping_date := OLD.shipping_date;
  END IF;

  IF NEW.attachments IS NULL THEN
    NEW.attachments := '{}'::jsonb;
  END IF;

  NEW.attachments := jsonb_set(NEW.attachments, '{soldBy}', to_jsonb(NEW.sold_by), true);
  NEW.attachments := jsonb_set(NEW.attachments, '{sellerName}', to_jsonb(NEW.seller_name), true);
  NEW.attachments := jsonb_set(NEW.attachments, '{shippingName}', to_jsonb(COALESCE(NEW.shipping_name, '')), true);
  NEW.attachments := jsonb_set(NEW.attachments, '{shippingDate}', to_jsonb(COALESCE(NEW.shipping_date, '')), true);

  RETURN NEW;
END;
$$;

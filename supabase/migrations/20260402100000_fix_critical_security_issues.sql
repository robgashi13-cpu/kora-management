-- Resolve critical security findings for data access, elevated functions, and config storage.

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

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

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
  OR (
    public.current_profile_name() IS NOT NULL
    AND (
      COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
      OR COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
    )
  )
);

CREATE POLICY sales_insert_policy
ON public.sales
FOR INSERT
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
    AND COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
    AND COALESCE(shipping_name, '') = ''
    AND COALESCE(shipping_date, '') = ''
  )
);

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
    AND COALESCE(NULLIF(TRIM(sold_by), ''), NULLIF(TRIM(attachments ->> 'soldBy'), '')) = public.current_profile_name()
    AND COALESCE(NULLIF(TRIM(seller_name), ''), NULLIF(TRIM(attachments ->> 'sellerName'), '')) = public.current_profile_name()
  )
);

CREATE POLICY sales_delete_policy
ON public.sales
FOR DELETE
USING (public.is_admin_robert());

-- Replace permissive bank transaction policy with owner/admin scoped access.
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_select_policy ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_insert_policy ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_update_policy ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_delete_policy ON public.bank_transactions;

CREATE POLICY bank_transactions_select_policy
ON public.bank_transactions
FOR SELECT
USING (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND NULLIF(TRIM(last_edited_by), '') = public.current_profile_name()
  )
);

CREATE POLICY bank_transactions_insert_policy
ON public.bank_transactions
FOR INSERT
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND NULLIF(TRIM(last_edited_by), '') = public.current_profile_name()
  )
);

CREATE POLICY bank_transactions_update_policy
ON public.bank_transactions
FOR UPDATE
USING (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND NULLIF(TRIM(last_edited_by), '') = public.current_profile_name()
  )
)
WITH CHECK (
  public.is_admin_robert()
  OR (
    public.current_profile_name() IS NOT NULL
    AND NULLIF(TRIM(last_edited_by), '') = public.current_profile_name()
  )
);

CREATE POLICY bank_transactions_delete_policy
ON public.bank_transactions
FOR DELETE
USING (public.is_admin_robert());

CREATE OR REPLACE FUNCTION public.reassign_profile_and_delete(
    from_profile TEXT,
    to_profile TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_robert() THEN
        RAISE EXCEPTION 'Only Robert admin can reassign profiles';
    END IF;

    UPDATE public.sales
    SET
        sold_by = CASE WHEN sold_by = from_profile THEN to_profile ELSE sold_by END,
        seller_name = CASE WHEN seller_name = from_profile THEN to_profile ELSE seller_name END
    WHERE sold_by = from_profile
       OR seller_name = from_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_profile_and_delete(TEXT, TEXT) TO authenticated;

-- Validate actor identity server-side for UI audit logs.
CREATE OR REPLACE FUNCTION public.log_ui_audit_event(
  p_actor_profile_id TEXT,
  p_actor_profile_name TEXT,
  p_action_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_page_context TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_actor TEXT := public.current_profile_name();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Missing profile claim in JWT';
  END IF;

  INSERT INTO public.audit_logs (
    actor_profile_id,
    actor_profile_name,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    field_changes,
    page_context,
    request_id,
    metadata,
    route,
    user_agent,
    source,
    occurred_at
  ) VALUES (
    v_actor,
    v_actor,
    UPPER(COALESCE(NULLIF(p_action_type, ''), 'UPDATE')),
    COALESCE(NULLIF(p_entity_type, ''), 'ui_event'),
    COALESCE(NULLIF(p_entity_id, ''), 'unknown'),
    p_before_data,
    p_after_data,
    public.jsonb_object_diff(p_before_data, p_after_data),
    p_page_context,
    COALESCE(p_request_id, gen_random_uuid()::text),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('claimed_actor_profile_id', p_actor_profile_id, 'claimed_actor_profile_name', p_actor_profile_name),
    p_route,
    p_user_agent,
    'ui',
    now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ui_audit_event(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- Move app config out of sales rows into dedicated table.
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_select_policy ON public.app_config;
DROP POLICY IF EXISTS app_config_insert_policy ON public.app_config;
DROP POLICY IF EXISTS app_config_update_policy ON public.app_config;
DROP POLICY IF EXISTS app_config_delete_policy ON public.app_config;

CREATE POLICY app_config_select_policy
ON public.app_config
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY app_config_insert_policy
ON public.app_config
FOR INSERT
WITH CHECK (public.is_admin_robert());

CREATE POLICY app_config_update_policy
ON public.app_config
FOR UPDATE
USING (public.is_admin_robert())
WITH CHECK (public.is_admin_robert());

CREATE POLICY app_config_delete_policy
ON public.app_config
FOR DELETE
USING (public.is_admin_robert());

INSERT INTO public.app_config(key, value, updated_by)
SELECT 'profile_avatars', attachments, 'migration'
FROM public.sales
WHERE id = 'config_profile_avatars'
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

INSERT INTO public.app_config(key, value, updated_by)
SELECT 'pdf_templates', attachments, 'migration'
FROM public.sales
WHERE id = 'config_pdf_templates'
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

DELETE FROM public.sales
WHERE id IN ('config_profile_avatars', 'config_pdf_templates');

NOTIFY pgrst, 'reload schema';

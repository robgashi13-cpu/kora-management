ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS route TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'db';

CREATE INDEX IF NOT EXISTS audit_logs_occurred_at_idx ON public.audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action_type, entity_type);

CREATE OR REPLACE FUNCTION public.log_row_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_entity_id TEXT;
  v_before JSONB;
  v_after JSONB;
  v_diff JSONB;
  v_actor TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_entity_id := COALESCE(v_after ->> 'id', 'unknown');
    v_actor := COALESCE(v_after ->> 'last_edited_by', v_after ->> 'sold_by', v_after ->> 'seller_name', v_after ->> 'updated_by', 'Unknown');
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := CASE
      WHEN (to_jsonb(OLD) ->> 'archived') IS DISTINCT FROM (to_jsonb(NEW) ->> 'archived')
           AND (to_jsonb(NEW) ->> 'archived') = 'true' THEN 'ARCHIVE'
      WHEN (to_jsonb(OLD) ->> 'archived') IS DISTINCT FROM (to_jsonb(NEW) ->> 'archived')
           AND (to_jsonb(NEW) ->> 'archived') = 'false' THEN 'RESTORE'
      ELSE 'UPDATE'
    END;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_entity_id := COALESCE(v_after ->> 'id', v_before ->> 'id', 'unknown');
    v_actor := COALESCE(v_after ->> 'last_edited_by', v_before ->> 'last_edited_by', v_after ->> 'sold_by', v_before ->> 'sold_by', v_after ->> 'seller_name', v_before ->> 'seller_name', v_after ->> 'updated_by', v_before ->> 'updated_by', 'Unknown');
  ELSE
    v_action := 'DELETE';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_entity_id := COALESCE(v_before ->> 'id', 'unknown');
    v_actor := COALESCE(v_before ->> 'last_edited_by', v_before ->> 'sold_by', v_before ->> 'seller_name', v_before ->> 'updated_by', 'Unknown');
  END IF;

  v_diff := public.jsonb_object_diff(v_before, v_after);

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
    source,
    occurred_at
  ) VALUES (
    v_actor,
    v_actor,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    v_before,
    v_after,
    v_diff,
    TG_TABLE_NAME,
    gen_random_uuid()::text,
    jsonb_build_object('table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA),
    NULL,
    'db',
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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
BEGIN
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
    p_actor_profile_id,
    COALESCE(NULLIF(p_actor_profile_name, ''), p_actor_profile_id, 'Unknown'),
    UPPER(COALESCE(NULLIF(p_action_type, ''), 'UPDATE')),
    COALESCE(NULLIF(p_entity_type, ''), 'ui_event'),
    COALESCE(NULLIF(p_entity_id, ''), 'unknown'),
    p_before_data,
    p_after_data,
    public.jsonb_object_diff(p_before_data, p_after_data),
    p_page_context,
    COALESCE(p_request_id, gen_random_uuid()::text),
    p_metadata,
    p_route,
    p_user_agent,
    'ui',
    now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ui_audit_event(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND t.table_name <> 'audit_logs'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_audit ON public.%I;', r.table_name, r.table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_row_audit_event();', r.table_name, r.table_name);
  END LOOP;
END $$;

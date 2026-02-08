ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS field_changes JSONB;

CREATE OR REPLACE FUNCTION public.jsonb_object_diff(old_row JSONB, new_row JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        jsonb_object_agg(key, jsonb_build_object('before', old_row -> key, 'after', new_row -> key)),
        '{}'::jsonb
    )
    FROM (
        SELECT key
        FROM jsonb_object_keys(COALESCE(old_row, '{}'::jsonb) || COALESCE(new_row, '{}'::jsonb)) AS key
    ) keys
    WHERE (old_row -> key) IS DISTINCT FROM (new_row -> key);
$$;

CREATE OR REPLACE FUNCTION public.log_row_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_actor TEXT;
  v_entity_id TEXT;
  v_before JSONB;
  v_after JSONB;
  v_diff JSONB;
BEGIN
  v_action := TG_OP;
  IF v_action = 'INSERT' THEN
    v_action := 'CREATE';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_entity_id := COALESCE(NEW.id::text, 'unknown');
    v_actor := COALESCE(NEW.last_edited_by, NEW.sold_by, NEW.seller_name, 'Unknown');
  ELSIF v_action = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_entity_id := COALESCE(NEW.id::text, OLD.id::text, 'unknown');
    v_actor := COALESCE(NEW.last_edited_by, OLD.last_edited_by, NEW.sold_by, OLD.sold_by, NEW.seller_name, OLD.seller_name, 'Unknown');
  ELSE
    v_action := 'DELETE';
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_entity_id := COALESCE(OLD.id::text, 'unknown');
    v_actor := COALESCE(OLD.last_edited_by, OLD.sold_by, OLD.seller_name, 'Unknown');
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
    request_id
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
    gen_random_uuid()::text
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_audit ON public.sales;
CREATE TRIGGER trg_sales_audit
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.log_row_audit_event();

DROP TRIGGER IF EXISTS trg_bank_transactions_audit ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.log_row_audit_event();

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_profile_id TEXT,
    actor_profile_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_data JSONB,
    after_data JSONB,
    page_context TEXT,
    request_id TEXT,
    ip_address TEXT,
    user_agent TEXT
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Robert can read audit logs" ON public.audit_logs;
CREATE POLICY "Robert can read audit logs"
ON public.audit_logs
FOR SELECT
USING ((auth.jwt() ->> 'profile') = 'Robert');

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.log_sale_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action TEXT;
  v_actor TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_actor := COALESCE(NEW.last_edited_by, NEW.sold_by, NEW.seller_name, 'Unknown');
    INSERT INTO public.audit_logs (
      actor_profile_id, actor_profile_name, action_type, entity_type, entity_id, before_data, after_data
    ) VALUES (
      v_actor, v_actor, v_action, 'sale', NEW.id, NULL, to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_actor := COALESCE(NEW.last_edited_by, NEW.sold_by, NEW.seller_name, 'Unknown');
    INSERT INTO public.audit_logs (
      actor_profile_id, actor_profile_name, action_type, entity_type, entity_id, before_data, after_data
    ) VALUES (
      v_actor, v_actor, v_action, 'sale', NEW.id, to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_actor := COALESCE(OLD.last_edited_by, OLD.sold_by, OLD.seller_name, 'Unknown');
    INSERT INTO public.audit_logs (
      actor_profile_id, actor_profile_name, action_type, entity_type, entity_id, before_data, after_data
    ) VALUES (
      v_actor, v_actor, v_action, 'sale', OLD.id, to_jsonb(OLD), NULL
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_audit ON public.sales;
CREATE TRIGGER trg_sales_audit
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.log_sale_audit_event();


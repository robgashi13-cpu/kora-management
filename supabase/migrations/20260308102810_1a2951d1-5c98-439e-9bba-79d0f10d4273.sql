CREATE TABLE IF NOT EXISTS public.app_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON public.app_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
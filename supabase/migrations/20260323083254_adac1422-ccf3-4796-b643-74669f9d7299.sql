CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on app_config"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert access on app_config"
  ON public.app_config FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update access on app_config"
  ON public.app_config FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
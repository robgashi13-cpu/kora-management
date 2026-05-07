
CREATE TABLE IF NOT EXISTS public.per_pages_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  notes TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.per_pages_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated per_pages"
  ON public.per_pages_uploads FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon all per_pages"
  ON public.per_pages_uploads FOR ALL
  TO anon
  USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('per-pages', 'per-pages', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "per-pages public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'per-pages');

CREATE POLICY "per-pages anon insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'per-pages');

CREATE POLICY "per-pages anon update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'per-pages');

CREATE POLICY "per-pages anon delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'per-pages');

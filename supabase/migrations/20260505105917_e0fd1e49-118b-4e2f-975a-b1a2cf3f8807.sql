
-- Add files column to customs_complaints
ALTER TABLE public.customs_complaints
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Create storage bucket for customs complaint files
INSERT INTO storage.buckets (id, name, public)
VALUES ('customs-files', 'customs-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (open access matching existing app pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Customs files public read') THEN
    CREATE POLICY "Customs files public read" ON storage.objects FOR SELECT USING (bucket_id = 'customs-files');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Customs files anon insert') THEN
    CREATE POLICY "Customs files anon insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'customs-files');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Customs files anon update') THEN
    CREATE POLICY "Customs files anon update" ON storage.objects FOR UPDATE USING (bucket_id = 'customs-files') WITH CHECK (bucket_id = 'customs-files');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Customs files anon delete') THEN
    CREATE POLICY "Customs files anon delete" ON storage.objects FOR DELETE USING (bucket_id = 'customs-files');
  END IF;
END $$;

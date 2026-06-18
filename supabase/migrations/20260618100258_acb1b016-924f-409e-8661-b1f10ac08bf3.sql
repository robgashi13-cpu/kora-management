-- RLS policies for pdf-logs bucket
CREATE POLICY "pdf_logs_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pdf-logs');

CREATE POLICY "pdf_logs_authenticated_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'pdf-logs');

CREATE POLICY "pdf_logs_anon_upload"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'pdf-logs');

CREATE POLICY "pdf_logs_anon_read"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'pdf-logs');

CREATE POLICY "Allow anon all sales"
ON public.sales
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.company_cash_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 0,
  note text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_cash_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_cash_logs TO authenticated;
GRANT ALL ON public.company_cash_logs TO service_role;

ALTER TABLE public.company_cash_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all company_cash_logs" ON public.company_cash_logs;
DROP POLICY IF EXISTS "Allow authenticated all company_cash_logs" ON public.company_cash_logs;

CREATE POLICY "Allow anon all company_cash_logs"
ON public.company_cash_logs
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated all company_cash_logs"
ON public.company_cash_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
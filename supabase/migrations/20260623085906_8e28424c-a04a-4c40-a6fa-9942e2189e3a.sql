ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS source_sale_id TEXT;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO anon, authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bank_transactions'
      AND policyname = 'Allow anon all bank_transactions'
  ) THEN
    CREATE POLICY "Allow anon all bank_transactions"
    ON public.bank_transactions
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

COMMENT ON COLUMN public.bank_transactions.source_sale_id IS 'Optional linked sale id for bank deposits and balance due current cash tracking';
COMMENT ON TABLE public.bank_transactions IS 'Bank transaction records used by deposits, invoices, and balance due current cash tracking';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
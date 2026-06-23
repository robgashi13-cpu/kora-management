ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS source_sale_id TEXT;

COMMENT ON COLUMN public.bank_transactions.source_sale_id IS 'Optional linked sale id for bank deposits and balance due current cash tracking';
COMMENT ON TABLE public.bank_transactions IS 'Bank transaction records used by deposits, invoices, and balance due current cash tracking';

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS car_name TEXT;
ALTER TABLE public.cash_deposits ADD COLUMN IF NOT EXISTS car_name TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_deposits TO anon, authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
GRANT ALL ON public.cash_deposits TO service_role;
NOTIFY pgrst, 'reload schema';

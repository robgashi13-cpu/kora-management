GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_deposits TO authenticated, anon;
GRANT ALL ON public.cash_deposits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated, anon;
GRANT ALL ON public.bank_transactions TO service_role;
NOTIFY pgrst, 'reload schema';
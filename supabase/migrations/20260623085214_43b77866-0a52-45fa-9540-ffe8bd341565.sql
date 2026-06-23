GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cash_deposits TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cash_deposits TO service_role;

COMMENT ON TABLE public.cash_deposits IS 'Cash deposit records for invoice deposit tracking';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
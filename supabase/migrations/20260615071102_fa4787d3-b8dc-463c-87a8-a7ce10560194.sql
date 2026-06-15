CREATE TABLE IF NOT EXISTS public.cash_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 0,
  deposit_date date,
  depositor_name text,
  receiver_name text,
  source_sale_id uuid,
  note text,
  source text NOT NULL DEFAULT 'manual',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_deposits TO authenticated;
GRANT ALL ON public.cash_deposits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_deposits TO anon;

ALTER TABLE public.cash_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_deposits read all auth" ON public.cash_deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_deposits write all auth" ON public.cash_deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cash_deposits read anon" ON public.cash_deposits FOR SELECT TO anon USING (true);
CREATE POLICY "cash_deposits write anon" ON public.cash_deposits FOR ALL TO anon USING (true) WITH CHECK (true);
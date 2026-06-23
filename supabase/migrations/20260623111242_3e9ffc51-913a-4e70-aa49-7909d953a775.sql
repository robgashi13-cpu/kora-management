CREATE TABLE public.customs_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE,
  car_name TEXT,
  note TEXT,
  depositor_name TEXT,
  receiver_name TEXT,
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customs_payments TO authenticated, anon;
GRANT ALL ON public.customs_payments TO service_role;

ALTER TABLE public.customs_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view customs payments" ON public.customs_payments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert customs payments" ON public.customs_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update customs payments" ON public.customs_payments FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete customs payments" ON public.customs_payments FOR DELETE USING (true);

CREATE TRIGGER update_customs_payments_updated_at
  BEFORE UPDATE ON public.customs_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
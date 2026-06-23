
CREATE TABLE public.korea_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  car_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.korea_payments TO anon, authenticated;
GRANT ALL ON public.korea_payments TO service_role;

ALTER TABLE public.korea_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to korea_payments" ON public.korea_payments FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_korea_payments_updated_at BEFORE UPDATE ON public.korea_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';

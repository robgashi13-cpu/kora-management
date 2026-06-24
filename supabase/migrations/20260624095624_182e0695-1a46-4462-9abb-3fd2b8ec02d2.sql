CREATE TABLE public.invoice_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'Other',
  description text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_expenses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_expenses TO authenticated;
GRANT ALL ON public.invoice_expenses TO service_role;

ALTER TABLE public.invoice_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read invoice expenses"
  ON public.invoice_expenses FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert invoice expenses"
  ON public.invoice_expenses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update invoice expenses"
  ON public.invoice_expenses FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete invoice expenses"
  ON public.invoice_expenses FOR DELETE
  USING (true);

CREATE TRIGGER trg_invoice_expenses_updated_at
  BEFORE UPDATE ON public.invoice_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_invoice_expenses_date ON public.invoice_expenses (expense_date DESC);
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date text,
    description text,
    category text,
    amount numeric,
    last_edited_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON public.bank_transactions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Ensure sales table columns align with app usage and accept non-UUID config IDs
ALTER TABLE public.sales
    ALTER COLUMN id TYPE TEXT USING id::text;

ALTER TABLE public.sales
    ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS year INTEGER,
    ADD COLUMN IF NOT EXISTS km INTEGER,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS plate_number TEXT,
    ADD COLUMN IF NOT EXISTS vin TEXT,
    ADD COLUMN IF NOT EXISTS seller_name TEXT,
    ADD COLUMN IF NOT EXISTS buyer_name TEXT,
    ADD COLUMN IF NOT EXISTS buyer_personal_id TEXT,
    ADD COLUMN IF NOT EXISTS shipping_name TEXT,
    ADD COLUMN IF NOT EXISTS shipping_date TEXT,
    ADD COLUMN IF NOT EXISTS include_transport BOOLEAN,
    ADD COLUMN IF NOT EXISTS cost_to_buy NUMERIC,
    ADD COLUMN IF NOT EXISTS sold_price NUMERIC,
    ADD COLUMN IF NOT EXISTS amount_paid_cash NUMERIC,
    ADD COLUMN IF NOT EXISTS amount_paid_bank NUMERIC,
    ADD COLUMN IF NOT EXISTS deposit NUMERIC,
    ADD COLUMN IF NOT EXISTS deposit_date TEXT,
    ADD COLUMN IF NOT EXISTS services_cost NUMERIC,
    ADD COLUMN IF NOT EXISTS tax NUMERIC,
    ADD COLUMN IF NOT EXISTS amount_paid_by_client NUMERIC,
    ADD COLUMN IF NOT EXISTS amount_paid_to_korea NUMERIC,
    ADD COLUMN IF NOT EXISTS paid_date_to_korea TEXT,
    ADD COLUMN IF NOT EXISTS paid_date_from_client TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER,
    ADD COLUMN IF NOT EXISTS sold_by TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS "group" TEXT,
    ADD COLUMN IF NOT EXISTS attachments JSONB,
    ADD COLUMN IF NOT EXISTS last_edited_by TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Refresh PostgREST schema cache after sales changes
NOTIFY pgrst, 'reload schema';

-- Ensure bank_transactions table exists with required columns
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id TEXT PRIMARY KEY,
    date TEXT,
    description TEXT,
    category TEXT,
    amount NUMERIC,
    last_edited_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'bank_transactions'
          AND policyname = 'Allow all operations for authenticated users'
    ) THEN
        CREATE POLICY "Allow all operations for authenticated users"
        ON public.bank_transactions
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END
$$;

-- Refresh PostgREST schema cache after bank_transactions changes
NOTIFY pgrst, 'reload schema';

-- Align profile reassignment function with app usage (profile names as text)
DROP FUNCTION IF EXISTS public.reassign_profile_and_delete(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reassign_profile_and_delete(
    from_profile TEXT,
    to_profile TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.sales
    SET
        sold_by = CASE WHEN sold_by = from_profile THEN to_profile ELSE sold_by END,
        seller_name = CASE WHEN seller_name = from_profile THEN to_profile ELSE seller_name END
    WHERE sold_by = from_profile
       OR seller_name = from_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_profile_and_delete(TEXT, TEXT) TO authenticated;

-- Refresh PostgREST schema cache after function changes
NOTIFY pgrst, 'reload schema';

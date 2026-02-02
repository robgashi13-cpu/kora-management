-- Ensure buyer_personal_id exists on sales to keep schema cache in sync
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS buyer_personal_id TEXT;

-- Refresh PostgREST schema cache (Supabase)
NOTIFY pgrst, 'reload schema';

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS custom_price_discount NUMERIC;

-- Create sales table with all required columns
CREATE TABLE public.sales (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    brand TEXT,
    model TEXT,
    year INTEGER,
    km INTEGER,
    color TEXT,
    plate_number TEXT,
    vin TEXT,
    seller_name TEXT,
    buyer_name TEXT,
    buyer_personal_id TEXT,
    shipping_name TEXT,
    shipping_date TEXT,
    include_transport BOOLEAN,
    cost_to_buy NUMERIC,
    sold_price NUMERIC,
    amount_paid_cash NUMERIC,
    amount_paid_bank NUMERIC,
    deposit NUMERIC,
    deposit_date TEXT,
    services_cost NUMERIC,
    tax NUMERIC,
    amount_paid_by_client NUMERIC,
    amount_paid_to_korea NUMERIC,
    paid_date_to_korea TEXT,
    paid_date_from_client TEXT,
    payment_method TEXT,
    status TEXT,
    sort_order INTEGER,
    sold_by TEXT,
    notes TEXT,
    "group" TEXT,
    attachments JSONB,
    last_edited_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create policy for all authenticated users to manage sales
CREATE POLICY "Allow all operations for authenticated users" 
ON public.sales 
FOR ALL 
USING (true)
WITH CHECK (true);
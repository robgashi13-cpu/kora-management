
CREATE TABLE public.mechanic_records (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    car_id TEXT,
    car_source TEXT DEFAULT 'sale',
    brand TEXT,
    model TEXT,
    year INTEGER,
    km INTEGER,
    plate_number TEXT,
    vin TEXT,
    inspected_city TEXT,
    repaired_work TEXT,
    needs_repair_work TEXT,
    repair_cost NUMERIC DEFAULT 0,
    is_repaired BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by TEXT
);

ALTER TABLE public.mechanic_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.mechanic_records
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon all mechanic_records" ON public.mechanic_records
    FOR ALL TO anon USING (true) WITH CHECK (true);

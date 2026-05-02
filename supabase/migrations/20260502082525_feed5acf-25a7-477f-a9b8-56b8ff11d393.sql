CREATE TABLE public.customs_complaints (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id text NOT NULL UNIQUE,
  car_source text NOT NULL DEFAULT 'sale',
  status text NOT NULL DEFAULT 'started',
  refund_amount numeric DEFAULT 0,
  notes text,
  last_edited_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.customs_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated"
ON public.customs_complaints
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow anon all customs_complaints"
ON public.customs_complaints
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE INDEX idx_customs_complaints_car_id ON public.customs_complaints(car_id);
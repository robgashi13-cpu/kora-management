create table if not exists public.invoice_history (
  id text primary key,
  invoice_id text not null,
  source_context text not null,
  related_entity_type text not null,
  related_entity_id text not null,
  car_display text,
  vin text,
  stock text,
  created_by_user_id text,
  created_by_display text,
  created_at timestamptz not null default now(),
  invoice_view_ref text,
  pdf_file_ref text
);

alter table public.invoice_history enable row level security;

create policy if not exists "Allow authenticated read invoice history" on public.invoice_history
for select using (auth.role() = 'authenticated');

create policy if not exists "Allow authenticated insert invoice history" on public.invoice_history
for insert with check (auth.role() = 'authenticated');

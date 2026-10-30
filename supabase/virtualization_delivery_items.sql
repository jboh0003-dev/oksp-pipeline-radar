-- Shopping-mall delivery requests: separate from contract registrations and bid awards.
-- A delivery request may be amended; each line has a stable identity by request number + item serial.
create table if not exists public.virtualization_delivery_items (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  delivery_request_no text not null,
  delivery_change_order text,
  product_serial text not null,
  receipt_date date not null,
  original_request_date date,
  contract_no text,
  product_id text,
  product_name text not null,
  product_category text,
  brand text,
  supplier_name text,
  supplier_business_no text,
  customer_name text,
  amount numeric,
  quantity numeric,
  final_request boolean,
  classification text not null default 'virtualization' check (classification in ('virtualization','related','review')),
  matched_keyword text not null,
  source_type text not null default 'g2b_shopping_delivery' check (source_type = 'g2b_shopping_delivery'),
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists virtualization_delivery_items_receipt_date_idx on public.virtualization_delivery_items (receipt_date desc);
create index if not exists virtualization_delivery_items_brand_idx on public.virtualization_delivery_items (brand);
create index if not exists virtualization_delivery_items_supplier_idx on public.virtualization_delivery_items (supplier_business_no);
alter table public.virtualization_delivery_items enable row level security;
-- Access solely through the authenticated server-side admin client; never grant anon table access.
revoke all on public.virtualization_delivery_items from anon, authenticated;

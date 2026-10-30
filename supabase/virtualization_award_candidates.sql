-- Actual G2B bid awards discovered by virtualization/HCI terms, including SI resellers.
-- "winner" is the contracting vendor; "product_brand" is only set when named in the tender.
create table if not exists public.virtualization_award_candidates (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  bid_no text not null,
  bid_ord text,
  award_date date,
  winner_name text not null,
  winner_business_no text not null,
  project text not null,
  customer text,
  amount numeric,
  rate numeric,
  category text,
  classification text not null check (classification in ('server_virtualization', 'hci', 'vdi', 'virtualization_other', 'review')),
  product_brand text,
  matched_keywords text[] not null default '{}'::text[],
  source_type text not null default 'g2b_award' check (source_type = 'g2b_award'),
  source_url text not null default 'https://www.data.go.kr/data/15129397/openapi.do',
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists virtualization_award_candidates_year_idx on public.virtualization_award_candidates(award_date desc);
create index if not exists virtualization_award_candidates_vendor_idx on public.virtualization_award_candidates(winner_business_no);
create index if not exists virtualization_award_candidates_classification_idx on public.virtualization_award_candidates(classification);
alter table public.virtualization_award_candidates enable row level security;
revoke all on public.virtualization_award_candidates from anon, authenticated;

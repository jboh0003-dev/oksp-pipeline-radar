-- Historical monthly coverage: never interpret absence of a row as zero sales.
create table if not exists public.virtualization_delivery_collection_coverage (
  year integer not null check (year between 2024 and 2026),
  month integer not null check (month between 1 and 12),
  keyword text not null,
  source_type text not null default 'g2b_shopping_delivery',
  status text not null check (status in ('ok','partial','error')),
  fetched_count integer not null default 0,
  matched_count integer not null default 0,
  persisted_count integer not null default 0,
  checked_at timestamptz not null default now(),
  details text,
  primary key (year,month,keyword)
);
alter table public.virtualization_delivery_collection_coverage enable row level security;
revoke all on public.virtualization_delivery_collection_coverage from anon,authenticated;
create index if not exists virtualization_delivery_coverage_status_idx on
  public.virtualization_delivery_collection_coverage (status,year,month);

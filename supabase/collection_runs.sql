-- 수집(자동·수동) 실행 이력. 화면에 "최근 수집 시간 / 저장 건수 / 상태"를 보여줄 때 사용.
-- 한 번에 그대로 실행해도 idempotent 하다. 이미 만든 환경에서는 ADD COLUMN IF NOT EXISTS 만 적용된다.

create table if not exists public.collection_runs (
  id                       uuid primary key default gen_random_uuid(),
  source                   text not null default 'cron:collect-g2b',
  -- 실행 방식. 자동수집(cron) 이면 'auto', 화면의 "지금 수집" 버튼은 'manual'.
  mode                     text not null default 'auto',
  started_at               timestamptz not null,
  finished_at              timestamptz,
  ok                       boolean not null,
  target_count             integer,
  page_start               integer,
  page_end                 integer,
  fetched_count            integer,
  matched_count            integer,
  saved_count              integer,
  -- saved_count 는 신규 + 업데이트 합계. 둘을 분리해서 보고 싶을 때 사용.
  inserted_count           integer,
  updated_count            integer,
  skipped_expired_count    integer,
  skipped_no_product_count integer,
  errors                   jsonb default '[]'::jsonb,
  warnings                 jsonb default '[]'::jsonb,
  message                  text,
  created_at               timestamptz not null default now()
);

-- 기존 환경에 이미 테이블이 만들어져 있던 경우를 대비한 컬럼 추가.
alter table public.collection_runs
  add column if not exists warnings jsonb default '[]'::jsonb;

alter table public.collection_runs
  add column if not exists message text;

alter table public.collection_runs
  add column if not exists mode text not null default 'auto';

alter table public.collection_runs
  add column if not exists inserted_count integer;

alter table public.collection_runs
  add column if not exists updated_count integer;

create index if not exists collection_runs_finished_at_desc_idx
  on public.collection_runs (finished_at desc);

create index if not exists collection_runs_source_finished_at_desc_idx
  on public.collection_runs (source, finished_at desc);

create index if not exists collection_runs_mode_finished_at_desc_idx
  on public.collection_runs (mode, finished_at desc);

-- RLS: 화면(anon)에서는 SELECT 만 허용, INSERT/UPDATE 는 service_role 키로만 가능.
alter table public.collection_runs enable row level security;

drop policy if exists "collection_runs_read_all" on public.collection_runs;
create policy "collection_runs_read_all"
  on public.collection_runs
  for select
  using ( true );

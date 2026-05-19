-- sync-g2b upsert에 필요한 컬럼 (기존 테이블에 없으면 추가)
alter table public.notices
  add column if not exists external_id text unique,
  add column if not exists notice_date timestamptz,
  add column if not exists source_type text,
  add column if not exists raw_data jsonb;

create unique index if not exists notices_external_id_key on public.notices (external_id);

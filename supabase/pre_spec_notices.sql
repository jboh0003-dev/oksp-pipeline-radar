-- 사전규격공고 (HrcspSsstndrdInfoService) 영속 테이블.
--
-- 입찰공고와 분리된 별도 테이블로 운영한다 — 필드명/의미가 완전히 달라 한 테이블로 합치면
-- 화면/RLS/upsert 정책이 복잡해지기 때문.
--
-- ============================================================================
-- URL 컬럼 의미 (★ 매우 중요 — 혼동하지 마라)
-- ============================================================================
--   detail_url            : *검증된* 사전규격 상세 페이지 URL.
--                           - detail_url_verified = true 인 경우에만 채워진다.
--                           - 화면에서 공고명 클릭 시 새 탭으로 이동하는 URL.
--                           - 검증 안 된 검색/목록 URL 을 절대 여기에 저장하지 마라.
--   search_url            : 나라장터 사전규격 검색/목록 URL.
--                           - 항상 채워진다 (등록번호 query 가 붙은 stable link).
--                           - 화면에서 별도 "나라장터 검색" 버튼이 사용.
--   attachment_url        : 규격서 첨부파일 URL (specDocFileUrl1~5 중 첫 번째).
--                           - 화면에서 별도 "규격서" 버튼이 사용.
--   detail_url_method     : 'verified-detail' | 'search-fallback' | 'unsupported'.
--                           - UI 가 공고명 클릭 가능 여부를 분기하는 키.
--   detail_url_verified   : detail_url 이 검증된 deep-link 인지 여부 (default false).
--   detail_url_checked_at : 마지막으로 detail_url 검증을 시도한 시각.
--   original_url          : API 가 raw 로 제공한 원본 URL (검증 통과 http(s) 만).
--                           - legacy 컬럼. detail_url 과 *혼동하지 마라*.
--   spec_file_url         : attachment_url 의 legacy alias (구 컬럼 호환).
-- ============================================================================
--
-- 다른 핵심 컬럼:
--   external_id  : upsert key. 보통 pre_spec_no (bfSpecRgstNo) 와 동일.
--   pre_spec_no  : 사전규격등록번호 (bfSpecRgstNo / preSpecRegNo / preStdRegNo / publicPreSpecNo)
--   notice_type  : 항상 'pre_spec'. 향후 다른 type 이 들어올 수 있어 컬럼으로 구분.
--   raw_data     : API raw 원본 JSON 통째 저장 (재처리 / 디버깅용).
--
-- upsert 정책:
--   - external_id 가 같으면 update.
--   - detail_url / search_url / detail_url_method / detail_url_verified /
--     detail_url_checked_at / attachment_url 은 *항상* 새 값으로 덮어쓴다.
--     → 검증되지 않은 legacy fallback URL 이 자동으로 NULL 로 정리되도록.
--   - original_url 은 fill-on-null 정책 (raw 라 의미 변화 없음).

create table if not exists public.pre_spec_notices (
  id                       uuid primary key default gen_random_uuid(),
  external_id              text not null unique,
  pre_spec_no              text,
  notice_type              text not null default 'pre_spec',
  title                    text not null,
  business_name            text,
  org_name                 text,
  demand_org_name          text,
  bsns_div_label           text,
  budget                   bigint,
  open_date                date,
  opinion_deadline         date,
  linked_bid_no            text,
  detail_url               text,
  search_url               text,
  attachment_url           text,
  detail_url_method        text,
  detail_url_verified      boolean not null default false,
  detail_url_checked_at    timestamptz,
  original_url             text,
  spec_file_url            text,
  source_api               text,
  source_endpoint          text,
  raw_data                 jsonb,
  inserted_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 기존 테이블이 이미 존재할 때 신규 컬럼을 안전하게 추가 (멱등성).
alter table public.pre_spec_notices
  add column if not exists search_url            text,
  add column if not exists attachment_url        text,
  add column if not exists detail_url_method     text,
  add column if not exists detail_url_verified   boolean not null default false,
  add column if not exists detail_url_checked_at timestamptz;

-- 기존 row 에 잘못 들어간 검색/목록 URL (= /link/PRCA001_04/single/ ...) 을 detail_url 에서 제거.
-- 한 번만 실행되어도 안전 (멱등). 새로 수집되면 어차피 NULL 로 다시 덮어써짐.
update public.pre_spec_notices
  set detail_url = null
  where detail_url ilike 'https://www.g2b.go.kr/link/PRCA001_04/single/%';

-- ============================================================================
-- external_id 'pre-spec:' prefix 마이그레이션 (2026-06, 사용자 요구사항).
-- ============================================================================
-- 기존 정책: external_id = preSpecRegNo 또는 announcementKey (prefix 없음).
-- 새 정책  : external_id = 'pre-spec:<preSpecRegNo>' 또는 'pre-spec:<announcementKey>'.
--
-- 목적:
--  1) 다른 source 와의 우발적 external_id 충돌 차단 (운영 안정성).
--  2) /api/pre-spec/[id] 가 prefix 양쪽 모두 lookup 하므로 화면은 그대로 동작.
--  3) 다음 cron 수집부터 신규 row 가 prefix 형태로 들어가도, 기존 row 도 prefix 가 붙어 있어
--     UPDATE 로 매칭 → 중복 row 생성 방지.
--
-- 멱등성:
--  - 이미 prefix 가 있는 row 는 WHERE 절에서 제외되어 영향 없음.
--  - external_id 는 unique 제약이 있으므로, prefix 추가가 다른 row 와 충돌하면 UPDATE 실패.
--    실패 시 SQL 에디터에 에러가 떠야 사용자가 인지 가능 (silent 무시 X).
-- ============================================================================
update public.pre_spec_notices
  set external_id = 'pre-spec:' || external_id
  where external_id is not null
    and external_id <> ''
    and external_id not like 'pre-spec:%';

create index if not exists pre_spec_notices_pre_spec_no_idx
  on public.pre_spec_notices (pre_spec_no);

create index if not exists pre_spec_notices_opinion_deadline_idx
  on public.pre_spec_notices (opinion_deadline desc);

create index if not exists pre_spec_notices_updated_at_idx
  on public.pre_spec_notices (updated_at desc);

-- updated_at 트리거 (업데이트 때마다 자동 갱신).
create or replace function public.pre_spec_notices_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pre_spec_notices_set_updated_at on public.pre_spec_notices;
create trigger pre_spec_notices_set_updated_at
  before update on public.pre_spec_notices
  for each row execute function public.pre_spec_notices_set_updated_at();

-- RLS: authenticated 사용자는 SELECT, INSERT/UPDATE/DELETE 는 service_role(cron/admin API) 만.
alter table public.pre_spec_notices enable row level security;

drop policy if exists "pre_spec_notices_read_all" on public.pre_spec_notices;
drop policy if exists "pre_spec_notices_read_authenticated" on public.pre_spec_notices;
create policy "pre_spec_notices_read_authenticated"
  on public.pre_spec_notices
  for select
  to authenticated
  using ( true );

-- anon(비로그인) 도 읽기 허용 — 입찰공고 notices 와 동일하게 로그인 전에도 목록 조회 가능.
drop policy if exists "pre_spec_notices_read_anon" on public.pre_spec_notices;
create policy "pre_spec_notices_read_anon"
  on public.pre_spec_notices
  for select
  to anon
  using ( true );

-- PostgREST schema cache 강제 reload.
--  - SQL Editor 에서 이 파일을 통째 실행하면 자동으로 함께 실행되어 schema cache 가 즉시 반영된다.
--  - 만약 실행 후에도 앱에서 PGRST205 ("Could not find the table") 가 보이면,
--    아래 한 줄을 SQL Editor 에서 단독으로 한 번 더 실행해 주세요:
--      notify pgrst, 'reload schema';
notify pgrst, 'reload schema';

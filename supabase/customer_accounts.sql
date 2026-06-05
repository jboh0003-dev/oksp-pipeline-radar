-- 내부 고객사 마스터.
-- 한 번에 그대로 실행해도 idempotent. 이미 만든 환경에서는 ADD COLUMN / CREATE INDEX IF NOT EXISTS 만 적용된다.

create table if not exists public.customer_accounts (
  id                     uuid primary key default gen_random_uuid(),
  -- 원본 고객사명 (엑셀 D열, 그대로 보존)
  customer_name          text not null,
  -- 정규화된 고객사명 (공백/괄호/법인표기 제거 + lowercase). 매칭 키로 사용.
  customer_name_norm     text not null,
  -- 향후 "그룹사" 등 분류를 추가하기 위한 자리. 현재 import 에서는 비워둔다.
  customer_group         text,
  -- 엑셀 F열 "Named" → "Named" / "Non Named"
  account_type           text,
  -- 엑셀 G열 "26 테리토리" (담당본부/테리토리)
  territory              text,
  -- 엑셀 E열 "지방/수도권 구분"
  region_group           text,
  -- 엑셀 J열 "지역 구분"
  region                 text,
  -- 엑셀 K열 "본사주소"
  address                text,
  -- 엑셀 L열 "사업자번호"
  business_number        text,
  -- import 출처 메모 (예: "2026_고객리스트")
  source_file            text,
  updated_at             timestamptz not null default now()
);

-- 매칭에 사용되는 정규화 키. 동일 정규화 이름은 한 row 로 합치기 위해 unique 인덱스로 둔다.
-- 같은 정규화 이름이 여러 사업자번호를 가지는 케이스는 v1 에서는 마지막 import 가 덮어쓴다.
create unique index if not exists customer_accounts_norm_unique_idx
  on public.customer_accounts (customer_name_norm);

-- 부가 검색용 인덱스
create index if not exists customer_accounts_business_number_idx
  on public.customer_accounts (business_number);

-- =========================================================================
-- RLS 정책
-- =========================================================================
-- 고객사명 / 주소 / 사업자번호 같은 민감 정보가 들어 있으므로
-- anon (브라우저) 에서는 SELECT 를 허용하지 않는다.
-- 매칭 처리는 Next.js server route(`/api/customer-accounts/match`) 가
-- SUPABASE_SERVICE_ROLE_KEY 로 수행한다. service_role 키는 RLS 를 우회한다.
--
-- 만약 이전 버전에서 anon select 정책이 만들어졌다면 여기서 제거한다.
-- =========================================================================
alter table public.customer_accounts enable row level security;

drop policy if exists "customer_accounts_read_all" on public.customer_accounts;
-- (정책을 만들지 않으면 RLS enabled 상태에서 anon select 는 자동으로 거부된다.)

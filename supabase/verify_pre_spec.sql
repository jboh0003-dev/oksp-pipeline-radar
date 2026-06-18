-- 사전규격공고(pre_spec_notices) 운영 검증용 SQL
-- Supabase SQL Editor 에서 순서대로 실행하세요.
--
-- 참고:
--  - status 컬럼은 테이블에 없습니다. 앱에서 raw_data 정규화 시 opinion_deadline 기준으로 계산됩니다.
--  - collection_runs.source = 'pre_spec' 은 cron(자동) / manual(관리자) 공통 표준 키입니다.
--    legacy: cron:collect-g2b:prespec:* , manual:pre-spec 도 함께 조회할 수 있습니다.

-- 1) 전체 건수
select count(*) as pre_spec_total from pre_spec_notices;

-- 2) 최근 사전규격 수집 이력 (표준 source)
select *
from collection_runs
where source = 'pre_spec'
order by started_at desc
limit 10;

-- 2-b) legacy cron/manual 이력까지 포함
select *
from collection_runs
where source = 'pre_spec'
   or source like 'cron:collect-g2b:prespec%'
   or source = 'manual:pre-spec'
order by started_at desc
limit 10;

-- 3) 의견마감일 기준 대략적 status 분포 (앱 status 근사)
select
  case
    when opinion_deadline is null then '확인필요'
    when opinion_deadline < current_date then '마감'
    when opinion_deadline <= current_date + 3 then '마감임박'
    else '진행중'
  end as status_approx,
  count(*) as cnt
from pre_spec_notices
group by 1
order by cnt desc;

-- 4) 최근 저장된 샘플 5건
select external_id, pre_spec_no, title, opinion_deadline, updated_at
from pre_spec_notices
order by updated_at desc nulls last
limit 5;

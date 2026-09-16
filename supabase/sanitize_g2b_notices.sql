-- G2B 공고 저장 전 데이터 품질 보정.
-- 1) keywords 배열의 중복 제거
-- 2) 소프트웨어 컨테이너와 무관한 물리적 컨테이너하우스/컨테이너박스 오탐 숨김
-- 3) 기존 만료 공고의 상태 정리

create or replace function public.sanitize_g2b_notice_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.keywords is not null then
    select array_agg(keyword order by first_ord)
      into new.keywords
    from (
      select keyword, min(ord) as first_ord
      from unnest(new.keywords) with ordinality as u(keyword, ord)
      group by keyword
    ) deduped;
  end if;

  if new.source_type = 'g2b_active_core'
     and new.title ~ '(컨테이너[[:space:]]*하우스|컨테이너[[:space:]]*박스)'
     and new.products is not null
     and 'VIOLA' = any(new.products)
  then
    new.status := 'filtered';
  end if;

  return new;
end;
$$;

drop trigger if exists notices_sanitize_g2b_before_write on public.notices;
create trigger notices_sanitize_g2b_before_write
before insert or update on public.notices
for each row
execute function public.sanitize_g2b_notice_before_write();

-- 기존 G2B 행에도 sanitizer 적용
update public.notices
set status = status
where source_type = 'g2b_active_core';

-- 과거 수집분 중 이미 마감됐지만 open 으로 남은 행 정리
update public.notices
set status = 'closed'
where source_type = 'g2b_active_core'
  and due_date < current_date
  and status = 'open';

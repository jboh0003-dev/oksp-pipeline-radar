-- Normalize keyword-based G2B records without deleting original procurement evidence.
-- Only explicitly computing/VDI/HCI relevant titles enter the default comparison.
with classified as (
  select id,
    case
      when project ~* '(가상[[:space:]]*화폐|암호화폐|블록체인|가상화[[:space:]]*스위치|백본[[:space:]]*가상화|네트워크[[:space:]]*가상화|가상화.{0,8}물리모델|물리모델.{0,8}가상화|가상화.{0,10}수치해석)' then 'review'
      when project ~* '(가상화.{0,10}데스크톱|데스크톱.{0,10}가상화|가상[[:space:]]*데스크톱|(^|[^a-z])vdi([^a-z]|$)|dstation|디스테이션|(^|[^a-z])daas([^a-z]|$)|원격근무.{0,10}가상화|원격접속.{0,12}가상화|모바일.{0,8}가상화|가상화.{0,10}스마트오피스)' then 'vdi'
      when project ~* '((^|[^a-z])hci([^a-z]|$)|하이퍼.?컨버|hyper.?converg|에이블스택|ablestack)' then 'hci'
      when project ~* '(서버.{0,10}가상화|가상화.{0,10}서버|통합가상화|가상화[[:space:]]*시스템|가상화소프트웨어|가상화[[:space:]]*솔루션|가상화[[:space:]]*인프라|가상화[[:space:]]*sw|하이퍼바이저|hypervisor|vsphere|vmware|openstackit|오픈스택잇|클라우드잇|cloudit)' then 'server_virtualization'
      when project ~* '(가상화|virtuali[sz])' then 'virtualization_other'
      else 'review'
    end as desired
  from public.virtualization_award_candidates
), changed as (
  update public.virtualization_award_candidates a
  set classification=c.desired, updated_at=now()
  from classified c
  where a.id=c.id and a.classification is distinct from c.desired
  returning a.id
)
select count(*) as reclassified_rows from changed;

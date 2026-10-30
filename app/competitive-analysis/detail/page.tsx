import Link from "next/link";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {vendorFromAward,vendorFromDelivery} from "@/lib/competitive/vendorEvidence";
import CopyReference from "./CopyReference";

export const dynamic="force-dynamic";
export const metadata={title:"납품·낙찰 상세 | Pipeline Maker"};

type Params={kind?:string;key?:string};
type DetailRow=Record<string,unknown>;
const fmt=(value:unknown)=>value==null||value===""?"-":String(value);
const won=(value:unknown)=>value==null?"-":Number(value).toLocaleString("ko-KR")+"원";

export default async function CompetitiveDetail({searchParams}:{searchParams:Promise<Params>}) {
  const {kind,key}=await searchParams;
  const tables:Record<string,string>={
    award:"virtualization_award_candidates",
    delivery:"virtualization_delivery_items",
    direct:"competitive_awards",
  };
  const table=kind?tables[kind]:undefined;
  if (!table || !key || key.length>256) return <main className="mx-auto max-w-5xl p-6"><Link href="/competitive-analysis" className="text-sm text-blue-600">경쟁분석으로 돌아가기</Link><p className="mt-5 text-sm">조회할 내역을 선택해 주세요.</p></main>;
  const db=getSupabaseAdmin();
  if(!db) return <main className="mx-auto max-w-5xl p-6"><p>데이터베이스 연결을 확인할 수 없습니다.</p></main>;
  const result=await db.from(table).select("*").eq("external_key",key).maybeSingle();
  const row=result.data as DetailRow|null;
  const isDelivery=kind==="delivery";
  const isDirect=kind==="direct";
  const evidence=isDelivery?vendorFromDelivery({
      product_name:fmt(row?.product_name),brand:fmt(row?.brand),supplier_name:fmt(row?.supplier_name)
    }):isDirect?null:row?vendorFromAward({
      bid_no:fmt(row.bid_no),project:fmt(row.project),product_brand:fmt(row.product_brand),
      winner_name:fmt(row.winner_name),winner_business_no:fmt(row.winner_business_no)
    }):null;
  const project=isDelivery?fmt(row?.product_name):fmt(row?.project);
  const reference=isDelivery?fmt(row?.delivery_request_no):fmt(row?.bid_no);
  const provider=isDelivery?fmt(row?.supplier_name):fmt(row?.winner_name);
  const date=isDelivery?fmt(row?.receipt_date):fmt(row?.award_date);
  const customer=isDelivery?fmt(row?.customer_name):fmt(row?.customer);
  const amount=isDelivery?row?.amount:row?.amount;
  const fields:[string,unknown][]=[
    [isDirect?"추적업체":"제조사",isDirect?row?.competitor:(evidence?.vendor??"미확인")],
    [isDirect?"실적 구분":"제조사 확인 근거",isDirect?"기업 전체 직접 낙찰 이력 · 가상화 제품 공급 여부 미확인":(evidence?.evidence??"자료에 제조사 미기재")],
    [isDelivery?"납품업체":"최종 낙찰업체",provider],
    ["사업자등록번호",isDelivery?row?.supplier_business_no:row?.winner_business_no],
    ["수요기관",customer],
    [isDelivery?"납품요구접수일":"최종낙찰일",date],
    [isDelivery?"납품요구번호":"입찰공고번호",reference],
    ["차수",isDelivery?row?.delivery_change_order:row?.bid_ord],
    ...(isDelivery?[
      ["물품식별번호",row?.product_id] as [string,unknown],
      ["물품수량",row?.quantity] as [string,unknown],
      ["원계약번호",row?.contract_no] as [string,unknown],
      ["최종납품요구 여부",row?.final_request===true?"예":"확인 필요"] as [string,unknown],
    ]:[
      ["사업 분야",row?.classification] as [string,unknown],
      ["업무구분",row?.category] as [string,unknown],
      ["낙찰률",row?.rate==null?"-":fmt(row?.rate)+"%"] as [string,unknown],
    ]),
  ];
  return <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-7">
    <nav className="mb-4 flex items-center gap-2 text-xs text-slate-500"><Link href="/competitive-analysis" className="font-semibold text-blue-600 hover:underline">경쟁분석</Link><span>/</span><span>상세 내역</span></nav>
    {!row?<section className="rounded-xl border border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-slate-900"><p className="font-semibold">내역을 찾지 못했습니다.</p><p className="mt-2 text-sm text-slate-500">기존 자료가 변경되었거나 조회에 실패했습니다.</p></section>:<>
    <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <p className="text-[11px] font-bold tracking-wide text-blue-600">{isDelivery?"나라장터 종합쇼핑몰 납품요구":isDirect?"벤더 직접 낙찰":"가상화 관련 낙찰사업"}</p>
      <h1 className="mt-2 break-words text-xl font-bold leading-relaxed text-slate-900 dark:text-white">{project}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{isDirect?fmt(row?.competitor):(evidence?.vendor??"제조사 미확인")}</span>
        <span>{date}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{won(amount)}</span>
      </div>
    </header>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_290px]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold dark:border-white/10">계약·납품 세부정보</h2>
        <dl className="divide-y divide-slate-100 px-5 dark:divide-white/10">
          {fields.map(([label,value])=><div key={label} className="grid grid-cols-[128px_1fr] gap-3 py-3 text-xs sm:grid-cols-[170px_1fr]">
            <dt className="text-slate-500">{label}</dt><dd className="break-words font-medium text-slate-900 dark:text-slate-100">{fmt(value)}</dd>
          </div>)}
        </dl>
      </section>
      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-sm font-bold">원문·증빙</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">원천 데이터와 공고번호를 기준으로 확인할 수 있습니다.</p>
        <p className="mt-4 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-800">{reference}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyReference value={reference}/>
          <a href="https://www.g2b.go.kr/" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">나라장터 검색</a>
        </div>
        {evidence?.url&&<a href={evidence.url} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 dark:border-blue-500/20 dark:text-blue-300">제조사 공식 구축사례 확인 ↗</a>}
        <a href={isDelivery?"https://www.data.go.kr/data/15129471/openapi.do":"https://www.data.go.kr/data/15129397/openapi.do"} target="_blank" rel="noopener noreferrer" className="mt-3 block text-xs text-blue-600 hover:underline">조달청 원천 API 안내 ↗</a>
        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500 dark:border-white/10">{isDelivery?"납품요구금액은 개별 구매내역입니다. 변경차수가 있는 경우 최종차수 확인이 필요합니다.":"낙찰금액은 사업 전체 계약금액입니다. 하드웨어·OS·가상화솔루션 등 구성품별 매출이 아닙니다."}</p>
      </aside>
    </div>
    </>}
  </main>;
}

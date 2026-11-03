"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {VENDORS, vendorFromAward, vendorFromDelivery, classifyDeliveryProduct, isCompetitiveDeliveryProduct, isDirectVendorSupply, hasConfirmedVendorBusinessNo, type VendorId} from "@/lib/competitive/vendorEvidence";
import {VIRTUALIZATION_KEYWORDS} from "@/lib/competitive/keywords";
import {authedFetch} from "@/lib/authedFetch";
import {useAuth} from "@/lib/auth";
import VendorInsight from "@/components/competitive/VendorInsight";

type Candidate = {
  external_key:string;bid_no:string;bid_ord:string|null;award_date:string|null;
  winner_name:string;winner_business_no:string;project:string;customer:string|null;
  amount:number|null;rate:number|null;category:string|null;classification:string;
  product_brand:string|null;matched_keywords:string[];
};
type Delivery = {
  external_key:string;delivery_request_no:string;receipt_date:string;original_request_date:string|null;
  product_name:string;product_id:string|null;brand:string|null;supplier_name:string|null;
  supplier_business_no:string|null;customer_name:string|null;amount:number|null;
  classification:string;matched_keyword:string;
};
type DirectAward = {
  external_key:string;bid_no:string;award_date:string|null;winner_name:string;
  winner_business_no:string|null;competitor:string;project:string;customer:string|null;
  amount:number|null;rate:number|null;
};
type Source = "award" | "delivery";
type Direction = "asc" | "desc";
type SortState = {key:string;direction:Direction};
type SupplyGroup = "all" | "direct" | "other" | "unidentified";
const TYPE_LABELS:Record<string,string>={
  server_virtualization:"서버 가상화",hci:"HCI",vdi:"VDI",
  virtualization_other:"기타 가상화",review:"검토 필요",
};
const YEARS=["전체","2026","2025","2024"];
const fmtWon=(n:number|null|undefined)=>n==null?"-":Math.round(Number(n)).toLocaleString("ko-KR")+"원";
const fmtCompact=(n:number)=>{
  if(!n)return "0원";
  if(Math.abs(n)>=1e8)return (n/1e8).toLocaleString("ko-KR",{maximumFractionDigits:2})+"억 원";
  if(Math.abs(n)>=1e4)return (n/1e4).toLocaleString("ko-KR",{maximumFractionDigits:0})+"만 원";
  return n.toLocaleString("ko-KR")+"원";
};
const dateText=(s:string|null|undefined)=>s?String(s).slice(0,10).replaceAll("-","."):"-";
const money=(n:unknown)=>n==null?0:Number(n)||0;
const inYear=(d:string|null|undefined,y:string)=>y==="전체"||String(d??"").startsWith(y);
const detail=(source:Source|"direct",key:string)=>"/competitive-analysis/detail?kind="+source+"&key="+encodeURIComponent(key);
const orderBy=<T,>(items:T[],value:(item:T)=>unknown,sort:SortState):T[]=>[...items].sort((a,b)=>{
  const x=value(a),y=value(b);
  if(x==null||x==="")return y==null||y===""?0:1;
  if(y==null||y==="")return -1;
  const n=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"ko-KR",{numeric:true});
  return sort.direction==="asc"?n:-n;
});
function Field({label,children}:{label:string;children:React.ReactNode}){
  return <label className="flex min-w-0 flex-col gap-1">
    <span className="text-sm font-medium text-slate-500">{label}</span>{children}
  </label>;
}
const inputClass="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100";
function SortHeader({title,field,sort,setSort,right=false,extra=""}:{
  title:string;field:string;sort:SortState;setSort:(next:SortState)=>void;right?:boolean;extra?:string;
}){
  const selected=sort.key===field;
  return <th scope="col" aria-sort={selected?(sort.direction==="asc"?"ascending":"descending"):"none"}
    className={"whitespace-nowrap px-3 py-3 font-semibold "+(right?"text-right ":"")+extra}>
    <button type="button" onClick={()=>setSort({key:field,direction:selected&&sort.direction==="desc"?"asc":"desc"})}
      className={"inline-flex items-center gap-1.5 hover:text-blue-600 "+(right?"justify-end":"")}>
      {title}<span className={selected?"text-blue-600 dark:text-blue-300":"text-slate-400"}>{selected?(sort.direction==="asc"?"▲":"▼"):"↕"}</span>
    </button>
  </th>;
}
function Summary({label,value,sub}:{label:string;value:string;sub:string}){
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="mt-1 truncate text-xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
    {sub&&<p className="mt-0.5 truncate text-sm text-slate-400">{sub}</p>}
  </div>;
}
function CsvButton({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-30 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">CSV 다운로드</button>;
}
const csvDownload=(file:string,rows:unknown[][])=>{
  const esc=(x:unknown)=>{
    const value=String(x??"");
    const safe=/^[=+\-@\t\r]/.test(value)?"'"+value:value;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(esc).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=file;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
};

export default function CompetitiveAnalysisPage(){
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [deliveries,setDeliveries]=useState<Delivery[]>([]);
  const [directAwards,setDirectAwards]=useState<DirectAward[]>([]);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [ready,setReady]=useState<Record<string,boolean>>({});
  const [year,setYear]=useState("2026");
  const [vendor,setVendor]=useState<"전체"|VendorId>("전체");
  const [type,setType]=useState("전체");
  const [agency,setAgency]=useState("전체");
  const [si,setSi]=useState("전체");
  const [query,setQuery]=useState("");
  const [awardSort,setAwardSort]=useState<SortState>({key:"award_date",direction:"desc"});
  const [deliverySort,setDeliverySort]=useState<SortState>({key:"receipt_date",direction:"desc"});
  const [awardPage,setAwardPage]=useState(1);
  const [deliveryPage,setDeliveryPage]=useState(1);
  const [pageSize,setPageSize]=useState(30);
  const [drilldown,setDrilldown]=useState<{vendor:VendorId;group:SupplyGroup}|null>(null);
  const [detailMonth,setDetailMonth]=useState<string|null>(null);
  const [refreshKey,setRefreshKey]=useState(0);
  const [collecting,setCollecting]=useState(false);
  const [collectMessage,setCollectMessage]=useState("");
  const [exporting,setExporting]=useState(false);
  const auth=useAuth();
  const canAdmin=auth.profileStatus==="ready"&&auth.role==="admin";
  useEffect(()=>{
    if(!drilldown)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setDrilldown(null);};
    document.addEventListener("keydown",onKey);
    return ()=>document.removeEventListener("keydown",onKey);
  },[drilldown]);

  useEffect(()=>{
    let cancelled=false;
    const sources=[
      {key:"award",url:"/api/virtualization-award-candidates",save:setCandidates},
      {key:"delivery",url:"/api/virtualization-deliveries",save:setDeliveries},
      {key:"direct",url:"/api/competitive-awards",save:setDirectAwards},
    ] as const;
    for(const source of sources){
      fetch(source.url,{cache:"no-store"})
        .then(async res=>{const body=await res.json();if(!res.ok||!body.ok)throw Error(body.error??"데이터 조회 실패");if(!cancelled)source.save(body.rows);})
        .catch(error=>{if(!cancelled)setErrors(old=>({...old,[source.key]:error instanceof Error?error.message:String(error)}));})
        .finally(()=>{if(!cancelled)setReady(old=>({...old,[source.key]:true}));});
    }
    return ()=>{cancelled=true;};
  },[refreshKey]);

  const relevantDeliveries=useMemo(()=>deliveries.filter(r=>isCompetitiveDeliveryProduct(r.product_name)),[deliveries]);
  const agencies=useMemo(()=>[...new Set([...candidates.map(x=>x.customer),...relevantDeliveries.map(x=>x.customer_name)]
    .filter((s):s is string=>!!s))].sort((a,b)=>a.localeCompare(b,"ko-KR")),[candidates,relevantDeliveries]);
  const supplierOptions=useMemo(()=>{
    const map=new Map<string,{name:string;count:number}>();
    for(const a of candidates){if(a.classification==="review"||!a.winner_business_no)continue;
      const id=a.winner_business_no,old=map.get(id);
      map.set(id,{name:old?.name??a.winner_name,count:(old?.count??0)+1});
    }
    for(const d of relevantDeliveries){if(!d.supplier_business_no)continue;
      const id=d.supplier_business_no,old=map.get(id);
      map.set(id,{name:old?.name??d.supplier_name??id,count:(old?.count??0)+1});
    }
    return [...map.entries()].sort((a,b)=>b[1].count-a[1].count||a[1].name.localeCompare(b[1].name,"ko-KR"));
  },[candidates,relevantDeliveries]);

  const filteredAwards=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase();
    return candidates.filter(r=>{
      if(r.classification==="review"||!inYear(r.award_date,year))return false;
      const attribution=vendorFromAward(r);
      if(vendor!=="전체"&&attribution?.vendor!==vendor)return false;
      if(type!=="전체"&&r.classification!==type)return false;
      if(agency!=="전체"&&r.customer!==agency)return false;
      if(si!=="전체"&&r.winner_business_no!==si)return false;
      return !q||[r.project,r.customer,r.bid_no,r.winner_name,r.product_brand,attribution?.vendor]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(q);
    });
  },[candidates,year,vendor,type,agency,si,query]);
  const filteredDeliveries=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase();
    return relevantDeliveries.filter(r=>{
      if(!inYear(r.receipt_date,year))return false;
      const attribution=vendorFromDelivery(r);
      if(vendor!=="전체"&&attribution?.vendor!==vendor)return false;
      if(agency!=="전체"&&r.customer_name!==agency)return false;
      if(si!=="전체"&&r.supplier_business_no!==si)return false;
      if(type!=="전체"&&classifyDeliveryProduct(r.product_name)!==type)return false;
      return !q||[r.product_name,r.brand,r.supplier_name,r.customer_name,r.delivery_request_no,r.product_id,attribution?.vendor]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(q);
    });
  },[relevantDeliveries,year,vendor,type,agency,si,query]);

  const verifiedAwards=useMemo(()=>filteredAwards.filter(r=>vendorFromAward(r)!=null),[filteredAwards]);
  const unverifiedAwards=useMemo(()=>filteredAwards.filter(r=>vendorFromAward(r)==null),[filteredAwards]);
  const verifiedDeliveries=useMemo(()=>filteredDeliveries.filter(r=>vendorFromDelivery(r)!=null),[filteredDeliveries]);
  const otherDeliveries=useMemo(()=>filteredDeliveries.filter(r=>vendorFromDelivery(r)==null),[filteredDeliveries]);
  const vendorStats=useMemo(()=>VENDORS.map(meta=>{
    const awards=verifiedAwards.filter(r=>vendorFromAward(r)?.vendor===meta.id);
    const items=verifiedDeliveries.filter(r=>vendorFromDelivery(r)?.vendor===meta.id);
    const partners=new Set(items.map(r=>r.supplier_business_no||r.supplier_name).filter(Boolean));
    const direct=items.filter(r=>isDirectVendorSupply(meta.id,r.supplier_business_no));
    const other=items.filter(r=>hasConfirmedVendorBusinessNo(meta.id)&&r.supplier_business_no&&!isDirectVendorSupply(meta.id,r.supplier_business_no));
    const unidentified=items.filter(r=>!r.supplier_business_no||!hasConfirmedVendorBusinessNo(meta.id));
    return {vendor:meta.id,label:meta.label,products:meta.products,
      awardCount:awards.length,awardAmount:awards.reduce((sum,r)=>sum+money(r.amount),0),
      deliveryCount:items.length,deliveryAmount:items.reduce((sum,r)=>sum+money(r.amount),0),
      pricedCount:items.filter(r=>r.amount!=null).length,
      directCount:direct.length,directAmount:direct.reduce((sum,r)=>sum+money(r.amount),0),
      otherCount:other.length,otherAmount:other.reduce((sum,r)=>sum+money(r.amount),0),
      unidentifiedCount:unidentified.length,unidentifiedAmount:unidentified.reduce((sum,r)=>sum+money(r.amount),0),
      supplierCount:partners.size};
  }),[verifiedAwards,verifiedDeliveries]);
  const ranking=useMemo(()=>vendorStats.filter(row=>row.deliveryCount>0).sort((a,b)=>
    b.deliveryAmount-a.deliveryAmount||b.deliveryCount-a.deliveryCount||a.label.localeCompare(b.label,"ko-KR")
  ),[vendorStats]);
  const comparisonDeliveries=useMemo(()=>relevantDeliveries.filter(r=>{
    const attribution=vendorFromDelivery(r);
    const q=query.trim().toLocaleLowerCase();
    return (vendor==="전체"||attribution?.vendor===vendor)&&
      (type==="전체"||classifyDeliveryProduct(r.product_name)===type)&&
      (agency==="전체"||r.customer_name===agency)&&
      (si==="전체"||r.supplier_business_no===si)&&
      (!q||[r.product_name,r.brand,r.supplier_name,r.customer_name,r.delivery_request_no,r.product_id,attribution?.vendor].filter(Boolean).join(" ").toLocaleLowerCase().includes(q))&&attribution!=null;
  }),[relevantDeliveries,vendor,type,agency,si,query]);
  const yearly=useMemo(()=>[2024,2025,2026].map(y=>{
    const ds=comparisonDeliveries.filter(x=>String(x.receipt_date??"").startsWith(String(y)));
    return {year:y,deliveryCount:ds.length,deliveryAmount:ds.reduce((s,x)=>s+money(x.amount),0)};
  }),[comparisonDeliveries]);
  const leadingAgencies=useMemo(()=>{
    const map=new Map<string,{count:number;amount:number;last:string;vendors:Set<string>}>();
    for(const r of verifiedDeliveries){const name=r.customer_name?.trim();if(!name)continue;
      const item=map.get(name)??{count:0,amount:0,last:"",vendors:new Set<string>()};
      item.count++;item.amount+=money(r.amount);item.last=item.last>r.receipt_date?item.last:r.receipt_date;
      const v=vendorFromDelivery(r)?.vendor;if(v)item.vendors.add(v);map.set(name,item);
    }
    return [...map.entries()].sort((a,b)=>b[1].amount-a[1].amount).slice(0,8);
  },[verifiedDeliveries]);

  const orderAwards=useMemo(()=>orderBy(verifiedAwards,r=>awardSort.key==="vendor"?vendorFromAward(r)?.vendor:
    awardSort.key==="evidence"?vendorFromAward(r)?.evidence:(r as unknown as Record<string,unknown>)[awardSort.key],awardSort),[verifiedAwards,awardSort]);
  const orderDeliveries=useMemo(()=>orderBy(verifiedDeliveries,r=>deliverySort.key==="vendor"?vendorFromDelivery(r)?.vendor:
    (r as unknown as Record<string,unknown>)[deliverySort.key],deliverySort),[verifiedDeliveries,deliverySort]);
  const shownAwards=orderAwards.slice((awardPage-1)*pageSize,awardPage*pageSize);
  const shownDeliveries=orderDeliveries.slice((deliveryPage-1)*pageSize,deliveryPage*pageSize);
  const awardPages=Math.max(1,Math.ceil(orderAwards.length/pageSize));
  const deliveryPages=Math.max(1,Math.ceil(orderDeliveries.length/pageSize));
  useEffect(()=>{setAwardPage(1);setDeliveryPage(1);},[year,vendor,type,agency,si,query,pageSize,awardSort,deliverySort]);

  function reset(){setYear("2026");setVendor("전체");setType("전체");setAgency("전체");setSi("전체");setQuery("");}
  function refresh(){reset();setDrilldown(null);setErrors({});setReady({});setRefreshKey(key=>key+1);}
  function openDrilldown(next:{vendor:VendorId;group:SupplyGroup}){setDetailMonth(null);setDrilldown(next);}
  async function collectLatest(){
    if(collecting)return;
    setCollecting(true);setCollectMessage("나라장터 최신 자료 수집 중 · 0건 완료");
    const [yearNow,monthNow]=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).format(new Date()).split("-").map(Number);
    const tasks=[
      ...VIRTUALIZATION_KEYWORDS.map(keyword=>({url:"/api/admin/virtualization-backfill",body:{year:yearNow,month:monthNow,keyword}})),
      ...(["core","nutanix","vmware","redhat","proxmox"] as const).map(group=>({url:"/api/admin/virtualization-candidates",body:{year:yearNow,month:monthNow,group,persist:true}})),
      {url:"/api/admin/competitive-awards-backfill",body:{year:yearNow,month:monthNow,persist:true}},
    ];
    let failed=0;
    try{
      for(let i=0;i<tasks.length;i++){
        const task=tasks[i];
        try{const response=await authedFetch(task.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(task.body)});
          const result=await response.json();if(!response.ok||!result.ok)failed++;
        }catch{failed++;}
        setCollectMessage(`나라장터 최신 자료 수집 중 · ${i+1}/${tasks.length} 완료${failed?` · 실패 ${failed}건`:""}`);
      }
      setCollectMessage(failed?`수집 완료 · ${tasks.length-failed}/${tasks.length}개 작업 성공. 실패 ${failed}건은 다시 시도해 주세요.`:"최신 자료 수집 완료");
      setRefreshKey(key=>key+1);
    }finally{setCollecting(false);}
  }
  async function downloadExcel(){
    if(exporting)return;setExporting(true);
    try{const {exportCompetitiveWorkbook}=await import("@/lib/competitive/exportWorkbook");
      await exportCompetitiveWorkbook({deliveries,awards:candidates,directAwards,year,vendor,type,agency,si,query});
    }catch(error){setCollectMessage(`엑셀 생성 실패: ${error instanceof Error?error.message:String(error)}`);}finally{setExporting(false);}
  }
  const deliveryAmount=verifiedDeliveries.reduce((sum,r)=>sum+money(r.amount),0);
  const maxVendorAmount=Math.max(0,...ranking.map(r=>r.deliveryAmount));
  const drilldownRows=drilldown?verifiedDeliveries.filter(r=>{
    if(vendorFromDelivery(r)?.vendor!==drilldown.vendor)return false;
    if(drilldown.group==="all")return true;
    const identified=Boolean(r.supplier_business_no)&&hasConfirmedVendorBusinessNo(drilldown.vendor);
    if(drilldown.group==="unidentified")return !identified;
    const direct=isDirectVendorSupply(drilldown.vendor,r.supplier_business_no);
    return identified&&(drilldown.group==="direct"?direct:!direct);
  }).sort((a,b)=>String(b.receipt_date).localeCompare(String(a.receipt_date))):[];
  const drilldownTitle=drilldown?`${drilldown.vendor} · ${{all:"전체 조달 공급",direct:"제조사 직접 공급",other:"타 공급업체 공급",unidentified:"공급경로 미확인"}[drilldown.group]}`:"";
  const visibleDrilldownRows=detailMonth?drilldownRows.filter(row=>row.receipt_date.startsWith(detailMonth)):drilldownRows;
  const noData=ready.award&&ready.delivery&&!verifiedAwards.length&&!verifiedDeliveries.length;
  const directVisible=directAwards.filter(r=>inYear(r.award_date,year)&&
    (vendor==="전체"||r.competitor===vendor)&&
    (si==="전체"||r.winner_business_no===si)&&
    (agency==="전체"||r.customer===agency)&&
    (!query||[r.project,r.winner_name,r.customer,r.bid_no].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())));

  return <div className="min-h-full">
    <div className="mx-auto w-full max-w-[1850px] px-4 py-5 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-white dark:ring-1 dark:ring-white/10">
        <div><p className="text-sm font-semibold tracking-widest text-cyan-300">PIPELINE MAKER</p>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">가상화 벤더 경쟁분석</h1></div>
        <div className="text-sm text-slate-300">{year==="전체"?"2024–2026년 전체":year+"년"} · 나라장터 기준</div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/70 md:grid-cols-3 xl:grid-cols-5">
        <Field label="분석 연도"><select className={inputClass} value={year} onChange={e=>setYear(e.target.value)}>
          {YEARS.map(y=><option key={y} value={y}>{y==="전체"?"2024~2026년 전체":y+"년"}</option>)}
        </select></Field>
        <Field label="경쟁 제조사"><select className={inputClass} value={vendor} onChange={e=>setVendor(e.target.value as typeof vendor)}>
          <option value="전체">전체 제조사</option>{VENDORS.filter(v=>relevantDeliveries.some(r=>vendorFromDelivery(r)?.vendor===v.id)).map(v=><option value={v.id} key={v.id}>{v.label}</option>)}
        </select></Field>
        <Field label="가상화 분야"><select className={inputClass} value={type} onChange={e=>setType(e.target.value)}>
          <option value="전체">전체 분야</option>{Object.entries(TYPE_LABELS).filter(([id])=>id!=="review").map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select></Field>
        <Field label="수요기관"><select className={inputClass} value={agency} onChange={e=>setAgency(e.target.value)}>
          <option value="전체">전체 수요기관</option>{agencies.map(a=><option key={a}>{a}</option>)}
        </select></Field>
        <Field label="사업·제품 검색"><input className={inputClass} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nutanix, 사업명, 공고번호 등"/></Field>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2 dark:border-white/10 md:col-span-3 xl:col-span-5">
          <details className="min-w-0 text-sm text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">상세 필터 · 낙찰/SI·총판 선택{si!=="전체"?" (적용됨)":""}</summary>
            <div className="mt-2 max-w-[420px]"><select className={inputClass} aria-label="실제 낙찰 및 납품업체 선택" value={si} onChange={e=>setSi(e.target.value)}>
              <option value="전체">전체 SI·총판·공급업체</option>{supplierOptions.map(([id,item])=><option value={id} key={id}>{item.name} ({item.count}건)</option>)}
            </select></div>
          </details>
          <div className="flex flex-wrap gap-2">
            {vendor!=="전체"&&<button type="button" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-300" onClick={()=>setVendor("전체")}>← 전체 제조사 보기</button>}
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300" onClick={reset}>필터 초기화</button>
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300" onClick={refresh}>↻ 새로고침</button>
            {canAdmin&&<button type="button" disabled={collecting} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void collectLatest()}>{collecting?"최신 자료 수집 중…":"나라장터 최신화"}</button>}
            <button type="button" disabled={exporting||!ready.delivery} className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-700 disabled:opacity-50 dark:text-blue-300" onClick={()=>void downloadExcel()}>{exporting?"엑셀 생성 중…":"분석 엑셀 다운로드"}</button>
          </div>
        </div>
      </div>
      {collectMessage&&<p role="status" className="mb-3 text-sm text-slate-600 dark:text-slate-300">{collectMessage}</p>}

      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Summary label="조달 공급 실적" value={!ready.delivery?"확인 중":verifiedDeliveries.length.toLocaleString("ko-KR")+"건"} sub=""/>
        <Summary label="조달 공급금액 합계" value={!ready.delivery?"확인 중":fmtCompact(deliveryAmount)} sub=""/>
        <Summary label="별도 입찰사업 수주" value={!ready.award?"확인 중":verifiedAwards.length+"건"} sub=""/>
      </div>
      {(errors.award||errors.delivery)&&<div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-300">
        {[errors.award,errors.delivery].filter(Boolean).join(" / ")}
      </div>}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/70">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">연도별 조달 공급 비교</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {yearly.map(item=>{
            const maxAmount=Math.max(0,...yearly.map(x=>x.deliveryAmount));
            const maxCount=Math.max(0,...yearly.map(x=>x.deliveryCount));
            return <button type="button" key={item.year} onClick={()=>setYear(String(item.year))} aria-pressed={year===String(item.year)} className={"rounded-xl border p-4 text-left transition-colors "+(year===String(item.year)?"border-blue-500 bg-blue-50 dark:bg-blue-950/30":"border-slate-200 hover:border-blue-300 dark:border-white/10 dark:hover:border-blue-500")}>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{item.year}년</span>
              <div className="mt-4 flex items-baseline justify-between gap-2"><span className="text-sm text-slate-600 dark:text-slate-300">공급금액</span><strong className="text-xl tabular-nums text-blue-700 dark:text-blue-300">{fmtCompact(item.deliveryAmount)}</strong></div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 dark:bg-slate-700" role="img" aria-label={`${item.year}년 금액 ${fmtWon(item.deliveryAmount)}`}><div className="h-full rounded-full bg-blue-600" style={{width:`${maxAmount?100*item.deliveryAmount/maxAmount:0}%`}}/></div>
              <div className="mt-4 flex items-baseline justify-between gap-2"><span className="text-sm text-slate-600 dark:text-slate-300">조달 건수</span><strong className="text-xl tabular-nums text-slate-900 dark:text-white">{item.deliveryCount.toLocaleString("ko-KR")}건</strong></div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 dark:bg-slate-700" role="img" aria-label={`${item.year}년 ${item.deliveryCount}건`}><div className="h-full rounded-full bg-cyan-500" style={{width:`${maxCount?100*item.deliveryCount/maxCount:0}%`}}/></div>
            </button>;
          })}
        </div>
      </section>

      <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">제조사별 조달 공급 현황</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] table-fixed border-collapse text-base">
            <colgroup><col className="w-[22%]"/><col className="w-[12%]"/><col className="w-[27%]"/><col className="w-[13%]"/><col className="w-[13%]"/><col className="w-[13%]"/></colgroup>
            <thead className="bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"><tr>
              <th scope="col" className="px-5 py-3 text-left">제조사 / 제품</th>
              <th scope="col" className="px-4 py-3 text-right">조달 건수</th>
              <th scope="col" className="px-4 py-3 text-left">조달 공급금액</th>
              <th scope="col" className="px-4 py-3 text-right">제조사 직접</th>
              <th scope="col" className="px-4 py-3 text-right">타 공급업체</th>
              <th scope="col" className="px-4 py-3 text-right">경로 미확인</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">{ranking.map(row=><tr key={row.vendor}>
              <th scope="row" className="px-5 py-4 text-left align-middle"><button type="button" onClick={()=>openDrilldown({vendor:row.vendor,group:"all"})} aria-label={`${row.label} 조달 공급 상세 보기`} className="text-lg font-bold text-slate-900 hover:text-blue-600 hover:underline dark:text-white">{row.label}</button><p className="mt-1 break-words text-sm font-normal text-slate-600 dark:text-slate-300">{row.products}</p></th>
              <td className="px-4 py-4 text-right align-middle text-xl font-bold tabular-nums text-slate-900 dark:text-white"><button type="button" onClick={()=>openDrilldown({vendor:row.vendor,group:"all"})} aria-label={`${row.label} 조달 ${row.deliveryCount}건 상세`} className="rounded hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500">{row.deliveryCount.toLocaleString("ko-KR")}건</button></td>
              <td className="px-4 py-4 align-middle"><button type="button" onClick={()=>openDrilldown({vendor:row.vendor,group:"all"})} aria-label={`${row.label} 조달 공급금액 상세`} className="block w-full rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"><strong className="text-xl tabular-nums text-blue-700 dark:text-blue-300">{row.pricedCount?fmtCompact(row.deliveryAmount):"-"}</strong>
                <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" role="img" aria-label={`${row.label} 금액 비중 ${maxVendorAmount?Math.round(100*row.deliveryAmount/maxVendorAmount):0}%`}><div className="h-full rounded-full bg-blue-600" style={{width:`${maxVendorAmount?100*row.deliveryAmount/maxVendorAmount:0}%`}}/></div>
              </button></td>
              <td className="px-4 py-4 text-right align-middle"><button type="button" onClick={()=>openDrilldown({vendor:row.vendor,group:"direct"})} aria-label={`${row.label} 제조사 직접 공급 상세`} className="rounded hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"><strong className="block tabular-nums">{row.directCount}건</strong><span className="block break-words text-sm tabular-nums text-slate-600 dark:text-slate-300">{fmtCompact(row.directAmount)}</span></button></td>
              <td className="px-4 py-4 text-right align-middle"><button type="button" onClick={()=>openDrilldown({vendor:row.vendor,group:"other"})} aria-label={`${row.label} 타 공급업체 상세`} className="rounded hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"><strong className="block tabular-nums">{row.otherCount}건</strong><span className="block break-words text-sm tabular-nums text-slate-600 dark:text-slate-300">{fmtCompact(row.otherAmount)}</span></button></td>
              <td className="px-4 py-4 text-right align-middle"><button type="button" onClick={()=>openDrilldown({vendor:row.vendor,group:"unidentified"})} aria-label={`${row.label} 공급경로 미확인 상세`} className="rounded hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"><strong className="block tabular-nums">{row.unidentifiedCount}건</strong><span className="block break-words text-sm tabular-nums text-slate-600 dark:text-slate-300">{fmtCompact(row.unidentifiedAmount)}</span></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/70">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">주요 수요기관 비교</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-slate-800"><tr><th className="p-3 text-left">수요기관</th><th className="p-3 text-right">구매요구</th><th className="p-3 text-right">요구금액</th><th className="p-3 text-left">경쟁 제조사</th><th className="p-3 text-right">최근 요구일</th></tr></thead>
          <tbody>{leadingAgencies.map(([name,item])=><tr key={name} className="border-b border-slate-100 dark:border-white/10"><td className="p-3 font-semibold"><button className="text-left hover:text-blue-600 hover:underline" onClick={()=>setAgency(name)}>{name}</button></td><td className="p-3 text-right tabular-nums">{item.count}건</td><td className="p-3 text-right font-bold tabular-nums">{fmtCompact(item.amount)}</td><td className="p-3">{[...item.vendors].join(", ")}</td><td className="p-3 text-right tabular-nums">{dateText(item.last)}</td></tr>)}
          {ready.delivery&&!leadingAgencies.length&&<tr><td colSpan={5} className="p-6 text-center text-slate-500">확인된 구매요구가 없습니다.</td></tr>}</tbody>
        </table></div>
      </section>

      <section className="mb-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/70">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">집계 범위</h2>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"><p className="text-sm text-slate-500">분석 대상 제품 구매</p><p className="mt-1 text-lg font-bold tabular-nums">{filteredDeliveries.length}건</p></div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"><p className="text-sm text-slate-500">제조사 확인 제품</p><p className="mt-1 text-lg font-bold tabular-nums">{verifiedDeliveries.length}건</p></div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"><p className="text-sm text-slate-500">기타 가상화 제품</p><p className="mt-1 text-lg font-bold tabular-nums">{otherDeliveries.length}건</p></div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"><p className="text-sm text-slate-500">별도 입찰사업</p><p className="mt-1 text-lg font-bold tabular-nums">{verifiedAwards.length}건</p></div>
          </div>
        </div>
      </section>

      <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">조달제품 구매요구 내역 <span className="ml-1 text-sm text-blue-600">{verifiedDeliveries.length}건</span></h2>
          <CsvButton disabled={!verifiedDeliveries.length} onClick={()=>csvDownload("벤더_쇼핑몰_납품요구.csv",[
            ["납품요구일","제조사","규격/제품명","납품업체","수요기관","요구금액","납품요구번호","물품식별번호"],
            ...orderDeliveries.map(x=>[x.receipt_date,vendorFromDelivery(x)?.vendor,x.product_name,x.supplier_name,x.customer_name,x.amount,x.delivery_request_no,x.product_id])
          ])}/>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-slate-800/50">
            <SortHeader title="요구일" field="receipt_date" sort={deliverySort} setSort={setDeliverySort}/>
            <SortHeader title="제조사" field="vendor" sort={deliverySort} setSort={setDeliverySort}/>
            <SortHeader title="제품 · 상세보기" field="product_name" sort={deliverySort} setSort={setDeliverySort} extra="min-w-[340px]"/>
            <SortHeader title="납품업체" field="supplier_name" sort={deliverySort} setSort={setDeliverySort}/>
            <SortHeader title="수요기관" field="customer_name" sort={deliverySort} setSort={setDeliverySort}/>
            <SortHeader title="구매요구금액" field="amount" sort={deliverySort} setSort={setDeliverySort} right/>
          </tr></thead>
          <tbody>{shownDeliveries.map(row=><tr key={row.external_key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/5">
            <td className="whitespace-nowrap px-3 py-3 tabular-nums">{dateText(row.receipt_date)}</td>
            <td className="whitespace-nowrap px-3 py-3 font-bold">{vendorFromDelivery(row)?.vendor}</td>
            <td className="min-w-[340px] px-3 py-3"><Link href={detail("delivery",row.external_key)} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{row.product_name}</Link><p className="mt-1 font-mono text-sm text-slate-400">{row.delivery_request_no}</p></td>
            <td className="whitespace-nowrap px-3 py-3">{row.supplier_name??"-"}</td>
            <td className="px-3 py-3">{row.customer_name??"-"}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{fmtWon(row.amount)}</td>
          </tr>)}
          {ready.delivery&&!shownDeliveries.length&&<tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">해당 조건의 내역이 없습니다.</td></tr>}
          </tbody>
        </table></div>
        <Pager page={deliveryPage} pages={deliveryPages} count={verifiedDeliveries.length} onPage={setDeliveryPage} pageSize={pageSize} onPageSize={setPageSize} showSize={false}/>
      </section>

      <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">입찰사업 수주 <span className="ml-1 text-sm text-blue-600">{verifiedAwards.length}건</span></h2>
          <CsvButton disabled={!verifiedAwards.length} onClick={()=>csvDownload("벤더_확인_낙찰사업.csv",[
            ["최종낙찰일","제조사","확인근거","사업명","최종낙찰업체(SI)","수요기관","사업전체금액","공고번호"],
            ...orderAwards.map(x=>[x.award_date,vendorFromAward(x)?.vendor,vendorFromAward(x)?.evidence,x.project,x.winner_name,x.customer,x.amount,x.bid_no]),
          ])}/>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-slate-800/50">
            <SortHeader title="낙찰일" field="award_date" sort={awardSort} setSort={setAwardSort}/>
            <SortHeader title="제조사" field="vendor" sort={awardSort} setSort={setAwardSort}/>
            <SortHeader title="사업명 · 상세보기" field="project" sort={awardSort} setSort={setAwardSort} extra="min-w-[320px]"/>
            <SortHeader title="SI·총판(실제 낙찰업체)" field="winner_name" sort={awardSort} setSort={setAwardSort}/>
            <SortHeader title="수요기관" field="customer" sort={awardSort} setSort={setAwardSort}/>
            <SortHeader title="전체 낙찰금액" field="amount" sort={awardSort} setSort={setAwardSort} right/>
          </tr></thead>
          <tbody>{shownAwards.map(row=>{
            const evidence=vendorFromAward(row);
            return <tr key={row.external_key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/5">
              <td className="whitespace-nowrap px-3 py-3 tabular-nums">{dateText(row.award_date)}</td>
              <td className="whitespace-nowrap px-3 py-3"><span className="font-bold">{evidence?.vendor}</span><p className="mt-0.5 text-sm text-slate-400">{evidence?.evidence}</p></td>
              <td className="min-w-[320px] px-3 py-3"><Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" href={detail("award",row.external_key)}>{row.project}</Link><p className="mt-1 font-mono text-sm text-slate-400">{row.bid_no}</p></td>
              <td className="whitespace-nowrap px-3 py-3">{row.winner_name}</td>
              <td className="px-3 py-3">{row.customer??"-"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{fmtWon(row.amount)}</td>
            </tr>;
          })}
          {ready.award&&!shownAwards.length&&<tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">해당 조건의 제조사 확인 낙찰사업이 없습니다.</td></tr>}
          </tbody>
        </table></div>
        <Pager page={awardPage} pages={awardPages} count={verifiedAwards.length} onPage={setAwardPage} pageSize={pageSize} onPageSize={setPageSize}/>
      </section>

      <details className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          제조사 미확인 가상화 사업 <span className="ml-1 text-blue-600">{unverifiedAwards.length}건</span> <span className="ml-2 text-sm font-normal text-slate-400">벤더 실적에서 제외 · 클릭하여 검토</span>
        </summary>
        <div className="max-h-[520px] overflow-auto border-t border-slate-100 dark:border-white/10">
          <table className="w-full min-w-[800px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr className="text-slate-500">
            <th className="p-3">낙찰일</th><th className="p-3">사업명 · 상세</th><th className="p-3">낙찰업체</th><th className="p-3">수요기관</th><th className="p-3 text-right">전체 낙찰금액</th>
          </tr></thead><tbody>{unverifiedAwards.map(r=><tr key={r.external_key} className="border-t border-slate-100 dark:border-white/10">
            <td className="whitespace-nowrap p-3">{dateText(r.award_date)}</td>
            <td className="min-w-[300px] p-3"><Link className="font-semibold text-blue-600 hover:underline" href={detail("award",r.external_key)}>{r.project}</Link></td>
            <td className="whitespace-nowrap p-3">{r.winner_name}</td><td className="p-3">{r.customer??"-"}</td>
            <td className="whitespace-nowrap p-3 text-right">{fmtWon(r.amount)}</td>
          </tr>)}</tbody></table>
        </div>
      </details>

      <details className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">기타 가상화 관련 쇼핑몰 품목 <span className="text-blue-600">{otherDeliveries.length}건</span><span className="ml-2 text-sm font-normal text-slate-400">중점 추적 벤더 외 제품</span></summary>
        <div className="overflow-x-auto border-t border-slate-100 dark:border-white/10"><table className="w-full min-w-[800px] text-left text-sm">
          <tbody>{otherDeliveries.map(r=><tr key={r.external_key} className="border-b border-slate-100 dark:border-white/10">
            <td className="whitespace-nowrap p-3">{dateText(r.receipt_date)}</td>
            <td className="min-w-[310px] p-3"><Link href={detail("delivery",r.external_key)} className="font-semibold text-blue-600 hover:underline">{r.product_name}</Link></td>
            <td className="p-3">{r.supplier_name}</td><td className="p-3">{r.customer_name}</td><td className="whitespace-nowrap p-3 text-right">{fmtWon(r.amount)}</td>
          </tr>)}</tbody>
        </table></div>
      </details>

      <details className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-500 dark:text-slate-300">원본 참고: 업체 전체 입찰 이력 · {directVisible.length}건 (가상화 제품 구매와 별개)</summary>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">기존 업체 전체 입찰 이력 <span className="ml-1 text-blue-600">{!ready.direct?"조회 중":directVisible.length+"건"}</span></h2>
          <button type="button" onClick={()=>csvDownload("추적업체_직접낙찰전체.csv",[
            ["낙찰일","추적업체","사업명","낙찰업체","사업금액","공고번호"],
            ...directVisible.map(r=>[r.award_date,r.competitor,r.project,r.winner_name,r.amount,r.bid_no])
          ])} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold dark:border-white/10">CSV 다운로드</button>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-3 text-sm dark:border-white/10 lg:grid-cols-4">
          {["오케스트로","이노그리드","에이블클라우드","오케스트로클라우드"].map(name=><div key={name} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <p className="text-slate-500">{name}</p>
            <p className="mt-1 font-bold tabular-nums text-slate-900 dark:text-white">{directVisible.filter(x=>x.competitor===name).length}건</p>
          </div>)}
        </div>
        {errors.direct&&<p className="px-4 py-2 text-sm text-rose-600">{errors.direct}</p>}
        <div className="overflow-x-auto border-t border-slate-100 dark:border-white/10"><table className="w-full min-w-[850px] text-left text-sm">
          <thead><tr className="text-slate-500"><th className="p-3">낙찰일</th><th className="p-3">추적업체</th><th className="p-3">사업명</th><th className="p-3">낙찰업체</th><th className="p-3 text-right">낙찰금액</th></tr></thead>
          <tbody>{directVisible.map(r=><tr key={r.external_key} className="border-t border-slate-100 dark:border-white/10">
            <td className="whitespace-nowrap p-3">{dateText(r.award_date)}</td>
            <td className="whitespace-nowrap p-3">{r.competitor}</td>
            <td className="min-w-[290px] p-3"><Link href={detail("direct",r.external_key)} className="font-semibold text-blue-600 hover:underline">{r.project}</Link></td>
            <td className="p-3">{r.winner_name}</td><td className="whitespace-nowrap p-3 text-right">{fmtWon(r.amount)}</td>
          </tr>)}</tbody></table></div>
      </details>
      {noData&&<p className="mt-3 text-sm text-slate-500">현재 조건에 일치하는 벤더 확인 실적이 없습니다. 조건을 초기화해 주세요.</p>}
    </div>
    {drilldown&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget)setDrilldown(null);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="drilldown-title" className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div><h2 id="drilldown-title" className="text-xl font-bold text-slate-900 dark:text-white">{drilldownTitle}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{year==="전체"?"전체 기간":year+"년"} · {drilldownRows.length.toLocaleString("ko-KR")}건 · {fmtWon(drilldownRows.reduce((sum,r)=>sum+money(r.amount),0))}</p></div>
          <button type="button" onClick={()=>setDrilldown(null)} aria-label="상세 닫기" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100 dark:border-white/20 dark:hover:bg-white/10">닫기 ✕</button>
        </div>
        <div className="overflow-auto">
          <VendorInsight rows={drilldownRows} year={year} selectedMonth={detailMonth} onMonth={setDetailMonth}/>
          <div className="flex items-center justify-between px-5 py-3"><h3 className="text-sm font-bold text-slate-900 dark:text-white">조달 내역</h3><span className="text-sm tabular-nums text-slate-500">{detailMonth??"전체"} · {visibleDrilldownRows.length}건</span></div>
          <table className="w-full min-w-[920px] text-sm">
          <thead className="sticky top-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><tr><th className="p-3 text-left">요구일</th><th className="p-3 text-left">제품 / 납품요구번호</th><th className="p-3 text-left">공급업체</th><th className="p-3 text-left">수요기관</th><th className="p-3 text-right">금액</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/10">{visibleDrilldownRows.map(r=><tr key={r.external_key} className="hover:bg-slate-50 dark:hover:bg-white/5">
            <td className="whitespace-nowrap p-3">{dateText(r.receipt_date)}</td>
            <td className="min-w-[290px] p-3"><Link href={detail("delivery",r.external_key)} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{r.product_name}</Link><span className="mt-1 block text-slate-500">{r.delivery_request_no}</span></td>
            <td className="p-3">{r.supplier_name??"-"}</td><td className="p-3">{r.customer_name??"-"}</td><td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">{fmtWon(r.amount)}</td>
          </tr>)}{!visibleDrilldownRows.length&&<tr><td colSpan={5} className="p-8 text-center text-slate-500">현재 조건에 해당하는 내역이 없습니다.</td></tr>}</tbody>
        </table></div>
      </section>
    </div>}
  </div>;
}

function Pager({page,pages,count,pageSize,onPage,onPageSize,showSize=true}:{
  page:number;pages:number;count:number;pageSize:number;onPage:(n:number)=>void;onPageSize:(n:number)=>void;showSize?:boolean;
}){
  return <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-3 py-2.5 text-sm text-slate-500 dark:border-white/10">
    <span>{count?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,count)} / {count}</span>
    {showSize&&<select aria-label="페이지당 표시" value={pageSize} onChange={e=>onPageSize(Number(e.target.value))} className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-slate-900">
      <option value={30}>30개씩</option><option value={50}>50개씩</option><option value={100}>100개씩</option>
    </select>}
    <button disabled={page<=1} type="button" onClick={()=>onPage(Math.max(1,page-1))} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-30 dark:border-white/10">이전</button>
    <span className="tabular-nums">{page}/{pages}</span>
    <button disabled={page>=pages} type="button" onClick={()=>onPage(Math.min(pages,page+1))} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-30 dark:border-white/10">다음</button>
  </div>;
}

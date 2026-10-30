"use client";

import { useEffect, useMemo, useState } from "react";

type DeliveryRow = {
  external_key: string; delivery_request_no: string; receipt_date: string;
  product_name: string; brand: string | null; supplier_name: string | null;
  customer_name: string | null; amount: number | null; matched_keyword: string;
};

type CandidateRow = {
  external_key: string; award_date: string | null; bid_no: string;
  project: string; winner_name: string; winner_business_no: string;
  customer: string | null; amount: number | null; category: string | null;
  classification: "server_virtualization" | "hci" | "vdi" | "virtualization_other" | "review";
  product_brand: string | null; matched_keywords: string[];
};
const candidateClassLabel: Record<CandidateRow["classification"], string> = {
  server_virtualization: "서버 가상화", hci: "HCI", vdi: "VDI",
  virtualization_other: "기타 가상화", review: "검토 필요",
};

type CompanyName = "이노그리드" | "에이블클라우드" | "오케스트로" | "오케스트로클라우드";

type AwardRow = {
  id: string;
  external_key: string;
  competitor: CompanyName;
  winner_name: string;
  winner_business_no: string | null;
  award_date: string | null;
  opening_at: string | null;
  bid_no: string;
  bid_ord: string | null;
  project: string;
  customer: string | null;
  amount: number | null;
  rate: number | null;
  category: string | null;
  source_label: string;
  source_url: string;
  source_type: "g2b_award";
  evidence: string;
  match_type: "company" | "product";
  matched_keyword: string | null;
  collected_at: string;
  updated_at: string;
};

type ApiResponse =
  | { ok: true; rows: AwardRow[]; rawCount?: number; excludedCatalogRegistrationCount?: number }
  | { ok: false; error: string };


const VIRTUALIZATION_PATTERN = /(가상화|virtuali[sz]|hypervisor|hyper-v|kvm|openstack|오픈스택|hci|하이퍼컨버지드|하이퍼컨버전스|abelstack|ablestack|에이블스택|vmware|vsphere|vcenter|vcloud|클라우드잇|cloudit|contrabass|viola)/i;
const RELATED_PATTERN = /(클라우드|cloud|스토리지|storage|서버|server|데이터센터|data.?center|정보자원\s*통합|iaas|paas|재해복구|\bdr\b|컨테이너|kubernetes|k8s|쿠버네티스)/i;
function classifyVirtualization(row: AwardRow): "virtualization" | "related" | "other" {
  // 회사가 가상화 업체라는 이유만으로 unrelated project를 가상화 수주로 분류하지 않는다.
  const evidence = [row.project, row.matched_keyword].filter(Boolean).join(" ");
  if (VIRTUALIZATION_PATTERN.test(evidence)) return "virtualization";
  if (RELATED_PATTERN.test(evidence)) return "related";
  return "other";
}

/** Manufacturer evidence published outside G2B. Do not treat entire award value as product revenue. */
function vendorCaseEvidence(row: CandidateRow): {brand: string; url: string; label: string} | null {
  if ((row.customer ?? "").includes("공영홈쇼핑") &&
      row.project.includes("공영홈쇼핑 2026년 노후 가상화 시스템 교체")) {
    return {brand: "ABLESTACK", url: "https://ablecloud.io/resource/blog/45", label: "에이블클라우드 공식 발표"};
  }
  if ((row.customer ?? "").includes("부산대학교") &&
      row.project.includes("부산대학교 통합대학 교육정보시스템 고도화를 위한 통합 가상화시스템(HCI) 구축")) {
    return {brand: "ABLESTACK", url: "https://ablecloud.io/resource/blog/47", label: "에이블클라우드 공식 발표"};
  }
  return null;
}


type SortDirection = "asc" | "desc";
type CandidateSortKey = "award_date" | "project" | "winner_name" | "product_brand" | "classification" | "customer" | "amount";
type AwardSortKey = "award_date" | "competitor" | "winner_name" | "bid_no" | "project" | "customer" | "amount" | "rate";
type DeliverySortKey = "receipt_date" | "brand" | "product_name" | "supplier_name" | "customer_name" | "amount";
type DisplayMetric = "count" | "amount";

function sortedBy<T>(records: T[], valueOf: (row: T) => unknown, direction: SortDirection): T[] {
  return [...records].sort((left, right) => {
    const a = valueOf(left), b = valueOf(right);
    if (a == null || a === "") return b == null || b === "" ? 0 : 1;
    if (b == null || b === "") return -1;
    let result = 0;
    if (typeof a === "number" && typeof b === "number") result = a - b;
    else result = String(a).localeCompare(String(b), "ko-KR", { numeric: true, sensitivity: "base" });
    return direction === "asc" ? result : -result;
  });
}

function candidateMaker(row: CandidateRow) {
  return row.product_brand ?? (vendorCaseEvidence(row) ? "에이블클라우드" : "미확인");
}

const COMPANIES = ["전체", "오케스트로", "오케스트로클라우드", "이노그리드", "에이블클라우드"] as const;
const COMPANY_ORDER: CompanyName[] = ["오케스트로", "오케스트로클라우드", "이노그리드", "에이블클라우드"];
const RECENT_3Y = "2024~2026년";
const ALL_YEARS = "전체기간";

function formatAmount(value: number | null) {
  if (value == null) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatCompactAmount(value: number) {
  if (!value) return "0원";
  if (value >= 100_000_000) return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
  if (value >= 10_000) return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatRate(value: number | null) {
  if (value == null) return "-";
  return `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 4 })}%`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default function CompetitiveAnalysisPage() {
  const [rows, setRows] = useState<AwardRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(RECENT_3Y);
  const [scope, setScope] = useState<"virtualization" | "related" | "all">("virtualization");
  const [company, setCompany] = useState<(typeof COMPANIES)[number]>("전체");
  const [query, setQuery] = useState("");
  const [winnerCompany, setWinnerCompany] = useState("전체");
  const [agency, setAgency] = useState("전체");
  const [candidateType, setCandidateType] = useState("전체");
  const [rankingMetric, setRankingMetric] = useState<DisplayMetric>("amount");
  const [candidatePage, setCandidatePage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [candidateSort, setCandidateSort] = useState<{key: CandidateSortKey; direction: SortDirection}>({key:"award_date", direction:"desc"});
  const [awardSort, setAwardSort] = useState<{key: AwardSortKey; direction: SortDirection}>({key:"award_date", direction:"desc"});
  const [deliverySort, setDeliverySort] = useState<{key: DeliverySortKey; direction: SortDirection}>({key:"receipt_date", direction:"desc"});
  function changeCandidateSort(key: CandidateSortKey) {
    setCandidateSort(prev => ({key, direction:prev.key===key && prev.direction==="desc"?"asc":"desc"}));
  }
  function changeAwardSort(key: AwardSortKey) {
    setAwardSort(prev => ({key, direction:prev.key===key && prev.direction==="desc"?"asc":"desc"}));
  }
  function changeDeliverySort(key: DeliverySortKey) {
    setDeliverySort(prev => ({key, direction:prev.key===key && prev.direction==="desc"?"asc":"desc"}));
  }

  const currentYear = 2026;
  const recentStartYear = 2024;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/competitive-awards", { cache: "no-store" });
        const body = (await response.json()) as ApiResponse;
        if (!response.ok || !body.ok) throw new Error(body.ok ? "조회 실패" : body.error);
        if (!cancelled) {
          setRows(body.rows);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "나라장터 낙찰 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/virtualization-deliveries", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error ?? "납품정보 조회 실패");
        if (!cancelled) setDeliveries(data.rows);
      }).catch((reason) => { if (!cancelled) setDeliveryError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/virtualization-award-candidates", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error ?? "가상화 낙찰 데이터 조회 실패");
        if (!cancelled) setCandidates(data.rows ?? []);
      })
      .catch(error => {
        if (!cancelled) setCandidateError(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, []);


  const allWinningCompanies = useMemo(() => {
    const counts = new Map<string,{id:string;name:string;count:number}>();
    for(const row of candidates) {
      if (row.classification === "review") continue;
      const key = row.winner_business_no;
      const previous = counts.get(key);
      if(previous) previous.count++;
      else counts.set(key, {id:key,name:row.winner_name, count:1});
    }
    return [...counts.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,"ko-KR"));
  }, [candidates]);

  const allAgencies = useMemo(() => [...new Set(candidates
    .filter(row=>row.classification!=="review").map(row=>row.customer).filter((value):value is string=>!!value))]
    .sort((a,b)=>a.localeCompare(b,"ko-KR")), [candidates]);

  const visibleCandidates = useMemo(() => {
    const q=query.trim().toLowerCase();
    return candidates.filter(item=>{
      if(item.classification==="review") return false;
      const rowYear=item.award_date?.slice(0,4)??"";
      if(year===RECENT_3Y && (rowYear<"2024"||rowYear>"2026")) return false;
      if(year!==RECENT_3Y && year!==ALL_YEARS && rowYear!==year) return false;
      if(company!=="전체" && !(item.product_brand??"").includes(company) &&
        !(item.winner_name??"").includes(company) &&
        !(company==="에이블클라우드" && vendorCaseEvidence(item)?.brand==="ABLESTACK")) return false;
      if(winnerCompany!=="전체" && item.winner_business_no!==winnerCompany) return false;
      if(agency!=="전체" && item.customer!==agency) return false;
      if(candidateType!=="전체" && item.classification!==candidateType) return false;
      if(!q) return true;
      return [item.project,item.winner_name,item.customer,item.product_brand,item.bid_no,...item.matched_keywords,
        vendorCaseEvidence(item)?.brand].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [candidates,year,company,winnerCompany,agency,candidateType,query]);

  const visibleDeliveries = useMemo(() => deliveries.filter(item=>{
    const rowYear=item.receipt_date.slice(0,4);
    if(year===RECENT_3Y && (rowYear<"2024"||rowYear>"2026")) return false;
    if(year!==RECENT_3Y && year!==ALL_YEARS && year!==rowYear) return false;
    if(company!=="전체" && !(item.brand??"").includes(company) && !(item.supplier_name??"").includes(company)) return false;
    if(winnerCompany!=="전체") return false;
    if(agency!=="전체" && item.customer_name!==agency) return false;
    const q=query.trim().toLowerCase();
    return !q || [item.product_name,item.brand,item.supplier_name,item.customer_name,item.delivery_request_no]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  }),[deliveries,year,company,winnerCompany,agency,query]);

  const availableYears = useMemo(
    () => Array.from(new Set([...rows.map(row=>row.award_date?.slice(0,4)),
      ...candidates.map(row=>row.award_date?.slice(0,4))].filter(Boolean) as string[]))
      .filter(y=>y==="2024"||y==="2025"||y==="2026").sort((a,b)=>Number(b)-Number(a)),
    [rows,candidates],
  );

  const filtered = useMemo(() => {
    const q=query.trim().toLowerCase();
    return rows.filter(row=>{
      const rowYear=Number(row.award_date?.slice(0,4)??0);
      if(year===RECENT_3Y && (rowYear<recentStartYear||rowYear>currentYear)) return false;
      if(year!==RECENT_3Y && year!==ALL_YEARS && String(rowYear)!==year) return false;
      if(company!=="전체"&&row.competitor!==company) return false;
      if(winnerCompany!=="전체" && row.winner_business_no!==winnerCompany) return false;
      if(agency!=="전체" && row.customer!==agency) return false;
      if(scope==="virtualization"&&classifyVirtualization(row)!=="virtualization") return false;
      if(scope==="related"&&classifyVirtualization(row)==="other") return false;
      if(!q) return true;
      return [row.project,row.customer,row.competitor,row.winner_name,row.bid_no,row.matched_keyword]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  },[rows,year,company,winnerCompany,agency,query,scope,currentYear,recentStartYear]);

  const sortedCandidates = useMemo(() => sortedBy(visibleCandidates, row => {
    if(candidateSort.key==="product_brand") return candidateMaker(row);
    if(candidateSort.key==="classification") return candidateClassLabel[row.classification];
    return row[candidateSort.key];
  },candidateSort.direction),[visibleCandidates,candidateSort]);

  const totalCandidatePages = Math.max(1,Math.ceil(sortedCandidates.length/pageSize));
  const safeCandidatePage = Math.min(candidatePage,totalCandidatePages);
  const displayedCandidates = sortedCandidates.slice((safeCandidatePage-1)*pageSize,safeCandidatePage*pageSize);
  useEffect(() => {setCandidatePage(1);},[year,company,winnerCompany,agency,candidateType,query,candidateSort,pageSize]);

  const sortedAwards = useMemo(() => sortedBy(filtered, row=>row[awardSort.key],awardSort.direction),[filtered,awardSort]);
  const sortedDeliveries = useMemo(() => sortedBy(visibleDeliveries,row=>row[deliverySort.key],deliverySort.direction),[visibleDeliveries,deliverySort]);

  const summary = useMemo(()=>{
    const amountRows=filtered.filter(row=>row.amount!=null);
    return {
      count: filtered.length,
      amount:amountRows.reduce((sum,row)=>sum+Number(row.amount??0),0),
      amountKnown:amountRows.length,
      companies:new Set(filtered.map(row=>row.competitor)).size,
      customers:new Set(filtered.map(row=>row.customer).filter(Boolean)).size,
    };
  },[filtered]);

  const companySummary = useMemo(()=>COMPANY_ORDER.map(name=>{
    const data=filtered.filter(row=>row.competitor===name);
    return {name,count:data.length,amount:data.reduce((sum,row)=>sum+Number(row.amount??0),0),
      amountKnown:data.filter(row=>row.amount!=null).length};
  }),[filtered]);

  const candidateOverview = useMemo(()=>{
    const amounts=visibleCandidates.filter(row=>row.amount!=null);
    return {
      count:visibleCandidates.length,
      amount:amounts.reduce((sum,row)=>sum+Number(row.amount??0),0),
      amountKnown:amounts.length,
      winners:new Set(visibleCandidates.map(row=>row.winner_business_no)).size,
      customers:new Set(visibleCandidates.map(row=>row.customer).filter(Boolean)).size,
      explicitBrands:visibleCandidates.filter(row=>row.product_brand!=null).length,
    };
  },[visibleCandidates]);

  const winnerRanking = useMemo(()=>{
    const map=new Map<string,{id:string;name:string;count:number;amount:number}>();
    for(const row of visibleCandidates) {
      const id=row.winner_business_no;
      const old=map.get(id);
      if(old){old.count++;old.amount+=Number(row.amount??0);}
      else map.set(id,{id,name:row.winner_name,count:1,amount:Number(row.amount??0)});
    }
    return [...map.values()].sort((a,b)=>b[rankingMetric]-a[rankingMetric]||
      b.count-a.count||a.name.localeCompare(b.name,"ko-KR")).slice(0,10);
  },[visibleCandidates,rankingMetric]);

  const agencyRanking = useMemo(()=>{
    const map=new Map<string,{name:string;count:number;amount:number}>();
    for(const row of visibleCandidates) {
      const name=row.customer??"미확인";
      const old=map.get(name);
      if(old){old.count++;old.amount+=Number(row.amount??0);}
      else map.set(name,{name,count:1,amount:Number(row.amount??0)});
    }
    return [...map.values()].sort((a,b)=>b[rankingMetric]-a[rankingMetric]||b.count-a.count).slice(0,8);
  },[visibleCandidates,rankingMetric]);

  const byYear = useMemo(() => [2024,2025,2026].map(y=>{
    const data=visibleCandidates.filter(row=>row.award_date?.startsWith(String(y)));
    return {year:String(y),count:data.length,amount:data.reduce((sum,row)=>sum+Number(row.amount??0),0)};
  }),[visibleCandidates]);

  const byCategory = useMemo(() => ([
    "server_virtualization","hci","vdi","virtualization_other"
  ] as const).map(type=>{
    const data=visibleCandidates.filter(row=>row.classification===type);
    return {type,label:candidateClassLabel[type],count:data.length,
      amount:data.reduce((sum,row)=>sum+Number(row.amount??0),0)};
  }),[visibleCandidates]);

  function downloadCsv(downloadName: string, cells: unknown[][]) {
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const url = URL.createObjectURL(new Blob(["\uFEFF" + cells.map(r => r.map(escape).join(",")).join("\r\n")], {type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCandidatesCsv() {
    downloadCsv(`가상화_HCI_수주업체_2024-2026_${year}.csv`, [
      ["최종낙찰일", "사업명", "낙찰업체", "사업자번호", "명시된 제조사", "사업분류", "수요기관", "공고번호", "낙찰금액(프로젝트 전체)", "공고명 매칭키워드", "근거"],
      ...sortedCandidates.map(r => [r.award_date, r.project, r.winner_name, r.winner_business_no,
        r.product_brand ?? (vendorCaseEvidence(r) ? "ABLESTACK (공식 구축사례 교차확인)" : "미확인"), candidateClassLabel[r.classification], r.customer, r.bid_no, r.amount, r.matched_keywords.join(", "),
        vendorCaseEvidence(r)?.url ?? "조달청 낙찰정보서비스"]),
    ]);
  }
  function exportDeliveriesCsv() {
    downloadCsv(`가상화_쇼핑몰_납품요구_2024-2026_${year}.csv`, [
      ["납품요구접수일", "요구번호", "규격/제품명", "브랜드", "납품업체", "수요기관", "납품요구금액"],
      ...sortedDeliveries.map(r => [r.receipt_date,r.delivery_request_no,r.product_name,r.brand,r.supplier_name,r.customer_name,r.amount]),
    ]);
  }

  function exportCsv() {
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csvRows: unknown[][] = [
      ["낙찰일", "가상화 분류", "추적업체", "매칭기준", "최종낙찰업체", "사업자등록번호", "공고번호", "차수", "사업명", "수요기관", "최종낙찰금액", "낙찰률", "업무구분"],
      ...sortedAwards.map((row) => [
        row.award_date,
        classifyVirtualization(row),
        row.competitor,
        row.match_type === "product" ? row.matched_keyword ?? "제품명" : "업체 사업자번호",
        row.winner_name,
        row.winner_business_no,
        row.bid_no,
        row.bid_ord,
        row.project,
        row.customer,
        row.amount,
        row.rate,
        row.category,
      ]),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csvRows.map((r) => r.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `나라장터_경쟁분석_${year.replaceAll(" ", "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6">
        <header className="mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 csg2b-header-bg dark:ring-white/10">
          <div className="flex min-h-[115px] flex-col justify-center px-5 py-5 sm:px-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">PIPELINE MAKER</p>
            <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">과거 수주 이력·경쟁분석</h1>
          </div>
        </header>
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">낙찰연도</span>
              <select value={year} onChange={e=>setYear(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
                <option value={RECENT_3Y}>2024~2026 전체</option>
                {availableYears.map(value=><option key={value} value={value}>{value}년</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">경쟁사·제조사</span>
              <select value={company} onChange={e=>setCompany(e.target.value as typeof company)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
                {COMPANIES.map(value=><option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">실제 낙찰업체</span>
              <select value={winnerCompany} onChange={e=>setWinnerCompany(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
                <option value="전체">전체 낙찰업체</option>
                {allWinningCompanies.map(row=><option key={row.id} value={row.id}>{row.name} ({row.count}건)</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">수요기관</span>
              <select value={agency} onChange={e=>setAgency(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
                <option value="전체">전체 수요기관</option>
                {allAgencies.map(name=><option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">가상화 분야</span>
              <select value={candidateType} onChange={e=>setCandidateType(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
                <option value="전체">전체 분야</option>
                {Object.entries(candidateClassLabel).filter(([key])=>key!=="review").map(([key,name])=><option key={key} value={key}>{name}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500">통합 검색</span>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="사업명·업체·공고번호" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"/>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
            <span className="text-xs text-slate-500">분석기간 2024.01 ~ 2026.10</span>
            <button type="button" className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
              onClick={()=>{setYear(RECENT_3Y);setCompany("전체");setWinnerCompany("전체");setAgency("전체");setCandidateType("전체");setScope("virtualization");setQuery("");setRankingMetric("amount");setCandidateSort({key:"award_date",direction:"desc"});setAwardSort({key:"award_date",direction:"desc"});setDeliverySort({key:"receipt_date",direction:"desc"});}}>
              필터 초기화
            </button>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <SummaryCard label="가상화 관련 낙찰" value={candidateError?"-":candidateOverview.count.toLocaleString("ko-KR")+"건"} note="중복 제외·조건 반영"/>
          <SummaryCard label="사업 전체 낙찰금액" value={candidateError?"-":formatCompactAmount(candidateOverview.amount)} note={"금액 확인 "+candidateOverview.amountKnown+"건"}/>
          <SummaryCard label="실제 낙찰업체" value={candidateError?"-":candidateOverview.winners.toLocaleString("ko-KR")+"개사"} note="업체명 정규화 중복 제외"/>
          <SummaryCard label="수요기관" value={candidateError?"-":candidateOverview.customers.toLocaleString("ko-KR")+"곳"} note="중복 제외"/>
        </section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">낙찰 데이터 분석</h2>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <button type="button" onClick={()=>setRankingMetric("amount")} aria-pressed={rankingMetric==="amount"}
              className={"px-4 py-1.5 text-xs font-semibold "+(rankingMetric==="amount"?"bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900":"text-slate-600 dark:text-slate-300")}>금액</button>
            <button type="button" onClick={()=>setRankingMetric("count")} aria-pressed={rankingMetric==="count"}
              className={"px-4 py-1.5 text-xs font-semibold "+(rankingMetric==="count"?"bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900":"text-slate-600 dark:text-slate-300")}>건수</button>
          </div>
        </div>
        <section className="mb-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">낙찰업체 TOP 10</h3>
              <span className="text-[11px] text-slate-400">{rankingMetric==="amount"?"낙찰금액":"수주 건수"} 순</span>
            </div>
            <div className="space-y-3">
              {winnerRanking.map((item,index)=>{
                const peak=winnerRanking[0]?.[rankingMetric]??0;
                const amountOrCount=item[rankingMetric];
                const percent=peak>0?100*amountOrCount/peak:0;
                return <button key={item.id} type="button" onClick={()=>setWinnerCompany(item.id)}
                  className="block w-full rounded-md text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
                  title={item.name+"만 보기"}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200"><span className="mr-2 inline-block w-4 tabular-nums text-slate-400">{index+1}</span>{item.name}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-800 dark:text-white">{rankingMetric==="amount"?formatCompactAmount(item.amount):item.count+"건"}</span>
                  </div>
                  <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-blue-600" style={{width:percent+"%"}}/>
                  </div>
                </button>;
              })}
              {!winnerRanking.length&&<p className="py-6 text-center text-xs text-slate-400">조회된 데이터가 없습니다.</p>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">연도별 수주 추이</h3>
              <span className="text-[11px] text-slate-400">연도를 누르면 필터 적용</span>
            </div>
            <div className="space-y-6 py-2">
              {byYear.map(item=>{
                const peak=Math.max(...byYear.map(row=>row[rankingMetric]),0);
                const percent=peak>0?100*item[rankingMetric]/peak:0;
                return <button key={item.year} type="button" onClick={()=>setYear(item.year)}
                  className="block w-full rounded-md text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{item.year}년</span>
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {rankingMetric==="amount"?formatCompactAmount(item.amount):item.count+"건"}
                      <span className="ml-2 font-normal text-slate-400">{rankingMetric==="amount"?item.count+"건":formatCompactAmount(item.amount)}</span>
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded bg-blue-600" style={{width:percent+"%"}}/>
                  </div>
                </button>;
              })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">가상화 분야별 비교</h3>
            <div className="space-y-4">
              {byCategory.map(item=>{
                const peak=Math.max(...byCategory.map(row=>row[rankingMetric]),0);
                const percent=peak>0?100*item[rankingMetric]/peak:0;
                return <button key={item.type} type="button" onClick={()=>setCandidateType(item.type)}
                  className="block w-full rounded-md text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{rankingMetric==="amount"?formatCompactAmount(item.amount):item.count+"건"}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded bg-blue-600" style={{width:percent+"%"}}/>
                  </div>
                </button>;
              })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">수요기관 TOP 8</h3>
            <div className="space-y-2.5">
              {agencyRanking.map((item,index)=><button key={item.name} type="button" onClick={()=>setAgency(item.name)}
                className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5">
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200"><span className="mr-2 inline-block w-4 tabular-nums text-slate-400">{index+1}</span>{item.name}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{rankingMetric==="amount"?formatCompactAmount(item.amount):item.count+"건"}</span>
              </button>)}
              {!agencyRanking.length&&<p className="py-6 text-center text-xs text-slate-400">조회된 데이터가 없습니다.</p>}
            </div>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">가상화·HCI 낙찰내역</h2>
              <span className="text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-300">{visibleCandidates.length.toLocaleString("ko-KR")}건</span>
            </div>
            <button type="button" onClick={exportCandidatesCsv} disabled={!visibleCandidates.length}
              className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900">CSV 다운로드</button>
          </div>
          {candidateError&&<div className="px-4 py-2 text-xs text-red-600">{candidateError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] text-left text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50/80 font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/50">
                <SortableTh label="낙찰일" selected={candidateSort.key==="award_date"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("award_date")}/>
                <SortableTh label="사업명" selected={candidateSort.key==="project"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("project")} className="min-w-[300px]"/>
                <SortableTh label="낙찰업체" selected={candidateSort.key==="winner_name"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("winner_name")}/>
                <SortableTh label="제조사" selected={candidateSort.key==="product_brand"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("product_brand")}/>
                <SortableTh label="분야" selected={candidateSort.key==="classification"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("classification")}/>
                <SortableTh label="수요기관" selected={candidateSort.key==="customer"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("customer")}/>
                <SortableTh label="낙찰금액" selected={candidateSort.key==="amount"} direction={candidateSort.direction} onClick={()=>changeCandidateSort("amount")} align="right"/>
              </tr></thead>
              <tbody>
                {displayedCandidates.map(item=><tr key={item.external_key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-white/10 dark:hover:bg-slate-800/40">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{formatDate(item.award_date)}</td>
                  <td className="min-w-[300px] px-3 py-2.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.project}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{item.bid_no}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5"><button type="button" onClick={()=>setWinnerCompany(item.winner_business_no)} className="font-semibold text-slate-700 hover:text-blue-600 hover:underline dark:text-slate-200">{item.winner_name}</button></td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                    {item.product_brand?item.product_brand:vendorCaseEvidence(item)?<span>
                      <span>ABLESTACK</span>
                      <a href={vendorCaseEvidence(item)?.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-[10px] text-blue-600 underline" title="에이블클라우드 공식 구축사례">근거</a>
                    </span>:"미확인"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-300">{candidateClassLabel[item.classification]}</td>
                  <td className="max-w-[230px] px-3 py-2.5"><button type="button" onClick={()=>setAgency(item.customer??"전체")} className="text-left text-slate-600 hover:text-blue-600 hover:underline dark:text-slate-300">{item.customer??"-"}</button></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatAmount(item.amount)}</td>
                </tr>)}
                {!displayedCandidates.length&&<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">검색 결과가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/10">
            <span>낙찰금액: 사업 전체 계약금액 · 제조사 매출 아님</span>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="candidate-page-size">표시 행 수</label>
              <select id="candidate-page-size" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))} className="h-8 rounded border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-slate-900">
                <option value={30}>30개씩</option><option value={50}>50개씩</option><option value={100}>100개씩</option>
              </select>
              <span className="tabular-nums">{sortedCandidates.length?((safeCandidatePage-1)*pageSize+1):0}–{Math.min(safeCandidatePage*pageSize,sortedCandidates.length)} / {sortedCandidates.length}</span>
              <button type="button" aria-label="이전 페이지" disabled={safeCandidatePage<=1} onClick={()=>setCandidatePage(p=>Math.max(1,p-1))} className="rounded border border-slate-200 px-2 py-1.5 disabled:opacity-30 dark:border-white/10">이전</button>
              <span className="tabular-nums">{safeCandidatePage}/{totalCandidatePages}</span>
              <button type="button" aria-label="다음 페이지" disabled={safeCandidatePage>=totalCandidatePages} onClick={()=>setCandidatePage(p=>Math.min(totalCandidatePages,p+1))} className="rounded border border-slate-200 px-2 py-1.5 disabled:opacity-30 dark:border-white/10">다음</button>
            </div>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">추적업체 직접 낙찰 이력 <span className="ml-1 text-xs text-blue-600">{summary.count}건</span></h2>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="direct-award-scope">직접 낙찰 범위</label>
              <select id="direct-award-scope" value={scope} onChange={e=>setScope(e.target.value as typeof scope)} className="h-8 rounded border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-slate-900">
                <option value="virtualization">가상화 직접 관련</option><option value="related">인프라 관련 포함</option><option value="all">회사 전체 낙찰</option>
              </select>
              <button type="button" onClick={exportCsv} disabled={!filtered.length} className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900">CSV 다운로드</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3 lg:grid-cols-4 dark:border-white/10">
            {companySummary.map(item=><div key={item.name} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/10">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.name}</p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-2"><p className="text-lg font-bold text-blue-600 dark:text-blue-300">{item.count}건</p><p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatCompactAmount(item.amount)}</p></div>
            </div>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 dark:border-white/10 dark:bg-slate-800/50">
                <SortableTh label="낙찰일" selected={awardSort.key==="award_date"} direction={awardSort.direction} onClick={()=>changeAwardSort("award_date")}/>
                <SortableTh label="추적업체" selected={awardSort.key==="competitor"} direction={awardSort.direction} onClick={()=>changeAwardSort("competitor")}/>
                <SortableTh label="낙찰업체" selected={awardSort.key==="winner_name"} direction={awardSort.direction} onClick={()=>changeAwardSort("winner_name")}/>
                <SortableTh label="공고번호" selected={awardSort.key==="bid_no"} direction={awardSort.direction} onClick={()=>changeAwardSort("bid_no")}/>
                <SortableTh label="사업명" selected={awardSort.key==="project"} direction={awardSort.direction} onClick={()=>changeAwardSort("project")} className="min-w-[300px]"/>
                <SortableTh label="수요기관" selected={awardSort.key==="customer"} direction={awardSort.direction} onClick={()=>changeAwardSort("customer")}/>
                <SortableTh label="낙찰금액" selected={awardSort.key==="amount"} direction={awardSort.direction} onClick={()=>changeAwardSort("amount")} align="right"/>
                <SortableTh label="낙찰률" selected={awardSort.key==="rate"} direction={awardSort.direction} onClick={()=>changeAwardSort("rate")} align="right"/>
              </tr></thead>
              <tbody>{sortedAwards.map(item=><tr key={item.external_key} className="border-b border-slate-100 last:border-0 dark:border-white/10">
                <td className="whitespace-nowrap px-3 py-2">{formatDate(item.award_date)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{item.competitor}</td>
                <td className="whitespace-nowrap px-3 py-2">{item.winner_name}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{item.bid_no}</td>
                <td className="min-w-[300px] px-3 py-2">{item.project}</td>
                <td className="px-3 py-2">{item.customer??"-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatAmount(item.amount)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatRate(item.rate)}</td>
              </tr>)}
              {!loading&&!sortedAwards.length&&<tr><td colSpan={8} className="px-3 py-7 text-center text-slate-500">조회 결과 없음</td></tr>}
              {loading&&<tr><td colSpan={8} className="px-3 py-7 text-center text-slate-500">데이터 로딩 중</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">쇼핑몰 납품요구 <span className="ml-1 text-xs text-blue-600">{visibleDeliveries.length}건</span></h2>
            <button type="button" onClick={exportDeliveriesCsv} disabled={!sortedDeliveries.length} className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900">CSV 다운로드</button>
          </div>
          {deliveryError&&<p className="px-4 py-2 text-xs text-amber-700">{deliveryError}</p>}
          {sortedDeliveries.length>0?<div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 dark:border-white/10 dark:bg-slate-800/50">
                <SortableTh label="요구일" selected={deliverySort.key==="receipt_date"} direction={deliverySort.direction} onClick={()=>changeDeliverySort("receipt_date")}/>
                <SortableTh label="브랜드" selected={deliverySort.key==="brand"} direction={deliverySort.direction} onClick={()=>changeDeliverySort("brand")}/>
                <SortableTh label="제품" selected={deliverySort.key==="product_name"} direction={deliverySort.direction} onClick={()=>changeDeliverySort("product_name")} className="min-w-[290px]"/>
                <SortableTh label="납품업체" selected={deliverySort.key==="supplier_name"} direction={deliverySort.direction} onClick={()=>changeDeliverySort("supplier_name")}/>
                <SortableTh label="수요기관" selected={deliverySort.key==="customer_name"} direction={deliverySort.direction} onClick={()=>changeDeliverySort("customer_name")}/>
                <SortableTh label="납품요구금액" selected={deliverySort.key==="amount"} direction={deliverySort.direction} onClick={()=>changeDeliverySort("amount")} align="right"/>
              </tr></thead>
              <tbody>{sortedDeliveries.map(item=><tr key={item.external_key} className="border-b border-slate-100 last:border-0 dark:border-white/10">
                <td className="whitespace-nowrap px-3 py-2">{formatDate(item.receipt_date)}</td><td className="whitespace-nowrap px-3 py-2">{item.brand??"-"}</td>
                <td className="min-w-[290px] px-3 py-2">{item.product_name}</td><td className="px-3 py-2">{item.supplier_name??"-"}</td>
                <td className="px-3 py-2">{item.customer_name??"-"}</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatAmount(item.amount)}</td>
              </tr>)}</tbody>
            </table>
          </div>:<div className="px-4 py-5 text-center text-xs text-slate-400">납품요구 데이터 없음</div>}
        </section>
      </div>
    </div>
  );
}



function SortableTh({label,selected,direction,onClick,align="left",className=""}:{
  label:string;selected:boolean;direction:SortDirection;onClick:()=>void;align?:"left"|"right";className?:string;
}){
  return <th scope="col" aria-sort={selected?(direction==="asc"?"ascending":"descending"):"none"}
    className={"whitespace-nowrap px-3 py-2.5 "+className+(align==="right"?" text-right":"")}>
    <button type="button" onClick={onClick} className={"inline-flex w-full items-center gap-1 font-semibold hover:text-blue-600 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 "+(align==="right"?"justify-end":"justify-start")}>
      {label}<span aria-hidden="true" className={selected?"text-blue-600 dark:text-blue-300":"text-slate-300"}>{selected?(direction==="asc"?"▲":"▼"):"↕"}</span>
    </button>
  </th>;
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5">
      <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold tracking-tight text-blue-600 dark:text-blue-300 sm:text-2xl">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">{note}</p>
    </div>
  );
}

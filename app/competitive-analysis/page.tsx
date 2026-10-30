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

function cleanCompany(value: string) {
  return value.replace(/^(주식회사|\(주\)|㈜)\s*/g, "").replace(/\s/g, "").toLowerCase();
}

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
    const counts = new Map<string,{name:string;count:number}>();
    for(const row of candidates) {
      if (row.classification === "review") continue;
      const key = cleanCompany(row.winner_name);
      const previous = counts.get(key);
      if(previous) previous.count++;
      else counts.set(key, {name:row.winner_name, count:1});
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
      if(winnerCompany!=="전체" && cleanCompany(item.winner_name)!==cleanCompany(winnerCompany)) return false;
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
    if(winnerCompany!=="전체" && cleanCompany(item.supplier_name??"")!==cleanCompany(winnerCompany)) return false;
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
      if(winnerCompany!=="전체" && cleanCompany(row.winner_name)!==cleanCompany(winnerCompany)) return false;
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
      winners:new Set(visibleCandidates.map(row=>cleanCompany(row.winner_name))).size,
      customers:new Set(visibleCandidates.map(row=>row.customer).filter(Boolean)).size,
      explicitBrands:visibleCandidates.filter(row=>row.product_brand!=null).length,
    };
  },[visibleCandidates]);

  const winnerRanking = useMemo(()=>{
    const map=new Map<string,{id:string;name:string;count:number;amount:number}>();
    for(const row of visibleCandidates) {
      const id=cleanCompany(row.winner_name);
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
      ...visibleCandidates.map(r => [r.award_date, r.project, r.winner_name, r.winner_business_no,
        r.product_brand ?? (vendorCaseEvidence(r) ? "ABLESTACK (공식 구축사례 교차확인)" : "미확인"), candidateClassLabel[r.classification], r.customer, r.bid_no, r.amount, r.matched_keywords.join(", "),
        vendorCaseEvidence(r)?.url ?? "조달청 낙찰정보서비스"]),
    ]);
  }
  function exportDeliveriesCsv() {
    downloadCsv(`가상화_쇼핑몰_납품요구_2024-2026_${year}.csv`, [
      ["납품요구접수일", "요구번호", "규격/제품명", "브랜드", "납품업체", "수요기관", "납품요구금액"],
      ...visibleDeliveries.map(r => [r.receipt_date,r.delivery_request_no,r.product_name,r.brand,r.supplier_name,r.customer_name,r.amount]),
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
      ...filtered.map((row) => [
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
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-7">
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div className="relative flex min-h-[160px] flex-col justify-center px-5 py-7 pr-28 sm:min-h-[190px] sm:px-7 sm:py-9 sm:pr-32">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">파이프라인 메이커 · 나라장터</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">과거 수주 이력·경쟁분석</h1>
            <p className="mt-1 max-w-4xl text-xs text-slate-200/85 sm:text-sm">조달청 나라장터 낙찰정보 API에서 확인되는 낙찰업체·금액·수요기관을 기준으로 비교합니다.</p>
          </div>
        </header>

        <section className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-xs leading-5 text-cyan-900 dark:text-cyan-100 sm:text-sm">
          <strong>데이터 기준:</strong> 2024~2026년의 가상화 관련 낙찰과 나라장터 종합쇼핑몰 납품요구를 구분합니다. 사업자번호 조회는 실제 낙찰사를 뜻하며, 공고명만으로 특정 솔루션 공급 여부가 확인되지 않는 사업은 분리합니다. 단순 카탈로그 등록 {excludedCount.toLocaleString("ko-KR")}건은 낙찰실적에서 제외합니다. 납품요구는 수주 계약과 중복 합산하지 않습니다.
        </section>

        {error && <section className="mb-4 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</section>}

        <section className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="추적업체 직접 낙찰 건수" value={loading ? "-" : `${summary.count}건`} note={year === RECENT_3Y ? `${recentStartYear}~${currentYear}년` : year} />
          <SummaryCard label="추적업체 직접 낙찰금액" value={loading ? "-" : formatCompactAmount(summary.amount)} note={`금액 확인 ${summary.amountKnown}건`} />
          <SummaryCard label="확인 업체" value={loading ? "-" : `${summary.companies}개사`} note="현재 조회조건 기준" />
          <SummaryCard label="수요기관" value={loading ? "-" : `${summary.customers}곳`} note="추적업체 직접 낙찰 기준" />
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">조회년도</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-slate-900">
                <option value={RECENT_3Y}>{RECENT_3Y} ({recentStartYear}~{currentYear})</option>
                {availableYears.map((value) => <option key={value} value={value}>{value}년</option>)}
                
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">업체</span>
              <select value={company} onChange={(e) => setCompany(e.target.value as (typeof COMPANIES)[number])} className="h-9 min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-slate-900">
                {COMPANIES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 md:max-w-xl">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">검색</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="사업명·수요기관·공고번호·낙찰업체 검색" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900" />
            </label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">사업 구분</span><select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-slate-900"><option value="virtualization">가상화 직접 관련</option><option value="related">가상화 + 인프라 관련</option><option value="all">전체 회사 수주</option></select></label>
            <button type="button" onClick={() => { setYear(RECENT_3Y); setCompany("전체"); setScope("virtualization"); setQuery(""); }} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">초기화</button>
            <button type="button" onClick={exportCsv} disabled={!filtered.length} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40">CSV 다운로드</button>
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {companySummary.map((item) => (
            <div key={item.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">{item.count}건</p>
                <p className="text-right text-sm font-semibold text-slate-700 dark:text-slate-200">{formatCompactAmount(item.amount)}</p>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">직접 낙찰 기준 · 금액 확인 {item.amountKnown}건</p>
              {item.name === "에이블클라우드" && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">제조사 납품실적은 별도 검증 · 직접 낙찰 0건 ≠ 실제 공급 0건</p>}
            </div>
          ))}
        </section>

        <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">가상화·HCI 관련 나라장터 낙찰 · {visibleCandidates.length.toLocaleString("ko-KR")}건</h2>
              <button type="button" onClick={exportCandidatesCsv} disabled={!visibleCandidates.length} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">가상화 낙찰 CSV</button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              낙찰업체(실제 계약상대자)와 제품 제조사를 구분합니다. 제조사가 공고명에 없는 건은 미확인으로 표시하되, 공식 구축사례와 동일 사업으로 대조되는 건은 출처를 별도 표시합니다.
              동일 사업은 위 업체 직접 수주이력과 중복될 수 있어 금액을 합산하지 않습니다.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
              낙찰업체 {new Set(visibleCandidates.map(item => item.winner_business_no)).size.toLocaleString("ko-KR")}개사
              <span className="mx-2 text-slate-300">|</span>
              제조사 명시 {visibleCandidates.filter(item => item.product_brand != null).length.toLocaleString("ko-KR")}건
              <span className="mx-2 text-slate-300">|</span>
              전체 사업 낙찰금액 {formatCompactAmount(visibleCandidates.reduce((sum, item) => sum + Number(item.amount ?? 0), 0))}
            </p>
          </div>
          {candidateError && <p className="px-4 py-3 text-xs text-amber-700 dark:text-amber-300">{candidateError}</p>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
                <th className="whitespace-nowrap px-4 py-3">낙찰일</th>
                <th className="min-w-[340px] px-4 py-3">사업명</th>
                <th className="whitespace-nowrap px-4 py-3">실제 낙찰업체</th>
                <th className="whitespace-nowrap px-4 py-3">명시된 제조사</th>
                <th className="whitespace-nowrap px-4 py-3">유형</th>
                <th className="whitespace-nowrap px-4 py-3">수요기관</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">낙찰금액</th>
              </tr></thead>
              <tbody>
                {visibleCandidates.map(item => (
                  <tr key={item.external_key} className="border-t border-slate-100 dark:border-white/10">
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{formatDate(item.award_date)}</td>
                    <td className="px-4 py-3.5"><p className="font-medium text-slate-800 dark:text-slate-100">{item.project}</p><p className="mt-0.5 text-[10px] text-slate-400">{item.bid_no} · {item.matched_keywords.join(", ")}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-200">{item.winner_name}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                      {item.product_brand ? item.product_brand : vendorCaseEvidence(item) ? (
                        <div>
                          <p>ABLESTACK <span className="font-normal text-[10px] text-slate-500">(제조사 발표)</span></p>
                          <a href={vendorCaseEvidence(item)?.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-normal text-blue-600 underline dark:text-blue-300">공식 구축사례 확인</a>
                          <p className="font-normal text-[10px] text-slate-500">나라장터 공고명에는 제조사 미기재</p>
                        </div>
                      ) : "미확인"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{candidateClassLabel[item.classification]}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.customer ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatAmount(item.amount)}</td>
                  </tr>
                ))}
                {!visibleCandidates.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">확인된 가상화 관련 낙찰 데이터가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">종합쇼핑몰 가상화 제품 납품요구 · {visibleDeliveries.length.toLocaleString("ko-KR")}건</h2>
              <button type="button" onClick={exportDeliveriesCsv} disabled={!visibleDeliveries.length} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">납품요구 CSV</button>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">상품 등록이나 계약 한도 금액이 아닌 수요기관별 납품요구 상세 금액입니다. 낙찰정보와 중복 합산하지 않습니다.</p>
          </div>
          {deliveryError && <p className="px-4 py-3 text-xs text-amber-700 dark:text-amber-300">쇼핑몰 데이터 준비 상태: {deliveryError}</p>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/40">
              <th className="px-4 py-3">납품요구일</th><th className="px-4 py-3">브랜드</th><th className="px-4 py-3">제품</th>
              <th className="px-4 py-3">납품업체</th><th className="px-4 py-3">수요기관</th><th className="px-4 py-3 text-right">요구금액</th>
            </tr></thead><tbody>
              {visibleDeliveries.map((item) => <tr key={item.external_key} className="border-t text-slate-700 dark:border-white/10 dark:text-slate-200">
                <td className="whitespace-nowrap px-4 py-3">{formatDate(item.receipt_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">{item.brand ?? "제품명만 확인"}</td>
                <td className="min-w-[260px] px-4 py-3">{item.product_name}</td>
                <td className="px-4 py-3">{item.supplier_name ?? "-"}</td>
                <td className="px-4 py-3">{item.customer_name ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatAmount(item.amount)}</td>
              </tr>)}
              {!visibleDeliveries.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">검증된 납품요구 데이터가 없습니다. 관리자 페이지에서 기간별 수집 후 확인하세요.</td></tr>}
            </tbody></table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">나라장터 낙찰 이력</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">금액·낙찰업체·공고번호·수요기관은 조달청 낙찰정보 API 원문 기준입니다.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">낙찰일</th>
                  <th className="whitespace-nowrap px-4 py-3">경쟁사 / 제품</th>
                  <th className="whitespace-nowrap px-4 py-3">최종낙찰업체</th>
                  <th className="whitespace-nowrap px-4 py-3">공고번호</th>
                  <th className="min-w-[380px] px-4 py-3">사업명</th>
                  <th className="whitespace-nowrap px-4 py-3">수요기관</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">낙찰금액</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">낙찰률</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.external_key} className="border-b border-slate-100 last:border-b-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{formatDate(item.award_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{item.competitor}</p>
                      {item.match_type === "product" && <p className="mt-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-300">{item.matched_keyword}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{item.winner_name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{item.winner_business_no || "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{item.bid_no}{item.bid_ord ? `-${item.bid_ord}` : ""}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.project}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.customer ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatAmount(item.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatRate(item.rate)}</td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">현재 조건에서 나라장터 낙찰 결과가 없습니다.</td></tr>}
                {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">나라장터 낙찰 데이터를 불러오는 중…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
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

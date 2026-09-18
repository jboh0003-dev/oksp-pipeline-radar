"use client";

import { useEffect, useMemo, useState } from "react";

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
  collected_at: string;
  updated_at: string;
};

type ProductProjectRow = {
  id: string;
  external_key: string;
  company: CompanyName;
  product: string;
  project_year: number;
  project_date: string | null;
  project: string;
  customer: string;
  sector: string;
  verification_level: "vendor_official" | "public_crosscheck" | "g2b_verified";
  source_label: string;
  source_url: string;
  public_source_label: string | null;
  public_source_url: string | null;
  bid_no: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type ApiResponse =
  | {
      ok: true;
      rows: AwardRow[];
      rawCount?: number;
      excludedCatalogRegistrationCount?: number;
      productProjects?: ProductProjectRow[];
    }
  | { ok: false; error: string };

const COMPANIES = ["전체", "오케스트로", "오케스트로클라우드", "이노그리드", "에이블클라우드"] as const;
const COMPANY_ORDER: CompanyName[] = ["오케스트로", "오케스트로클라우드", "이노그리드", "에이블클라우드"];
const RECENT_3Y = "최근 3년";
const ALL_YEARS = "전체기간";

function companyKind(name: CompanyName) {
  return name === "오케스트로" || name === "오케스트로클라우드" ? "자사" : "경쟁사";
}

function formatAmount(value: number | null) {
  if (value == null) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
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

function verificationLabel(level: ProductProjectRow["verification_level"]) {
  if (level === "g2b_verified") return "나라장터 근거";
  if (level === "public_crosscheck") return "공공사업 교차확인";
  return "업체 공식 구축이력";
}

export default function CompetitiveAnalysisPage() {
  const [rows, setRows] = useState<AwardRow[]>([]);
  const [productProjects, setProductProjects] = useState<ProductProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(RECENT_3Y);
  const [company, setCompany] = useState<(typeof COMPANIES)[number]>("전체");
  const [query, setQuery] = useState("");
  const [excludedCount, setExcludedCount] = useState(0);

  const currentYear = new Date().getFullYear();
  const recentStartYear = currentYear - 2;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/competitive-awards", { cache: "no-store" });
        const body = (await response.json()) as ApiResponse;
        if (!response.ok || !body.ok) throw new Error(body.ok ? "조회 실패" : body.error);
        if (!cancelled) {
          setRows(body.rows.filter((row) => row.source_type === "g2b_award"));
          setProductProjects(body.productProjects ?? []);
          setExcludedCount(body.excludedCatalogRegistrationCount ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "경쟁분석 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableYears = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      const y = row.award_date?.slice(0, 4);
      if (y) values.add(y);
    }
    for (const row of productProjects) values.add(String(row.project_year));
    return Array.from(values).sort((a, b) => Number(b) - Number(a));
  }, [rows, productProjects]);

  const filteredAwards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const rowYear = Number(row.award_date?.slice(0, 4) ?? 0);
      if (year === RECENT_3Y && (rowYear < recentStartYear || rowYear > currentYear)) return false;
      if (year !== RECENT_3Y && year !== ALL_YEARS && String(rowYear) !== year) return false;
      if (company !== "전체" && row.competitor !== company) return false;
      if (!q) return true;
      return [row.project, row.customer, row.competitor, row.winner_name, row.bid_no, row.winner_business_no]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, year, company, query, currentYear, recentStartYear]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productProjects.filter((row) => {
      if (year === RECENT_3Y && (row.project_year < recentStartYear || row.project_year > currentYear)) return false;
      if (year !== RECENT_3Y && year !== ALL_YEARS && String(row.project_year) !== year) return false;
      if (company !== "전체" && row.company !== company) return false;
      if (!q) return true;
      return [row.project, row.customer, row.company, row.product, row.bid_no, row.source_label, row.public_source_label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [productProjects, year, company, query, currentYear, recentStartYear]);

  const summary = useMemo(() => {
    const customers = new Set<string>();
    filteredAwards.forEach((row) => {
      if (row.customer) customers.add(row.customer);
    });
    filteredProjects.forEach((row) => {
      if (row.customer) customers.add(row.customer);
    });
    return {
      directAwards: filteredAwards.length,
      productProjects: filteredProjects.length,
      companies: new Set([
        ...filteredAwards.map((row) => row.competitor),
        ...filteredProjects.map((row) => row.company),
      ]).size,
      customers: customers.size,
    };
  }, [filteredAwards, filteredProjects]);

  const history = useMemo(() => {
    const map = new Map<string, AwardRow[]>();
    for (const row of filteredAwards) {
      const y = row.award_date?.slice(0, 4) ?? "일자 미상";
      map.set(y, [...(map.get(y) ?? []), row]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([label, values]) => ({ label, rows: values }));
  }, [filteredAwards]);

  const productHistory = useMemo(() => {
    const map = new Map<number, ProductProjectRow[]>();
    for (const row of filteredProjects) {
      map.set(row.project_year, [...(map.get(row.project_year) ?? []), row]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b - a)
      .map(([label, values]) => ({ label, rows: values }));
  }, [filteredProjects]);

  const companySummary = useMemo(
    () =>
      COMPANY_ORDER.map((name) => {
        const awardRows = filteredAwards.filter((row) => row.competitor === name);
        const projectRows = filteredProjects.filter((row) => row.company === name);
        const productDataAvailable = productProjects.some((row) => row.company === name);
        return {
          name,
          kind: companyKind(name),
          directCount: awardRows.length,
          productCount: projectRows.length,
          productDataAvailable,
          customers: new Set([
            ...awardRows.map((row) => row.customer).filter(Boolean),
            ...projectRows.map((row) => row.customer).filter(Boolean),
          ]).size,
        };
      }),
    [filteredAwards, filteredProjects, productProjects],
  );

  function exportCsv() {
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csvRows: unknown[][] = [
      ["낙찰일", "구분", "업체", "최종낙찰업체", "사업자등록번호", "공고번호", "차수", "사업명", "수요기관", "최종낙찰금액", "낙찰률", "업무구분", "근거", "출처"],
      ...filteredAwards.map((row) => [
        row.award_date,
        companyKind(row.competitor),
        row.competitor,
        row.winner_name,
        row.winner_business_no,
        row.bid_no,
        row.bid_ord,
        row.project,
        row.customer,
        row.amount,
        row.rate,
        row.category,
        row.evidence,
        row.source_url,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csvRows.map((r) => r.map(escape).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `나라장터_업체별_직접낙찰_${year.replaceAll(" ", "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-7">
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div className="relative flex min-h-[160px] flex-col justify-center px-5 py-7 pr-28 sm:min-h-[190px] sm:px-7 sm:py-9 sm:pr-32">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">파이프라인 메이커 · 나라장터</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">과거 수주 이력·경쟁분석</h1>
            <p className="mt-1 max-w-4xl text-xs text-slate-200/85 sm:text-sm">나라장터 직접낙찰과 제조사 제품 적용·구축 실적을 분리해 확인합니다.</p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="나라장터 직접 낙찰" value={loading ? "-" : `${summary.directAwards}건`} note={year === RECENT_3Y ? `${recentStartYear}~${currentYear}년` : `${year} 기준`} />
          <SummaryCard label="제품 적용·구축 확인" value={loading ? "-" : `${summary.productProjects}건`} note="직접낙찰과 별도 집계" />
          <SummaryCard label="확인 업체" value={loading ? "-" : `${summary.companies}개사`} note="현재 조회조건 기준" />
          <SummaryCard label="확인 고객·기관" value={loading ? "-" : `${summary.customers}곳`} note="중복 고객 제외" />
        </section>

        <section className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-xs leading-5 text-cyan-900 shadow-sm dark:text-cyan-100 sm:text-sm">
          <strong>집계 기준:</strong> <strong>직접 낙찰</strong>은 나라장터 최종낙찰업체 사업자번호가 해당 회사와 직접 일치한 건만 집계합니다. <strong>제품 적용·구축</strong>은 제조사가 공개한 구축이력 중 공공 고객·사업을 별도 관리하며, 파트너·컨소시엄이 최종낙찰사인 사업도 포함될 수 있어 직접 낙찰 건수와 합산하지 않습니다. 제3자단가·디지털서비스의 단순 등록 {excludedCount.toLocaleString("ko-KR")}건은 직접 낙찰 집계에서 제외했습니다.
        </section>

        {error && <section className="mb-4 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</section>}

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">조회년도</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                <option value={RECENT_3Y}>{RECENT_3Y} ({recentStartYear}~{currentYear})</option>
                {availableYears.map((value) => <option key={value} value={value}>{value}년</option>)}
                <option value={ALL_YEARS}>{ALL_YEARS}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">업체</span>
              <select value={company} onChange={(e) => setCompany(e.target.value as (typeof COMPANIES)[number])} className="h-9 min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                {COMPANIES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 md:max-w-xl">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">검색</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="사업명·수요기관·공고번호·제품명 검색" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <button type="button" onClick={() => { setYear(RECENT_3Y); setCompany("전체"); setQuery(""); }} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">초기화</button>
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {companySummary.map((item) => (
            <div key={item.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.kind}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-400">직접 낙찰</p>
                  <p className="mt-0.5 text-xl font-bold text-blue-600 dark:text-blue-300">{item.directCount}건</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">제품 적용·구축</p>
                  <p className="mt-0.5 text-xl font-bold text-cyan-600 dark:text-cyan-300">
                    {item.productDataAvailable ? `${item.productCount}건` : "-"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">확인 고객·기관 {item.customers}곳{!item.productDataAvailable ? " · 제품실적 데이터 미구축" : ""}</p>
            </div>
          ))}
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">나라장터 직접 낙찰 이력</h2>
              <p className="mt-1 text-xs text-slate-500">최종낙찰업체 사업자번호가 해당 회사와 직접 일치한 건만 표시합니다.</p>
            </div>
            <button onClick={exportCsv} disabled={!filteredAwards.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">직접 낙찰 CSV 다운로드</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {history.map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="font-bold">{item.label}{item.label !== "일자 미상" ? "년" : ""} · {item.rows.length}건</p>
                <p className="mt-1 text-xs text-slate-500">{new Set(item.rows.map((row) => row.customer).filter(Boolean)).size}개 수요기관</p>
                <p className="mt-2 text-xs">{Array.from(new Set(item.rows.map((row) => row.competitor))).join(" · ")}</p>
              </div>
            ))}
          </div>
          {!loading && !history.length && <p className="mt-3 text-sm text-slate-500">현재 조건에서 확인된 직접 낙찰이 없습니다.</p>}
        </section>

        <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">제품 적용·구축 실적</h2>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">제조사 공식 구축이력을 기준으로 공공 고객·사업을 정리한 보완 지표입니다. 직접 낙찰사와 제조사가 다른 사업을 놓치지 않기 위한 데이터이며 직접 낙찰 건수에는 합산하지 않습니다.</p>
          </div>
          <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {productHistory.map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="font-bold">{item.label}년 · {item.rows.length}건</p>
                <p className="mt-1 text-xs text-slate-500">{new Set(item.rows.map((row) => row.customer)).size}개 고객·기관</p>
              </div>
            ))}
            {!loading && !productHistory.length && <p className="text-sm text-slate-500">현재 조건에서 확인된 제품 적용·구축 데이터가 없습니다.</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">연도</th>
                  <th className="whitespace-nowrap px-4 py-3">업체 / 제품</th>
                  <th className="whitespace-nowrap px-4 py-3">고객·기관</th>
                  <th className="min-w-[380px] px-4 py-3">사업·구축내용</th>
                  <th className="whitespace-nowrap px-4 py-3">검증상태</th>
                  <th className="whitespace-nowrap px-4 py-3">근거</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((item) => (
                  <tr key={item.external_key} className="border-b border-slate-100 last:border-b-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200">{item.project_year}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{item.company}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{item.product}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.customer}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">
                      {item.project}
                      {item.bid_no ? <p className="mt-1 font-mono text-[10px] font-normal text-slate-400">공고 {item.bid_no}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        item.verification_level === "public_crosscheck" || item.verification_level === "g2b_verified"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      }`}>
                        {verificationLabel(item.verification_level)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <a href={item.source_url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline dark:text-blue-300">{item.source_label}</a>
                        {item.public_source_url ? <a href={item.public_source_url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-300">{item.public_source_label ?? "공공사업 근거"}</a> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredProjects.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">조건에 맞는 제품 적용·구축 실적이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">확인된 직접 최종낙찰 실적</h2>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">나라장터 최종낙찰업체 사업자번호 일치 + 특정 수요기관이 확인된 건만 표시합니다.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">낙찰일</th>
                  <th className="whitespace-nowrap px-4 py-3">업체 / 최종낙찰업체</th>
                  <th className="whitespace-nowrap px-4 py-3">공고번호</th>
                  <th className="min-w-[360px] px-4 py-3">사업명</th>
                  <th className="whitespace-nowrap px-4 py-3">수요기관</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">최종낙찰금액</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">낙찰률</th>
                  <th className="whitespace-nowrap px-4 py-3">근거</th>
                </tr>
              </thead>
              <tbody>
                {filteredAwards.map((item) => (
                  <tr key={item.external_key} className="border-b border-slate-100 last:border-b-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{formatDate(item.award_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{item.competitor}</p>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{companyKind(item.competitor)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">{item.winner_name}{item.winner_business_no ? ` · ${item.winner_business_no}` : ""}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{item.bid_no}{item.bid_ord ? `-${item.bid_ord}` : ""}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.project}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.customer ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatAmount(item.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatRate(item.rate)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5"><a href={item.source_url || "https://www.g2b.go.kr/"} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline dark:text-blue-300">{item.source_label || "나라장터 낙찰정보"}</a></td>
                  </tr>
                ))}
                {!loading && filteredAwards.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">조건에 맞는 직접 최종낙찰 실적이 없습니다.</td></tr>}
                {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">경쟁분석 데이터를 불러오는 중입니다…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs leading-6 text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300">
          <p className="font-semibold text-slate-800 dark:text-slate-100">해석 원칙</p>
          <p>① 직접 낙찰은 나라장터 최종낙찰업체 사업자번호 일치 기준입니다.</p>
          <p>② 제품 적용·구축은 제조사 제품이 실제 사업에 공급·구축된 정황을 별도 관리하는 지표이며, 파트너·컨소시엄 사업을 포함할 수 있습니다.</p>
          <p>③ 따라서 두 지표를 합산해 ‘총 수주’로 표현하지 않습니다. 경쟁사의 시장 적용 실적을 볼 때는 두 지표를 함께 봅니다.</p>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5">
      <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">{label}</p>
      <p className="mt-0.5 text-xl font-bold tracking-tight text-blue-600 dark:text-blue-300 sm:text-2xl">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500 sm:text-[11px]">{note}</p>
    </div>
  );
}

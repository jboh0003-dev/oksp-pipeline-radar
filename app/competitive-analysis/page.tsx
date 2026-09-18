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
  match_type: "company" | "product";
  matched_keyword: string | null;
  collected_at: string;
  updated_at: string;
};

type ApiResponse =
  | { ok: true; rows: AwardRow[]; rawCount?: number; excludedCatalogRegistrationCount?: number }
  | { ok: false; error: string };

const COMPANIES = ["전체", "오케스트로", "오케스트로클라우드", "이노그리드", "에이블클라우드"] as const;
const COMPANY_ORDER: CompanyName[] = ["오케스트로", "오케스트로클라우드", "이노그리드", "에이블클라우드"];
const RECENT_3Y = "최근 3년";
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
          setRows(body.rows);
          setExcludedCount(body.excludedCatalogRegistrationCount ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "나라장터 낙찰 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const availableYears = useMemo(
    () => Array.from(new Set(rows.map((row) => row.award_date?.slice(0, 4)).filter(Boolean) as string[])).sort((a, b) => Number(b) - Number(a)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const rowYear = Number(row.award_date?.slice(0, 4) ?? 0);
      if (year === RECENT_3Y && (rowYear < recentStartYear || rowYear > currentYear)) return false;
      if (year !== RECENT_3Y && year !== ALL_YEARS && String(rowYear) !== year) return false;
      if (company !== "전체" && row.competitor !== company) return false;
      if (!q) return true;
      return [row.project, row.customer, row.competitor, row.winner_name, row.bid_no, row.matched_keyword]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, year, company, query, currentYear, recentStartYear]);

  const summary = useMemo(() => {
    const amountRows = filtered.filter((row) => row.amount != null);
    return {
      count: filtered.length,
      amount: amountRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      amountKnown: amountRows.length,
      companies: new Set(filtered.map((row) => row.competitor)).size,
      customers: new Set(filtered.map((row) => row.customer).filter(Boolean)).size,
    };
  }, [filtered]);

  const companySummary = useMemo(
    () => COMPANY_ORDER.map((name) => {
      const companyRows = filtered.filter((row) => row.competitor === name);
      const amountRows = companyRows.filter((row) => row.amount != null);
      return {
        name,
        count: companyRows.length,
        amount: amountRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        amountKnown: amountRows.length,
      };
    }),
    [filtered],
  );

  function exportCsv() {
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csvRows: unknown[][] = [
      ["낙찰일", "추적업체", "매칭기준", "최종낙찰업체", "사업자등록번호", "공고번호", "차수", "사업명", "수요기관", "최종낙찰금액", "낙찰률", "업무구분"],
      ...filtered.map((row) => [
        row.award_date,
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
          <strong>데이터 기준:</strong> 회사는 최종낙찰업체 사업자번호로 조회하고, 에이블클라우드는 요청하신 <strong>ABLESTACK/에이블스택</strong>이 나라장터 공고명에 명시된 낙찰 결과도 함께 조회합니다. 홈페이지·기사·수기 구축이력은 사용하지 않습니다. 제3자단가·디지털서비스 단순 등록 {excludedCount.toLocaleString("ko-KR")}건은 제외합니다.
        </section>

        {error && <section className="mb-4 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</section>}

        <section className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="나라장터 확인 건수" value={loading ? "-" : `${summary.count}건`} note={year === RECENT_3Y ? `${recentStartYear}~${currentYear}년` : year} />
          <SummaryCard label="낙찰금액 합계" value={loading ? "-" : formatCompactAmount(summary.amount)} note={`금액 확인 ${summary.amountKnown}건`} />
          <SummaryCard label="확인 업체" value={loading ? "-" : `${summary.companies}개사`} note="현재 조회조건 기준" />
          <SummaryCard label="수요기관" value={loading ? "-" : `${summary.customers}곳`} note="중복 제외" />
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">조회년도</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-slate-900">
                <option value={RECENT_3Y}>{RECENT_3Y} ({recentStartYear}~{currentYear})</option>
                {availableYears.map((value) => <option key={value} value={value}>{value}년</option>)}
                <option value={ALL_YEARS}>{ALL_YEARS}</option>
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
            <button type="button" onClick={() => { setYear(RECENT_3Y); setCompany("전체"); setQuery(""); }} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">초기화</button>
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
              <p className="mt-1 text-[10px] text-slate-400">낙찰금액 확인 {item.amountKnown}건 기준</p>
            </div>
          ))}
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

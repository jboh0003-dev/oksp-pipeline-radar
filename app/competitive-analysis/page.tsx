"use client";

import { useEffect, useMemo, useState } from "react";

type AwardRow = {
  id: string;
  external_key: string;
  competitor: "이노그리드" | "에이블클라우드";
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

type ApiResponse = { ok: true; rows: AwardRow[] } | { ok: false; error: string };

const COMPETITORS = ["전체", "이노그리드", "에이블클라우드"] as const;

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
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).format(date);
}

export default function CompetitiveAnalysisPage() {
  const [rows, setRows] = useState<AwardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState("전체");
  const [competitor, setCompetitor] = useState<(typeof COMPETITORS)[number]>("전체");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/competitive-awards", { cache: "no-store" });
        const body = (await response.json()) as ApiResponse;
        if (!response.ok || !body.ok) throw new Error(body.ok ? "조회 실패" : body.error);
        if (!cancelled) setRows(body.rows.filter((row) => row.source_type === "g2b_award"));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "나라장터 낙찰 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const years = useMemo(() => ["전체", ...Array.from(new Set(rows.map((row) => row.award_date?.slice(0, 4)).filter(Boolean) as string[])).sort((a, b) => Number(b) - Number(a))], [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (year !== "전체" && row.award_date?.slice(0, 4) !== year) return false;
      if (competitor !== "전체" && row.competitor !== competitor) return false;
      if (!q) return true;
      return [row.project, row.customer, row.competitor, row.winner_name, row.bid_no, row.winner_business_no]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [rows, year, competitor, query]);

  const summary = useMemo(() => ({
    count: filtered.length,
    companies: new Set(filtered.map((row) => row.competitor)).size,
    amountKnown: filtered.filter((row) => row.amount != null).length,
    customers: new Set(filtered.map((row) => row.customer).filter(Boolean)).size,
  }), [filtered]);

  const history = useMemo(() => {
    const map = new Map<string, AwardRow[]>();
    for (const row of filtered) {
      const y = row.award_date?.slice(0, 4) ?? "일자 미상";
      map.set(y, [...(map.get(y) ?? []), row]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([label, values]) => ({ label, rows: values }));
  }, [filtered]);

  const companySummary = useMemo(() => (["이노그리드", "에이블클라우드"] as const).map((name) => {
    const companyRows = filtered.filter((row) => row.competitor === name);
    return { name, count: companyRows.length, customers: new Set(companyRows.map((row) => row.customer).filter(Boolean)).size };
  }), [filtered]);

  function exportCsv() {
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csvRows: unknown[][] = [
      ["낙찰일", "경쟁사", "최종낙찰업체", "사업자등록번호", "공고번호", "차수", "사업명", "수요기관", "최종낙찰금액", "낙찰률", "업무구분", "근거", "출처"],
      ...filtered.map((row) => [row.award_date, row.competitor, row.winner_name, row.winner_business_no, row.bid_no, row.bid_ord, row.project, row.customer, row.amount, row.rate, row.category, row.evidence, row.source_url]),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csvRows.map((r) => r.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "나라장터_경쟁사_최종낙찰이력.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-7">
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div className="relative flex min-h-[160px] flex-col justify-center px-5 py-7 sm:min-h-[190px] sm:px-7 sm:py-9">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">파이프라인 메이커 · 나라장터</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">과거 수주 이력·경쟁분석</h1>
            <p className="mt-1 max-w-4xl text-xs text-slate-200/85 sm:text-sm">조달청 나라장터 최종낙찰 결과에서 경쟁사의 실제 낙찰이 확인된 건만 집계합니다.</p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <SummaryCard label="나라장터 확인 낙찰" value={loading ? "-" : `${summary.count}건`} note="최종낙찰업체 확인 기준" />
          <SummaryCard label="확인 경쟁사" value={loading ? "-" : `${summary.companies}개사`} note="업체명 기준" />
          <SummaryCard label="낙찰금액 확인" value={loading ? "-" : `${summary.amountKnown}건`} note="나라장터 최종낙찰금액" />
          <SummaryCard label="수요기관" value={loading ? "-" : `${summary.customers}곳`} note="현재 검색 결과 기준" />
        </section>

        <section className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-xs leading-5 text-cyan-900 shadow-sm dark:text-cyan-100 sm:text-sm">
          <strong>데이터 기준:</strong> 이 화면은 조달청 나라장터의 최종낙찰 결과만 사용합니다. 경쟁사 홈페이지·보도자료·언론기사·키워드 추정 자료는 수주 실적으로 사용하지 않습니다. 동일 공고는 공고번호·차수·최종낙찰업체 기준으로 중복 제거합니다.
        </section>

        {error && <section className="mb-4 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</section>}

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">연도</span><select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{years.map((value) => <option key={value} value={value}>{value === "전체" ? value : `${value}년`}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">경쟁사</span><select value={competitor} onChange={(e) => setCompetitor(e.target.value as (typeof COMPETITORS)[number])} className="h-9 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{COMPETITORS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="flex flex-1 flex-col gap-1 md:max-w-xl"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">검색</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="사업명·수요기관·공고번호·낙찰업체 검색" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100" /></label>
            <button type="button" onClick={() => { setYear("전체"); setCompetitor("전체"); setQuery(""); }} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">초기화</button>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">나라장터 낙찰 이력</h2><p className="mt-1 text-xs text-slate-500">연도·경쟁사·검색어 조건이 아래 이력과 요약에 함께 적용됩니다.</p></div><button onClick={exportCsv} disabled={!filtered.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">검색 결과 CSV 다운로드</button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{history.map((item) => <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="font-bold">{item.label}{item.label !== "일자 미상" ? "년" : ""} · {item.rows.length}건</p><p className="mt-1 text-xs text-slate-500">{new Set(item.rows.map((row) => row.customer).filter(Boolean)).size}개 수요기관</p><p className="mt-2 text-xs">{Array.from(new Set(item.rows.map((row) => row.competitor))).join(" · ")}</p></div>)}</div>
          {!loading && !history.length && <p className="mt-3 text-sm text-slate-500">현재 조건에서 나라장터 최종낙찰이 확인된 건이 없습니다.</p>}
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2">{companySummary.map((item) => <div key={item.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70"><p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p><div className="mt-2 flex items-baseline gap-4"><span className="text-2xl font-bold text-blue-600 dark:text-blue-300">{item.count}건</span><span className="text-xs text-slate-500 dark:text-slate-400">수요기관 {item.customers}곳</span></div></div>)}</section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10"><h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">확인된 최종낙찰 실적</h2><p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">조달청 나라장터 최종낙찰업체 필드로 확인된 건만 표시합니다.</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400"><th className="whitespace-nowrap px-4 py-3">낙찰일</th><th className="whitespace-nowrap px-4 py-3">경쟁사 / 최종낙찰업체</th><th className="whitespace-nowrap px-4 py-3">공고번호</th><th className="min-w-[360px] px-4 py-3">사업명</th><th className="whitespace-nowrap px-4 py-3">수요기관</th><th className="whitespace-nowrap px-4 py-3 text-right">최종낙찰금액</th><th className="whitespace-nowrap px-4 py-3 text-right">낙찰률</th><th className="whitespace-nowrap px-4 py-3">근거</th></tr></thead>
            <tbody>{filtered.map((item) => <tr key={item.external_key} className="border-b border-slate-100 last:border-b-0 dark:border-white/5"><td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{formatDate(item.award_date)}</td><td className="whitespace-nowrap px-4 py-3.5"><p className="font-semibold text-slate-800 dark:text-slate-100">{item.competitor}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.winner_name}{item.winner_business_no ? ` · ${item.winner_business_no}` : ""}</p></td><td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{item.bid_no}{item.bid_ord ? `-${item.bid_ord}` : ""}</td><td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.project}</td><td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.customer ?? "-"}</td><td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatAmount(item.amount)}</td><td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatRate(item.rate)}</td><td className="whitespace-nowrap px-4 py-3.5"><a href={item.source_url || "https://www.g2b.go.kr/"} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline dark:text-blue-300">{item.source_label || "나라장터 낙찰정보"}</a></td></tr>)}
              {!loading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">조건에 맞는 나라장터 최종낙찰 실적이 없습니다.</td></tr>}
              {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">나라장터 기반 낙찰 데이터를 불러오는 중입니다…</td></tr>}
            </tbody></table></div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs leading-6 text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"><p className="font-semibold text-slate-800 dark:text-slate-100">검증 원칙</p><p>① 최종낙찰업체가 이노그리드 또는 에이블클라우드로 나라장터에서 직접 확인된 건만 포함합니다.</p><p>② 공고명에 클라우드·HCI·가상화 등의 단어가 포함됐다는 이유만으로 경쟁사 수주로 추정하지 않습니다.</p><p>③ 회사 홈페이지·연혁·보도자료·언론기사는 이 화면의 수주 실적 근거로 사용하지 않습니다.</p></section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5"><p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">{label}</p><p className="mt-0.5 text-xl font-bold tracking-tight text-blue-600 dark:text-blue-300 sm:text-2xl">{value}</p><p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500 sm:text-[11px]">{note}</p></div>;
}

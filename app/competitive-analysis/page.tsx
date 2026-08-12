"use client";

import { useMemo, useState } from "react";

/**
 * 수주·경쟁분석 — 1차 화면 골격.
 *
 *  - 실제 데이터/API/DB 연결은 다음 phase.
 *  - 초기 경쟁사 행만 고정 표시하고, 숫자·기관·SI 는 0 / "-" placeholder.
 */

type VerdictFilter = "all" | "confirmed" | "likely" | "review";

type CompetitorRow = {
  name: string;
  winCount: number;
  contractAmount: number | null;
  mainAgencies: string;
  mainSi: string;
  latestWinDate: string;
};

const INITIAL_COMPETITORS: CompetitorRow[] = [
  {
    name: "이노그리드",
    winCount: 0,
    contractAmount: null,
    mainAgencies: "-",
    mainSi: "-",
    latestWinDate: "-",
  },
  {
    name: "에이블스택",
    winCount: 0,
    contractAmount: null,
    mainAgencies: "-",
    mainSi: "-",
    latestWinDate: "-",
  },
  {
    name: "에이블클라우드",
    winCount: 0,
    contractAmount: null,
    mainAgencies: "-",
    mainSi: "-",
    latestWinDate: "-",
  },
  {
    name: "팝콘사",
    winCount: 0,
    contractAmount: null,
    mainAgencies: "-",
    mainSi: "-",
    latestWinDate: "-",
  },
];

const COMPETITOR_OPTIONS = ["전체", ...INITIAL_COMPETITORS.map((c) => c.name)] as const;

const PERIOD_START_YEAR = 2023;
const CURRENT_YEAR = new Date().getFullYear();

function formatAmount(value: number | null): string {
  if (value == null || value === 0) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

export default function CompetitiveAnalysisPage() {
  const [periodFrom, setPeriodFrom] = useState(String(PERIOD_START_YEAR));
  const [periodTo, setPeriodTo] = useState(String(CURRENT_YEAR));
  const [competitor, setCompetitor] = useState<string>("전체");
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [applied, setApplied] = useState({
    periodFrom: String(PERIOD_START_YEAR),
    periodTo: String(CURRENT_YEAR),
    competitor: "전체",
    verdict: "all" as VerdictFilter,
    searchQuery: "",
  });

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = PERIOD_START_YEAR; y <= CURRENT_YEAR; y += 1) years.push(y);
    return years;
  }, []);

  const rows = useMemo(() => {
    const q = applied.searchQuery.trim().toLowerCase();
    return INITIAL_COMPETITORS.filter((row) => {
      if (applied.competitor !== "전체" && row.name !== applied.competitor) return false;
      if (q && !row.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [applied]);

  const summary = useMemo(
    () => ({
      winCount: 0,
      contractAmountLabel: "-",
      agencyCount: 0,
      siCount: 0,
    }),
    [],
  );

  const handleSearch = () => {
    setApplied({
      periodFrom,
      periodTo,
      competitor,
      verdict,
      searchQuery,
    });
  };

  const handleReset = () => {
    setPeriodFrom(String(PERIOD_START_YEAR));
    setPeriodTo(String(CURRENT_YEAR));
    setCompetitor("전체");
    setVerdict("all");
    setSearchQuery("");
    setApplied({
      periodFrom: String(PERIOD_START_YEAR),
      periodTo: String(CURRENT_YEAR),
      competitor: "전체",
      verdict: "all",
      searchQuery: "",
    });
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div className="relative flex min-h-[150px] flex-col justify-center px-5 py-7 sm:min-h-[190px] sm:px-7 sm:py-9">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">
              OKESTRO CS-G2B
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
              수주·경쟁분석
            </h1>
            <p className="mt-1 hidden text-xs text-slate-200/85 sm:block">
              2023년 이후 경쟁사의 공공사업 수주 실적과 SI 협업 현황을 분석합니다.
            </p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SummaryCard label="확인된 수주 건수" value={summary.winCount} note="확정 수주 기준" tone="blue" />
          <SummaryCard
            label="확인된 계약금액"
            valueLabel={summary.contractAmountLabel}
            note="합계 (원)"
            tone="indigo"
          />
          <SummaryCard label="분석 발주기관" value={summary.agencyCount} note="고유 기관 수" tone="cyan" />
          <SummaryCard label="협업 SI" value={summary.siCount} note="고유 SI 수" tone="violet" />
        </section>

        <section className="mb-5 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">조회기간</span>
              <div className="flex items-center gap-1.5">
                <select
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-7 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 sm:text-sm"
                >
                  {yearOptions.map((y) => (
                    <option key={`from-${y}`} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">~</span>
                <select
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-7 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 sm:text-sm"
                >
                  {yearOptions.map((y) => (
                    <option key={`to-${y}`} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">경쟁사</span>
              <select
                value={competitor}
                onChange={(e) => setCompetitor(e.target.value)}
                className="h-9 min-w-[140px] cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-7 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 sm:text-sm"
              >
                {COMPETITOR_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">판정</span>
              <select
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as VerdictFilter)}
                className="h-9 min-w-[120px] cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-7 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 sm:text-sm"
              >
                <option value="all">전체</option>
                <option value="confirmed">확정</option>
                <option value="likely">유력</option>
                <option value="review">검토 필요</option>
              </select>
            </label>

            <label className="flex min-w-0 flex-1 flex-col gap-1 lg:max-w-xs">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">검색어</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="경쟁사명 검색"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 sm:text-sm"
              >
                조회
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800 sm:text-sm"
              >
                초기화
              </button>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            적용 필터: {applied.periodFrom}년 ~ {applied.periodTo}년 · {applied.competitor} ·{" "}
            {applied.verdict === "all"
              ? "판정 전체"
              : applied.verdict === "confirmed"
                ? "확정"
                : applied.verdict === "likely"
                  ? "유력"
                  : "검토 필요"}
            {applied.searchQuery.trim() ? ` · 검색:"${applied.searchQuery.trim()}"` : ""}
            <span className="ml-2 text-slate-300 dark:text-slate-600">· 데이터 연동 전 (골격)</span>
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">경쟁사 현황</h2>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              수주·계약 데이터 연동 전 — 수치는 0, 텍스트는 &quot;-&quot;로 표시합니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">경쟁사</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">수주 건수</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">계약금액</th>
                  <th className="whitespace-nowrap px-4 py-3">주요 발주기관</th>
                  <th className="whitespace-nowrap px-4 py-3">주요 SI</th>
                  <th className="whitespace-nowrap px-4 py-3">최근 수주일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.name}
                    className="border-b border-slate-100 last:border-b-0 dark:border-white/5"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                      {row.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {row.winCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {formatAmount(row.contractAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{row.mainAgencies}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{row.mainSi}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">
                      {row.latestWinDate}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                    >
                      조건에 맞는 경쟁사가 없습니다. 필터를 초기화해 보세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
          수주·경쟁분석 · CS-G2B · 데이터 연동 예정
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueLabel,
  note,
  tone,
}: {
  label: string;
  value?: number;
  valueLabel?: string;
  note: string;
  tone: "blue" | "indigo" | "cyan" | "violet";
}) {
  const accentByTone: Record<typeof tone, string> = {
    blue: "text-blue-600 dark:text-blue-300",
    indigo: "text-indigo-600 dark:text-indigo-300",
    cyan: "text-cyan-600 dark:text-cyan-300",
    violet: "text-violet-600 dark:text-violet-300",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5">
      <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-bold leading-none tabular-nums sm:text-2xl ${accentByTone[tone]}`}>
        {valueLabel ?? (value ?? 0).toLocaleString("ko-KR")}
      </p>
      <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">{note}</p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type NoticeRow,
} from "@/lib/supabase";

type VerdictFilter = "all" | "confirmed" | "likely" | "review";
type Verdict = Exclude<VerdictFilter, "all">;
type SummaryTone = "blue" | "indigo" | "cyan" | "violet";

type CompetitorDefinition = {
  name: string;
  aliases: string[];
  marketSignals: string[];
};

type CompetitorRow = {
  name: string;
  hitCount: number;
  confirmedCount: number;
  likelyCount: number;
  reviewCount: number;
  contractAmount: number | null;
  mainAgencies: string;
  mainSi: string;
  latestWinDate: string;
};

type AnalysisHit = {
  id: string;
  competitor: string;
  verdict: Verdict;
  title: string;
  agency: string;
  si: string;
  date: string;
  dueDate: string;
  amount: number | null;
  amountLabel: string;
  sourceUrl: string | null;
  evidence: string;
};

const COMPETITORS: CompetitorDefinition[] = [
  {
    name: "이노그리드",
    aliases: ["이노그리드", "innogrid", "inno grid", "클라우드잇", "cloudit"],
    marketSignals: ["클라우드잇", "cloudit", "cmp", "클라우드관리", "클라우드 관리", "멀티클라우드", "멀티 클라우드"],
  },
  {
    name: "에이블스택",
    aliases: ["에이블스택", "able stack", "ablestack"],
    marketSignals: ["openstack", "오픈스택", "hci", "하이퍼컨버지드", "하이퍼 컨버지드", "kvm", "프라이빗클라우드", "프라이빗 클라우드"],
  },
  {
    name: "에이블클라우드",
    aliases: ["에이블클라우드", "able cloud", "ablecloud"],
    marketSignals: ["클라우드플랫폼", "클라우드 플랫폼", "가상화관리", "가상화 관리", "클라우드 인프라", "iaas", "프라이빗클라우드", "프라이빗 클라우드"],
  },
  {
    name: "팝콘사",
    aliases: ["팝콘사", "팝콘", "popcon", "popconsa", "popcorn"],
    marketSignals: ["vdi", "데스크톱가상화", "데스크톱 가상화", "가상데스크톱", "가상 데스크톱", "daas", "workspace"],
  },
];

const COMPETITOR_OPTIONS = ["전체", ...COMPETITORS.map((c) => c.name)] as const;
const PERIOD_START_YEAR = 2023;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_FETCH_LIMIT = 3000;
const DETAIL_LIMIT = 120;

const SI_KEYWORDS = [
  "삼성SDS",
  "삼성에스디에스",
  "LG CNS",
  "엘지씨엔에스",
  "SK C&C",
  "SK씨앤씨",
  "쌍용정보통신",
  "대보정보통신",
  "아이티센",
  "콤텍정보통신",
  "현대오토에버",
  "CJ올리브네트웍스",
  "롯데이노베이트",
  "메타넷",
  "대우정보시스템",
];

const CONTRACT_FIELD_KEYS = [
  "cntrctEntrpsNm",
  "sucsfbidEntrpsNm",
  "finalSucsfEntrpsNm",
  "winBidEntrpsNm",
  "opengRsltDivNm",
  "bidwinnrNm",
  "contractor",
  "winner",
];

const BUDGET_FIELD_KEYS = [
  "asignBdgtAmt",
  "presmptPrce",
  "bssamt",
  "bdgtAmt",
  "budget",
  " 추정가격",
  "추정가격",
  "배정예산",
  "계약금액",
  "contractAmount",
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\[\]{}·.,_\-–—/\\]/g, "");
}

function safeStringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseStringArray(value: string[] | string | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // ignore malformed json-like text
    }
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function getRawValue(row: NoticeRow, keys: string[]): unknown {
  const raw = row.raw_data;
  if (!raw || typeof raw !== "object") return null;
  for (const key of keys) {
    const value = (raw as Record<string, unknown>)[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const dashed = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (dashed) {
    return `${dashed[1]}-${dashed[2].padStart(2, "0")}-${dashed[3].padStart(2, "0")}`;
  }

  return null;
}

function resolveDate(row: NoticeRow): string {
  const candidates = [
    row.notice_date,
    getRawValue(row, ["rgstDt", "bidNtceDt", "ntceDt", "regDt", "registDt", "cntrctDt", "opengDt"]),
    row.due_date,
    row.created_at,
  ];

  for (const candidate of candidates) {
    const date = toDateOnly(candidate);
    if (date) return date;
  }
  return "-";
}

function getYear(row: NoticeRow): number | null {
  const date = resolveDate(row);
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function resolveDueDate(row: NoticeRow): string {
  return toDateOnly(row.due_date) ?? toDateOnly(getRawValue(row, ["bidClseDt", "rceptClosDt", "opengDt"])) ?? "-";
}

function parseMoneyToWon(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).replace(/,/g, "").trim();
  if (!text || text === "-") return null;

  const numericOnly = text.replace(/[^0-9.]/g, "");
  if (/^[0-9.]+$/.test(text) && Number.isFinite(Number(text))) return Number(text);

  let total = 0;
  const eok = text.match(/([0-9]+(?:\.[0-9]+)?)\s*억/);
  const man = text.match(/([0-9]+(?:\.[0-9]+)?)\s*만/);
  if (eok) total += Number(eok[1]) * 100_000_000;
  if (man) total += Number(man[1]) * 10_000;
  if (total > 0) return Math.round(total);

  if (numericOnly && Number.isFinite(Number(numericOnly))) return Number(numericOnly);
  return null;
}

function resolveAmount(row: NoticeRow): number | null {
  const candidates = [row.budget, getRawValue(row, BUDGET_FIELD_KEYS)];
  for (const candidate of candidates) {
    const amount = parseMoneyToWon(candidate);
    if (amount != null && amount > 0) return amount;
  }
  return null;
}

function formatAmount(value: number | null): string {
  if (value == null || value === 0) return "-";
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

function buildSearchCorpus(row: NoticeRow): string {
  return [
    row.title,
    row.agency,
    row.budget,
    row.summary,
    row.source,
    row.status,
    row.source_type,
    parseStringArray(row.products).join(" "),
    parseStringArray(row.keywords).join(" "),
    safeStringify(row.raw_data),
  ]
    .filter(Boolean)
    .join(" ");
}

function findMatchedTerm(corpus: string, terms: string[]): string | null {
  const normalizedCorpus = normalizeText(corpus);
  for (const term of terms) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) continue;
    if (normalizedCorpus.includes(normalizedTerm)) return term;
  }
  return null;
}

function detectSi(corpus: string): string {
  const normalizedCorpus = normalizeText(corpus);
  const found = SI_KEYWORDS.find((si) => normalizedCorpus.includes(normalizeText(si)));
  return found ?? "-";
}

function classifyVerdict(row: NoticeRow, corpus: string, explicitTerm: string | null): Verdict {
  const contractFieldText = safeStringify(getRawValue(row, CONTRACT_FIELD_KEYS));
  const contractSignalText = `${corpus} ${contractFieldText}`;
  const hasContractSignal = /낙찰|계약|수주|우선협상|협상대상|winner|contract|award|sucsf|cntrct/i.test(
    contractSignalText,
  );

  if (explicitTerm && hasContractSignal) return "confirmed";
  if (explicitTerm) return "likely";
  return "review";
}

function verdictLabel(verdict: Verdict): string {
  if (verdict === "confirmed") return "확정";
  if (verdict === "likely") return "유력";
  return "검토";
}

function verdictClass(verdict: Verdict): string {
  if (verdict === "confirmed") return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/20";
  if (verdict === "likely") return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-300/20";
  return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20";
}

function sourceUrl(row: NoticeRow): string | null {
  const direct = row.original_url?.trim();
  if (direct) return direct;
  const rawUrl = getRawValue(row, ["detailUrl", "url", "sourceUrl", "bidNtceUrl"]);
  return rawUrl ? String(rawUrl) : null;
}

function topItems(values: string[], limit = 3): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "-") continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
  return ranked.length > 0 ? ranked.join(", ") : "-";
}

function buildAnalysisHits(rows: NoticeRow[], applied: AppliedFilter): AnalysisHit[] {
  const fromYear = Number(applied.periodFrom);
  const toYear = Number(applied.periodTo);
  const query = applied.searchQuery.trim().toLowerCase();

  const hits: AnalysisHit[] = [];

  for (const row of rows) {
    const year = getYear(row);
    if (year != null && (year < fromYear || year > toYear)) continue;

    const corpus = buildSearchCorpus(row);
    const lowercaseCorpus = corpus.toLowerCase();
    if (query && !lowercaseCorpus.includes(query)) continue;

    for (const competitor of COMPETITORS) {
      if (applied.competitor !== "전체" && competitor.name !== applied.competitor) continue;

      const explicitTerm = findMatchedTerm(corpus, competitor.aliases);
      const marketTerm = explicitTerm ? null : findMatchedTerm(corpus, competitor.marketSignals);
      if (!explicitTerm && !marketTerm) continue;

      const verdict = classifyVerdict(row, corpus, explicitTerm);
      if (applied.verdict !== "all" && verdict !== applied.verdict) continue;

      const amount = resolveAmount(row);
      const date = resolveDate(row);
      hits.push({
        id: `${row.id}-${competitor.name}`,
        competitor: competitor.name,
        verdict,
        title: row.title || "제목 없음",
        agency: row.agency || "-",
        si: detectSi(corpus),
        date,
        dueDate: resolveDueDate(row),
        amount,
        amountLabel: formatAmount(amount),
        sourceUrl: sourceUrl(row),
        evidence: explicitTerm ? `명시 키워드: ${explicitTerm}` : `시장 키워드: ${marketTerm}`,
      });
    }
  }

  return hits.sort((a, b) => b.date.localeCompare(a.date));
}

function buildCompetitorRows(hits: AnalysisHit[]): CompetitorRow[] {
  return COMPETITORS.map((competitor) => {
    const competitorHits = hits.filter((hit) => hit.competitor === competitor.name);
    const amountTotal = competitorHits.reduce((sum, hit) => sum + (hit.amount ?? 0), 0);
    const latest = competitorHits.map((hit) => hit.date).filter((date) => date && date !== "-").sort().at(-1) ?? "-";
    return {
      name: competitor.name,
      hitCount: competitorHits.length,
      confirmedCount: competitorHits.filter((hit) => hit.verdict === "confirmed").length,
      likelyCount: competitorHits.filter((hit) => hit.verdict === "likely").length,
      reviewCount: competitorHits.filter((hit) => hit.verdict === "review").length,
      contractAmount: amountTotal > 0 ? amountTotal : null,
      mainAgencies: topItems(competitorHits.map((hit) => hit.agency)),
      mainSi: topItems(competitorHits.map((hit) => hit.si)),
      latestWinDate: latest,
    };
  });
}

type AppliedFilter = {
  periodFrom: string;
  periodTo: string;
  competitor: string;
  verdict: VerdictFilter;
  searchQuery: string;
};

export default function CompetitiveAnalysisPage() {
  const [periodFrom, setPeriodFrom] = useState(String(PERIOD_START_YEAR));
  const [periodTo, setPeriodTo] = useState(String(CURRENT_YEAR));
  const [competitor, setCompetitor] = useState<string>("전체");
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [applied, setApplied] = useState<AppliedFilter>({
    periodFrom: String(PERIOD_START_YEAR),
    periodTo: String(CURRENT_YEAR),
    competitor: "전체",
    verdict: "all",
    searchQuery: "",
  });

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const configError = getSupabaseConfigError();
      const supabase = getSupabaseClient();
      if (configError || !supabase) {
        if (active) {
          setNotices([]);
          setLoadError(configError ?? "Supabase 클라이언트를 생성하지 못했습니다.");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(MAX_FETCH_LIMIT);

      if (!active) return;

      if (error) {
        setNotices([]);
        setLoadError(error.message ?? "수주·경쟁분석 데이터를 불러오지 못했습니다.");
      } else {
        setNotices(((data ?? []) as NoticeRow[]).filter((row) => row.original_url !== "https://example.com"));
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = PERIOD_START_YEAR; y <= CURRENT_YEAR; y += 1) years.push(y);
    return years;
  }, []);

  const analysisHits = useMemo(() => buildAnalysisHits(notices, applied), [notices, applied]);
  const rows = useMemo(() => buildCompetitorRows(analysisHits), [analysisHits]);
  const visibleRows = useMemo(() => {
    if (applied.competitor === "전체") return rows;
    return rows.filter((row) => row.name === applied.competitor);
  }, [applied.competitor, rows]);

  const detailHits = useMemo(() => analysisHits.slice(0, DETAIL_LIMIT), [analysisHits]);

  const summary = useMemo(() => {
    const agencies = new Set(analysisHits.map((hit) => hit.agency).filter((value) => value && value !== "-"));
    const sis = new Set(analysisHits.map((hit) => hit.si).filter((value) => value && value !== "-"));
    const amount = analysisHits.reduce((sum, hit) => sum + (hit.amount ?? 0), 0);
    return {
      hitCount: analysisHits.length,
      contractAmountLabel: formatAmount(amount > 0 ? amount : null),
      agencyCount: agencies.size,
      siCount: sis.size,
    };
  }, [analysisHits]);

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
              나라장터 수집 DB에서 경쟁사 명시 키워드와 시장 키워드를 찾아 수주·경쟁 후보를 분석합니다.
            </p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SummaryCard label="분석 대상 건수" value={summary.hitCount} note="확정·유력·검토 포함" tone="blue" />
          <SummaryCard label="관련 예산/금액" valueLabel={summary.contractAmountLabel} note="확인 가능 금액 합계" tone="indigo" />
          <SummaryCard label="분석 발주기관" value={summary.agencyCount} note="고유 기관 수" tone="cyan" />
          <SummaryCard label="협업 SI" value={summary.siCount} note="본문 언급 기준" tone="violet" />
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
                placeholder="경쟁사명, 공고명, 기관명 검색"
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
            {applied.verdict === "all" ? "판정 전체" : verdictLabel(applied.verdict)}
            {applied.searchQuery.trim() ? ` · 검색:"${applied.searchQuery.trim()}"` : ""}
            <span className="ml-2 text-slate-300 dark:text-slate-600">
              · 총 {notices.length.toLocaleString("ko-KR")}건 DB 기준
            </span>
          </p>
        </section>

        {loadError && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-300/20 dark:bg-red-400/10 dark:text-red-200">
            수주·경쟁분석 데이터를 불러오지 못했습니다. {loadError}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">경쟁사 현황</h2>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              확정은 경쟁사명과 계약/낙찰 신호가 함께 확인된 건, 유력은 경쟁사명 직접 언급, 검토는 시장 키워드 기반 후보입니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">경쟁사</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">관련 건수</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">확정/유력/검토</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">예산/금액</th>
                  <th className="whitespace-nowrap px-4 py-3">주요 발주기관</th>
                  <th className="whitespace-nowrap px-4 py-3">주요 SI</th>
                  <th className="whitespace-nowrap px-4 py-3">최근 확인일</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      수주·경쟁분석 데이터를 불러오는 중입니다.
                    </td>
                  </tr>
                )}
                {!loading && visibleRows.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100 last:border-b-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                      {row.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {row.hitCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {row.confirmedCount}/{row.likelyCount}/{row.reviewCount}
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
                {!loading && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      조건에 맞는 경쟁사 분석 결과가 없습니다. 필터를 초기화하거나 수집 데이터를 확인해 주세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">관련 공고 상세</h2>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              최신 {DETAIL_LIMIT}건까지 표시합니다. 공고명을 누르면 원문 링크를 새 탭으로 엽니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="whitespace-nowrap px-4 py-3">판정</th>
                  <th className="whitespace-nowrap px-4 py-3">경쟁사</th>
                  <th className="min-w-[360px] px-4 py-3">공고명</th>
                  <th className="whitespace-nowrap px-4 py-3">발주기관</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">금액</th>
                  <th className="whitespace-nowrap px-4 py-3">확인일</th>
                  <th className="whitespace-nowrap px-4 py-3">근거</th>
                </tr>
              </thead>
              <tbody>
                {!loading && detailHits.map((hit) => (
                  <tr key={hit.id} className="border-b border-slate-100 last:border-b-0 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${verdictClass(hit.verdict)}`}>
                        {verdictLabel(hit.verdict)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-200">
                      {hit.competitor}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">
                      {hit.sourceUrl ? (
                        <a href={hit.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-blue-600 hover:underline dark:hover:text-blue-300">
                          {hit.title}
                        </a>
                      ) : (
                        hit.title
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{hit.agency}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {hit.amountLabel}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">{hit.date}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {hit.evidence}
                    </td>
                  </tr>
                ))}
                {!loading && detailHits.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      관련 공고가 없습니다. 현재 DB에 경쟁사명 또는 시장 키워드가 포함된 공고가 없을 수 있습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
          수주·경쟁분석 · CS-G2B · Supabase notices 데이터 기준 자동 분석
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
  tone: SummaryTone;
}) {
  const accentByTone: Record<SummaryTone, string> = {
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLoading from "@/components/DashboardLoading";
import Header from "@/components/Header";
import LastCollectionRunCard from "@/components/LastCollectionRunCard";
import NoticeCard from "@/components/NoticeCard";
import NoticeTable from "@/components/NoticeTable";
import ProductFilter from "@/components/ProductFilter";
import SearchBar from "@/components/SearchBar";
import SummaryCards from "@/components/SummaryCards";
import {
  CONTRABASS_FAMILY,
  type Notice,
  type ProductFilter as ProductFilterValue,
} from "@/data/sampleNotices";
import { fetchLastCollectionRun } from "@/lib/fetchLastCollectionRun";
import { fetchNotices, type NoticeDataSource } from "@/lib/fetchNotices";
import { buildNegativeSearchText, detectNegativeSignals } from "@/lib/noticeMatching";
import { evaluateMatchGrade } from "@/lib/noticeGrades";
import {
  DEFAULT_SORT_STATE,
  sortNoticesByState,
  toggleSortState,
  type SortColumn,
  type SortState,
} from "@/lib/noticeSorting";
import {
  getDueStatus,
  hasRealProductMatch,
  isTestNoticeUrl,
  type DashboardSummaryCounts,
} from "@/lib/noticeVisibility";
import { getSupabaseClient, type CollectionRunRow } from "@/lib/supabase";

const CONTRABASS_FAMILY_SET = new Set<string>(CONTRABASS_FAMILY);

/** "담당본부 매칭 여부" 드롭다운 값. */
type TerritoryStatusFilter = "all" | "withTerritory" | "withoutTerritory";

function countSummaryForCards(notices: DisplayNotice[]): DashboardSummaryCounts {
  const counts: DashboardSummaryCounts = {
    activeTotal: 0,
    contrabass: 0,
    viola: 0,
  };

  for (const notice of notices) {
    counts.activeTotal += 1;
    if (notice.relatedProducts.some((p) => CONTRABASS_FAMILY_SET.has(p))) {
      counts.contrabass += 1;
    }
    if (notice.relatedProducts.includes("VIOLA")) {
      counts.viola += 1;
    }
  }

  return counts;
}

type DisplayNotice = Notice & { rawData?: string };

function buildNoticeHaystack(notice: DisplayNotice): string {
  return [
    notice.title,
    notice.agency,
    ...notice.relatedProducts,
    ...notice.keywords,
    notice.summary ?? "",
    notice.rawData ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * 화면 노출 조건.
 *  - 마감 공고 기본 제외: 한국시간 기준 deadline >= today 인 공고만 노출.
 *    (getDueStatus === "진행 중" 이 정확히 이 조건을 보장한다.)
 *  - 제품 매칭: CONTRABASS / VIOLA 중 하나라도 매칭되어야 함.
 *  - 테스트 URL 제외.
 *
 * Supabase 에서는 마감 공고도 그대로 보존되고 (delete 금지), 화면에서만 숨긴다.
 * 추후 "마감 포함" 토글이 필요해지면 이 함수에 옵션을 추가한다.
 */
function isVisibleCandidate(notice: DisplayNotice): boolean {
  if (isTestNoticeUrl(notice.sourceUrl)) return false;
  if (getDueStatus(notice.deadline) !== "진행 중") return false;
  return hasRealProductMatch(notice);
}

function matchesSearch(notice: DisplayNotice, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return buildNoticeHaystack(notice).includes(normalized);
}

function matchesProduct(notice: DisplayNotice, product: ProductFilterValue) {
  if (product === "전체") return true;
  if (product === "CONTRABASS") {
    return notice.relatedProducts.some((p) => CONTRABASS_FAMILY_SET.has(p));
  }
  if (product === "VIOLA") {
    return notice.relatedProducts.includes("VIOLA");
  }
  return false;
}

/**
 * 담당본부(테리토리) "없음" 판정.
 *
 * 회의 피드백:
 *   - null / undefined / 빈 문자열은 당연히 없음.
 *   - 데이터 정합성 이슈로 "미매칭" / "비매칭" / "매칭 안됨" / "담당본부 없음" / "미지정" 같은
 *     문자열 sentinel 이 들어와도 동일하게 "없음" 으로 본다.
 */
const EMPTY_TERRITORY_SENTINELS = new Set([
  "",
  "-",
  "미매칭",
  "비매칭",
  "매칭 안됨",
  "매칭안됨",
  "담당본부 없음",
  "본부 미매칭",
  "미지정",
  "없음",
  "n/a",
  "na",
  "null",
  "undefined",
]);

function isWithoutTerritory(notice: DisplayNotice): boolean {
  const raw = notice.customer?.territory;
  if (raw == null) return true;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return true;
  return EMPTY_TERRITORY_SENTINELS.has(trimmed.toLowerCase());
}

/**
 * 담당본부(테리토리) 매칭 상태 필터.
 *  - "all"              : 전부 표시
 *  - "withTerritory"    : 담당본부(테리토리) 가 채워진 공고만
 *  - "withoutTerritory" : 담당본부가 비어있거나 고객사 매칭 자체가 실패한 공고만
 *
 * 여기서 "매칭"은 제품 매칭이 아니라 기관/고객사 → 담당본부 매칭을 의미한다.
 */
function matchesTerritoryStatus(
  notice: DisplayNotice,
  status: TerritoryStatusFilter,
): boolean {
  if (status === "all") return true;
  const empty = isWithoutTerritory(notice);
  if (status === "withTerritory") return !empty;
  return empty;
}

function normalizeNotice(notice: Notice): DisplayNotice {
  // fetchNotices 가 이미 negativeWeight 를 반영해 matchGrade 를 계산해 넘겨주지만,
  // 샘플 데이터(supabase 미연결) 경로에서도 동일한 정책을 적용하기 위해
  // 클라이언트 측에서도 한 번 더 evaluateMatchGrade 를 돌려준다.
  const negativeText = buildNegativeSearchText({
    title: notice.title,
    agency: notice.agency,
    summary: notice.summary,
    keywords: notice.keywords,
  });
  const { weight: negativeWeight } = detectNegativeSignals(negativeText);
  return {
    ...notice,
    matchGrade: evaluateMatchGrade(notice.fitScore, negativeWeight),
  };
}

async function attachRawData(
  notices: Notice[],
  source: NoticeDataSource,
): Promise<DisplayNotice[]> {
  const normalized = notices.map(normalizeNotice);

  if (source !== "supabase") {
    return normalized.map((notice) => ({ ...notice, rawData: "" }));
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return normalized.map((notice) => ({ ...notice, rawData: "" }));
  }

  const { data, error } = await supabase
    .from("notices")
    .select("id, raw_data")
    .eq("status", "open")
    .or(
      "source_type.eq.g2b,source_type.eq.g2b_keyword,source_type.eq.g2b_active_core,source_type.is.null,source_type.eq.",
    );

  if (error || !data) {
    return normalized.map((notice) => ({ ...notice, rawData: "" }));
  }

  const rawMap = new Map(
    (data as Array<{ id: string; raw_data?: Record<string, unknown> | null }>).map(
      (row) => [String(row.id), JSON.stringify(row.raw_data ?? {})],
    ),
  );

  return normalized.map((notice) => ({
    ...notice,
    rawData: rawMap.get(notice.id) ?? "",
  }));
}

export default function Home() {
  const [notices, setNotices] = useState<DisplayNotice[]>([]);
  const [dataSource, setDataSource] = useState<NoticeDataSource>("sample");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductFilterValue>("전체");
  const [territoryFilter, setTerritoryFilter] =
    useState<TerritoryStatusFilter>("all");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [showMatchSource, setShowMatchSource] = useState(false);
  const [lastRun, setLastRun] = useState<CollectionRunRow | null>(null);
  const [lastRunError, setLastRunError] = useState<string | null>(null);
  const [isLastRunLoading, setIsLastRunLoading] = useState(true);

  // 수동 수집("지금 수집") 상태.
  // - "idle"     : 클릭 전
  // - "running"  : /api/collect-now 호출 중
  // - "success"  : 가장 최근 수동 수집 완료. message 에 "신규 N건 / 업데이트 M건 / 조회 K건"
  // - "error"    : 실패. message 에 사유.
  type ManualCollectStatus = "idle" | "running" | "success" | "error";
  const [manualStatus, setManualStatus] = useState<ManualCollectStatus>("idle");
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    const result = await fetchNotices();
    const withRaw = await attachRawData(result.notices, result.source);
    setNotices(withRaw);
    setDataSource(result.source);
    setErrorMessage(result.error);
  }, []);

  const loadLastRun = useCallback(async () => {
    const { run, error } = await fetchLastCollectionRun();
    setLastRun(run);
    setLastRunError(error);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function runOnce() {
      setIsLoading(true);
      setIsLastRunLoading(true);
      try {
        await Promise.all([loadNotices(), loadLastRun()]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsLastRunLoading(false);
        }
      }
    }

    void runOnce();

    return () => {
      isMounted = false;
    };
  }, [loadNotices, loadLastRun]);

  const candidates = useMemo(
    () => notices.filter((notice) => isVisibleCandidate(notice)),
    [notices],
  );

  const summaryCounts = useMemo(() => countSummaryForCards(candidates), [candidates]);

  const filteredNotices = useMemo(() => {
    const query = searchQuery.trim();
    let pool = candidates;
    if (query) {
      pool = pool.filter((notice) => matchesSearch(notice, query));
    }
    const filtered = pool.filter(
      (notice) =>
        matchesProduct(notice, selectedProduct) &&
        matchesTerritoryStatus(notice, territoryFilter) &&
        (!showSavedOnly || savedIds.includes(notice.id)),
    );
    return sortNoticesByState(filtered, sortState);
  }, [
    candidates,
    searchQuery,
    selectedProduct,
    territoryFilter,
    showSavedOnly,
    savedIds,
    sortState,
  ]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const matchesExceptSearch = useMemo(
    () =>
      candidates.filter(
        (notice) =>
          matchesProduct(notice, selectedProduct) &&
          matchesTerritoryStatus(notice, territoryFilter) &&
          (!showSavedOnly || savedIds.includes(notice.id)),
      ),
    [candidates, selectedProduct, territoryFilter, showSavedOnly, savedIds],
  );

  /**
   * "담당본부 없음" 건수 — territoryFilter 와는 무관하게, 현재 검색/제품/관심 필터 결과 안에서
   * 본부 매칭이 비어있는 공고가 몇 건인지 보여준다. 클릭하면 곧장 "담당본부 없음" 필터로 토글.
   * 이 값은 사용자가 필터를 바꿔도 다른 카운트와 분리되어 보이도록 해당 필터를 빼고 계산한다.
   */
  const withoutTerritoryCount = useMemo(() => {
    const query = searchQuery.trim();
    return candidates.reduce((acc, notice) => {
      if (query && !matchesSearch(notice, query)) return acc;
      if (!matchesProduct(notice, selectedProduct)) return acc;
      if (showSavedOnly && !savedIds.includes(notice.id)) return acc;
      return acc + (isWithoutTerritory(notice) ? 1 : 0);
    }, 0);
  }, [candidates, searchQuery, selectedProduct, showSavedOnly, savedIds]);

  const handleToggleSave = (id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((savedId) => savedId !== id) : [...prev, id],
    );
  };

  const handleRefresh = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  /**
   * "지금 수집" 버튼.
   *  1) /api/collect-now POST 호출.
   *  2) 응답 ok 면 신규/업데이트/조회 건수를 사용자에게 안내.
   *  3) loggedToDb=false 면 DB 로그 실패 사유를 별도로 노출 — 화면의 "최근 수집" 카드가
   *     갱신되지 않는 이유가 사용자에게 보이도록.
   *  4) 성공/실패 무관하게 끝나면 공고 목록과 최근 수집 카드를 다시 읽어온다.
   */
  const handleManualCollect = async () => {
    if (manualStatus === "running") return;
    setManualStatus("running");
    setManualMessage("수집 중입니다… 60초 정도 걸릴 수 있어요.");

    type ManualResp = {
      ok: boolean;
      error?: string;
      message?: string | null;
      insertedCount?: number;
      updatedCount?: number;
      fetchedCount?: number;
      matchedCount?: number;
      activeProductMatchedCount?: number;
      errors?: string[];
      warnings?: string[];
      loggedToDb?: boolean;
      dbLogError?: string | null;
    };

    let resp: ManualResp | null = null;
    let httpStatus = 0;
    try {
      const res = await fetch("/api/collect-now", { method: "POST" });
      httpStatus = res.status;
      resp = (await res.json()) as ManualResp;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setManualStatus("error");
      setManualMessage(`수집 실패: 네트워크 오류 (${reason})`);
      return;
    }

    // 어쨌든 끝났으니 화면 데이터는 다시 읽어온다. (DB 로그가 안 남았더라도 notices 는 갱신됐을 수 있음)
    await Promise.all([loadNotices(), loadLastRun()]);

    if (!resp) {
      setManualStatus("error");
      setManualMessage("수집 실패: 응답을 해석하지 못했습니다.");
      return;
    }

    if (!resp.ok) {
      // runCollect 내부 에러 (G2B / Supabase / 환경변수 등)
      const reason = resp.error ?? resp.errors?.[0] ?? `HTTP ${httpStatus}`;
      setManualStatus("error");
      setManualMessage(`수집 실패: ${reason}`);
      return;
    }

    const inserted = resp.insertedCount ?? 0;
    const updated = resp.updatedCount ?? 0;
    const fetched = resp.fetchedCount ?? 0;
    const matched = resp.matchedCount ?? 0;
    const parts = [
      `신규 ${inserted.toLocaleString("ko-KR")}건`,
      `업데이트 ${updated.toLocaleString("ko-KR")}건`,
      `조회 ${fetched.toLocaleString("ko-KR")}건`,
      `매칭 ${matched.toLocaleString("ko-KR")}건`,
    ];

    if (resp.loggedToDb === false) {
      // 수집 자체는 성공했지만 collection_runs 가 갱신되지 않은 케이스.
      // → 화면의 "최근 수집" 카드는 갱신되지 않는다. 사용자에게 명확히 알린다.
      setManualStatus("error");
      setManualMessage(
        `수집은 완료됐지만 DB 로그 기록 실패: ${parts.join(" / ")} · 사유: ${resp.dbLogError ?? "(unknown)"}`,
      );
      return;
    }

    setManualStatus("success");
    setManualMessage(`수집 완료: ${parts.join(" / ")}`);

    // 일부 환경에서 Supabase 의 read replica 가 약간 지연될 수 있어, 1초 후 한 번 더 lastRun 을 갱신한다.
    setTimeout(() => {
      void loadLastRun();
    }, 1500);
  };

  const handleSortChange = (column: SortColumn) => {
    setSortState((prev) => toggleSortState(prev, column));
  };

  if (isLoading) {
    // 첫 로딩 시 Header 까지 포함해 전체 영역을 스켈레톤으로 처리한다.
    // 데이터가 없는 동안 빈 Header(0/0건) 가 잠깐 보이는 것을 막아 체감 속도를 개선.
    return (
      <div className="min-h-full">
        <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
          <DashboardLoading />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
        <Header totalCount={candidates.length} filteredCount={filteredNotices.length} />

        {dataSource === "sample" && errorMessage && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p className="font-semibold">
              Supabase 연결에 실패해 샘플 데이터를 표시하고 있습니다.
            </p>
            <p className="mt-1 break-all rounded-md bg-white/80 px-2 py-1 font-mono text-[11px] leading-relaxed text-rose-900 dark:bg-slate-900/60 dark:text-rose-200">
              {errorMessage}
            </p>
          </div>
        )}

        <LastCollectionRunCard
          run={lastRun}
          error={lastRunError}
          isLoading={isLastRunLoading}
        />

        <SummaryCards {...summaryCounts} />

        {/*
          검색/관심/제품 필터/매칭 상태 필터/디버그 토글/새로고침은 PC 에서 한 줄, 좁은 화면에서 두 줄로 배치한다.
          정렬은 PC 테이블 헤더에서 처리하므로 이 영역에서는 select 를 두지 않는다.
        */}
        <section className="mb-5 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
            <div className="min-w-0 flex-1 lg:max-w-md">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSavedOnly((prev) => !prev)}
                aria-pressed={showSavedOnly}
                className={`inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition sm:text-sm ${
                  showSavedOnly
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
                }`}
              >
                {showSavedOnly ? "★ 관심만 (켜짐)" : "☆ 관심만"}
              </button>

              <span aria-hidden className="hidden h-6 w-px bg-slate-200 dark:bg-white/10 lg:inline-block" />

              <ProductFilter selected={selectedProduct} onChange={setSelectedProduct} />

              {/* 담당본부 매칭 여부 드롭다운 */}
              <label className="relative inline-flex items-center">
                <span className="sr-only">담당본부 매칭 여부</span>
                <select
                  value={territoryFilter}
                  onChange={(event) =>
                    setTerritoryFilter(event.target.value as TerritoryStatusFilter)
                  }
                  title="기관/고객사 → 담당본부(테리토리) 매칭 상태로 필터"
                  className="h-9 cursor-pointer appearance-none whitespace-nowrap rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/30 sm:text-sm"
                >
                  <option value="all">담당본부 매칭 · 전체 보기</option>
                  <option value="withTerritory">담당본부 있음</option>
                  <option value="withoutTerritory">담당본부 없음</option>
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 text-[10px] text-slate-400 dark:text-slate-500"
                >
                  ▼
                </span>
              </label>

              {/*
                담당본부 없음 건수 chip — 한 번 클릭으로 "담당본부 없음" 필터를 토글한다.
                현재 territoryFilter 가 이미 "withoutTerritory" 면 강조 색으로 표시.
              */}
              <button
                type="button"
                onClick={() =>
                  setTerritoryFilter(
                    territoryFilter === "withoutTerritory" ? "all" : "withoutTerritory",
                  )
                }
                aria-pressed={territoryFilter === "withoutTerritory"}
                title="담당본부가 비어있거나 미매칭인 공고만 빠르게 필터링"
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:text-sm ${
                  territoryFilter === "withoutTerritory"
                    ? "bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
                    : withoutTerritoryCount > 0
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30 dark:hover:bg-rose-500/25"
                      : "bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-white/10"
                }`}
              >
                본부 미매칭
                <span className="tabular-nums">{withoutTerritoryCount}건</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMatchSource((prev) => !prev)}
                aria-pressed={showMatchSource}
                title="매칭근거(exact / alias / contains / fuzzy / unmatched) 컬럼을 표시합니다."
                className={`inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:text-sm ${
                  showMatchSource
                    ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
                }`}
              >
                {showMatchSource ? "매칭근거 ON" : "매칭근거"}
              </button>

              <button
                type="button"
                onClick={handleManualCollect}
                disabled={manualStatus === "running"}
                title="나라장터에서 새 공고를 다시 수집합니다."
                className={`inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:text-sm ${
                  manualStatus === "running"
                    ? "cursor-not-allowed bg-blue-200 text-blue-700 dark:bg-blue-500/30 dark:text-blue-200"
                    : "bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                }`}
              >
                {manualStatus === "running" ? "⏳ 수집 중…" : "지금 수집"}
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                title="DB에 저장된 공고 목록을 다시 불러옵니다. 나라장터에서 새로 수집하지는 않습니다."
                className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-3 text-xs font-semibold text-blue-600 ring-1 ring-blue-200 transition hover:bg-blue-50 dark:bg-slate-900/60 dark:text-blue-300 dark:ring-blue-400/30 dark:hover:bg-slate-800 sm:text-sm"
              >
                ⟳ 화면 새로고침
              </button>
            </div>
          </div>

          {manualMessage && (
            <p
              className={`mt-2 text-[11px] ${
                manualStatus === "error"
                  ? "text-rose-700 dark:text-rose-300"
                  : manualStatus === "success"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-blue-700 dark:text-blue-300"
              }`}
              role="status"
            >
              {manualMessage}
            </p>
          )}

          {showSavedOnly && savedIds.length === 0 && (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              저장한 관심 공고가 없습니다.
            </p>
          )}

          {/*
            모바일에서는 PC 처럼 헤더 클릭 정렬이 없으므로 현재 정렬 상태 표시(읽기 전용).
            기본은 "추천 높은순" 이며 모바일에서 다른 정렬로 바꿀 수단은 두지 않는다.
          */}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 md:hidden">
            정렬: 추천 등급 높은순
          </p>
        </section>

        {/* 모바일: 기존 카드 UI */}
        <section className="space-y-4 sm:space-y-5 md:hidden">
          {filteredNotices.length > 0 ? (
            filteredNotices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                isSaved={savedIds.includes(notice.id)}
                onToggleSave={handleToggleSave}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                검색 결과가 없습니다
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {showSavedOnly
                  ? "관심 저장한 공고가 없거나 필터 조건에 맞지 않습니다."
                  : hasActiveSearch && matchesExceptSearch.length > 0
                    ? "현재 진행 중 공고 중 해당 키워드가 없습니다."
                    : "검색어나 제품 필터를 변경해 다시 시도해 보세요."}
              </p>
            </div>
          )}
        </section>

        {/* PC/노트북: 테이블 UI (헤더 클릭으로 정렬) */}
        <section className="hidden md:block">
          <NoticeTable
            notices={filteredNotices}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
            sortState={sortState}
            onSortChange={handleSortChange}
            showMatchSource={showMatchSource}
          />
        </section>

        <p className="mt-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {dataSource === "supabase" ? "Supabase · 나라장터 연동" : "샘플 데이터 기반 MVP"}
        </p>
      </main>
    </div>
  );
}

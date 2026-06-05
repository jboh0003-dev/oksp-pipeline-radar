"use client";

import { useEffect, useMemo, useState } from "react";
import BudgetTable from "@/components/BudgetTable";
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
import { parseBudgetAmount } from "@/lib/budget";
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

/** 화면 상단 탭. "공고" 는 기본 테이블/카드, "예산" 은 예산 전용 테이블. */
type ViewTab = "notices" | "budget";

/** "본부 매칭 여부" 드롭다운 값. */
type MatchStatusFilter = "all" | "matched" | "unmatched";

function countSummaryForCards(notices: DisplayNotice[]): DashboardSummaryCounts {
  const counts: DashboardSummaryCounts = {
    activeTotal: 0,
    contrabass: 0,
    viola: 0,
    totalBudgetWon: 0,
  };

  for (const notice of notices) {
    counts.activeTotal += 1;
    if (notice.relatedProducts.some((p) => CONTRABASS_FAMILY_SET.has(p))) {
      counts.contrabass += 1;
    }
    if (notice.relatedProducts.includes("VIOLA")) {
      counts.viola += 1;
    }
    const amount = parseBudgetAmount(notice.budget);
    if (amount && amount > 0) counts.totalBudgetWon += amount;
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
 * 본부 매칭 상태 필터.
 *  - "all"       : 전부 표시
 *  - "matched"   : 담당본부(테리토리) 가 채워진 공고만
 *  - "unmatched" : 담당본부가 비어있는 공고만 (고객사 매칭 자체가 실패한 케이스도 포함)
 */
function matchesMatchStatus(
  notice: DisplayNotice,
  status: MatchStatusFilter,
): boolean {
  if (status === "all") return true;
  const territory = notice.customer?.territory?.trim() ?? "";
  if (status === "matched") return territory.length > 0;
  return territory.length === 0;
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
  const [matchStatusFilter, setMatchStatusFilter] = useState<MatchStatusFilter>("all");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [budgetSortState, setBudgetSortState] = useState<SortState>({
    column: "budget",
    direction: "desc",
  });
  const [showMatchSource, setShowMatchSource] = useState(false);
  const [view, setView] = useState<ViewTab>("notices");
  const [lastRun, setLastRun] = useState<CollectionRunRow | null>(null);
  const [lastRunError, setLastRunError] = useState<string | null>(null);
  const [isLastRunLoading, setIsLastRunLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadNotices() {
      setIsLoading(true);
      const result = await fetchNotices();
      if (!isMounted) return;
      const withRaw = await attachRawData(result.notices, result.source);
      if (!isMounted) return;
      setNotices(withRaw);
      setDataSource(result.source);
      setErrorMessage(result.error);
      setIsLoading(false);
    }

    async function loadLastRun() {
      setIsLastRunLoading(true);
      const { run, error } = await fetchLastCollectionRun();
      if (!isMounted) return;
      setLastRun(run);
      setLastRunError(error);
      setIsLastRunLoading(false);
    }

    void loadNotices();
    void loadLastRun();

    return () => {
      isMounted = false;
    };
  }, []);

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
        matchesMatchStatus(notice, matchStatusFilter) &&
        (!showSavedOnly || savedIds.includes(notice.id)),
    );
    return sortNoticesByState(filtered, sortState);
  }, [
    candidates,
    searchQuery,
    selectedProduct,
    matchStatusFilter,
    showSavedOnly,
    savedIds,
    sortState,
  ]);

  /**
   * 예산 탭에서 표시할 공고 목록.
   *  - 공고 탭과 동일한 필터(검색/제품/매칭상태/관심)를 그대로 적용한다.
   *  - 정렬은 별도의 budgetSortState 로 관리하며 기본값은 예산 내림차순.
   *  - 예산이 없는 공고는 budget 정렬 시 noticeSorting 의 isEmptyForColumn 처리에 의해 자동으로 맨 뒤.
   */
  const filteredBudgetNotices = useMemo(() => {
    const query = searchQuery.trim();
    let pool = candidates;
    if (query) {
      pool = pool.filter((notice) => matchesSearch(notice, query));
    }
    const filtered = pool.filter(
      (notice) =>
        matchesProduct(notice, selectedProduct) &&
        matchesMatchStatus(notice, matchStatusFilter) &&
        (!showSavedOnly || savedIds.includes(notice.id)),
    );
    return sortNoticesByState(filtered, budgetSortState);
  }, [
    candidates,
    searchQuery,
    selectedProduct,
    matchStatusFilter,
    showSavedOnly,
    savedIds,
    budgetSortState,
  ]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const matchesExceptSearch = useMemo(
    () =>
      candidates.filter(
        (notice) =>
          matchesProduct(notice, selectedProduct) &&
          matchesMatchStatus(notice, matchStatusFilter) &&
          (!showSavedOnly || savedIds.includes(notice.id)),
      ),
    [candidates, selectedProduct, matchStatusFilter, showSavedOnly, savedIds],
  );

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

  const handleSortChange = (column: SortColumn) => {
    setSortState((prev) => toggleSortState(prev, column));
  };

  const handleBudgetSortChange = (column: SortColumn) => {
    setBudgetSortState((prev) => toggleSortState(prev, column));
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

        {/* 탭: 공고 / 예산.
            예산 탭은 예산 정렬·표시에 특화된 BudgetTable 을 보여준다.
            모바일에서도 탭 자체는 노출하되, 예산 탭에서도 동일하게 BudgetTable 가로 스크롤 형태로 표시. */}
        <div className="mb-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:w-fit">
          <ViewTabButton
            active={view === "notices"}
            onClick={() => setView("notices")}
            label="공고"
          />
          <ViewTabButton
            active={view === "budget"}
            onClick={() => setView("budget")}
            label="예산"
          />
        </div>

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

              {/* 본부 매칭 여부 드롭다운 */}
              <label className="relative inline-flex items-center">
                <span className="sr-only">매칭 상태</span>
                <select
                  value={matchStatusFilter}
                  onChange={(event) =>
                    setMatchStatusFilter(event.target.value as MatchStatusFilter)
                  }
                  title="기관/고객사 → 담당본부 매칭 상태로 필터"
                  className="h-9 cursor-pointer appearance-none whitespace-nowrap rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/30 sm:text-sm"
                >
                  <option value="all">매칭 상태 · 전체</option>
                  <option value="matched">본부 매칭 완료</option>
                  <option value="unmatched">본부 매칭 안 됨</option>
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 text-[10px] text-slate-400 dark:text-slate-500"
                >
                  ▼
                </span>
              </label>

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
                onClick={handleRefresh}
                title="화면 새로고침"
                className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-3 text-xs font-semibold text-blue-600 ring-1 ring-blue-200 transition hover:bg-blue-50 dark:bg-slate-900/60 dark:text-blue-300 dark:ring-blue-400/30 dark:hover:bg-slate-800 sm:text-sm"
              >
                ⟳ 새로고침
              </button>
            </div>
          </div>

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
            정렬: {view === "budget" ? "예산 큰 금액 순" : "추천 등급 높은순"}
          </p>
        </section>

        {view === "budget" ? (
          <section>
            <BudgetTable
              notices={filteredBudgetNotices}
              sortState={budgetSortState}
              onSortChange={handleBudgetSortChange}
            />
            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
              예산 합계와 카드 통계는 화면 상단 요약 영역의 “예산 합계” 카드에서 확인할 수 있습니다.
              예산이 “미공개” 또는 “정보 없음” 인 공고는 정렬 시 항상 마지막에 표시됩니다.
            </p>
          </section>
        ) : (
          <>
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
          </>
        )}

        <p className="mt-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {dataSource === "supabase" ? "Supabase · 나라장터 연동" : "샘플 데이터 기반 MVP"}
        </p>
      </main>
    </div>
  );
}

function ViewTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-w-[64px] items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

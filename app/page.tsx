"use client";

import { useEffect, useMemo, useState } from "react";
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
  getDueStatus,
  hasRealProductMatch,
  isMissingDueDate,
  isTestNoticeUrl,
  type DashboardSummaryCounts,
} from "@/lib/noticeVisibility";
import { getSupabaseClient, type CollectionRunRow } from "@/lib/supabase";

const CONTRABASS_FAMILY_SET = new Set<string>(CONTRABASS_FAMILY);

type SortOption =
  | "fit_desc"
  | "fit_asc"
  | "notice_desc"
  | "due_asc"
  | "due_desc";

const SORT_OPTIONS: Array<{ id: SortOption; label: string }> = [
  { id: "fit_desc", label: "적합도 높은순" },
  { id: "fit_asc", label: "적합도 낮은순" },
  { id: "notice_desc", label: "게시일 최신순" },
  { id: "due_asc", label: "마감일 가까운순" },
  { id: "due_desc", label: "마감일 먼순" },
];

function deadlineSortKey(deadline: string): string {
  if (isMissingDueDate(deadline)) return "";
  return deadline.includes("T") ? deadline.slice(0, 10) : deadline;
}

function noticeDateSortKey(noticeDate: string | null | undefined): string {
  if (!noticeDate) return "";
  const trimmed = noticeDate.trim();
  if (!trimmed) return "";
  return trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
}

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

function partitionByDateKey(
  notices: DisplayNotice[],
  getKey: (notice: DisplayNotice) => string,
): { withKey: DisplayNotice[]; withoutKey: DisplayNotice[] } {
  const withKey: DisplayNotice[] = [];
  const withoutKey: DisplayNotice[] = [];
  for (const notice of notices) {
    if (getKey(notice)) withKey.push(notice);
    else withoutKey.push(notice);
  }
  return { withKey, withoutKey };
}

function sortNoticesByOption(
  notices: DisplayNotice[],
  option: SortOption,
): DisplayNotice[] {
  if (option === "fit_desc") {
    return [...notices].sort((a, b) => {
      if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
      const aKey = deadlineSortKey(a.deadline);
      const bKey = deadlineSortKey(b.deadline);
      if (!aKey && !bKey) return 0;
      if (!aKey) return 1;
      if (!bKey) return -1;
      return aKey.localeCompare(bKey);
    });
  }

  if (option === "fit_asc") {
    return [...notices].sort((a, b) => {
      if (a.fitScore !== b.fitScore) return a.fitScore - b.fitScore;
      const aKey = deadlineSortKey(a.deadline);
      const bKey = deadlineSortKey(b.deadline);
      if (!aKey && !bKey) return 0;
      if (!aKey) return 1;
      if (!bKey) return -1;
      return aKey.localeCompare(bKey);
    });
  }

  if (option === "notice_desc") {
    const { withKey, withoutKey } = partitionByDateKey(notices, (n) =>
      noticeDateSortKey(n.noticeDate),
    );
    withKey.sort((a, b) => {
      const aKey = noticeDateSortKey(a.noticeDate);
      const bKey = noticeDateSortKey(b.noticeDate);
      const cmp = bKey.localeCompare(aKey);
      if (cmp !== 0) return cmp;
      return b.fitScore - a.fitScore;
    });
    return [...withKey, ...withoutKey];
  }

  if (option === "due_asc") {
    const { withKey, withoutKey } = partitionByDateKey(notices, (n) => deadlineSortKey(n.deadline));
    withKey.sort((a, b) => {
      const aKey = deadlineSortKey(a.deadline);
      const bKey = deadlineSortKey(b.deadline);
      const cmp = aKey.localeCompare(bKey);
      if (cmp !== 0) return cmp;
      return b.fitScore - a.fitScore;
    });
    return [...withKey, ...withoutKey];
  }

  // due_desc
  const { withKey, withoutKey } = partitionByDateKey(notices, (n) => deadlineSortKey(n.deadline));
  withKey.sort((a, b) => {
    const aKey = deadlineSortKey(a.deadline);
    const bKey = deadlineSortKey(b.deadline);
    const cmp = bKey.localeCompare(aKey);
    if (cmp !== 0) return cmp;
    return b.fitScore - a.fitScore;
  });
  return [...withKey, ...withoutKey];
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
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("fit_desc");
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
        (!showSavedOnly || savedIds.includes(notice.id)),
    );
    return sortNoticesByOption(filtered, sortOption);
  }, [candidates, searchQuery, selectedProduct, showSavedOnly, savedIds, sortOption]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const matchesExceptSearch = useMemo(
    () =>
      candidates.filter(
        (notice) =>
          matchesProduct(notice, selectedProduct) &&
          (!showSavedOnly || savedIds.includes(notice.id)),
      ),
    [candidates, selectedProduct, showSavedOnly, savedIds],
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

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-[#0b1120]">
        <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5 md:max-w-[1800px] md:px-6">
          <Header totalCount={0} filteredCount={0} />
          <DashboardLoading />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#0b1120]">
      <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5 md:max-w-[1800px] md:px-6">
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
          검색/정렬/관심/제품 필터를 한 줄(혹은 좁은 화면에서 두 줄)에 배치하여
          공고 테이블이 더 위로 올라오게 한다.
        */}
        <section className="mb-4 min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm sm:px-4 sm:py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
            <div className="min-w-0 flex-1 lg:max-w-md">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="notice-sort" className="sr-only">
                정렬
              </label>
              <select
                id="notice-sort"
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20 sm:text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowSavedOnly((prev) => !prev)}
                aria-pressed={showSavedOnly}
                className={`inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:text-sm ${
                  showSavedOnly
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
                }`}
              >
                {showSavedOnly ? "★ 관심만 (켜짐)" : "☆ 관심만"}
              </button>

              <span aria-hidden className="hidden h-5 w-px bg-slate-200 dark:bg-white/10 lg:inline-block" />

              <ProductFilter selected={selectedProduct} onChange={setSelectedProduct} />

              <button
                type="button"
                onClick={handleRefresh}
                title="화면 새로고침"
                className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-2.5 text-xs font-semibold text-blue-600 ring-1 ring-blue-200 transition hover:bg-blue-50 dark:bg-slate-900/60 dark:text-blue-300 dark:ring-blue-400/30 dark:hover:bg-slate-800"
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

        {/* PC/노트북: 테이블 UI */}
        <section className="hidden md:block">
          <NoticeTable
            notices={filteredNotices}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
          />
        </section>

        <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {dataSource === "supabase" ? "Supabase · 나라장터 연동" : "샘플 데이터 기반 MVP"}
        </p>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLoading from "@/components/DashboardLoading";
import Header from "@/components/Header";
import NoticeCard from "@/components/NoticeCard";
import ProductFilter from "@/components/ProductFilter";
import SearchBar from "@/components/SearchBar";
import SummaryCards from "@/components/SummaryCards";
import {
  type Notice,
  type ProductFilter as ProductFilterValue,
} from "@/data/sampleNotices";
import { fetchNotices, type NoticeDataSource } from "@/lib/fetchNotices";
import { getMatchGrade } from "@/lib/noticeGrades";
import {
  countByGrade,
  isNoticeVisible,
  sortNoticesForDisplay,
} from "@/lib/noticeVisibility";
import { getSupabaseClient } from "@/lib/supabase";

type DisplayNotice = Notice & { rawData?: string };

const EXCLUDE_DISPLAY_KEYWORDS = [
  "체험학습",
  "현장학습",
  "수학여행",
  "항공권",
  "버스 임차",
  "차량 임차",
  "급식",
  "청소",
  "의류",
] as const;

const STRONG_TECH_RESCUE_KEYWORDS = [
  "AI",
  "인공지능",
  "GPU",
  "LLM",
  "MLOps",
  "생성형 AI",
  "AI 인프라",
  "클라우드",
  "가상화",
  "서버 가상화",
  "서버",
  "인프라",
  "OpenStack",
  "HCI",
  "VMware",
] as const;

const CONCERTO_STRONG_KEYWORDS = [
  "AI",
  "인공지능",
  "GPU",
  "LLM",
  "머신러닝",
  "딥러닝",
  "생성형",
  "챗봇",
  "NLP",
  "음성인식",
  "영상분석",
] as const;

function containsSearchTerm(text: string, term: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  if (lowerTerm === "ai") {
    return /(?:^|[^a-z0-9])ai(?:[^a-z0-9]|$)/i.test(text);
  }
  return lowerText.includes(lowerTerm);
}

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

function isConcertoLearningOnly(notice: DisplayNotice): boolean {
  const hasConcerto = notice.relatedProducts.some((p) => p === "CONCERTO AI");
  if (!hasConcerto) {
    return false;
  }
  const haystack = buildNoticeHaystack(notice);
  if (CONCERTO_STRONG_KEYWORDS.some((kw) => containsSearchTerm(haystack, kw))) {
    return false;
  }
  return (
    containsSearchTerm(haystack, "학습") &&
    !STRONG_TECH_RESCUE_KEYWORDS.some((kw) => containsSearchTerm(haystack, kw))
  );
}

function shouldShowOnDashboard(notice: DisplayNotice): boolean {
  if (!isNoticeVisible(notice)) {
    return false;
  }
  if (notice.fitScore < 20) {
    return false;
  }
  if (isConcertoLearningOnly(notice)) {
    return false;
  }

  const haystack = buildNoticeHaystack(notice);
  const hasExclude = EXCLUDE_DISPLAY_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
  const hasStrongTech = STRONG_TECH_RESCUE_KEYWORDS.some((kw) =>
    containsSearchTerm(haystack, kw),
  );

  if (hasExclude && !hasStrongTech) {
    return false;
  }

  return true;
}

function isSearchableCandidate(notice: DisplayNotice): boolean {
  if (!isNoticeVisible(notice) || notice.fitScore < 20) {
    return false;
  }
  if (isConcertoLearningOnly(notice)) {
    return false;
  }
  return true;
}

function matchesSearch(notice: DisplayNotice, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return buildNoticeHaystack(notice).includes(normalized);
}

function matchesProduct(notice: DisplayNotice, product: ProductFilterValue) {
  if (product === "전체") return true;
  return notice.relatedProducts.includes(product);
}

function normalizeNotice(notice: Notice): DisplayNotice {
  return {
    ...notice,
    matchGrade: getMatchGrade(notice.fitScore),
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
    .eq("status", "open");

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

    void loadNotices();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const handleSyncG2b = async () => {
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const response = await fetch("/api/sync-g2b", { method: "POST" });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        savedCount?: number;
        fetchedCount?: number;
        uniqueFetchedCount?: number;
        matchedCount?: number;
        recommendedCount?: number;
        reviewCount?: number;
        watchCount?: number;
        expiredSkippedCount?: number;
        errors?: string[];
      };

      if (!response.ok || !result.ok) {
        const detail = result.errors?.length ? result.errors.join(" / ") : result.message;
        setSyncMessage(detail ?? "나라장터 공고 수집에 실패했습니다.");
        return;
      }

      const parts = [
        result.message,
        result.fetchedCount != null ? `수집 ${result.fetchedCount}건` : null,
        result.uniqueFetchedCount != null ? `고유 ${result.uniqueFetchedCount}건` : null,
        result.matchedCount != null ? `후보 ${result.matchedCount}건` : null,
        result.recommendedCount != null
          ? `추천 ${result.recommendedCount} · 검토 ${result.reviewCount ?? 0} · 관찰 ${result.watchCount ?? 0}`
          : null,
        result.expiredSkippedCount != null && result.expiredSkippedCount > 0
          ? `마감 제외 ${result.expiredSkippedCount}건`
          : null,
      ].filter(Boolean);

      setSyncMessage(parts.join(" · "));
      setReloadKey((prev) => prev + 1);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "나라장터 공고 수집에 실패했습니다.");
    } finally {
      setIsSyncing(false);
    }
  };

  const visibleNotices = useMemo(
    () => notices.filter((notice) => shouldShowOnDashboard(notice)),
    [notices],
  );

  const filteredNotices = useMemo(() => {
    const query = searchQuery.trim();
    const basePool = query
      ? notices.filter((notice) => isSearchableCandidate(notice) && matchesSearch(notice, query))
      : visibleNotices;

    const filtered = basePool.filter(
      (notice) =>
        matchesProduct(notice, selectedProduct) &&
        (!showSavedOnly || savedIds.includes(notice.id)),
    );
    return sortNoticesForDisplay(filtered);
  }, [notices, visibleNotices, searchQuery, selectedProduct, showSavedOnly, savedIds]);

  const gradeCounts = useMemo(() => countByGrade(filteredNotices), [filteredNotices]);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const matchesExceptSearch = useMemo(
    () =>
      notices
        .filter((notice) => isSearchableCandidate(notice))
        .filter(
          (notice) =>
            matchesProduct(notice, selectedProduct) &&
            (!showSavedOnly || savedIds.includes(notice.id)),
        ),
    [notices, selectedProduct, showSavedOnly, savedIds],
  );

  const handleToggleSave = (id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((savedId) => savedId !== id) : [...prev, id],
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-full bg-[#F2F4F6]">
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <Header totalCount={0} filteredCount={0} />
          <DashboardLoading />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F2F4F6]">
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Header totalCount={visibleNotices.length} filteredCount={filteredNotices.length} />

        <div className="mb-4">
          <button
            type="button"
            onClick={() => void handleSyncG2b()}
            disabled={isSyncing || isLoading}
            className="rounded-xl bg-[#3182F6] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1B64DA] disabled:cursor-not-allowed disabled:bg-[#ADB5BD]"
          >
            {isSyncing ? "수집 중..." : "나라장터 공고 수집"}
          </button>
          {syncMessage && <p className="mt-2 text-sm text-[#4E5968]">{syncMessage}</p>}
        </div>

        {dataSource === "sample" && errorMessage && (
          <div className="mb-4 rounded-xl border border-[#FFD6D6] bg-[#FFF0F0] px-4 py-4 text-sm text-[#B42318]">
            <p className="font-semibold">Supabase 연결에 실패해 샘플 데이터를 표시하고 있습니다.</p>
            <p className="mt-2 text-xs font-medium text-[#912018]">오류 상세</p>
            <p className="mt-1 break-all rounded-lg bg-white/80 px-3 py-2 font-mono text-xs leading-relaxed text-[#912018]">
              {errorMessage}
            </p>
          </div>
        )}

        <SummaryCards
          totalCount={filteredNotices.length}
          recommendedCount={gradeCounts.추천}
          reviewCount={gradeCounts.검토}
          watchCount={gradeCounts.관찰}
        />

        <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <button
              type="button"
              onClick={() => setShowSavedOnly((prev) => !prev)}
              aria-pressed={showSavedOnly}
              className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                showSavedOnly
                  ? "bg-[#3182F6] text-white shadow-sm"
                  : "bg-[#F2F4F6] text-[#4E5968] ring-1 ring-[#E5E8EB] hover:bg-[#E5E8EB]"
              }`}
            >
              {showSavedOnly ? "관심 공고만 보기 (켜짐)" : "관심 공고만 보기"}
            </button>
            {showSavedOnly && savedIds.length === 0 && (
              <p className="text-xs text-[#8B95A1]">저장한 관심 공고가 없습니다.</p>
            )}
          </div>
          <div className="mt-5 min-w-0">
            <ProductFilter selected={selectedProduct} onChange={setSelectedProduct} />
          </div>
        </section>

        <section className="mt-6 space-y-5 sm:space-y-6">
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
            <div className="rounded-2xl border border-dashed border-[#D1D6DB] bg-white px-6 py-14 text-center">
              <p className="text-base font-semibold text-[#191F28]">검색 결과가 없습니다</p>
              <p className="mt-2 text-sm text-[#6B7684]">
                {showSavedOnly
                  ? "관심 저장한 공고가 없거나 필터 조건에 맞지 않습니다."
                  : hasActiveSearch && matchesExceptSearch.length > 0
                    ? "저장된 후보 공고 중 해당 키워드가 없습니다. 수집 범위 또는 매칭 키워드 확인이 필요합니다."
                    : "검색어나 제품 필터를 변경해 다시 시도해 보세요."}
              </p>
            </div>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-[#8B95A1]">
          {dataSource === "supabase" ? "Supabase · 나라장터 연동" : "샘플 데이터 기반 MVP"}
        </p>
      </main>
    </div>
  );
}

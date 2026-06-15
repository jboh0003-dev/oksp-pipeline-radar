"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BudgetFilter, {
  matchesBudgetFilter,
  type BudgetFilterValue,
} from "@/components/BudgetFilter";
import CollectionDiagnosticsPanel from "@/components/CollectionDiagnosticsPanel";
import CollectionErrorPanel from "@/components/CollectionErrorPanel";
import DashboardLoading from "@/components/DashboardLoading";
import { clearBidLocalCache } from "@/lib/cacheReset";
import Header from "@/components/Header";
import LastCollectionRunCard from "@/components/LastCollectionRunCard";
import { useAuth } from "@/lib/auth";
import NoticeCard from "@/components/NoticeCard";
import NoticeTable from "@/components/NoticeTable";
import ProductFilter from "@/components/ProductFilter";
import SearchBar from "@/components/SearchBar";
import SummaryCards from "@/components/SummaryCards";
import { parseBudgetAmount } from "@/lib/budget";
import {
  makeCollectionError,
  type CollectionError,
} from "@/lib/collectionErrors";
import {
  CONTRABASS_FAMILY,
  type Notice,
  type ProductFilter as ProductFilterValue,
} from "@/data/sampleNotices";
import {
  dedupeByAnnouncementKey,
  getAnnouncementKey,
} from "@/lib/announcementKey";
import {
  fetchLastCollectionRun,
  fetchLastSuccessfulRun,
} from "@/lib/fetchLastCollectionRun";
import { fetchNotices, type NoticeDataSource } from "@/lib/fetchNotices";
import {
  loadNoticesCache,
  saveNoticesCache,
} from "@/lib/noticeCache";
import {
  buildFeedbackMap,
  loadAllFeedbacks,
  type AnnouncementFeedback,
} from "@/lib/feedback";
import FeedbackModal from "@/components/FeedbackModal";
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
import { getPrimaryProduct, type PrimaryProduct } from "@/lib/primaryProduct";
import {
  isKeyNewInScope,
  loadNewMap,
  markNewItemsBySnapshot,
  resetNewSnapshot,
  type NewMap,
} from "@/lib/newState";
import { getSupabaseClient, type CollectionRunRow } from "@/lib/supabase";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const CONTRABASS_FAMILY_SET = new Set<string>(CONTRABASS_FAMILY);

/**
 * 담당본부 필터 값.
 *
 *  - "all"            : 전체
 *  - MISSING_VALUE    : 미매칭 (담당본부가 비어있거나 sentinel)
 *  - 그 외 임의 문자열 : 해당 본부값과 정확히 일치하는 공고만
 *
 * 옵션은 현재 공고들의 customer.territory 에서 자동 추출하며, "미매칭" 은 항상 마지막에 포함된다.
 */
const MISSING_TERRITORY_VALUE = "__missing__";
type TerritoryFilter = string; // "all" | "__missing__" | actual territory string

/**
 * 화면 카드(상단 요약) 카운트 — 회의 피드백 (VIOLA 11→6 으로 줄던 문제) 반영.
 *
 *  - 진행 중 공고: announcementKey 로 dedup 한 unique 공고 수.
 *  - CONTRABASS / VIOLA: relatedProducts 에 해당 제품군이 한 번이라도 들어가면 +1
 *    ("관련 매칭 기준 · 중복 포함"). primaryProduct 한 개만 보면 두 제품이 모두 매칭된
 *    공고가 한쪽에서만 카운트되어 실제 매칭 건수보다 적게 보이는 부작용이 있어 변경.
 *  - 결과적으로 카드 합계가 전체보다 커질 수 있다 → SummaryCards 하단에 "관련 매칭 기준 ·
 *    중복 포함" 보조문구를 작게 표시해 사용자 혼동을 방지한다.
 */
function countSummaryForCards(notices: DisplayNotice[]): DashboardSummaryCounts {
  const counts: DashboardSummaryCounts = {
    activeTotal: 0,
    contrabass: 0,
    viola: 0,
  };

  const seenKeys = new Set<string>();
  for (const notice of notices) {
    const key = getAnnouncementKey(notice);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    counts.activeTotal += 1;
    const related = notice.relatedProducts ?? [];
    if (related.some((p) => CONTRABASS_FAMILY_SET.has(p))) counts.contrabass += 1;
    if (related.includes("VIOLA")) counts.viola += 1;
  }

  return counts;
}

type DisplayNotice = Notice & {
  rawData?: string;
  /** announcementKey 기반 신규 여부. 24h 안에 처음 본 공고이면 true. */
  isNew?: boolean;
  /** 카드 카운트와 "주제품" 표시에 쓰는 단일 제품 분류. */
  primaryProduct?: PrimaryProduct;
};

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
 * 화면에 노출할 수 있는 후보 공고인지 — 가장 기본적인 검사.
 *
 *  - 테스트 URL 제외.
 *  - 제품 매칭(CONTRABASS / VIOLA) 이 한 번이라도 잡힌 경우만 포함.
 *
 * 마감 여부는 여기서 검사하지 않는다 — visibleCandidates 단계에서 isOpenForReview 로 제외.
 */
function isVisibleCandidate(notice: DisplayNotice): boolean {
  if (isTestNoticeUrl(notice.sourceUrl)) return false;
  return hasRealProductMatch(notice);
}

/**
 * "진행 중(=마감 전 또는 마감일 미상)" 판단.
 *  - 기본 화면(테이블 / 카드 / 표출 카운트)은 항상 이 함수로 마감 공고를 제외한다.
 *  - "마감 포함" 토글은 더 이상 제공하지 않는다.
 *  - TODO(고급필터): 추후 필요 시 "마감 포함" 옵션을 별도 고급 필터 메뉴에서 다시 노출.
 */
function isOpenForReview(notice: DisplayNotice): boolean {
  const status = getDueStatus(notice.deadline);
  return status === "진행 중" || status === "마감일 확인 필요";
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
 * 담당본부 필터.
 *  - "all"               : 전부 표시
 *  - MISSING_TERRITORY_VALUE : 담당본부가 비어있거나 매칭되지 않은 공고만
 *  - 그 외 문자열         : 해당 담당본부와 정확히 일치하는 공고만
 *
 * 여기서 "매칭"은 제품 매칭이 아니라 기관/고객사 → 담당본부 매칭을 의미한다.
 */
function matchesTerritoryStatus(
  notice: DisplayNotice,
  filter: TerritoryFilter,
): boolean {
  if (filter === "all") return true;
  const empty = isWithoutTerritory(notice);
  if (filter === MISSING_TERRITORY_VALUE) return empty;
  if (empty) return false;
  const territory = notice.customer?.territory?.trim() ?? "";
  return territory === filter;
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

/**
 * announcementKey 기반 NewMap("이번 수집에서 새로 등장한 키") 을 받아 isNew 플래그를 부착.
 *
 * 정의: 이전 수집 snapshot 에는 없었지만 이번 수집 snapshot 에 새로 등장한 공고이며,
 *       등록 시각이 24시간 이내인 경우만 isNew=true.
 */
function applyNewFlags(notices: DisplayNotice[], newMap: NewMap): DisplayNotice[] {
  const now = Date.now();
  return notices.map((n) => ({
    ...n,
    isNew: isKeyNewInScope("bid", getAnnouncementKey(n), newMap, now),
  }));
}

export default function Home() {
  const [notices, setNotices] = useState<DisplayNotice[]>([]);
  const [dataSource, setDataSource] = useState<NoticeDataSource>("sample");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** 첫 페인트가 캐시에서 즉시 그려졌는지 — Header 우상단에 cache 배지로 표시. */
  const [fromCache, setFromCache] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  /** 키 입력마다 filteredNotices 재계산을 막기 위해 250ms debounce. */
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const [selectedProduct, setSelectedProduct] = useState<ProductFilterValue>("전체");
  const [territoryFilter, setTerritoryFilter] = useState<TerritoryFilter>("all");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilterValue>("all");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  /** "신규" 필터 — 켜면 이번 수집 snapshot 에서 새로 등장한 공고만 표시. */
  const [showNewOnly, setShowNewOnly] = useState(false);
  /*
   * 마감(deadline 지난) 공고는 항상 화면에서 제외한다.
   *  - 기본 테이블 / 전체 카드 / 제품 카드 / 표출 수 모두 진행 중 기준.
   *  - "마감 포함" 토글은 더 이상 제공하지 않는다.
   *  - TODO(고급필터): 추후 "마감 포함"이 필요한 케이스가 생기면 별도 고급 필터 메뉴로 추가.
   */
  /** 피드백 — 영업대표가 공고/키워드/본부 매칭에 대해 남기는 의견. localStorage 1차 저장. */
  const [feedbackList, setFeedbackList] = useState<AnnouncementFeedback[]>([]);
  /** 모달 대상 공고. null 이면 닫힌 상태. */
  const [feedbackTarget, setFeedbackTarget] = useState<DisplayNotice | null>(
    null,
  );
  /** "피드백 있음" 필터 — 사용자가 관리하는 의견이 있는 공고만 추리기. */
  const [showFeedbackOnly, setShowFeedbackOnly] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [lastRun, setLastRun] = useState<CollectionRunRow | null>(null);
  const [lastRunError, setLastRunError] = useState<string | null>(null);
  const [isLastRunLoading, setIsLastRunLoading] = useState(true);
  /**
   * 마지막 "성공" 수집 row.
   *  - lastRun.ok=true 이면 동일하지만, 마지막 시도가 실패면 더 과거의 성공 row 를 가리킨다.
   *  - 화면의 "데이터 신선도" / "업데이트 필요" 판정 기준이 되는 값.
   */
  const [lastSuccessRun, setLastSuccessRun] = useState<CollectionRunRow | null>(
    null,
  );

  const auth = useAuth();

  /**
   * 페이지네이션 — 페이지당 50/100/200/전체.
   *  - 0 == 전체. 매칭이 많아도 한 번에 다 그리지 않도록 기본은 50.
   *  - 검색/필터 변경 시 자동으로 1페이지로 리셋(아래 useEffect).
   */
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  /**
   * 수집 직후 짧게 띄우는 "신규 N건 추가됨" toast.
   * setTimeout 으로 4s 뒤 자동 dismiss.
   */
  const [collectToast, setCollectToast] = useState<string | null>(null);
  useEffect(() => {
    if (!collectToast) return;
    const id = window.setTimeout(() => setCollectToast(null), 4_000);
    return () => window.clearTimeout(id);
  }, [collectToast]);

  // 수동 수집("지금 수집") 상태.
  // - "idle"     : 클릭 전
  // - "running"  : /api/collect-now 호출 중
  // - "success"  : 가장 최근 수동 수집 완료. message 에 "신규 N건 / 업데이트 M건 / 조회 K건"
  // - "error"    : 실패. message 에 사유.
  type ManualCollectStatus = "idle" | "running" | "success" | "error";
  const [manualStatus, setManualStatus] = useState<ManualCollectStatus>("idle");
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  /**
   * 동시에 같은 fetchNotices 호출이 두 번 일어나는 것을 막는 mutex.
   * - React StrictMode 의 useEffect 2회 실행
   * - 사용자가 빠르게 새로고침 / 지금 수집 / 진입을 연쇄적으로 트리거하는 경우
   * 모두 여기서 흡수해 Supabase / 매칭 API 가 중복 호출되지 않도록 한다.
   */
  const fetchInFlightRef = useRef(false);

  /**
   * 공고 목록 갱신 — Supabase / 샘플에서 가져온 뒤
   *  1) negativeWeight 보정 + rawData 부착 (기존)
   *  2) primaryProduct 계산 (CONTRABASS / VIOLA 카드 카운트가 중복되지 않게)
   *  3) announcementKey 기준 dedup
   *  4) seenNotices 와 비교해 isNew 표시
   *  5) 결과를 localStorage 캐시(15분 TTL) 에 저장 — 다음 진입 시 즉시 표시.
   *
   * 반환값: 이번 갱신에서 "처음 본" 공고 수 — 수집 직후 toast 메시지에 사용.
   * 동시에 두 번 호출되면 두 번째 호출은 즉시 { newCount: 0 } 으로 무시한다.
   */
  const loadNotices = useCallback(async (): Promise<{ newCount: number }> => {
    if (fetchInFlightRef.current) {
      return { newCount: 0 };
    }
    fetchInFlightRef.current = true;
    try {
      const result = await fetchNotices();
      const withRaw = await attachRawData(result.notices, result.source);

      // primaryProduct 부착 + dedup (한 입찰의 같은 차수는 1건)
      const enriched: DisplayNotice[] = withRaw.map((n) => ({
        ...n,
        primaryProduct: getPrimaryProduct(n),
      }));
      const deduped = dedupeByAnnouncementKey(enriched);

      // snapshot diff — 이번 수집에 "새로 등장한" 키만 NEW 로 표시.
      // (어제 있던 공고가 오늘도 있으면 신규 아님)
      const keys = deduped.map((n) => getAnnouncementKey(n));
      const { newKeys, newMap } = markNewItemsBySnapshot("bid", keys);

      const flagged = applyNewFlags(deduped, newMap);
      setNotices(flagged);
      setDataSource(result.source);
      setErrorMessage(result.error);
      // 캐시 저장은 enrich 이전의 원본 Notice[] 만으로 충분하다 — primaryProduct/isNew 는 화면에서 다시 계산.
      saveNoticesCache(result.notices, result.source);
      // 백그라운드 fetch 가 끝났으니 이후로는 cache 표시를 끈다.
      setFromCache(false);
      return { newCount: newKeys.length };
    } finally {
      fetchInFlightRef.current = false;
    }
  }, []);

  const loadLastRun = useCallback(async () => {
    // last attempt + last success 를 병렬 조회. last success 가 stale 판정 기준이 된다.
    const [attempt, success] = await Promise.all([
      fetchLastCollectionRun(),
      fetchLastSuccessfulRun(),
    ]);
    setLastRun(attempt.run);
    setLastRunError(attempt.error);
    setLastSuccessRun(success.run);
  }, []);

  /**
   * 첫 진입 흐름 — 캐시가 있으면 즉시 화면에 보여주고, 백그라운드에서 최신 데이터를 받아온다.
   *  1) localStorage 에서 csg2b:notices 읽기 → 즉시 setNotices (skeleton 미표시)
   *  2) 백그라운드 fetchNotices() / fetchLastCollectionRun() 병렬 실행
   *  3) 응답이 도착하면 화면 갱신 + 새 캐시 저장
   */
  useEffect(() => {
    let isMounted = true;

    // (1) 캐시 즉시 페인트
    const cached = loadNoticesCache();
    if (cached && cached.notices.length > 0) {
      const enriched = cached.notices.map((n) => ({
        ...n,
        primaryProduct: getPrimaryProduct(n as DisplayNotice),
      })) as DisplayNotice[];
      const deduped = dedupeByAnnouncementKey(enriched);
      // 캐시 페인트 시점에서도 newMap 을 읽어 isNew 를 정확히 부착한다.
      // (저장만 하고 갱신은 하지 않음 — markNewItemsBySnapshot 호출은 fresh fetch 후에만)
      const newMap = loadNewMap("bid");
      const flagged = applyNewFlags(deduped, newMap);
      setNotices(flagged);
      setDataSource(cached.source);
      setIsLoading(false);
      setFromCache(true);
    }

    // (2) 백그라운드 최신화
    async function refresh() {
      // 캐시 hit 이 아니면 일반 로딩 스켈레톤을 그대로 보여준다.
      if (!cached) setIsLoading(true);
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

    void refresh();

    return () => {
      isMounted = false;
    };
  }, [loadNotices, loadLastRun]);

  /** 첫 마운트에 localStorage 에서 입찰공고용 피드백만 읽어 메모리에 캐싱. */
  useEffect(() => {
    setFeedbackList(loadAllFeedbacks("BID"));
  }, []);

  /** announcementKey → AnnouncementFeedback 인덱스. 테이블 행 lookup 에 사용. */
  const feedbackMap = useMemo(
    () => buildFeedbackMap(feedbackList),
    [feedbackList],
  );

  const candidates = useMemo(
    () => notices.filter((notice) => isVisibleCandidate(notice)),
    [notices],
  );

  /**
   * 화면 노출 후보 — 마감(deadline 지난) 공고는 항상 제외.
   * 기본 테이블 / 전체 카드 / 제품 카드 / 표출 수 모두 이 집합 위에서 계산한다.
   * (TODO 고급필터: 추후 필요 시 별도 토글을 둬서 마감 포함 보기를 옵션으로 제공)
   */
  const visibleCandidates = useMemo(
    () => candidates.filter((notice) => isOpenForReview(notice)),
    [candidates],
  );

  const summaryCounts = useMemo(
    () => countSummaryForCards(visibleCandidates),
    [visibleCandidates],
  );

  /**
   * 상단 통계용 추가 지표.
   *  - productMatchTotal : products 배열 기준 (notice, product) 매칭 관계 수. 한 공고에 두 제품이
   *    매칭되면 +2. "제품매칭"으로 화면에 표시.
   *  - multiMatchCount   : products 가 2개 이상인 공고 수. "복수매칭"으로 화면에 표시.
   *  - 모두 visibleCandidates(=진행 중) 기준으로 계산해 사용자가 보는 표/카드와 일치시킨다.
   */
  const productMatchTotal = useMemo(
    () =>
      visibleCandidates.reduce(
        (sum, n) => sum + (Array.isArray(n.relatedProducts) ? n.relatedProducts.length : 0),
        0,
      ),
    [visibleCandidates],
  );
  const multiMatchCount = useMemo(
    () =>
      visibleCandidates.filter(
        (n) => Array.isArray(n.relatedProducts) && n.relatedProducts.length >= 2,
      ).length,
    [visibleCandidates],
  );

  /*
   * 데이터 레이어 분리 (3차 고도화):
   *  - rawBidItems       : Supabase 에서 받은 raw 매칭 모집단 (= notices)
   *  - activeBidItems    : 마감 제외 + 제품 매칭된 후보 (= visibleCandidates)
   *  - matchedBidItems   : products 가 1개 이상인 active 공고 (= activeBidItems 와 동일)
   *  - filteredBidItems  : 검색/필터/예산 적용 후 표시 후보 (= filteredNotices)
   *  - displayedBidItems : 페이지네이션 적용 후 실제 화면 표시 (= pagedNotices)
   *
   * 통계는 반드시 이 기준으로:
   *   조회      = lastRun.fetched_count (G2B 원천 조회 수)
   *   진행중    = activeBidItems.length
   *   제품매칭  = sum(relatedProducts.length) on activeBidItems
   *   표출      = filteredBidItems / displayedBidItems
   */
  const filteredNotices = useMemo(() => {
    const query = debouncedSearchQuery.trim();
    let pool = visibleCandidates;
    if (query) {
      pool = pool.filter((notice) => matchesSearch(notice, query));
    }
    const filtered = pool.filter((notice) => {
      if (!matchesProduct(notice, selectedProduct)) return false;
      if (!matchesTerritoryStatus(notice, territoryFilter)) return false;
      if (showSavedOnly && !savedIds.includes(notice.id)) return false;
      if (showNewOnly && notice.isNew !== true) return false;
      if (showFeedbackOnly && !feedbackMap.has(getAnnouncementKey(notice))) return false;
      // 예산 필터 — budget 문자열을 숫자(원) 로 파싱한 뒤 임계값 비교.
      const budgetAmount = parseBudgetAmount(notice.budget);
      if (!matchesBudgetFilter(budgetAmount, budgetFilter)) return false;
      return true;
    });
    return sortNoticesByState(filtered, sortState);
  }, [
    visibleCandidates,
    debouncedSearchQuery,
    selectedProduct,
    territoryFilter,
    showSavedOnly,
    showNewOnly,
    showFeedbackOnly,
    feedbackMap,
    savedIds,
    sortState,
    budgetFilter,
  ]);

  const hasActiveSearch = debouncedSearchQuery.trim().length > 0;
  const matchesExceptSearch = useMemo(
    () =>
      visibleCandidates.filter(
        (notice) =>
          matchesProduct(notice, selectedProduct) &&
          matchesTerritoryStatus(notice, territoryFilter) &&
          (!showSavedOnly || savedIds.includes(notice.id)) &&
          (!showNewOnly || notice.isNew === true) &&
          (!showFeedbackOnly || feedbackMap.has(getAnnouncementKey(notice))),
      ),
    [
      visibleCandidates,
      selectedProduct,
      territoryFilter,
      showSavedOnly,
      showNewOnly,
      showFeedbackOnly,
      feedbackMap,
      savedIds,
    ],
  );

  /** 현재 후보 안의 신규(isNew=true) 건수 — 신규 필터 버튼 라벨에 표시. */
  const newCandidateCount = useMemo(
    () => visibleCandidates.filter((n) => n.isNew === true).length,
    [visibleCandidates],
  );

  /**
   * 담당본부 드롭다운 옵션 — 현재 후보 공고들의 customer.territory 에서 자동 추출.
   * "미매칭" 은 항상 마지막 옵션으로 포함한다(데이터에 매칭된 본부가 0건일 때도 보이도록).
   */
  const territoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const notice of visibleCandidates) {
      const raw = notice.customer?.territory;
      if (raw == null) continue;
      const trimmed = String(raw).trim();
      if (trimmed.length === 0) continue;
      if (EMPTY_TERRITORY_SENTINELS.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [visibleCandidates]);

  /**
   * 페이지네이션 계산.
   *  - pageSize === 0 → 전체.
   *  - 필터/검색이 변하면 currentPage 가 totalPages 보다 커질 수 있으므로 below 에서 보정.
   */
  const totalFiltered = filteredNotices.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = pageSize === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEndIndex = pageSize === 0 ? totalFiltered : Math.min(totalFiltered, pageStartIndex + pageSize);
  const pagedNotices = useMemo(
    () => (pageSize === 0 ? filteredNotices : filteredNotices.slice(pageStartIndex, pageEndIndex)),
    [filteredNotices, pageSize, pageStartIndex, pageEndIndex],
  );

  /**
   * "진행중" 기준 unique 공고 수 — 상단 통계에서 사용자가 헷갈리지 않도록 매칭이 아닌 진행 중을 노출.
   * (= visibleCandidates.length, 마감 제외)
   * 표출 카운트는 페이지네이션 영역의 stat strip 에서 직접 pagedNotices.length / totalFiltered 로 보여준다.
   */
  const activeTotal = visibleCandidates.length;

  /**
   * 수집 오류 패널용 CollectionError[].
   *  - Supabase config 오류 / 마지막 cron 실행에서 errors[]
   *  - 직전 수동 수집(manualMessage) 가 error 인 경우.
   * 0건이면 panel 자체가 렌더되지 않는다.
   */
  const collectionErrors: CollectionError[] = useMemo(() => {
    const list: CollectionError[] = [];
    if (dataSource === "sample" && errorMessage) {
      list.push(
        makeCollectionError({
          scope: "BID",
          kind: "API_RESPONSE_ERROR",
          message: `Supabase 연결 실패 — 샘플 데이터 표시 중`,
          detail: errorMessage,
        }),
      );
    }
    if (manualStatus === "error" && manualMessage) {
      list.push(
        makeCollectionError({
          scope: "BID",
          kind: "API_RESPONSE_ERROR",
          message: manualMessage,
        }),
      );
    }
    if (lastRun?.errors && lastRun.errors.length > 0) {
      for (const e of lastRun.errors) {
        const lower = (e ?? "").toLowerCase();
        const kind = lower.includes("timeout")
          ? "API_TIMEOUT"
          : lower.includes("json") || lower.includes("파싱")
            ? "JSON_PARSE_ERROR"
            : lower.includes("hcsp") || lower.includes("auth") || lower.includes("키")
              ? "API_KEY_MISSING"
              : "API_RESPONSE_ERROR";
        list.push(
          makeCollectionError({
            scope: "BID",
            kind,
            endpoint: "cron/collect-g2b",
            message: e ?? "(unknown)",
          }),
        );
      }
    }
    return list;
  }, [dataSource, errorMessage, manualStatus, manualMessage, lastRun]);

  // 필터/검색/페이지사이즈가 바뀌면 1페이지로 리셋.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchQuery,
    selectedProduct,
    territoryFilter,
    showSavedOnly,
    showNewOnly,
    showFeedbackOnly,
    budgetFilter,
    pageSize,
  ]);
  // currentPage 가 totalPages 를 넘기면 자동으로 마지막 페이지로.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
   * "신규 표시 초기화".
   *  - 현재 화면(activeItems) 의 키들을 lastSnapshotKeys 로 강제 저장.
   *  - newMap 비우기 → 화면의 신규 0건 처리.
   *  - 다음 수집부터는 정상 snapshot diff 로 새 키만 NEW 로 표시.
   */
  const handleResetNewState = () => {
    const keys = notices.map((n) => getAnnouncementKey(n));
    const newMap = resetNewSnapshot("bid", keys);
    setNotices((prev) => applyNewFlags(prev, newMap));
    setShowNewOnly(false);
    setCollectToast("신규 표시를 초기화했습니다");
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
    setManualMessage("나라장터 공고 수집 중... (60초 정도 걸릴 수 있어요)");

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
    const [{ newCount }] = await Promise.all([loadNotices(), loadLastRun()]);

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

    // 사용자에게 즉시 보이는 신규 공고 건수를 토스트로 안내. (loadNotices 가 snapshot diff 로
    // 산출한 값이라 이번 수집에서 새로 등장한 공고만 잡힌다.)
    if (newCount > 0) {
      setCollectToast(`신규 ${newCount.toLocaleString("ko-KR")}건이 추가됐어요`);
    }

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
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
          <DashboardLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
        <Header
          matchedCount={activeTotal}
          fromCache={fromCache}
        />

        {/*
          수집 직후 짧게 보이는 토스트.
          "신규 N건 추가됨" 처럼 사용자가 결과를 곧장 인지할 수 있게 한다.
          4초 뒤 자동 dismiss (collectToast useEffect 가 처리).
        */}
        {collectToast && (
          <div
            role="status"
            className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200 sm:text-sm"
          >
            <span className="font-semibold">{collectToast}</span>
            <button
              type="button"
              onClick={() => setCollectToast(null)}
              className="text-[11px] font-medium text-emerald-700/80 hover:text-emerald-900 dark:text-emerald-200/80 dark:hover:text-emerald-50"
            >
              닫기
            </button>
          </div>
        )}

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

        {/* 구조화된 수집 오류 패널 — Supabase 실패 / 직전 수집 오류를 한 곳에 모아서 표시. */}
        <CollectionErrorPanel errors={collectionErrors} title="입찰공고 수집 오류" />

        <LastCollectionRunCard
          run={lastRun}
          error={lastRunError}
          isLoading={isLastRunLoading}
          lastSuccess={lastSuccessRun}
        />

        {/*
          관리자 전용 수집 진단 패널 — 일반 사용자에게는 보이지 않는다.
          마지막 시도 / 마지막 성공 / 환경 점검 / Vercel cron 안내 등이 한 곳에 모인다.
          isLastRunLoading 동안에는 아직 데이터가 없으므로 패널을 띄우지 않는다 (깜빡임 방지).
        */}
        {auth.isAdmin && !isLastRunLoading && (
          <CollectionDiagnosticsPanel
            lastAttempt={lastRun}
            lastSuccess={lastSuccessRun}
            fetchError={lastRunError}
          />
        )}

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

              {/*
                마감 공고는 기본 화면에서 항상 제외한다 — "마감 포함" 토글은 더 이상 제공하지 않는다.
                (TODO 고급필터: 추후 필요 시 별도 메뉴로 마감 포함 보기 옵션 추가)
              */}

              {/*
                "신규" 필터 — snapshot diff 기준. 이전 수집에는 없었지만 이번 수집에 새로 등장한 공고만.
                미적용 시 카운트만 안내 (예: "신규 3"), 0건이면 강조하지 않는다.
              */}
              <button
                type="button"
                onClick={() => setShowNewOnly((prev) => !prev)}
                aria-pressed={showNewOnly}
                title="최근 24시간 내 처음 들어온 공고만 표시"
                disabled={newCandidateCount === 0 && !showNewOnly}
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:text-sm ${
                  showNewOnly
                    ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    : newCandidateCount > 0
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30 dark:hover:bg-emerald-500/25"
                      : "cursor-not-allowed bg-slate-50 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-white/10"
                }`}
              >
                <span aria-hidden>●</span>
                <span>신규</span>
                <span className="tabular-nums">{newCandidateCount}</span>
              </button>

              {/*
                "신규 표시 초기화" — 화면이 한 번에 신규로 폭발한 경우 수동 복구용.
                자주 누를 버튼은 아니므로 작은 텍스트 링크 톤.
              */}
              {newCandidateCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetNewState}
                  title="현재 보이는 공고를 모두 '이미 본 것'으로 표시해 신규 표시를 끕니다"
                  className="inline-flex h-9 shrink-0 items-center whitespace-nowrap text-[11px] font-medium text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200 sm:text-xs"
                >
                  신규 표시 초기화
                </button>
              )}

              {/*
                "피드백 있음" 필터 — 영업 의견이 등록된 공고만 다시 보고싶을 때 사용.
                feedbackList 가 비어있으면 disable 톤.
              */}
              <button
                type="button"
                onClick={() => setShowFeedbackOnly((prev) => !prev)}
                aria-pressed={showFeedbackOnly}
                title="피드백이 등록된 공고만 표시"
                disabled={feedbackList.length === 0 && !showFeedbackOnly}
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:text-sm ${
                  showFeedbackOnly
                    ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                    : feedbackList.length > 0
                      ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30 dark:hover:bg-violet-500/25"
                      : "cursor-not-allowed bg-slate-50 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-white/10"
                }`}
              >
                <span aria-hidden>💬</span>
                <span>피드백</span>
                <span className="tabular-nums">{feedbackList.length}</span>
              </button>

              <span aria-hidden className="hidden h-6 w-px bg-slate-200 dark:bg-white/10 lg:inline-block" />

              <ProductFilter selected={selectedProduct} onChange={setSelectedProduct} />

              {/*
                담당본부 드롭다운.
                현재 공고 데이터에서 자동 추출한 본부값(공공/금융/광역 등) + 항상 포함되는 "미매칭".
                필터명은 "담당본부" 단일.
              */}
              <label className="relative inline-flex items-center">
                <span className="sr-only">담당본부</span>
                <select
                  value={territoryFilter}
                  onChange={(event) => setTerritoryFilter(event.target.value)}
                  title="담당본부 별로 공고를 필터링"
                  className="h-9 cursor-pointer appearance-none whitespace-nowrap rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/30 sm:text-sm"
                >
                  <option value="all">담당본부 · 전체</option>
                  {territoryOptions.map((territory) => (
                    <option key={territory} value={territory}>
                      {territory}
                    </option>
                  ))}
                  <option value={MISSING_TERRITORY_VALUE}>미매칭</option>
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 text-[10px] text-slate-400 dark:text-slate-500"
                >
                  ▼
                </span>
              </label>

              <BudgetFilter value={budgetFilter} onChange={setBudgetFilter} />

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

              <button
                type="button"
                title="입찰공고 화면 캐시(localStorage) 와 lastFetchAt / NEW snapshot 을 모두 비우고 새로 시작합니다. 피드백/관심/DB 데이터는 보존됩니다."
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(
                      "입찰공고 화면 캐시를 비웁니다. 다음 수집부터 새로 저장됩니다. 계속할까요?",
                    )
                  ) {
                    return;
                  }
                  clearBidLocalCache();
                  window.location.reload();
                }}
                className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800 sm:text-sm"
              >
                캐시 초기화
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

        {/*
          상단 표출 카운트 + 페이지 사이즈 선택 + 페이지 이동 — PC/모바일 공통.
          기준 (사용자 혼동 방지):
            - 조회      : 마지막 수집 fetched_count (G2B 원천 조회 수, 없으면 미표시)
            - 진행중    : 제품 매칭 + 마감 제외 후 unique 공고 수
            - 제품매칭  : products 배열 기준 (notice, product) 매칭 관계 수 (한 공고에 두 제품이면 +2)
            - 표출      : 현재 화면 필터/검색/페이지 적용 후 실제 보이는 건수 (1-50 / N건 형태)
            - 복수매칭  : products 가 2개 이상인 공고 수
        */}
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
            {lastRun?.fetched_count != null && (
              <span title="G2B 원천 조회 수 (마지막 수집 기준)">
                <span className="text-slate-500 dark:text-slate-400">조회 </span>
                <span className="font-semibold tabular-nums">
                  {lastRun.fetched_count.toLocaleString("ko-KR")}
                </span>
              </span>
            )}
            <span title="제품 매칭 + 마감 제외, unique 공고 수">
              <span className="text-slate-500 dark:text-slate-400">진행중 </span>
              <span className="font-semibold tabular-nums">
                {activeTotal.toLocaleString("ko-KR")}
              </span>
            </span>
            <span title="products 배열 기준 매칭 관계 수 — 복수 제품 매칭 시 중복 포함">
              <span className="text-slate-500 dark:text-slate-400">제품매칭 </span>
              <span className="font-semibold tabular-nums">
                {productMatchTotal.toLocaleString("ko-KR")}
              </span>
            </span>
            <span title="현재 필터 + 페이지네이션 기준">
              <span className="text-slate-500 dark:text-slate-400">표출 </span>
              <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                {totalFiltered === 0
                  ? "0"
                  : pageSize === 0
                    ? `1-${totalFiltered.toLocaleString("ko-KR")}`
                    : `${(pageStartIndex + 1).toLocaleString("ko-KR")}-${pageEndIndex.toLocaleString("ko-KR")}`}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {" "}
                / {totalFiltered.toLocaleString("ko-KR")}건
              </span>
            </span>
            <span title="products 가 2개 이상인 공고 수">
              <span className="text-slate-500 dark:text-slate-400">복수매칭 </span>
              <span className="font-semibold tabular-nums">
                {multiMatchCount.toLocaleString("ko-KR")}건
              </span>
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="inline-flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">페이지당</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-2 pr-6 text-xs font-semibold text-slate-700 shadow-sm hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-blue-400/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/30"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={0}>전체</option>
              </select>
            </label>

            {pageSize !== 0 && totalPages > 1 && (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  ← 이전
                </button>
                <span className="px-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400 sm:text-xs">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 모바일: 기존 카드 UI */}
        <section className="space-y-4 sm:space-y-5 md:hidden">
          {pagedNotices.length > 0 ? (
            pagedNotices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                isSaved={savedIds.includes(notice.id)}
                onToggleSave={handleToggleSave}
                hasFeedback={feedbackMap.has(getAnnouncementKey(notice))}
                onOpenFeedback={() => setFeedbackTarget(notice)}
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
            notices={pagedNotices}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
            sortState={sortState}
            onSortChange={handleSortChange}
            feedbackMap={feedbackMap}
            onOpenFeedback={(notice) => setFeedbackTarget(notice)}
          />
        </section>

        {/* 하단 페이지네이션 — 표가 길 때 다시 한번 노출 */}
        {pageSize !== 0 && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ← 이전
            </button>
            <span className="px-2 tabular-nums text-slate-500 dark:text-slate-400">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              다음 →
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {dataSource === "supabase" ? "Supabase · 나라장터 연동" : "샘플 데이터 기반 MVP"}
        </p>
      </div>

      {/*
        피드백 모달 — feedbackTarget 이 set 되면 모달이 열린다.
        existing 은 announcementKey 기준으로 기존 피드백을 찾아 폼 초기값으로 사용.
      */}
      {feedbackTarget && (
        <FeedbackModal
          open
          notice={feedbackTarget}
          announcementKey={getAnnouncementKey(feedbackTarget)}
          existing={feedbackMap.get(getAnnouncementKey(feedbackTarget))}
          onSaved={(list) => setFeedbackList(list)}
          onClose={() => setFeedbackTarget(null)}
        />
      )}
    </div>
  );
}

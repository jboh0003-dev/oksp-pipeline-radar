"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BudgetFilter, {
  matchesBudgetFilter,
  type BudgetFilterValue,
} from "@/components/BudgetFilter";
import CollectionErrorPanel from "@/components/CollectionErrorPanel";
import FeedbackModal from "@/components/FeedbackModal";
import PreSpecTable from "@/components/PreSpecTable";
import { clearPreSpecLocalCache } from "@/lib/cacheReset";
import type { CollectionError } from "@/lib/collectionErrors";
import {
  buildFeedbackMap,
  loadAllFeedbacks,
  type AnnouncementFeedback,
} from "@/lib/feedback";
import {
  getPreSpecLastDurationMs,
  loadPreSpecCache,
  recordPreSpecLoadDurationMs,
  savePreSpecCache,
} from "@/lib/preSpec/cache";
import {
  isKeyNewInScope,
  loadNewMap,
  markNewItemsBySnapshot,
  resetNewSnapshot,
  type NewMap,
} from "@/lib/newState";
import type {
  PreSpecAnnouncement,
  PreSpecProduct,
} from "@/lib/preSpec/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type ProductFilter = "ALL" | PreSpecProduct;

const SAVED_KEY = "csg2b:preSpec:savedKeys";

function loadSavedKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveSavedKeys(keys: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

/**
 * snapshot 기반 NEW 판정 (입찰공고와 동일 정의).
 *  - 신규 = "이전 수집 snapshot 에는 없고 이번 수집 snapshot 에 새로 등장한 announcementKey"
 *  - 신규 표시는 24시간 동안 유지 → 자동으로 사라진다.
 */
function applyNewFlags(
  items: PreSpecAnnouncement[],
  newMap: NewMap,
  now: number = Date.now(),
): PreSpecAnnouncement[] {
  return items.map((it) => {
    const isNew = isKeyNewInScope("preSpec", it.announcementKey, newMap, now);
    return {
      ...it,
      isNew,
      newAt: newMap[it.announcementKey] ?? null,
    };
  });
}

/**
 * 진행 중(=마감 안 된) 사전규격공고만 통과시키는 가드.
 *  - opinionDeadline 이 지나 status === "마감" 인 항목은 항상 화면에서 제외.
 *  - 의견마감일 미상("확인필요") 은 일단 노출.
 *  - TODO(고급필터): 추후 필요 시 별도 토글로 마감 포함 보기 옵션 추가.
 */
function isOpenPreSpec(item: PreSpecAnnouncement): boolean {
  return item.status !== "마감";
}

/**
 * 마지막 수집 시각이 "직전 cron 시각(매일 08:30 KST) 이전" 이면 stale 로 간주.
 *  - 자동 수집은 매일 08:30 KST 에 돌도록 vercel.json 에 등록되어 있다.
 *  - 따라서 그 시각 이후로 한 번도 갱신되지 않았다면 사용자에게 "업데이트 필요" 라벨로 알린다.
 *  - 시각 비교는 모두 UTC ms 기준이라 OS 타임존 영향 없음.
 */
function isStaleSinceMorningCutoff(lastFetchAt: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(lastFetchAt) || lastFetchAt <= 0) return false;
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  // KST 시각의 분/시 추출.
  const kstNow = new Date(now + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const kstHour = kstNow.getUTCHours();
  const kstMinute = kstNow.getUTCMinutes();
  // 오늘 08:30 KST 의 UTC ms.
  let cutoffUtcMs = Date.UTC(y, m, d, 8, 30, 0) - KST_OFFSET_MS;
  // 현재 KST 가 아직 08:30 전이라면, 직전 cutoff 는 어제 08:30 KST.
  if (kstHour < 8 || (kstHour === 8 && kstMinute < 30)) {
    cutoffUtcMs -= 24 * 60 * 60 * 1000;
  }
  return lastFetchAt < cutoffUtcMs;
}

type CollectResp = {
  ok: boolean;
  items?: PreSpecAnnouncement[];
  error?: string;
  message?: string;
  totalsByCategory?: Record<string, number>;
  errors?: string[];
  collectionErrors?: CollectionError[];
  durationMs?: number;
  inqryBgnDt?: string;
  inqryEndDt?: string;
  days?: number;
  cats?: string[];
  debug?: {
    firstItemKeys?: string[];
    firstItemSample?: Record<string, unknown> | null;
    pageCount?: number;
  };
};

type CustomerMatchPayload = {
  customerName: string;
  accountType: string | null;
  territory: string | null;
  regionGroup: string | null;
  region: string | null;
  matchType: string;
};

/** 정규화된 PreSpec 목록에 customer-accounts 매칭을 붙여서 department/region/customer 를 채워준다. */
async function applyCustomerMatching(
  items: PreSpecAnnouncement[],
): Promise<PreSpecAnnouncement[]> {
  if (items.length === 0) return items;
  const uniqueAgencies = Array.from(
    new Set(
      items
        .flatMap((it) => [it.orgName, it.demandOrgName ?? ""])
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "(기관 미상)"),
    ),
  );
  if (uniqueAgencies.length === 0) return items;

  // 한 번에 1000개 상한이 있으니 청크로 나눠 호출.
  const CHUNK = 800;
  const matches: Record<string, CustomerMatchPayload> = {};
  for (let i = 0; i < uniqueAgencies.length; i += CHUNK) {
    const slice = uniqueAgencies.slice(i, i + CHUNK);
    try {
      const res = await fetch("/api/customer-accounts/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencies: slice }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { matches?: Record<string, CustomerMatchPayload> };
      Object.assign(matches, json.matches ?? {});
    } catch {
      // 네트워크 오류 무시 — 매칭 없이도 화면은 떠야 한다.
    }
  }

  return items.map((it) => {
    // 발주기관 우선, 없으면 수요기관 으로 매칭.
    const m =
      (it.orgName && matches[it.orgName]) ||
      (it.demandOrgName && matches[it.demandOrgName]) ||
      undefined;
    if (!m) return it;
    return {
      ...it,
      customer: {
        customerName: m.customerName,
        territory: m.territory ?? "미매칭",
        accountType: m.accountType ?? "-",
        region: m.region ?? null,
        regionGroup: m.regionGroup ?? null,
      },
      department: m.territory && m.territory.trim() ? m.territory : "미매칭",
      namedType:
        m.accountType === "Named" || m.accountType === "Non Named" ? m.accountType : "-",
      region: m.region ?? undefined,
    };
  });
}

/**
 * 사전규격공고 대시보드.
 *
 * 흐름:
 *  - 마운트 시 캐시(15분 TTL) 가 있으면 즉시 표시 → 백그라운드 fetch.
 *  - "지금 수집" 클릭 시 캐시 무시 + 바로 fetch.
 *  - 검색 / 필터 / 페이지 변경은 모두 클라이언트 (재호출 없음).
 *  - NEW 표시는 csg2b:preSpec:* localStorage 로 입찰공고와 분리 관리.
 *  - 피드백은 sourceType="PRE_SPEC" 으로 분리 저장.
 */
export default function PreSpecPage() {
  const [items, setItems] = useState<PreSpecAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** API 가 명시적으로 알려주는 안내 메시지(데이터 없음 등). */
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  /** API 응답의 errors 배열 — 카테고리별 페이지 에러 등. */
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  /** 구조화된 수집 오류 (CollectionErrorPanel 용). */
  const [collectionErrors, setCollectionErrors] = useState<CollectionError[]>([]);
  /** debug panel 표시 여부 (응답의 debug 정보). */
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<CollectResp["debug"]>(undefined);
  const [collectStatus, setCollectStatus] = useState<"idle" | "running" | "success" | "error">(
    "idle",
  );
  const [collectMessage, setCollectMessage] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [totalsByCategory, setTotalsByCategory] = useState<Record<string, number>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [productFilter, setProductFilter] = useState<ProductFilter>("ALL");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [showImminentOnly, setShowImminentOnly] = useState(false);
  const [showNewOnly, setShowNewOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showFeedbackOnly, setShowFeedbackOnly] = useState(false);
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilterValue>("all");

  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const savedSet = useMemo(() => new Set(savedKeys), [savedKeys]);

  const [feedbackList, setFeedbackList] = useState<AnnouncementFeedback[]>([]);
  const feedbackMap = useMemo(() => buildFeedbackMap(feedbackList), [feedbackList]);
  const [feedbackTarget, setFeedbackTarget] = useState<PreSpecAnnouncement | null>(null);

  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchInFlightRef = useRef(false);

  /** 사전규격 수집 — /api/pre-spec/collect 호출 → 정규화 + dedup 은 서버에서 끝났음. */
  const refresh = useCallback(async (): Promise<{ newCount: number; ok: boolean }> => {
    if (fetchInFlightRef.current) return { newCount: 0, ok: false };
    fetchInFlightRef.current = true;
    const started = Date.now();
    try {
      // days=7 — 사전규격은 의견접수기간이 보통 5~7일이므로 최근 7일 등록분만 받아도
      // 진행중/마감임박 항목 거의 전부를 커버한다. 30일을 받으면 G2B API 가
      // rcptDt ASC 정렬이라 maxPages 한도(=5) 안에 가장 오래된 페이지(이미 마감)만 들어와서
      // 화면에 진행중 데이터가 1건도 안 나타나는 문제가 생긴다.
      const res = await fetch("/api/pre-spec/collect?days=7", { method: "GET" });
      const json = (await res.json()) as CollectResp;

      // 서버가 보내준 진단 정보를 항상 반영 (성공/실패 상관없이).
      setApiErrors(json.errors ?? []);
      setCollectionErrors(json.collectionErrors ?? []);
      setDebugInfo(json.debug);
      setTotalsByCategory(json.totalsByCategory ?? {});

      if (!json.ok || !Array.isArray(json.items)) {
        setErrorMessage(json.error ?? "사전규격 수집 실패");
        setInfoMessage(null);
        return { newCount: 0, ok: false };
      }
      setErrorMessage(null);
      setInfoMessage(json.message ?? null);

      const next = json.items;
      // snapshot diff — 이전 수집에는 없었지만 이번 수집에 새로 등장한 키만 NEW.
      // 최초 시드는 자동으로 newMap 비움 (= 신규 0건).
      const keys = next.map((n) => n.announcementKey);
      const { newKeys, newMap } = markNewItemsBySnapshot("preSpec", keys);
      const flagged = applyNewFlags(next, newMap);

      // 담당본부 매칭 — 시간이 걸려도 화면에는 매칭 전 데이터를 먼저 띄우고 끝나면 update.
      setItems(flagged);
      const now = Date.now();
      const duration = now - started;
      savePreSpecCache(flagged, now);
      recordPreSpecLoadDurationMs(duration);
      setLastFetchAt(now);
      setLastDurationMs(duration);
      setFromCache(false);

      // 비동기 매칭 — Promise 끝나면 items 갱신 + cache 도 다시 저장.
      void applyCustomerMatching(flagged).then((withCustomer) => {
        setItems(withCustomer);
        savePreSpecCache(withCustomer, Date.now());
      });

      return { newCount: newKeys.length, ok: true };
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      return { newCount: 0, ok: false };
    } finally {
      fetchInFlightRef.current = false;
    }
  }, []);

  // 첫 진입: 캐시 즉시 페인트 → 백그라운드 fetch
  useEffect(() => {
    let mounted = true;
    setSavedKeys(loadSavedKeys());
    setFeedbackList(loadAllFeedbacks("PRE_SPEC"));
    setLastDurationMs(getPreSpecLastDurationMs());

    const cached = loadPreSpecCache();
    if (cached && cached.items.length > 0) {
      // 캐시 페인트 시점에서도 newMap 을 읽어 isNew 를 정확히 다시 부착한다.
      // (snapshot 갱신은 fresh fetch 후에만 수행)
      const newMap = loadNewMap("preSpec");
      setItems(applyNewFlags(cached.items, newMap));
      setLastFetchAt(cached.fetchedAt);
      setIsLoading(false);
      setFromCache(true);
    }

    (async () => {
      if (!cached) setIsLoading(true);
      try {
        await refresh();
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refresh]);

  // 필터/검색/페이지사이즈 변경 시 1페이지로 리셋.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    productFilter,
    territoryFilter,
    showImminentOnly,
    showNewOnly,
    showSavedOnly,
    showFeedbackOnly,
    budgetFilter,
    pageSize,
  ]);

  const handleManualCollect = async () => {
    if (collectStatus === "running") return;
    setCollectStatus("running");
    setCollectMessage("사전규격공고 수집 중... (수십 초 걸릴 수 있어요)");
    const { newCount, ok } = await refresh();
    if (!ok) {
      setCollectStatus("error");
      setCollectMessage(`수집 실패: ${errorMessage ?? "알 수 없는 오류"}`);
      return;
    }
    setCollectStatus("success");
    setCollectMessage(
      newCount > 0
        ? `수집 완료 · 신규 ${newCount.toLocaleString("ko-KR")}건 추가됨`
        : `수집 완료 · 신규 0건`,
    );
  };

  const handleToggleSave = (key: string) => {
    setSavedKeys((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      saveSavedKeys(next);
      return next;
    });
  };

  const handleResetNew = () => {
    const keys = items.map((it) => it.announcementKey);
    const newMap = resetNewSnapshot("preSpec", keys);
    setItems((prev) => applyNewFlags(prev, newMap));
    setShowNewOnly(false);
  };

  const territoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const it of items.filter(isOpenPreSpec)) {
      const t = it.customer?.territory;
      if (t && t !== "미매칭") seen.add(t);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [items]);

  /*
   * 데이터 레이어 분리 (3차 고도화):
   *  - rawPreSpecItems       : 서버에서 받은 raw 매칭 모집단 (= items, 마감 포함)
   *  - activePreSpecItems    : 마감 제외 unique 공고
   *  - matchedPreSpecItems   : products 가 1개 이상인 active 공고 (제품 매칭됨)
   *  - filteredPreSpecItems  : 검색/필터/예산 적용 후 표시 후보
   *  - displayedPreSpecItems : 페이지네이션 적용 후 실제 화면 표시 (paged)
   *
   *  통계는 반드시 이 기준으로:
   *    조회      = rawPreSpecItems.length
   *    진행중    = activePreSpecItems.length
   *    제품매칭  = sum(products.length) on activePreSpecItems
   *    표출      = filteredPreSpecItems / displayedPreSpecItems
   */
  const rawPreSpecItems = items;
  const activePreSpecItems = useMemo(
    () => rawPreSpecItems.filter(isOpenPreSpec),
    [rawPreSpecItems],
  );
  const matchedPreSpecItems = useMemo(
    () => activePreSpecItems.filter((it) => Array.isArray(it.products) && it.products.length > 0),
    [activePreSpecItems],
  );
  // legacy alias — 화면 다른 부분에서 visibleItems 라는 이름을 그대로 쓴다.
  const visibleItems = activePreSpecItems;

  // 1차 필터 (검색/제품/담당본부/임박/신규/관심/피드백/예산)
  const filteredPreSpecItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return activePreSpecItems.filter((it) => {
      if (q) {
        const hay = [
          it.title,
          it.orgName,
          it.demandOrgName ?? "",
          it.businessName ?? "",
          ...(it.matchedKeywords ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (productFilter !== "ALL" && !it.products.includes(productFilter)) return false;
      if (territoryFilter !== "all") {
        const t = it.customer?.territory ?? "미매칭";
        if (territoryFilter === "__missing__") {
          if (t && t !== "미매칭") return false;
        } else if (t !== territoryFilter) return false;
      }
      if (showImminentOnly && it.status !== "마감임박") return false;
      if (showNewOnly && !it.isNew) return false;
      if (showSavedOnly && !savedSet.has(it.announcementKey)) return false;
      if (showFeedbackOnly && !feedbackMap.has(it.announcementKey)) return false;
      if (!matchesBudgetFilter(it.budget ?? null, budgetFilter)) return false;
      return true;
    });
  }, [
    activePreSpecItems,
    debouncedSearch,
    productFilter,
    territoryFilter,
    showImminentOnly,
    showNewOnly,
    showSavedOnly,
    showFeedbackOnly,
    savedSet,
    feedbackMap,
    budgetFilter,
  ]);

  /*
   * 상단 통계 (입찰공고와 동일 정의):
   *  - 조회        : rawPreSpecItems.length (= items.length, 마감 포함 raw 모집단)
   *  - 진행중      : activePreSpecItems.length (마감 제외 unique 공고 수)
   *  - 제품매칭    : products.length 합계 (한 공고에 두 제품이면 +2, "관계 수")
   *  - 복수매칭    : products 가 2개 이상인 공고 수
   *  - CONTRABASS / VIOLA / CMP : 각 제품이 products 에 포함된 공고 수 (관련 매칭 · 중복 포함)
   *  - 의견마감 임박 : status === "마감임박" — 보조지표
   *  - 신규 / 피드백 / 매칭(전체 items.length) 도 함께 표시.
   */
  const matchedTotal = rawPreSpecItems.length; // "조회/매칭" 모집단 (마감 포함 raw 매칭 수)
  const activeTotal = activePreSpecItems.length;
  const productMatchTotal = useMemo(
    () =>
      matchedPreSpecItems.reduce(
        (sum, it) => sum + (Array.isArray(it.products) ? it.products.length : 0),
        0,
      ),
    [matchedPreSpecItems],
  );
  const multiMatchCount = useMemo(
    () =>
      visibleItems.filter((it) => Array.isArray(it.products) && it.products.length >= 2)
        .length,
    [visibleItems],
  );
  const imminentTotal = useMemo(
    () => visibleItems.filter((it) => it.status === "마감임박").length,
    [visibleItems],
  );
  const newTotal = useMemo(() => visibleItems.filter((it) => it.isNew).length, [visibleItems]);
  const feedbackTotal = feedbackList.length;
  const contrabassTotal = useMemo(
    () => visibleItems.filter((it) => it.products.includes("CONTRABASS")).length,
    [visibleItems],
  );
  const violaTotal = useMemo(
    () => visibleItems.filter((it) => it.products.includes("VIOLA")).length,
    [visibleItems],
  );
  const cmpTotal = useMemo(
    () => visibleItems.filter((it) => it.products.includes("CMP")).length,
    [visibleItems],
  );

  // 페이지네이션 — slice 는 표출 단계에서만 사용한다 (표출 외 통계는 filteredPreSpecItems 기준).
  const totalFiltered = filteredPreSpecItems.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = pageSize === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEnd = pageSize === 0 ? totalFiltered : Math.min(totalFiltered, pageStart + pageSize);
  const displayedPreSpecItems = useMemo(
    () =>
      pageSize === 0 ? filteredPreSpecItems : filteredPreSpecItems.slice(pageStart, pageEnd),
    [filteredPreSpecItems, pageSize, pageStart, pageEnd],
  );
  const paged = displayedPreSpecItems;

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
        {/* 브랜드 헤더 — 입찰공고와 톤 통일 */}
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl"
          />
          <div className="relative flex min-h-[150px] flex-col justify-center px-5 py-7 sm:min-h-[190px] sm:px-7 sm:py-9">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">
              OKESTRO CS-G2B
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
              나라장터 사전규격공고 대시보드
            </h1>
            <p className="mt-1 hidden text-xs text-slate-200/85 sm:block">
              공공기관 조달 공고 조회 · 사전규격 조기탐지 · 담당본부 자동 매칭
            </p>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p className="font-semibold">사전규격 수집 오류</p>
            <p className="mt-1 break-all rounded-md bg-white/80 px-2 py-1 font-mono text-[11px] leading-relaxed text-rose-900 dark:bg-slate-900/60 dark:text-rose-200">
              {errorMessage}
            </p>
          </div>
        )}

        {/* 구조화된 수집 오류 패널 — 페이지 단위 timeout / 5xx / JSON 파싱 실패 등이 표시. */}
        <CollectionErrorPanel errors={collectionErrors} title="사전규격 수집 오류" />

        {!errorMessage && infoMessage && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            {infoMessage}
          </div>
        )}

        {(apiErrors.length > 0 || debugInfo) && !errorMessage && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setShowDebug((p) => !p)}
              className="font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
            >
              {showDebug ? "▾ 디버그 정보 숨기기" : "▸ 디버그 정보 보기"}
            </button>
            {showDebug && (
              <div className="mt-2 space-y-1.5">
                {Object.keys(totalsByCategory).length > 0 && (
                  <p>
                    <span className="font-semibold">카테고리 totalCount</span>:{" "}
                    {Object.entries(totalsByCategory)
                      .map(([k, v]) => `${k}=${(v as number).toLocaleString("ko-KR")}`)
                      .join(", ")}
                  </p>
                )}
                {debugInfo?.firstItemKeys && debugInfo.firstItemKeys.length > 0 && (
                  <p>
                    <span className="font-semibold">first item keys</span>:{" "}
                    <span className="font-mono">{debugInfo.firstItemKeys.join(", ")}</span>
                  </p>
                )}
                {apiErrors.length > 0 && (
                  <details>
                    <summary className="cursor-pointer select-none font-semibold">
                      페이지 오류 {apiErrors.length}건
                    </summary>
                    <ul className="mt-1 max-h-40 list-disc overflow-y-auto rounded-md bg-slate-50 px-3 py-1.5 pl-5 dark:bg-slate-800/40">
                      {apiErrors.map((e, i) => (
                        <li key={i} className="font-mono">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/*
          상단 카드 — 입찰공고와 동일 정의.
            - 진행중   : 마감 제외 unique 공고 수
            - 의견마감 임박 / 신규 / 피드백 : 보조지표
          제품별 카드 (CONTRABASS / VIOLA / CMP) 는 products.includes 기준 (중복 포함).
        */}
        <section className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SummaryCard label="진행중" value={activeTotal} note="마감 제외 · 중복제거" tone="blue" />
          <SummaryCard label="의견마감 임박" value={imminentTotal} note="3일 이내" tone="rose" />
          <SummaryCard label="신규" value={newTotal} note="이번 수집에 새로 등장" tone="amber" />
          <SummaryCard label="피드백" value={feedbackTotal} note="등록된 의견" tone="violet" />
        </section>

        {/* 제품별 카드 */}
        <section className="mb-1 grid grid-cols-3 gap-2.5">
          <SummaryCard label="CONTRABASS" value={contrabassTotal} note="관련 매칭 기준 · 중복 포함" tone="indigo" />
          <SummaryCard label="VIOLA" value={violaTotal} note="관련 매칭 기준 · 중복 포함" tone="cyan" />
          <SummaryCard label="CMP" value={cmpTotal} note="관련 매칭 기준 · 중복 포함" tone="emerald" />
        </section>
        <p className="mb-4 mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          제품별 수는 복수 제품 매칭 시 중복 집계됩니다.
        </p>

        {/*
          수집 정보 띠 — 입찰공고와 동일 정의.
            - 조회      : items 전체 (마감 포함, 매칭된 raw 모집단)
            - 진행중    : 마감 제외 unique 공고 수
            - 제품매칭  : products 배열 기준 (notice, product) 매칭 관계 수 (중복 포함 가능)
            - 표출      : 현재 필터/페이지 적용 후 보이는 건수
            - 복수매칭  : products 가 2개 이상인 공고 수
        */}
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
            <span title="이번 수집에서 받은 raw 매칭 모집단 (마감 포함)">
              <span className="text-slate-500 dark:text-slate-400">조회 </span>
              <span className="font-semibold tabular-nums">
                {matchedTotal.toLocaleString("ko-KR")}
              </span>
            </span>
            <span title="마감 제외 unique 공고 수">
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
                    : `${(pageStart + 1).toLocaleString("ko-KR")}-${pageEnd.toLocaleString("ko-KR")}`}
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
            {fromCache && (
              <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/30">
                cache
              </span>
            )}
            {lastFetchAt && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                · 업데이트 주기 매일 08:30 · 마지막 수집{" "}
                {new Date(lastFetchAt).toLocaleString("ko-KR")}
                {lastDurationMs && ` (${Math.round(lastDurationMs / 1000)}s)`}
              </span>
            )}
            {/*
              "오늘 08:30 이후 수집되었는지" 신선도 hint.
              - 오늘 08:30 KST 이전 데이터면 "업데이트 필요" 라벨로 사용자가 인지하도록 한다.
              - lastFetchAt 이 없으면 표시하지 않는다 (수집 자체가 처음인 케이스).
            */}
            {lastFetchAt && isStaleSinceMorningCutoff(lastFetchAt) && (
              <span
                title="오늘 08:30 KST 이전에 받은 데이터입니다 — 지금 수집을 눌러 새로 받아오세요"
                className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
              >
                업데이트 필요
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="inline-flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">페이지당</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 pr-6 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
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
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"
                >
                  ← 이전
                </button>
                <span className="px-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 필터 영역 */}
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-5 sm:py-3.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="사전규격명 / 기관 / 키워드 검색"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 lg:max-w-md"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSavedOnly((p) => !p)}
                className={`inline-flex h-9 items-center justify-center rounded-full px-3.5 text-xs font-semibold sm:text-sm ${
                  showSavedOnly
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10"
                }`}
              >
                {showSavedOnly ? "★ 관심만 (켜짐)" : "☆ 관심만"}
              </button>
              <button
                type="button"
                onClick={() => setShowImminentOnly((p) => !p)}
                className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold sm:text-sm ${
                  showImminentOnly
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30"
                }`}
                disabled={imminentTotal === 0 && !showImminentOnly}
              >
                의견마감 {imminentTotal}
              </button>
              <button
                type="button"
                onClick={() => setShowNewOnly((p) => !p)}
                disabled={newTotal === 0 && !showNewOnly}
                className={`inline-flex h-9 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold sm:text-sm ${
                  showNewOnly
                    ? "bg-emerald-600 text-white"
                    : newTotal > 0
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30"
                      : "cursor-not-allowed bg-slate-50 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-white/10"
                }`}
              >
                ● 신규 {newTotal}
              </button>
              {newTotal > 0 && (
                <button
                  type="button"
                  onClick={handleResetNew}
                  className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                >
                  신규 표시 초기화
                </button>
              )}
              <span aria-hidden className="hidden h-6 w-px bg-slate-200 dark:bg-white/10 lg:inline-block" />
              <ProductFilterPill
                label="CONTRABASS"
                count={contrabassTotal}
                active={productFilter === "CONTRABASS"}
                onClick={() =>
                  setProductFilter((p) => (p === "CONTRABASS" ? "ALL" : "CONTRABASS"))
                }
              />
              <ProductFilterPill
                label="VIOLA"
                count={violaTotal}
                active={productFilter === "VIOLA"}
                onClick={() => setProductFilter((p) => (p === "VIOLA" ? "ALL" : "VIOLA"))}
              />
              <ProductFilterPill
                label="CMP"
                count={cmpTotal}
                active={productFilter === "CMP"}
                onClick={() => setProductFilter((p) => (p === "CMP" ? "ALL" : "CMP"))}
              />

              <select
                value={territoryFilter}
                onChange={(e) => setTerritoryFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 sm:text-sm"
              >
                <option value="all">담당본부 · 전체</option>
                {territoryOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__missing__">미매칭</option>
              </select>

              <BudgetFilter value={budgetFilter} onChange={setBudgetFilter} />

              <button
                type="button"
                onClick={() => setShowFeedbackOnly((p) => !p)}
                disabled={feedbackTotal === 0 && !showFeedbackOnly}
                className={`inline-flex h-9 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold sm:text-sm ${
                  showFeedbackOnly
                    ? "bg-violet-600 text-white"
                    : feedbackTotal > 0
                      ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30"
                      : "cursor-not-allowed bg-slate-50 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-white/10"
                }`}
              >
                💬 피드백 {feedbackTotal}
              </button>

              <button
                type="button"
                onClick={handleManualCollect}
                disabled={collectStatus === "running"}
                className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold sm:text-sm ${
                  collectStatus === "running"
                    ? "cursor-not-allowed bg-blue-200 text-blue-700 dark:bg-blue-500/30 dark:text-blue-200"
                    : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500"
                }`}
              >
                {collectStatus === "running" ? "⏳ 수집 중…" : "지금 수집"}
              </button>
              <button
                type="button"
                title="사전규격공고 화면 캐시(localStorage) 와 lastFetchAt / NEW snapshot 을 모두 비우고 새로 시작합니다. 피드백/관심 등록은 보존됩니다."
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(
                      "사전규격공고 캐시를 비웁니다. 다음 수집부터 새로 저장됩니다. 계속할까요?",
                    )
                  ) {
                    return;
                  }
                  clearPreSpecLocalCache();
                  window.location.reload();
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800 sm:text-sm"
              >
                캐시 초기화
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-blue-600 ring-1 ring-blue-200 dark:bg-slate-900/60 dark:text-blue-300 dark:ring-blue-400/30 sm:text-sm"
              >
                ⟳ 새로고침
              </button>
            </div>
          </div>
          {collectMessage && (
            <p
              className={`mt-2 text-[11px] ${
                collectStatus === "error"
                  ? "text-rose-700 dark:text-rose-300"
                  : collectStatus === "success"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-blue-700 dark:text-blue-300"
              }`}
            >
              {collectMessage}
            </p>
          )}
        </section>

        {isLoading && items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
            <p className="text-sm text-slate-500 dark:text-slate-400">사전규격공고를 불러오는 중…</p>
          </div>
        ) : (
          <PreSpecTable
            items={paged}
            savedKeys={savedSet}
            feedbackMap={feedbackMap}
            onToggleSave={handleToggleSave}
            onOpenFeedback={(it) => setFeedbackTarget(it)}
          />
        )}

        {pageSize !== 0 && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-600 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"
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
              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-600 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"
            >
              다음 →
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
          나라장터 사전규격정보서비스 · CS-G2B
          {/* TODO: 사전규격 → 입찰공고 연결 추적 — bidNtceNo 또는 사업명 유사도 기반 */}
        </p>
      </div>

      {feedbackTarget && (
        <FeedbackModal
          open
          sourceType="PRE_SPEC"
          memoPlaceholder="예: 규격서에 VMware 전환 내용이 있어 Contrabass 관점에서 사전 영업 필요"
          notice={{
            id: feedbackTarget.announcementKey,
            title: feedbackTarget.title,
            agency: feedbackTarget.orgName,
            relatedProducts: feedbackTarget.products,
            keywords: feedbackTarget.matchedKeywords,
            deadline: feedbackTarget.opinionDeadline,
            deadlineLabel: "의견마감",
            customer: feedbackTarget.customer
              ? {
                  customerName: feedbackTarget.customer.customerName,
                  territory: feedbackTarget.customer.territory,
                  accountType: feedbackTarget.customer.accountType,
                }
              : null,
          }}
          announcementKey={feedbackTarget.announcementKey}
          existing={feedbackMap.get(feedbackTarget.announcementKey)}
          onSaved={(list) => setFeedbackList(list)}
          onClose={() => setFeedbackTarget(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: "blue" | "indigo" | "cyan" | "rose" | "amber" | "violet" | "emerald";
}) {
  const accentByTone: Record<typeof tone, string> = {
    blue: "text-blue-600 dark:text-blue-300",
    indigo: "text-indigo-600 dark:text-indigo-300",
    cyan: "text-cyan-600 dark:text-cyan-300",
    rose: "text-rose-600 dark:text-rose-300",
    amber: "text-amber-700 dark:text-amber-300",
    violet: "text-violet-600 dark:text-violet-300",
    emerald: "text-emerald-600 dark:text-emerald-300",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5">
      <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-bold leading-none tabular-nums sm:text-2xl ${accentByTone[tone]}`}>
        {value.toLocaleString("ko-KR")}
      </p>
      <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">{note}</p>
    </div>
  );
}

function ProductFilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold sm:text-sm ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30"
      }`}
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );
}

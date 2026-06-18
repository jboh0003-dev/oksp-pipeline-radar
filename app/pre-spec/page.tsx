"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BudgetFilter, {
  matchesBudgetFilter,
  type BudgetFilterValue,
} from "@/components/BudgetFilter";
import CollectionErrorPanel from "@/components/CollectionErrorPanel";
import FeedbackModal from "@/components/FeedbackModal";
import LastCollectionRunCard from "@/components/LastCollectionRunCard";
import PreSpecTable from "@/components/PreSpecTable";
import { useAuth } from "@/lib/auth";
import { authedFetch } from "@/lib/authedFetch";
import { clearPreSpecLocalCache } from "@/lib/cacheReset";
import { fetchPreSpecNotices } from "@/lib/fetchPreSpecNotices";
import {
  fetchLastPreSpecCollectionRun,
  fetchLastSuccessfulPreSpecRun,
} from "@/lib/fetchLastPreSpecCollectionRun";
import type { CollectionRunRow } from "@/lib/supabase";
import { getClientSupabaseDebugInfo } from "@/lib/supabaseDebug";
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
import { isPreSpecKeywordMatched } from "@/lib/preSpec/displayFilter";
import { isStaleSinceMorningCutoff } from "@/lib/freshness";
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
type ListFilter = "recommended" | "saved" | "new" | "imminent";

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

type CollectResp = {
  ok: boolean;
  source?: "pre_spec";
  /** 수집된 사전규격공고 목록 (정규화된 형태). */
  items?: PreSpecAnnouncement[];
  /** ok=false 일 때만 설정되는 사용자 표시 에러 메시지. */
  error?: string | null;
  /** 사용자 친화적 안내 메시지 (성공 / 일부 경고 / 결과 없음). */
  message?: string | null;
  /** 부분 실패 / 부가 안내 — 사용자 화면에는 info 톤으로 노출 (error 아님). */
  warnings?: string[];
  // ── 사용자 명세 카운터 ──
  fetchedCount?: number;
  normalizedCount?: number;
  upsertedCount?: number;
  matchedCount?: number;
  excludedCount?: number;
  // ── legacy / 진단용 ──
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
 * 흐름 (입찰공고와 동일):
 *  - 마운트 / "새로고침": Supabase pre_spec_notices SELECT (fetchPreSpecNotices) — 모든 사용자.
 *  - "지금 수집" (admin 만): /api/pre-spec/collect → G2B fetch + DB upsert → loadPreSpecNotices().
 *  - 캐시(15분 TTL) 가 있으면 즉시 표시 → 백그라운드 DB 재조회.
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
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "running">("idle");
  const [collectMessage, setCollectMessage] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [totalsByCategory, setTotalsByCategory] = useState<Record<string, number>>({});
  /** Supabase pre_spec_notices raw row 수 (필터 전). */
  const [dbRowCount, setDbRowCount] = useState<number | null>(null);
  const [lastPreSpecRun, setLastPreSpecRun] = useState<CollectionRunRow | null>(null);
  const [lastPreSpecSuccess, setLastPreSpecSuccess] = useState<CollectionRunRow | null>(null);
  const [lastPreSpecRunLoading, setLastPreSpecRunLoading] = useState(true);
  const [lastPreSpecRunError, setLastPreSpecRunError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [productFilter, setProductFilter] = useState<ProductFilter>("ALL");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [listFilter, setListFilter] = useState<ListFilter>("recommended");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilterValue>("all");
  /**
   * 표시 모드
   *   matched (기본): 키워드/제품 매칭 + recommendation !== "제외"
   *   all (admin): 수집된 active 전체
   */
  type ViewMode = "matched" | "all";
  const [viewMode, setViewMode] = useState<ViewMode>("matched");

  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const savedSet = useMemo(() => new Set(savedKeys), [savedKeys]);

  const [feedbackList, setFeedbackList] = useState<AnnouncementFeedback[]>([]);
  const feedbackMap = useMemo(() => buildFeedbackMap(feedbackList), [feedbackList]);
  const [feedbackTarget, setFeedbackTarget] = useState<PreSpecAnnouncement | null>(null);

  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchInFlightRef = useRef(false);
  const auth = useAuth();

  /** profiles.role 이 확정된 admin 만 수집·관리 UI 노출. */
  const canAdmin = useMemo(
    () =>
      auth.status === "authed" &&
      auth.profileStatus === "ready" &&
      auth.role === "admin",
    [auth.status, auth.profileStatus, auth.role],
  );

  useEffect(() => {
    if (!canAdmin) {
      setCollectionErrors([]);
      setApiErrors([]);
      setCollectMessage(null);
      setCollectStatus("idle");
      if (viewMode === "all") setViewMode("matched");
    }
  }, [canAdmin, viewMode]);

  /**
   * DB 에서 사전규격 목록 조회 — 입찰공고 fetchNotices 와 동일 패턴.
   * 모든 사용자(일반 user 포함)가 사용한다. G2B 수집은 하지 않는다.
   */
  const loadPreSpecNotices = useCallback(async (): Promise<{ newCount: number }> => {
    if (fetchInFlightRef.current) return { newCount: 0 };
    fetchInFlightRef.current = true;
    const started = Date.now();
    try {
      const result = await fetchPreSpecNotices({
        email: auth.session?.user?.email ?? null,
        role: auth.role,
        viewMode,
        productFilter,
        territoryFilter,
        budgetFilter,
      });

      if (result.error) {
        setErrorMessage(result.error);
        console.warn("[pre-spec/page] DB 조회 실패:", result.error);
      } else {
        setErrorMessage(null);
      }

      setDbRowCount(result.rowCount);

      const next = result.items;
      const keys = next.map((n) => n.announcementKey);
      const { newKeys, newMap } = markNewItemsBySnapshot("preSpec", keys);
      const flagged = applyNewFlags(next, newMap);

      setItems(flagged);
      const now = Date.now();
      savePreSpecCache(flagged, now);
      recordPreSpecLoadDurationMs(now - started);
      setLastFetchAt(now);
      setLastDurationMs(now - started);
      setFromCache(false);

      if (result.rowCount === 0 && !result.error) {
        setInfoMessage(
          canAdmin
            ? "아직 수집된 사전규격공고가 없습니다. '지금 수집'으로 즉시 수집하거나, 자동 수집은 매일 08:30에 실행됩니다."
            : "아직 수집된 사전규격공고가 없습니다. 자동 수집은 매일 08:30에 실행됩니다.",
        );
      } else if (!result.error) {
        setInfoMessage(null);
      }

      const env = getClientSupabaseDebugInfo();
      console.log("[pre-spec/page] loadPreSpecNotices", {
        nodeEnv: env.nodeEnv,
        supabaseProjectRef: env.projectRef,
        supabaseMaskedUrl: env.maskedUrl,
        email: auth.session?.user?.email ?? null,
        role: auth.role,
        dbRowCount: result.rowCount,
        mappedCount: next.length,
        filters: { viewMode, productFilter, territoryFilter, budgetFilter },
      });

      void applyCustomerMatching(flagged).then((withCustomer) => {
        setItems(withCustomer);
        savePreSpecCache(withCustomer, Date.now());
      });

      return { newCount: newKeys.length };
    } catch (err) {
      const fatal = err instanceof Error ? err.message : String(err);
      setErrorMessage(fatal);
      console.error("[pre-spec/page] loadPreSpecNotices exception:", fatal);
      return { newCount: 0 };
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [
    canAdmin,
    auth.role,
    auth.session?.user?.email,
    viewMode,
    productFilter,
    territoryFilter,
    budgetFilter,
  ]);

  /** G2B 사전규격 수집 — admin 전용 (/api/pre-spec/collect). */
  const collectPreSpec = useCallback(async (): Promise<{
    ok: boolean;
    itemsCount: number;
    warningsCount: number;
    errorMessage: string | null;
    successMessage: string | null;
  }> => {
    if (
      auth.status !== "authed" ||
      auth.profileStatus !== "ready" ||
      auth.role !== "admin"
    ) {
      return {
        ok: false,
        itemsCount: 0,
        warningsCount: 0,
        errorMessage: null,
        successMessage: null,
      };
    }
    try {
      const res = await authedFetch("/api/pre-spec/collect?days=7", { method: "GET" });
      const json = (await res.json()) as CollectResp;

      setApiErrors(json.errors ?? []);
      setCollectionErrors(json.collectionErrors ?? []);
      setDebugInfo(json.debug);
      setTotalsByCategory(json.totalsByCategory ?? {});

      const warnings = json.warnings ?? [];

      if (!json.ok || !Array.isArray(json.items)) {
        const fatal =
          json.error ??
          "사전규격 수집에 실패했습니다. 관리자에게 문의해 주세요.";
        setErrorMessage(fatal);
        setInfoMessage(null);
        return {
          ok: false,
          itemsCount: 0,
          warningsCount: warnings.length,
          errorMessage: fatal,
          successMessage: null,
        };
      }

      setErrorMessage(null);
      const successText =
        warnings.length > 0
          ? "사전규격 수집은 완료되었지만 일부 항목은 제외되었습니다."
          : json.items.length === 0
            ? "조건에 맞는 사전규격공고가 없습니다."
            : "사전규격 수집이 완료되었습니다.";
      setInfoMessage(json.message ?? successText);

      console.log("[pre-spec/page] collect ok", {
        fetched: json.fetchedCount,
        normalized: json.normalizedCount,
        upserted: json.upsertedCount,
        warnings: warnings.length,
      });

      return {
        ok: true,
        itemsCount: json.items.length,
        warningsCount: warnings.length,
        errorMessage: null,
        successMessage: successText,
      };
    } catch (err) {
      const fatal =
        err instanceof Error
          ? err.message
          : "사전규격 수집에 실패했습니다. 관리자에게 문의해 주세요.";
      setErrorMessage(fatal);
      return {
        ok: false,
        itemsCount: 0,
        warningsCount: 0,
        errorMessage: fatal,
        successMessage: null,
      };
    }
  }, [auth.profileStatus, auth.role, auth.status]);

  // 첫 진입: 캐시 즉시 페인트 → 백그라운드 DB 조회 (G2B 수집 아님)
  useEffect(() => {
    let mounted = true;
    setSavedKeys(loadSavedKeys());
    setFeedbackList(loadAllFeedbacks("PRE_SPEC"));
    setLastDurationMs(getPreSpecLastDurationMs());

    const cached = loadPreSpecCache();
    if (cached && cached.items.length > 0) {
      const newMap = loadNewMap("preSpec");
      setItems(applyNewFlags(cached.items, newMap));
      setLastFetchAt(cached.fetchedAt);
      setIsLoading(false);
      setFromCache(true);
    }

    (async () => {
      if (!cached) setIsLoading(true);
      try {
        await loadPreSpecNotices();
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadPreSpecNotices]);

  // 사전규격 collection_runs 이력 (마지막 수집 시각 표시용).
  useEffect(() => {
    let mounted = true;
    setLastPreSpecRunLoading(true);
    (async () => {
      const [last, success] = await Promise.all([
        fetchLastPreSpecCollectionRun(),
        fetchLastSuccessfulPreSpecRun(),
      ]);
      if (!mounted) return;
      setLastPreSpecRun(last.run);
      setLastPreSpecSuccess(success.run);
      setLastPreSpecRunError(last.error ?? success.error);
      setLastPreSpecRunLoading(false);
      const env = getClientSupabaseDebugInfo();
      console.log("[pre-spec/page] collection_runs", {
        nodeEnv: env.nodeEnv,
        supabaseProjectRef: env.projectRef,
        lastPreSpecRun: last.run?.finished_at ?? null,
        lastPreSpecSuccess: success.run?.finished_at ?? null,
        lastPreSpecOk: last.run?.ok ?? null,
      });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 필터/검색/페이지사이즈 변경 시 1페이지로 리셋.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    productFilter,
    territoryFilter,
    listFilter,
    budgetFilter,
    pageSize,
  ]);

  /**
   * "지금 수집" — admin 전용. G2B 수집 후 DB 재조회.
   */
  const handleManualCollect = async () => {
    if (!canAdmin || collectStatus === "running") return;
    setCollectStatus("running");
    setCollectMessage("사전규격공고 수집 중... (수십 초 걸릴 수 있어요)");
    const result = await collectPreSpec();

    if (!result.ok) {
      setCollectStatus("error");
      setCollectMessage(
        result.errorMessage ??
          "사전규격 수집에 실패했습니다. 관리자에게 문의해 주세요.",
      );
      return;
    }

    await loadPreSpecNotices();

    const [last, success] = await Promise.all([
      fetchLastPreSpecCollectionRun(),
      fetchLastSuccessfulPreSpecRun(),
    ]);
    setLastPreSpecRun(last.run);
    setLastPreSpecSuccess(success.run);
    setLastPreSpecRunError(last.error ?? success.error);

    setCollectStatus("success");
    if (result.itemsCount === 0) {
      setCollectMessage("조건에 맞는 사전규격공고가 없습니다.");
      return;
    }
    const warnPart =
      result.warningsCount > 0
        ? ` · 경고 ${result.warningsCount.toLocaleString("ko-KR")}건`
        : "";
    setCollectMessage(
      `${result.successMessage ?? "사전규격 수집이 완료되었습니다."}${warnPart}`,
    );
  };

  /** "새로고침" — 모든 사용자. Supabase DB 재조회만 (G2B 수집 없음). */
  const handleRefresh = async () => {
    if (refreshStatus === "running" || collectStatus === "running") return;
    setRefreshStatus("running");
    try {
      await loadPreSpecNotices();
    } finally {
      setRefreshStatus("idle");
    }
  };

  /** 제품 필터 — radio. 동일 항목 재클릭 시 전체 제품으로 해제. */
  const selectProductFilter = (next: ProductFilter) => {
    setProductFilter((prev) => {
      if (next === "ALL") return "ALL";
      return prev === next ? "ALL" : next;
    });
  };

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setListFilter("recommended");
    setProductFilter("ALL");
    setTerritoryFilter("all");
    setBudgetFilter("all");
    setViewMode("matched");
    setCurrentPage(1);
  }, []);

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
    if (listFilter === "new") setListFilter("recommended");
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
   * 데이터 레이어 분리 (사용자 정책 2026-06):
   *  - rawPreSpecItems        : 서버에서 받은 raw 모집단 (= items, 마감 포함)
   *  - activePreSpecItems     : 마감 제외 unique 공고 (= 진행중 + 마감임박 + 확인필요)
   *  - matchedPreSpecItems    : products 또는 matchedKeywords 가 1개 이상인 active 공고
   *  - excludedPreSpecItems   : recommendation === "제외" 인 active 공고
   *  - baselineItems          : viewMode 에 따른 표시 모집단 (recommended | with-excluded | all)
   *  - filteredPreSpecItems   : baselineItems 에 검색/필터/예산 적용 후 표시 후보
   *  - displayedPreSpecItems  : 페이지네이션 적용 후 실제 화면 표시
   *
   *  카운트 라벨 (사용자 정책 2026-06):
   *    조회       = rawPreSpecItems.length          (API 에서 가져온 전체)
   *    매칭       = matchedPreSpecItems.length      (제품/키워드 매칭 1건 이상)
   *    표시       = filteredPreSpecItems.length     (현재 필터 적용 후 — 화면 행 수와 동일)
   *    제외       = excludedPreSpecItems.length     (recommendation === "제외")
   *    진행중     = activeTotal                     (마감 제외 unique 공고)
   *    제품매칭   = productMatchTotal               (products 배열이 비어 있지 않은 수)
   *    복수매칭   = multiMatchCount                 (products 배열 길이 >= 2)
   */
  const rawPreSpecItems = items;
  const activePreSpecItems = useMemo(
    () => rawPreSpecItems.filter(isOpenPreSpec),
    [rawPreSpecItems],
  );
  const matchedPreSpecItems = useMemo(
    () =>
      activePreSpecItems.filter(
        (it) =>
          (Array.isArray(it.products) && it.products.length > 0) ||
          (Array.isArray(it.matchedKeywords) && it.matchedKeywords.length > 0),
      ),
    [activePreSpecItems],
  );
  const excludedPreSpecItems = useMemo(
    () => activePreSpecItems.filter((it) => it.recommendation === "제외"),
    [activePreSpecItems],
  );
  /**
   * 기본 표시 모집단 — viewMode 에 따라 다음과 같이 결정 (사용자 정책 2026-06).
   *
   *   'recommended' (기본): "제외 아님" + "matched (products/keywords ≥ 1)"
   *                         → 영업이 실제로 검토할 후보만 좁게 노출.
   *   'with-excluded'     : "matched 또는 제외" → 매칭이 약해 자동 제외된 항목까지 한 번 훑어볼 때.
   *   'all' (admin)       : active 모집단 전체 (매칭 0건 항목 포함).
   *                         → 운영/디버그용 전체 확인.
   */
  const baselineItems = useMemo(() => {
    if (viewMode === "all" && canAdmin) {
      return activePreSpecItems;
    }
    return activePreSpecItems.filter(
      (it) => it.recommendation !== "제외" && isPreSpecKeywordMatched(it),
    );
  }, [viewMode, canAdmin, activePreSpecItems]);
  // legacy alias — 상단 카드/제품 카운트는 "표시 가능한" 모집단 기준.
  const visibleItems = baselineItems;

  // 1차 필터 (검색/제품/담당본부/임박/신규/관심/피드백/예산)
  // baseline = "제외" recommendation 을 기본 숨김한 모집단.
  const filteredPreSpecItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = baselineItems.filter((it) => {
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
      if (listFilter === "imminent" && it.status !== "마감임박") return false;
      if (listFilter === "new" && !it.isNew) return false;
      if (listFilter === "saved" && !savedSet.has(it.announcementKey)) return false;
      if (!matchesBudgetFilter(it.budget ?? null, budgetFilter)) return false;
      return true;
    });

    /**
     * 최신순 정렬 (사용자 정책 2026-06):
     *  - openDate (=공개일/rcptDt) 내림차순 우선.
     *  - openDate 가 비어 있으면 opinionDeadline 으로 보조 정렬 (의견마감 임박 = 최근 등록일 가능성).
     *  - 둘 다 비면 announcementKey 사전순 (안정 정렬용 tiebreaker).
     *  - 마감 항목이 baseline 에서 제외되어 있어 sort 안에 별도 처리 불필요.
     */
    const dateKey = (it: PreSpecAnnouncement) =>
      (it.openDate ?? "") || (it.opinionDeadline ?? "") || "";
    return [...filtered].sort((a, b) => {
      const da = dateKey(a);
      const db = dateKey(b);
      if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      }
      return a.announcementKey.localeCompare(b.announcementKey);
    });
  }, [
    baselineItems,
    debouncedSearch,
    productFilter,
    territoryFilter,
    listFilter,
    savedSet,
    budgetFilter,
  ]);

  /*
   * 상단 통계 — 사용자 피드백 반영 (조회 / 매칭 / 표시 / 제외 분리).
   *  - rawTotal       : rawPreSpecItems.length (API 가 준 마감 포함 전체)
   *  - activeTotal    : activePreSpecItems.length (마감 제외 unique 공고 수)
   *  - matchedTotal   : 키워드/제품 매칭 1개 이상 (영업적으로 의미 있는 후보)
   *  - excludedTotal  : recommendation === "제외" 인 active 공고
   *  - 표시(filteredTotal): 현재 필터 적용 후 baselineItems 의 매칭 부분
   *  - CONTRABASS / VIOLA / CMP : 각 제품이 products 에 포함된 공고 수 (visibleItems 기준)
   *  - 복수매칭     : products 가 2개 이상인 공고 수 (visibleItems 기준)
   */
  const rawTotal = rawPreSpecItems.length;
  const activeTotal = activePreSpecItems.length;
  const matchedTotal = matchedPreSpecItems.length;
  const excludedTotal = excludedPreSpecItems.length;
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
  const savedTotal = useMemo(
    () => visibleItems.filter((it) => savedSet.has(it.announcementKey)).length,
    [visibleItems, savedSet],
  );
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

  const tableEmptyReason: "no-data" | "filtered" =
    dbRowCount == null || dbRowCount === 0
      ? "no-data"
      : totalFiltered === 0
        ? "filtered"
        : "no-data";

  const clientDebug = useMemo(() => getClientSupabaseDebugInfo(), []);

  useEffect(() => {
    if (isLoading) return;
    const env = getClientSupabaseDebugInfo();
    console.log("[pre-spec/page] display state", {
      nodeEnv: env.nodeEnv,
      supabaseProjectRef: env.projectRef,
      email: auth.session?.user?.email ?? null,
      role: auth.role,
      dbRowCount,
      rawTotal,
      activeTotal,
      totalFiltered,
      viewMode,
      productFilter,
      territoryFilter,
      budgetFilter,
      lastPreSpecRun: lastPreSpecRun?.finished_at ?? null,
    });
  }, [
    isLoading,
    dbRowCount,
    rawTotal,
    activeTotal,
    totalFiltered,
    viewMode,
    productFilter,
    territoryFilter,
    budgetFilter,
    auth.session?.user?.email,
    auth.role,
    lastPreSpecRun?.finished_at,
  ]);

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

        <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400 sm:text-xs">
          {canAdmin ? (
            <p>지금 수집 · 자동 수집 매일 08:30 · 전체 수집본은 관리자 전용</p>
          ) : (
            <p>
              자동 수집 매일 08:30 · 일반 사용자는 조회/검색/피드백만 · 새로고침은 저장된
              공고 재조회
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p className="font-semibold">
              {canAdmin
                ? "사전규격 데이터 조회에 실패했습니다."
                : "사전규격 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
            </p>
            {canAdmin && (
              <p className="mt-1 break-all rounded-md bg-white/80 px-2 py-1 font-mono text-[11px] leading-relaxed text-rose-900 dark:bg-slate-900/60 dark:text-rose-200">
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {/*
          구조화된 수집 오류 패널 — admin 만 볼 수 있다.
          일반 사용자에게는 운영성 메시지를 노출하지 않는다.
        */}
        {canAdmin && (
          <CollectionErrorPanel errors={collectionErrors} title="사전규격 수집 오류" />
        )}

        {!errorMessage && infoMessage && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            {infoMessage}
          </div>
        )}

        <LastCollectionRunCard
          title="최근 사전규격 수집"
          run={lastPreSpecRun}
          error={lastPreSpecRunError}
          isLoading={lastPreSpecRunLoading}
          lastSuccess={lastPreSpecSuccess}
          showManualCollectHint={canAdmin}
        />

        {canAdmin && (
          <p className="mb-3 font-mono text-[10px] text-slate-400 dark:text-slate-500">
            env={clientDebug.nodeEnv} · supabase={clientDebug.maskedUrl ?? "(unset)"} · dbRows=
            {dbRowCount ?? "-"} · role={auth.role ?? "-"}
          </p>
        )}

        {canAdmin && (apiErrors.length > 0 || debugInfo) && !errorMessage && (
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
          수집 정보 띠 — "조회 / 매칭 / 표시 / 제외" 4단 분리 표기.
            - 조회      : 이번 수집 raw 전체 (마감 포함)
            - 매칭      : 키워드/제품 매칭 1개 이상 (영업적으로 의미 있는 후보)
            - 표시      : 현재 필터 적용 후 보이는 건수 (baseline 모집단 기준)
            - 제외      : recommendation === "제외" 인 active 공고 수 (기본 숨김)
            - 진행중/복수매칭/제품매칭 은 보조지표.
        */}
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
            <span title="이번 수집에서 받은 raw 전체 (마감 포함)">
              <span className="text-slate-500 dark:text-slate-400">조회 </span>
              <span className="font-semibold tabular-nums">
                {rawTotal.toLocaleString("ko-KR")}
              </span>
            </span>
            <span title="키워드/제품 매칭이 1건 이상 — 영업적으로 의미 있는 후보 (마감 제외)">
              <span className="text-slate-500 dark:text-slate-400">매칭 </span>
              <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {matchedTotal.toLocaleString("ko-KR")}
              </span>
            </span>
            <span title="현재 필터 + 페이지네이션 기준 (baseline 모집단)">
              <span className="text-slate-500 dark:text-slate-400">표시 </span>
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
            <span title="recommendation === &quot;제외&quot; 인 active 공고 수 (기본 숨김 대상)">
              <span className="text-slate-500 dark:text-slate-400">제외 </span>
              <span className="font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                {excludedTotal.toLocaleString("ko-KR")}
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
            {lastFetchAt && canAdmin && isStaleSinceMorningCutoff(lastFetchAt) && (
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

        {/* 필터 — 4행 구조 */}
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-5 sm:py-4">
          {/* 1행: 검색 · 새로고침 · 필터 초기화 */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="사전규격명 / 기관 / 키워드 검색"
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshStatus === "running" || collectStatus === "running"}
                title="저장된 공고를 DB에서 다시 불러옵니다 (수집 없음)"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 sm:text-sm"
              >
                {refreshStatus === "running" ? "⏳ 조회 중…" : "⟳ 새로고침"}
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-white/10 sm:text-sm"
              >
                필터 초기화
              </button>
            </div>
          </div>

          {/* 2행: 목록 필터 (radio) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:w-auto sm:mr-1">
              목록
            </span>
            <FilterPill
              label="추천공고"
              count={matchedTotal}
              active={listFilter === "recommended"}
              onClick={() => setListFilter("recommended")}
            />
            <FilterPill
              label="관심공고"
              count={savedTotal}
              active={listFilter === "saved"}
              onClick={() => setListFilter("saved")}
              disabled={savedTotal === 0 && listFilter !== "saved"}
            />
            <FilterPill
              label="신규"
              count={newTotal}
              active={listFilter === "new"}
              onClick={() => setListFilter("new")}
              disabled={newTotal === 0 && listFilter !== "new"}
            />
            <FilterPill
              label="의견마감 임박"
              count={imminentTotal}
              active={listFilter === "imminent"}
              onClick={() => setListFilter("imminent")}
              disabled={imminentTotal === 0 && listFilter !== "imminent"}
            />
            {newTotal > 0 && listFilter === "new" && (
              <button
                type="button"
                onClick={handleResetNew}
                className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
              >
                신규 표시 초기화
              </button>
            )}
          </div>

          {/* 3행: 제품 필터 (radio) */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:w-auto sm:mr-1">
              제품
            </span>
            <FilterPill
              label="전체 제품"
              active={productFilter === "ALL"}
              onClick={() => selectProductFilter("ALL")}
            />
            <FilterPill
              label="CONTRABASS"
              count={contrabassTotal}
              active={productFilter === "CONTRABASS"}
              onClick={() => selectProductFilter("CONTRABASS")}
            />
            <FilterPill
              label="VIOLA"
              count={violaTotal}
              active={productFilter === "VIOLA"}
              onClick={() => selectProductFilter("VIOLA")}
            />
            <FilterPill
              label="CMP"
              count={cmpTotal}
              active={productFilter === "CMP"}
              onClick={() => selectProductFilter("CMP")}
            />
          </div>

          {/* 4행: 담당본부 · 예산 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:w-auto sm:mr-1">
              조건
            </span>
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
          </div>

          {/* admin 전용: 수집 · 전체 수집본 */}
          {canAdmin && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
              <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:w-auto sm:mr-1">
                관리
              </span>
              <button
                type="button"
                onClick={() => setViewMode((m) => (m === "all" ? "matched" : "all"))}
                title={
                  viewMode === "all"
                    ? "키워드 매칭 추천공고만 보기"
                    : "수집된 사전규격 전체 (미매칭 포함)"
                }
                className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold sm:text-sm ${
                  viewMode === "all"
                    ? "bg-slate-700 text-white dark:bg-slate-600"
                    : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-white/10"
                }`}
              >
                {viewMode === "all" ? "전체 수집본 (켜짐)" : "전체 수집본"}
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
                title="화면 캐시 초기화"
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm("사전규격 캐시를 비웁니다. 계속할까요?")
                  ) {
                    return;
                  }
                  clearPreSpecLocalCache();
                  window.location.reload();
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-white/10 sm:text-sm"
              >
                캐시 초기화
              </button>
            </div>
          )}

          {canAdmin && collectMessage && (
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
            emptyReason={paged.length === 0 ? tableEmptyReason : "no-data"}
            isAdmin={canAdmin}
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

function FilterPill({
  label,
  count,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold sm:text-sm ${
        disabled
          ? "cursor-not-allowed bg-slate-50 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-white/10"
          : active
            ? "bg-blue-600 text-white shadow-sm"
            : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
      }`}
    >
      {label}
      {count != null && <span className="tabular-nums opacity-80">{count}</span>}
    </button>
  );
}

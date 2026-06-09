"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FeedbackModal from "@/components/FeedbackModal";
import PreSpecTable from "@/components/PreSpecTable";
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
  isPreSpecKeyNew,
  recordPreSpecSeenKeys,
  resetPreSpecSeen,
  type PreSpecSeenMap,
} from "@/lib/preSpec/seen";
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

function applyNewFlags(
  items: PreSpecAnnouncement[],
  seenMap: PreSpecSeenMap,
  now: number = Date.now(),
): PreSpecAnnouncement[] {
  return items.map((it) => {
    const isNew = isPreSpecKeyNew(it.announcementKey, seenMap, now);
    return {
      ...it,
      isNew,
      newAt: seenMap[it.announcementKey] ?? null,
    };
  });
}

type CollectResp = {
  ok: boolean;
  items?: PreSpecAnnouncement[];
  error?: string;
  message?: string;
  totalsByCategory?: Record<string, number>;
  errors?: string[];
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
      const res = await fetch("/api/pre-spec/collect?days=30", { method: "GET" });
      const json = (await res.json()) as CollectResp;

      // 서버가 보내준 진단 정보를 항상 반영 (성공/실패 상관없이).
      setApiErrors(json.errors ?? []);
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
      // 신규 표시 — 최초 시드는 자동으로 stale (no NEW).
      const keys = next.map((n) => n.announcementKey);
      const { newKeys, map } = recordPreSpecSeenKeys(keys);
      const flagged = applyNewFlags(next, map);

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
      setItems(cached.items);
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
  }, [debouncedSearch, productFilter, territoryFilter, showImminentOnly, showNewOnly, showSavedOnly, showFeedbackOnly, pageSize]);

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
    const map = resetPreSpecSeen(keys);
    setItems((prev) => applyNewFlags(prev, map));
    setShowNewOnly(false);
  };

  const territoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const it of items) {
      const t = it.customer?.territory;
      if (t && t !== "미매칭") seen.add(t);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [items]);

  // 1차 필터 (검색/제품/담당본부/임박/신규/관심/피드백)
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return items.filter((it) => {
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
      return true;
    });
  }, [
    items,
    debouncedSearch,
    productFilter,
    territoryFilter,
    showImminentOnly,
    showNewOnly,
    showSavedOnly,
    showFeedbackOnly,
    savedSet,
    feedbackMap,
  ]);

  // 카운트
  const matchedTotal = useMemo(() => items.length, [items]);
  const productMatchedTotal = useMemo(
    () => items.filter((it) => it.products.length > 0).length,
    [items],
  );
  const imminentTotal = useMemo(
    () => items.filter((it) => it.status === "마감임박").length,
    [items],
  );
  const newTotal = useMemo(() => items.filter((it) => it.isNew).length, [items]);
  const feedbackTotal = feedbackList.length;
  const contrabassTotal = useMemo(
    () => items.filter((it) => it.products.includes("CONTRABASS")).length,
    [items],
  );
  const violaTotal = useMemo(
    () => items.filter((it) => it.products.includes("VIOLA")).length,
    [items],
  );
  const cmpTotal = useMemo(
    () => items.filter((it) => it.products.includes("CMP")).length,
    [items],
  );

  // 페이지네이션
  const totalFiltered = filtered.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = pageSize === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEnd = pageSize === 0 ? totalFiltered : Math.min(totalFiltered, pageStart + pageSize);
  const paged = useMemo(
    () => (pageSize === 0 ? filtered : filtered.slice(pageStart, pageEnd)),
    [filtered, pageSize, pageStart, pageEnd],
  );

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
        {/* 브랜드 헤더 — 입찰공고와 톤 통일 */}
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl"
          />
          <div className="relative px-5 py-5 sm:px-7 sm:py-6">
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
            {apiErrors.length > 0 && (
              <details className="mt-2 text-[11px]">
                <summary className="cursor-pointer select-none font-semibold">
                  세부 페이지 오류 {apiErrors.length}건
                </summary>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto rounded-md bg-white/80 px-3 py-1.5 pl-5 dark:bg-slate-900/60">
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

        {/* 상단 카드 */}
        <section className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="전체 사전규격" value={matchedTotal} note="중복제거 기준" tone="blue" />
          <SummaryCard label="제품 매칭" value={productMatchedTotal} note="키워드 매칭 기준" tone="indigo" />
          <SummaryCard label="의견마감 임박" value={imminentTotal} note="3일 이내" tone="rose" />
          <SummaryCard label="신규" value={newTotal} note="최근 24h" tone="amber" />
          <SummaryCard label="피드백" value={feedbackTotal} note="등록된 의견" tone="violet" />
        </section>

        {/* 제품별 카드 */}
        <section className="mb-4 grid grid-cols-3 gap-2.5">
          <SummaryCard label="CONTRABASS" value={contrabassTotal} note="관련 매칭 기준" tone="indigo" />
          <SummaryCard label="VIOLA" value={violaTotal} note="관련 매칭 기준" tone="cyan" />
          <SummaryCard label="CMP" value={cmpTotal} note="관련 매칭 기준" tone="emerald" />
        </section>

        {/* 수집 정보 띠 */}
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">매칭 </span>
            <span className="font-semibold tabular-nums">{matchedTotal.toLocaleString("ko-KR")}</span>
            <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
            <span className="text-slate-500 dark:text-slate-400">표출 </span>
            <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">
              {totalFiltered === 0
                ? "0"
                : pageSize === 0
                  ? `1-${totalFiltered.toLocaleString("ko-KR")}`
                  : `${(pageStart + 1).toLocaleString("ko-KR")}-${pageEnd.toLocaleString("ko-KR")}`}
            </span>
            <span className="text-slate-500 dark:text-slate-400"> / {totalFiltered.toLocaleString("ko-KR")}건</span>
            {fromCache && (
              <span className="ml-2 rounded-full bg-cyan-50 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/30">
                cache
              </span>
            )}
            {lastFetchAt && (
              <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                · 마지막 수집 {new Date(lastFetchAt).toLocaleString("ko-KR")}
                {lastDurationMs && ` (${Math.round(lastDurationMs / 1000)}s)`}
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

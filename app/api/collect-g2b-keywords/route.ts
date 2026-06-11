import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchG2bApi } from "@/lib/g2b/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type G2BItem = Record<string, unknown>;

// 수동 수집의 기본 lookbackDays.
// 기본값을 짧게 두어 "마감 임박/진행 중" 공고 비율을 높이고, 화면 기본 노출에서
// 마감 공고가 끌려오지 않도록 한다. 더 멀리 수집해야 할 때는 query parameter
// (`lookbackDays=...`) 로 명시적으로 늘린다.
//
// cron(/api/cron/collect-g2b)은 자체 DEFAULTS.lookbackDays(=30) 로 호출한다.
const DEFAULT_LOOKBACK_DAYS = 30;
const WINDOW_SIZE_DAYS = 30;
const DEFAULT_MAX_PAGES_PER_WINDOW = 80;
const DEFAULT_TARGET_COUNT = 50;

const INQUIRY_DIV = "1";
const NUM_OF_ROWS = 100;

const SOURCE_TYPE_VALUE = "g2b_active_core";

/**
 * 나라장터 입찰공고 4개 엔드포인트.
 *  - servc  : 용역 (CONTRABASS / VIOLA 영업기회의 주력)
 *  - thng   : 물품 (HW 납품성 비중이 큼 → NEGATIVE_KEYWORDS 로 등급 다운그레이드 처리)
 *  - cnstwk : 공사 (후순위, 대부분 무관)
 *  - frgcpt : 외자 (보조)
 *
 * 일부가 실패해도 다른 것은 계속 시도한다. 키워드는 G2B 검색 파라미터가 아니라
 * 응답 후 post-filter 매칭(PRODUCT_KEYWORD_MAP) 으로 사용한다.
 *
 * TODO: 향후 endpoint 별로 ON/OFF 토글 또는 가중치를 부여해
 *       물품·공사 비중을 조절할 수 있게 옵션을 노출하는 것을 검토한다.
 */
const ENDPOINTS = [
  "getBidPblancListInfoServc",
  "getBidPblancListInfoThng",
  "getBidPblancListInfoCnstwk",
  "getBidPblancListInfoFrgcpt",
] as const;

/**
 * 이번 버전 매칭 대상 — CONTRABASS / VIOLA 두 제품만.
 *
 * 키워드 정책:
 *  - 수집 자체(G2B fetch) 는 키워드를 검색 파라미터로 넘기지 않고 4개 endpoint 의
 *    공고 전체를 가져온 뒤 본문/제목/raw 데이터에서 이 키워드를 substring 으로 검색한다.
 *    → 키워드를 늘리면 매칭 가능 범위가 넓어지고, 그만큼 무관 공고도 들어올 수 있다.
 *  - 그래서 "가상화", "정보시스템", "데이터센터" 같이 광범위한 키워드는 일부러 포함시킨 뒤,
 *    하드웨어 납품성/단순구매성 단어(NEGATIVE_KEYWORDS)와 함께 등급(matchGrade) 단계에서
 *    감점·다운그레이드해 영업 적합도가 낮은 공고를 화면 하단으로 밀어낸다.
 *  - "단순 납품/장비구매/CCTV/UPS/스위치/PC구매" 등이 포함된 공고는
 *    NEGATIVE_KEYWORDS(lib/g2b/constants.ts) 가중치로 등급이 내려간다.
 *  - 단, "서버 가상화", "클라우드 인프라 구축" 같은 표현은 양성 시그널이 강해
 *    그대로 핵심검토/검토 등급을 유지한다.
 */
const PRODUCT_KEYWORD_MAP: Record<string, readonly string[]> = {
  CONTRABASS: [
    // 가상화 / 사설 클라우드 / IaaS 핵심
    "가상화",
    "서버 가상화",
    "VMware",
    "VM웨어",
    "OpenStack",
    "오픈스택",
    "HCI",
    "IaaS",
    // 클라우드 인프라 군
    "클라우드",
    "클라우드 인프라",
    "프라이빗 클라우드",
    "클라우드 구축",
    "클라우드 전환",
    "클라우드 기반",
    "데이터센터 클라우드",
    // 인프라/시스템 구축 (광범위 — NEGATIVE 로 보정)
    "서버 인프라",
    "전산 인프라",
    "데이터센터",
    "전산센터",
    "서버 구축",
    "서버 증설",
    "인프라 구축",
    "인프라 고도화",
    "정보시스템",
    "시스템 구축",
    "차세대 시스템",
    "정보화 사업",
    "AI 플랫폼",
  ],
  VIOLA: [
    // PaaS / Kubernetes 핵심
    "Kubernetes",
    "쿠버네티스",
    "K8S",
    "PaaS",
    "컨테이너",
    "컨테이너 플랫폼",
    "클라우드 네이티브",
    "MSA",
    "애플리케이션 현대화",
    "DevOps",
    // 플랫폼 군 (광범위 — NEGATIVE 로 보정)
    "플랫폼 구축",
    "애플리케이션 플랫폼",
    "서비스 플랫폼",
    "통합 플랫폼",
    "개발 플랫폼",
    "운영 플랫폼",
    "데이터 플랫폼",
    "업무 플랫폼",
    "디지털 플랫폼",
  ],
};

const MATCHED_PRODUCT_NAMES = new Set(Object.keys(PRODUCT_KEYWORD_MAP));

const ALL_PRODUCT_KEYWORDS = new Set(
  Object.values(PRODUCT_KEYWORD_MAP).flatMap((keywords) => [...keywords]),
);

/** 단독 매칭 금지 — 강한 키워드와 함께 있을 때만 참고 키워드로 같이 저장 */
const WEAK_KEYWORDS = [
  "서버",
  "인프라",
  "플랫폼",
  "시스템",
  "전산",
  "정보시스템",
  "유지관리",
  "운영관리",
] as const;

const COLLECT_KEYWORDS: readonly string[] = [...ALL_PRODUCT_KEYWORDS];

const EXCLUDE_KEYWORDS = [
  "체험학습",
  "현장학습",
  "수학여행",
  "항공권",
  "버스 임차",
  "차량 임차",
  "급식",
  "청소",
  "의류",
  "인쇄",
  "기념품",
] as const;

/** EXCLUDE 단어가 있어도 이 강한 기술 키워드가 같이 있으면 살림 */
const STRONG_TECH_RESCUE_KEYWORDS = [
  "가상화",
  "VMware",
  "VM웨어",
  "클라우드",
  "OpenStack",
  "오픈스택",
  "HCI",
  "Kubernetes",
  "쿠버네티스",
] as const;

type DateRangeLabel = { from: string; to: string };

type DateRange = {
  from: string;
  to: string;
  label: DateRangeLabel;
};

type CollectParams = {
  targetCount: number;
  lookbackDays: number;
  maxPagesPerWindow: number;
  pageStart: number;
  /** null이면 maxPagesPerWindow까지 (기존 호환 모드) */
  pageEnd: number | null;
  /** pageEnd가 명시적으로 들어왔는지 (explicit range 모드 여부) */
  useExplicitPageRange: boolean;
};

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function parseOptionalPositiveInt(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

function readQueryParam(request: NextRequest, key: string): string | null {
  return request.nextUrl.searchParams.get(key);
}

function parseCollectParams(request: NextRequest): CollectParams {
  const targetCount = parsePositiveInt(
    readQueryParam(request, "targetCount"),
    DEFAULT_TARGET_COUNT,
  );
  const lookbackDays = parsePositiveInt(
    readQueryParam(request, "lookbackDays"),
    DEFAULT_LOOKBACK_DAYS,
  );

  const explicitPerWindow = readQueryParam(request, "maxPagesPerWindow");
  let maxPagesPerWindow: number;
  if (explicitPerWindow != null && explicitPerWindow.trim() !== "") {
    maxPagesPerWindow = parsePositiveInt(explicitPerWindow, DEFAULT_MAX_PAGES_PER_WINDOW);
  } else {
    const legacy = readQueryParam(request, "maxPages");
    maxPagesPerWindow =
      legacy != null && legacy.trim() !== ""
        ? parsePositiveInt(legacy, DEFAULT_MAX_PAGES_PER_WINDOW)
        : DEFAULT_MAX_PAGES_PER_WINDOW;
  }

  const pageStart = parsePositiveInt(readQueryParam(request, "pageStart"), 1);
  const pageEnd = parseOptionalPositiveInt(readQueryParam(request, "pageEnd"));
  const useExplicitPageRange = pageEnd != null;

  return {
    targetCount,
    lookbackDays,
    maxPagesPerWindow,
    pageStart,
    pageEnd,
    useExplicitPageRange,
  };
}

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const g2bServiceKey = process.env.G2B_SERVICE_KEY?.trim();
  const g2bBaseUrl = process.env.G2B_API_BASE_URL?.trim();

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!g2bServiceKey) missing.push("G2B_SERVICE_KEY");
  if (!g2bBaseUrl) missing.push("G2B_API_BASE_URL");

  return { supabaseUrl, serviceRoleKey, g2bServiceKey, g2bBaseUrl, missing };
}

function getKstDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function getKstTodayDateString(): string {
  const { year, month, day } = getKstDateParts(new Date());
  return `${year}-${month}-${day}`;
}

function formatG2BDate(date: Date, endOfDay = false) {
  const { year, month, day } = getKstDateParts(date);
  const hh = endOfDay ? "23" : "00";
  const min = endOfDay ? "59" : "00";
  return `${year}${month}${day}${hh}${min}`;
}

function offsetDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function buildDateWindows(lookbackDays: number, windowSize: number): DateRange[] {
  const windows: DateRange[] = [];
  const now = new Date();
  let k = 0;

  while (true) {
    const toOffset = k === 0 ? 0 : k * windowSize + 1;
    if (toOffset >= lookbackDays) break;

    const rawFromOffset = (k + 1) * windowSize;
    const fromOffset = Math.min(rawFromOffset, lookbackDays);

    const toDate = offsetDays(now, toOffset);
    const fromDate = offsetDays(now, fromOffset);

    const from = formatG2BDate(fromDate, false);
    const to = formatG2BDate(toDate, true);
    windows.push({ from, to, label: { from, to } });

    if (rawFromOffset >= lookbackDays) break;
    k += 1;
  }

  return windows;
}

function buildG2BUrl(
  baseUrl: string,
  endpoint: string,
  serviceKey: string,
  pageNo: number,
  dateRange: DateRange,
) {
  const params = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(NUM_OF_ROWS),
    inqryDiv: INQUIRY_DIV,
    inqryBgnDt: dateRange.from,
    inqryEndDt: dateRange.to,
    type: "json",
  });
  const cleanBase = baseUrl.replace(/\/$/, "");
  return `${cleanBase}/${endpoint}?serviceKey=${serviceKey}&${params.toString()}`;
}

function asArray(value: unknown): G2BItem[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "object" && v !== null) as G2BItem[];
  }
  if (typeof value === "object") return [value as G2BItem];
  return [];
}

function parseItems(json: unknown): G2BItem[] {
  if (!json || typeof json !== "object") return [];

  const body =
    (json as { response?: { body?: unknown } }).response?.body ??
    (json as { body?: unknown }).body;
  if (!body || typeof body !== "object") return [];

  const items = (body as { items?: unknown }).items;
  if (items == null) return [];

  if (Array.isArray(items)) {
    return items.flatMap((node) => {
      if (node && typeof node === "object" && "item" in (node as object)) {
        return asArray((node as { item?: unknown }).item);
      }
      return asArray(node);
    });
  }

  if (typeof items !== "object") return [];

  const record = items as Record<string, unknown>;
  if (Array.isArray(record.item)) return asArray(record.item);
  if (record.item && typeof record.item === "object") return asArray(record.item);

  const looksLikeNotice =
    "bidNtceNo" in record ||
    "bidNtceNm" in record ||
    "ntceNm" in record ||
    "bidNm" in record;

  return looksLikeNotice ? [record as G2BItem] : [];
}

function getString(item: G2BItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function itemToRawString(item: G2BItem): string {
  return JSON.stringify(item);
}

function getExternalId(item: G2BItem): string | null {
  const bidNtceNo = getString(item, ["bidNtceNo", "bidNo", "ntceNo"]);
  if (!bidNtceNo) return null;
  const bidNtceOrd = getString(item, ["bidNtceOrd", "bidOrd", "ntceOrd"]) || "0";
  return `${bidNtceNo}-${bidNtceOrd}`;
}

function getTitleText(item: G2BItem): string {
  const title = getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]);
  const productName = getString(item, ["prdctClsfcNoNm", "dtilPrdctClsfcNoNm", "itemNm", "prdctNm"]);
  return `${title} ${productName}`.trim();
}

function containsKeyword(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  if (
    ["ai", "vm", "gpu", "llm", "k8s", "cmp", "msa", "sds", "hci", "iaas", "paas", "dr", "git"].includes(
      lowerKeyword,
    )
  ) {
    const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }

  return lowerText.includes(lowerKeyword);
}

function findMatchedKeywords(text: string, keywords: readonly string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (containsKeyword(text, kw)) matched.push(kw);
  }
  return matched;
}

function shouldExclude(rawText: string): boolean {
  const hasExclude = EXCLUDE_KEYWORDS.some((kw) => rawText.includes(kw));
  if (!hasExclude) return false;
  const hasRescue = STRONG_TECH_RESCUE_KEYWORDS.some((kw) => containsKeyword(rawText, kw));
  return !hasRescue;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const text = String(value).trim();
  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }
  const dashedMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashedMatch) {
    return `${dashedMatch[1]}-${dashedMatch[2]}-${dashedMatch[3]}`;
  }
  return null;
}

/** 입찰 마감 관련 필드만 사용 (등록일/시작일 fallback 안 함) */
function getRealDueDate(item: G2BItem): string | null {
  return parseDate(getString(item, ["bidClseDt", "bidClseTm", "opengDt", "opengTm"]));
}

function resolveProducts(rawText: string): string[] {
  const products = new Set<string>();
  for (const [product, keywords] of Object.entries(PRODUCT_KEYWORD_MAP)) {
    if (keywords.some((kw) => containsKeyword(rawText, kw))) {
      products.add(product);
    }
  }
  return Array.from(products);
}

function calcMatchScore(titleText: string, rawText: string, strongHits: string[]): number {
  if (strongHits.some((kw) => containsKeyword(titleText, kw))) return 80;
  if (strongHits.some((kw) => containsKeyword(rawText, kw))) return 60;
  return 40;
}

function classifyGrade(score: number): string {
  if (score >= 70) return "추천";
  if (score >= 40) return "검토";
  return "관찰";
}

function buildSummary(products: string[], strongHits: string[], score: number): string {
  const grade = classifyGrade(score);
  const kwSample = strongHits.slice(0, 5).join(", ");
  const productLabel = products[0] ?? "제품";
  return `[${grade}] ${kwSample} 키워드가 포함되어 ${productLabel} 검토 후보`;
}

type MatchResult = {
  matchedKeywords: string[]; // 저장될 키워드 (강한 + 동반 약한)
  strongMatchedKeywords: string[]; // 통계용
  products: string[];
  matchScore: number;
  summary: string;
};

function evaluateItem(item: G2BItem): MatchResult | null {
  const rawText = itemToRawString(item);
  const titleText = getTitleText(item);

  if (shouldExclude(rawText)) return null;

  const strongMatchedKeywords = findMatchedKeywords(rawText, COLLECT_KEYWORDS);
  if (strongMatchedKeywords.length === 0) return null;

  const products = resolveProducts(rawText);
  if (products.length === 0) return null;

  // 강한 키워드 매칭이 있을 때만 약한 키워드도 참고용으로 함께 저장
  const weakHits = findMatchedKeywords(rawText, WEAK_KEYWORDS);
  const matchedKeywords = [...strongMatchedKeywords, ...weakHits];

  const matchScore = calcMatchScore(titleText, rawText, strongMatchedKeywords);
  const summary = buildSummary(products, strongMatchedKeywords, matchScore);

  return { matchedKeywords, strongMatchedKeywords, products, matchScore, summary };
}

function toNoticeRow(item: G2BItem, match: MatchResult, dueDate: string) {
  const bidNtceNo = getString(item, ["bidNtceNo", "bidNo", "ntceNo"]);
  const bidNtceOrd = getString(item, ["bidNtceOrd", "bidOrd", "ntceOrd"]) || "0";
  const title = getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]) || "제목 없음";
  const agency = getString(item, ["dminsttNm", "ntceInsttNm", "demandInsttNm", "insttNm"]);
  const originalUrl =
    getString(item, ["bidNtceDtlUrl", "bidNtceUrl", "ntceSpecDocUrl1", "ntceSpecDocUrl2"]) || "";
  const budget = getString(item, ["asignBdgtAmt", "presmptPrce", "bssamt", "bdgtAmt", "bidPrce"]);
  const noticeDate = parseDate(getString(item, ["bidNtceDt", "rgstDt"]));

  return {
    external_id: `${bidNtceNo}-${bidNtceOrd}`,
    title,
    agency,
    source: "나라장터",
    original_url: originalUrl,
    budget: budget || "-",
    due_date: dueDate,
    notice_date: noticeDate,
    products: match.products,
    match_score: match.matchScore,
    keywords: match.matchedKeywords,
    summary: match.summary,
    status: "open",
    source_type: SOURCE_TYPE_VALUE,
    raw_data: item,
  };
}

type NoticeRow = ReturnType<typeof toNoticeRow>;

type SampleItem = {
  external_id: string;
  title: string;
  agency: string;
  match_score: number;
  products: string[];
  keywords: string[];
  summary: string;
  due_date: string;
};

function toSample(row: NoticeRow): SampleItem {
  return {
    external_id: row.external_id,
    title: row.title,
    agency: row.agency,
    match_score: row.match_score,
    products: row.products,
    keywords: row.keywords,
    summary: row.summary,
    due_date: row.due_date,
  };
}

type CollectStats = {
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  /** 신규 저장(insert) 건수. saved_count 의 분해값. */
  insertedCount: number;
  /** 기존 공고 업데이트 건수. saved_count 의 분해값. */
  updatedCount: number;
  activeProductMatchedCount: number;
  skippedExpiredCount: number;
  skippedNoProductCount: number;
  fetchedPages: number;
  productCounts: Record<string, number>;
  matchedKeywordCounts: Record<string, number>;
  sampleSavedItems: SampleItem[];
};

type CollectResponse = {
  ok: boolean;
  targetCount: number;
  pageStart: number;
  pageEnd: number | null;
  fetchedPages: number;
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  /** 신규(insert) 건수. */
  insertedCount: number;
  /** 업데이트 건수. */
  updatedCount: number;
  activeProductMatchedCount: number;
  skippedExpiredCount: number;
  skippedNoProductCount: number;
  productCounts: Record<string, number>;
  matchedKeywordCounts: Record<string, number>;
  sampleSavedItems: SampleItem[];
  errors: string[];
};

function emptyStats(): CollectStats {
  return {
    fetchedCount: 0,
    matchedCount: 0,
    savedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    activeProductMatchedCount: 0,
    skippedExpiredCount: 0,
    skippedNoProductCount: 0,
    fetchedPages: 0,
    productCounts: {},
    matchedKeywordCounts: {},
    sampleSavedItems: [],
  };
}

function buildResponseBody(
  ok: boolean,
  params: CollectParams,
  stats: CollectStats,
  errors: string[],
): CollectResponse {
  return {
    ok,
    targetCount: params.targetCount,
    pageStart: params.pageStart,
    pageEnd: params.pageEnd,
    fetchedPages: stats.fetchedPages,
    fetchedCount: stats.fetchedCount,
    matchedCount: stats.matchedCount,
    savedCount: stats.savedCount,
    insertedCount: stats.insertedCount,
    updatedCount: stats.updatedCount,
    activeProductMatchedCount: stats.activeProductMatchedCount,
    skippedExpiredCount: stats.skippedExpiredCount,
    skippedNoProductCount: stats.skippedNoProductCount,
    productCounts: stats.productCounts,
    matchedKeywordCounts: stats.matchedKeywordCounts,
    sampleSavedItems: stats.sampleSavedItems,
    errors,
  };
}

async function fetchG2BPage(
  baseUrl: string,
  endpoint: string,
  serviceKey: string,
  pageNo: number,
  dateRange: DateRange,
): Promise<{ items: G2BItem[]; error: string | null; fatal?: boolean }> {
  // 공통 G2B client 사용 — timeout / retry / resultCode / JSON 파싱 통합 처리.
  // 여기서 호출자(executeCollect) 가 errors[] 에 메시지를 누적하므로 fatal 도 함께 반환한다.
  const url = buildG2BUrl(baseUrl, endpoint, serviceKey, pageNo, dateRange);
  const result = await fetchG2bApi(url, {
    label: `${endpoint}/p${pageNo}`,
    timeoutMs: 20_000,
    retries: 3,
  });

  if (!result.ok) {
    return {
      items: [],
      error: `${endpoint} p${pageNo}: ${result.error}`,
      fatal: true,
    };
  }

  return {
    items: parseItems(result.data),
    error: null,
  };
}

function recordMatchStats(match: MatchResult, stats: CollectStats) {
  for (const kw of match.strongMatchedKeywords) {
    stats.matchedKeywordCounts[kw] = (stats.matchedKeywordCounts[kw] ?? 0) + 1;
  }
  for (const product of match.products) {
    stats.productCounts[product] = (stats.productCounts[product] ?? 0) + 1;
  }
}

function pushSample(samples: SampleItem[], row: NoticeRow, limit = 10) {
  if (samples.length < limit) {
    samples.push(toSample(row));
  }
}

async function executeCollect(
  params: CollectParams,
): Promise<{ status: number; body: CollectResponse }> {
  const { targetCount, lookbackDays, maxPagesPerWindow, pageStart, pageEnd, useExplicitPageRange } =
    params;
  const windows = buildDateWindows(lookbackDays, WINDOW_SIZE_DAYS);

  const { supabaseUrl, serviceRoleKey, g2bServiceKey, g2bBaseUrl, missing } = getEnv();

  if (missing.length > 0) {
    return {
      status: 500,
      body: buildResponseBody(false, params, emptyStats(), missing),
    };
  }

  // 페이지 범위 결정:
  //  - pageEnd 명시 → [pageStart, pageEnd]            (explicit range 모드)
  //  - pageEnd 미지정 → [pageStart, maxPagesPerWindow] (기존 maxPages 호환 모드)
  const effectivePageEnd = pageEnd ?? maxPagesPerWindow;
  const startPage = pageStart;
  const endPage = Math.max(effectivePageEnd, startPage);

  const today = getKstTodayDateString();
  const errors: string[] = [];
  const stats = emptyStats();
  const seenExternalIds = new Set<string>();
  const pendingRows: NoticeRow[] = [];

  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  });

  const flushPending = async () => {
    if (pendingRows.length === 0) return;
    const batch = pendingRows.splice(0, pendingRows.length);

    // upsert 전에 같은 external_id 가 이미 있는지 조회해 신규/업데이트 카운트를 분리한다.
    // 이 한 번의 SELECT 비용이 들지만, 화면에서 "신규 N건 / 업데이트 M건" 을 표시하는 데 필요.
    // 실패해도 upsert 자체는 그대로 진행한다(이전과 동일한 saved_count 만 채워짐).
    const externalIds = batch.map((r) => r.external_id);
    let preexistingIds = new Set<string>();
    if (externalIds.length > 0) {
      const { data: existing, error: existingErr } = await supabase
        .from("notices")
        .select("external_id")
        .in("external_id", externalIds);
      if (existingErr) {
        errors.push(
          [
            "flushPending preflight",
            existingErr.message,
            existingErr.code,
            existingErr.details,
            existingErr.hint,
          ]
            .filter(Boolean)
            .join(" | "),
        );
      } else {
        preexistingIds = new Set(
          (existing ?? [])
            .map((row) => (row as { external_id?: string | null }).external_id ?? "")
            .filter((id): id is string => Boolean(id)),
        );
      }
    }

    const { data, error } = await supabase
      .from("notices")
      .upsert(batch, { onConflict: "external_id" })
      .select("external_id");

    if (error) {
      errors.push(
        [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | "),
      );
      return;
    }

    const savedRows = data ?? [];
    const savedExternalIds = savedRows
      .map((row) => (row as { external_id?: string | null }).external_id ?? "")
      .filter((id): id is string => Boolean(id));

    let insertedInBatch = 0;
    let updatedInBatch = 0;
    if (savedExternalIds.length > 0) {
      for (const id of savedExternalIds) {
        if (preexistingIds.has(id)) updatedInBatch += 1;
        else insertedInBatch += 1;
      }
    } else {
      // upsert 가 select 를 반환하지 않은 fallback. batch 길이로 합산만 채운다.
      insertedInBatch = batch.length - preexistingIds.size;
      updatedInBatch = preexistingIds.size;
    }

    stats.savedCount += savedRows.length || batch.length;
    stats.insertedCount += insertedInBatch;
    stats.updatedCount += updatedInBatch;
  };

  /**
   * legacy 모드(maxPages 기반)에서만 활성. 명시적 pageStart/pageEnd 구간 모드에서는
   * targetCount에 도달하더라도 현재 구간(window 전체)을 정상적으로 마치고 응답한다.
   */
  const shouldStopOnTarget = () =>
    !useExplicitPageRange && stats.activeProductMatchedCount >= targetCount;

  windowLoop: for (const dateRange of windows) {
    if (shouldStopOnTarget()) break;

    const exhaustedEndpoints = new Set<string>();

    pageLoop: for (let pageNo = startPage; pageNo <= endPage; pageNo += 1) {
      if (shouldStopOnTarget()) break windowLoop;

      for (const endpoint of ENDPOINTS) {
        if (shouldStopOnTarget()) break windowLoop;
        if (exhaustedEndpoints.has(endpoint)) continue;

        stats.fetchedPages += 1;

        const page = await fetchG2BPage(
          g2bBaseUrl!,
          endpoint,
          g2bServiceKey!,
          pageNo,
          dateRange,
        );
        if (page.error) errors.push(page.error);
        // 추가 endpoint(공사·외자)가 미지원·404 등으로 실패해도 전체 수집을 멈추지 않고
        // 해당 endpoint만 더 이상 시도하지 않도록 표시한 뒤 다음 endpoint로 진행한다.
        if (page.fatal) {
          exhaustedEndpoints.add(endpoint);
          continue;
        }

        for (const item of page.items) {
          const externalId = getExternalId(item);
          if (!externalId || seenExternalIds.has(externalId)) continue;
          seenExternalIds.add(externalId);
          stats.fetchedCount += 1;

          const match = evaluateItem(item);
          if (!match) {
            stats.skippedNoProductCount += 1;
            continue;
          }

          stats.matchedCount += 1;

          const dueDate = getRealDueDate(item);
          if (dueDate == null || dueDate < today) {
            // 마감 지난 공고 / 마감일 없는 공고는 저장하지 않음
            stats.skippedExpiredCount += 1;
            continue;
          }

          recordMatchStats(match, stats);
          const row = toNoticeRow(item, match, dueDate);
          pendingRows.push(row);
          pushSample(stats.sampleSavedItems, row);
          stats.activeProductMatchedCount += 1;

          // legacy 모드에서만 item 단위 조기 종료 (explicit range 모드는 구간 끝까지 진행)
          if (shouldStopOnTarget()) break;
        }

        if (page.items.length < NUM_OF_ROWS) {
          exhaustedEndpoints.add(endpoint);
        }

        await flushPending();

        if (shouldStopOnTarget()) break windowLoop;
      }

      if (exhaustedEndpoints.size >= ENDPOINTS.length) break pageLoop;
    }
  }

  await flushPending();

  const ok = errors.length === 0 && stats.activeProductMatchedCount >= targetCount;
  return {
    status: 200,
    body: buildResponseBody(ok, params, stats, errors),
  };
}

async function handleCollect(request: NextRequest) {
  const params = parseCollectParams(request);
  const { status, body } = await executeCollect(params);
  if (status !== 200) {
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(body);
}

/**
 * 외부(예: cron route)에서 같은 수집 로직을 호출할 때 쓰는 진입점.
 * NextRequest 없이 직접 파라미터를 넘긴다. 누락 항목은 기본값 사용.
 */
export type RunCollectInput = Partial<{
  targetCount: number;
  lookbackDays: number;
  maxPagesPerWindow: number;
  pageStart: number;
  pageEnd: number | null;
}>;

export async function runCollect(
  input: RunCollectInput = {},
): Promise<{ status: number; body: CollectResponse }> {
  const pageEnd = input.pageEnd ?? null;
  const params: CollectParams = {
    targetCount: input.targetCount ?? DEFAULT_TARGET_COUNT,
    lookbackDays: input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
    maxPagesPerWindow: input.maxPagesPerWindow ?? DEFAULT_MAX_PAGES_PER_WINDOW,
    pageStart: input.pageStart ?? 1,
    pageEnd,
    useExplicitPageRange: pageEnd != null,
  };
  return executeCollect(params);
}

export type { CollectResponse };

export async function GET(request: NextRequest) {
  return handleCollect(request);
}

// MATCHED_PRODUCT_NAMES는 다른 모듈과의 호환을 위해 노출만 해 둔다 (no-op).
void MATCHED_PRODUCT_NAMES;

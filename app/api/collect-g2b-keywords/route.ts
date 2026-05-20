import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type G2BItem = Record<string, unknown>;

const INQUIRY_DAYS = 30;
const NUM_OF_ROWS = 100;
const DEFAULT_TARGET_COUNT = 100;
const DEFAULT_MAX_PAGES = 150;

const ENDPOINTS = ["getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;

/** raw item 전체 문자열에서 하나라도 있으면 후보 */
const COLLECT_KEYWORDS = [
  "가상화",
  "서버 가상화",
  "VMware",
  "VM웨어",
  "OpenStack",
  "오픈스택",
  "IaaS",
  "HCI",
  "클라우드",
  "프라이빗 클라우드",
  "클라우드 전환",
  "클라우드 플랫폼",
  "클라우드 관리",
  "CMP",
  "통합관리",
  "멀티클라우드",
  "하이브리드 클라우드",
  "Kubernetes",
  "쿠버네티스",
  "K8S",
  "PaaS",
  "컨테이너",
  "클라우드 네이티브",
  "MSA",
  "SDS",
  "소프트웨어 정의 스토리지",
  "스토리지",
  "오브젝트 스토리지",
  "백업",
  "DevOps",
  "CI/CD",
  "형상관리",
  "배포관리",
  "AI 인프라",
  "인공지능",
  "생성형 AI",
  "GPU",
  "LLM",
  "MLOps",
  "딥러닝",
  "머신러닝",
  "추론",
] as const;

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

const STRONG_TECH_RESCUE_KEYWORDS = [
  "가상화",
  "VMware",
  "VM웨어",
  "클라우드",
  "GPU",
  "AI 인프라",
  "서버 가상화",
  "OpenStack",
  "오픈스택",
  "IaaS",
  "HCI",
  "LLM",
  "인공지능",
] as const;

const PRODUCT_KEYWORD_MAP: Record<string, readonly string[]> = {
  CONTRABASS: [
    "가상화",
    "서버 가상화",
    "VMware",
    "VM웨어",
    "OpenStack",
    "오픈스택",
    "IaaS",
    "HCI",
    "프라이빗 클라우드",
  ],
  "OKESTRO CMP": [
    "CMP",
    "클라우드 관리",
    "통합관리",
    "멀티클라우드",
    "하이브리드 클라우드",
    "클라우드 플랫폼",
  ],
  VIOLA: [
    "Kubernetes",
    "쿠버네티스",
    "K8S",
    "PaaS",
    "컨테이너",
    "클라우드 네이티브",
    "MSA",
  ],
  "CONTRABASS SDS+": [
    "SDS",
    "소프트웨어 정의 스토리지",
    "스토리지",
    "오브젝트 스토리지",
    "백업",
  ],
  TROMBONE: ["DevOps", "CI/CD", "형상관리", "배포관리"],
  "CONCERTO AI": [
    "AI 인프라",
    "인공지능",
    "생성형 AI",
    "GPU",
    "LLM",
    "MLOps",
    "딥러닝",
    "머신러닝",
    "추론",
  ],
};

const CONCERTO_KEYWORDS = PRODUCT_KEYWORD_MAP["CONCERTO AI"];

const ALL_PRODUCT_KEYWORDS = new Set(
  Object.values(PRODUCT_KEYWORD_MAP).flatMap((keywords) => [...keywords]),
);

const GENERAL_COLLECT_KEYWORDS = COLLECT_KEYWORDS.filter(
  (kw) => !ALL_PRODUCT_KEYWORDS.has(kw),
);

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

function parsePositiveInt(
  raw: string | null,
  fallback: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function parseTargetCount(request: NextRequest): number {
  return parsePositiveInt(
    request.nextUrl.searchParams.get("targetCount"),
    DEFAULT_TARGET_COUNT,
  );
}

function parseMaxPages(request: NextRequest): number {
  return parsePositiveInt(
    request.nextUrl.searchParams.get("maxPages"),
    DEFAULT_MAX_PAGES,
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatG2BDate(date: Date, endOfDay = false) {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = endOfDay ? "23" : "00";
  const min = endOfDay ? "59" : "00";
  return `${yyyy}${mm}${dd}${hh}${min}`;
}

function getDateRange(days: number) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return {
    from: formatG2BDate(start, false),
    to: formatG2BDate(now, true),
  };
}

function maskUrl(url: string) {
  return url.replace(/serviceKey=([^&]+)/, "serviceKey=***");
}

function buildG2BUrl(
  baseUrl: string,
  endpoint: string,
  serviceKey: string,
  pageNo: number,
  dateRange: { from: string; to: string },
) {
  const params = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(NUM_OF_ROWS),
    inqryDiv: "1",
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

  if (["ai", "vm", "gpu", "llm", "k8s", "cmp", "msa", "sds", "hci", "iaas", "paas"].includes(lowerKeyword)) {
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

function hasCollectKeyword(rawText: string): boolean {
  return COLLECT_KEYWORDS.some((kw) => containsKeyword(rawText, kw));
}

function shouldExclude(rawText: string): boolean {
  const hasExclude = EXCLUDE_KEYWORDS.some((kw) => rawText.includes(kw));
  if (!hasExclude) return false;
  const hasRescue = STRONG_TECH_RESCUE_KEYWORDS.some((kw) => containsKeyword(rawText, kw));
  return !hasRescue;
}

function resolveProducts(item: G2BItem, matchedKeywords: string[]): string[] {
  const rawText = itemToRawString(item);
  const products = new Set<string>();

  for (const [product, keywords] of Object.entries(PRODUCT_KEYWORD_MAP)) {
    if (keywords.some((kw) => matchedKeywords.includes(kw))) {
      products.add(product);
    }
  }

  if (products.has("CONCERTO AI")) {
    const hasConcertoHit = CONCERTO_KEYWORDS.some((kw) => containsKeyword(rawText, kw));
    const hasLearning = containsKeyword(rawText, "학습");
    if (hasLearning && !hasConcertoHit) {
      products.delete("CONCERTO AI");
    }
  }

  return Array.from(products);
}

function calcMatchScore(
  titleText: string,
  rawText: string,
  matchedKeywords: string[],
): number {
  const strongHits = matchedKeywords.filter((kw) => ALL_PRODUCT_KEYWORDS.has(kw));
  const generalHits = matchedKeywords.filter((kw) =>
    (GENERAL_COLLECT_KEYWORDS as readonly string[]).includes(kw),
  );

  if (strongHits.some((kw) => containsKeyword(titleText, kw))) return 80;
  if (strongHits.some((kw) => containsKeyword(rawText, kw))) return 60;
  if (generalHits.length > 0 || matchedKeywords.length > 0) return 40;
  return 40;
}

function classifyGrade(score: number): string {
  if (score >= 70) return "추천";
  if (score >= 40) return "검토";
  return "관찰";
}

function buildSummary(products: string[], matchedKeywords: string[], score: number): string {
  const grade = classifyGrade(score);
  const kwSample = matchedKeywords.slice(0, 5).join(", ");
  const productLabel = products[0] ?? "제품";
  return `[${grade}] ${kwSample} 키워드가 포함되어 ${productLabel} 검토 후보`;
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

type MatchResult = {
  matchedKeywords: string[];
  products: string[];
  matchScore: number;
  summary: string;
};

function evaluateItem(item: G2BItem): MatchResult | null {
  const rawText = itemToRawString(item);
  const titleText = getTitleText(item);

  if (!hasCollectKeyword(rawText)) return null;
  if (shouldExclude(rawText)) return null;

  const matchedKeywords = findMatchedKeywords(rawText, COLLECT_KEYWORDS);
  if (matchedKeywords.length === 0) return null;

  const products = resolveProducts(item, matchedKeywords);
  if (products.length === 0) return null;

  const matchScore = calcMatchScore(titleText, rawText, matchedKeywords);
  const summary = buildSummary(products, matchedKeywords, matchScore);

  return { matchedKeywords, products, matchScore, summary };
}

function toNoticeRow(item: G2BItem, match: MatchResult) {
  const bidNtceNo = getString(item, ["bidNtceNo", "bidNo", "ntceNo"]);
  const bidNtceOrd = getString(item, ["bidNtceOrd", "bidOrd", "ntceOrd"]) || "0";
  const title = getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]) || "제목 없음";
  const agency = getString(item, ["dminsttNm", "ntceInsttNm", "demandInsttNm", "insttNm"]);
  const originalUrl =
    getString(item, ["bidNtceDtlUrl", "bidNtceUrl", "ntceSpecDocUrl1", "ntceSpecDocUrl2"]) || "";
  const budget = getString(item, ["asignBdgtAmt", "presmptPrce", "bssamt", "bdgtAmt", "bidPrce"]);
  const dueDate =
    parseDate(getString(item, ["bidClseDt", "opengDt", "bidBeginDt", "bidNtceDt"])) ??
    new Date().toISOString().slice(0, 10);
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
    source_type: "g2b_keyword",
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
  };
}

type CollectResponse = {
  ok: boolean;
  targetCount: number;
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  fetchedPages: number;
  productCounts: Record<string, number>;
  matchedKeywordCounts: Record<string, number>;
  sampleSavedItems: SampleItem[];
  errors: string[];
};

function buildResponse(partial: CollectResponse): CollectResponse {
  return partial;
}

async function fetchG2BPage(
  baseUrl: string,
  endpoint: string,
  serviceKey: string,
  pageNo: number,
  dateRange: { from: string; to: string },
) {
  const url = buildG2BUrl(baseUrl, endpoint, serviceKey, pageNo, dateRange);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      items: [] as G2BItem[],
      error: `JSON 파싱 실패 (${endpoint} p${pageNo})`,
    };
  }

  const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })
    .response?.header;
  const resultCode = header?.resultCode ?? null;

  if (resultCode != null && resultCode !== "00") {
    return {
      items: [] as G2BItem[],
      error: `${endpoint} p${pageNo}: ${header?.resultMsg ?? resultCode}`,
    };
  }

  return {
    items: parseItems(json),
    error: null as string | null,
  };
}

function recordMatchStats(
  match: MatchResult,
  productCounts: Record<string, number>,
  matchedKeywordCounts: Record<string, number>,
) {
  for (const kw of match.matchedKeywords) {
    matchedKeywordCounts[kw] = (matchedKeywordCounts[kw] ?? 0) + 1;
  }
  for (const product of match.products) {
    productCounts[product] = (productCounts[product] ?? 0) + 1;
  }
}

function hasReachedTarget(
  savedCount: number,
  matchedCount: number,
  targetCount: number,
): boolean {
  return savedCount >= targetCount || matchedCount >= targetCount;
}

async function handleCollect(request: NextRequest) {
  const targetCount = parseTargetCount(request);
  const maxPages = parseMaxPages(request);
  const { supabaseUrl, serviceRoleKey, g2bServiceKey, g2bBaseUrl, missing } = getEnv();

  const emptyResponse = (errors: string[]): CollectResponse =>
    buildResponse({
      ok: false,
      targetCount,
      fetchedCount: 0,
      matchedCount: 0,
      savedCount: 0,
      fetchedPages: 0,
      productCounts: {},
      matchedKeywordCounts: {},
      sampleSavedItems: [],
      errors,
    });

  if (missing.length > 0) {
    return NextResponse.json(emptyResponse(missing), { status: 500 });
  }

  const dateRange = getDateRange(INQUIRY_DAYS);
  const errors: string[] = [];
  const seenExternalIds = new Set<string>();
  const exhaustedEndpoints = new Set<string>();
  const productCounts: Record<string, number> = {};
  const matchedKeywordCounts: Record<string, number> = {};
  const sampleSavedItems: SampleItem[] = [];
  const pendingRows: NoticeRow[] = [];

  let fetchedCount = 0;
  let matchedCount = 0;
  let savedCount = 0;
  let fetchedPages = 0;

  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  });

  const flushPending = async () => {
    if (pendingRows.length === 0) return;
    const batch = pendingRows.splice(0, pendingRows.length);

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

    savedCount += data?.length ?? batch.length;
    for (const row of batch) {
      if (sampleSavedItems.length < 10) {
        sampleSavedItems.push(toSample(row));
      }
    }
  };

  pageLoop: for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    if (hasReachedTarget(savedCount, matchedCount, targetCount)) break;

    for (const endpoint of ENDPOINTS) {
      if (hasReachedTarget(savedCount, matchedCount, targetCount)) break pageLoop;
      if (exhaustedEndpoints.has(endpoint)) continue;

      const page = await fetchG2BPage(
        g2bBaseUrl!,
        endpoint,
        g2bServiceKey!,
        pageNo,
        dateRange,
      );
      fetchedPages += 1;
      if (page.error) errors.push(page.error);

      for (const item of page.items) {
        if (hasReachedTarget(savedCount, matchedCount, targetCount)) break;

        const externalId = getExternalId(item);
        if (!externalId || seenExternalIds.has(externalId)) continue;
        seenExternalIds.add(externalId);
        fetchedCount += 1;

        const match = evaluateItem(item);
        if (!match) continue;

        matchedCount += 1;
        recordMatchStats(match, productCounts, matchedKeywordCounts);
        pendingRows.push(toNoticeRow(item, match));

        if (hasReachedTarget(savedCount, matchedCount, targetCount)) break;
      }

      if (page.items.length < NUM_OF_ROWS) {
        exhaustedEndpoints.add(endpoint);
      }

      await flushPending();

      if (hasReachedTarget(savedCount, matchedCount, targetCount)) break pageLoop;
    }

    if (exhaustedEndpoints.size >= ENDPOINTS.length) break;
  }

  await flushPending();

  return NextResponse.json(
    buildResponse({
      ok: errors.length === 0 && savedCount >= targetCount,
      targetCount,
      fetchedCount,
      matchedCount,
      savedCount,
      fetchedPages,
      productCounts,
      matchedKeywordCounts,
      sampleSavedItems,
      errors,
    }),
  );
}

export async function GET(request: NextRequest) {
  return handleCollect(request);
}

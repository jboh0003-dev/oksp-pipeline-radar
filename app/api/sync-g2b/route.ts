import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type G2BItem = Record<string, unknown>;

const INQUIRY_DAYS = 30;
const NUM_OF_ROWS = 100;
const SAFETY_MAX_PAGES = 300;

const ENDPOINTS = [
  "getBidPblancListInfoServc",
  "getBidPblancListInfoThng",
] as const;

const PRODUCT_KEYWORDS = {
  CONTRABASS: {
    strong: [
      "가상화",
      "서버 가상화",
      "클라우드",
      "VMware",
      "VM",
      "OpenStack",
      "IaaS",
      "HCI",
      "프라이빗 클라우드",
      "KVM",
      "탈 VMware",
      "윈백",
    ],
    weak: ["서버", "인프라", "전산", "데이터센터", "시스템 구축"],
  },
  "CONTRABASS Legato": {
    strong: ["마이그레이션", "VM 전환", "워크로드 전환", "VMware 전환", "하이퍼바이저 전환"],
    weak: ["전환", "이관", "이전", "고도화"],
  },
  "CONTRABASS SDS+": {
    strong: ["SDS", "소프트웨어 정의 스토리지", "오브젝트 스토리지", "블록 스토리지", "파일 스토리지"],
    weak: ["스토리지", "백업", "저장장치"],
  },
  "OKESTRO CMP": {
    strong: ["CMP", "클라우드 관리", "멀티클라우드", "하이브리드 클라우드", "통합관리", "클라우드 포털"],
    weak: ["자원관리", "운영관리", "관리 포털", "플랫폼 운영"],
  },
  VIOLA: {
    strong: ["Kubernetes", "쿠버네티스", "K8S", "PaaS", "컨테이너", "클라우드 네이티브", "MSA"],
    weak: ["애플리케이션 현대화", "플랫폼", "서비스형"],
  },
  TROMBONE: {
    strong: ["DevOps", "CI/CD", "배포관리", "형상관리", "Git", "소스코드", "변경관리"],
    weak: ["개발환경", "개발 플랫폼", "자동 배포"],
  },
  "CONCERTO AI": {
    strong: [
      "AI",
      "인공지능",
      "GPU",
      "LLM",
      "MLOps",
      "생성형 AI",
      "AI 인프라",
      "모델 배포",
      "추론",
      "딥러닝",
      "머신러닝",
    ],
    weak: [],
  },
};

const GENERAL_IT_KEYWORDS = [
  "정보시스템",
  "전산",
  "서버",
  "스토리지",
  "네트워크",
  "데이터센터",
  "인프라",
  "통합관리",
  "유지관리",
  "고도화",
  "플랫폼",
  "클라우드 전환",
  "정보화",
  "시스템 구축",
  "소프트웨어",
  "솔루션",
  "가상화",
  "백업",
  "보안관제",
  "운영관리",
];

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
  "단순 인쇄",
];

const EXPIRED_KEEP_KEYWORDS = [
  "재공고",
  "정정",
  "변경",
  "연장",
  "추가모집",
  "추가 공고",
  "긴급",
];

/** 무관 키워드가 있어도 강한 기술 키워드가 함께 있으면 관찰 등급으로 유지 */
const STRONG_TECH_RESCUE_KEYWORDS = [
  "AI",
  "인공지능",
  "GPU",
  "LLM",
  "MLOps",
  "생성형 AI",
  "AI 인프라",
  "모델 배포",
  "추론",
  "딥러닝",
  "머신러닝",
  "클라우드",
  "가상화",
  "서버",
  "인프라",
  "OpenStack",
  "HCI",
  "VMware",
];

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const g2bServiceKey = process.env.G2B_SERVICE_KEY?.trim();
  const g2bBaseUrl = process.env.G2B_API_BASE_URL?.trim();

  const missing = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!g2bServiceKey) missing.push("G2B_SERVICE_KEY");
  if (!g2bBaseUrl) missing.push("G2B_API_BASE_URL");

  return { supabaseUrl, serviceRoleKey, g2bServiceKey, g2bBaseUrl, missing };
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
  dateRange: { from: string; to: string }
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
  if (Array.isArray(value)) return value.filter((v) => typeof v === "object" && v !== null) as G2BItem[];
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

function slimItemSample(item: G2BItem | null) {
  if (!item) return null;
  return {
    bidNtceNo: getString(item, ["bidNtceNo", "bidNo", "ntceNo"]),
    bidNtceOrd: getString(item, ["bidNtceOrd", "bidOrd", "ntceOrd"]),
    bidNtceNm: getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]),
    dminsttNm: getString(item, ["dminsttNm", "ntceInsttNm", "demandInsttNm"]),
    bidClseDt: getString(item, ["bidClseDt", "opengDt"]),
  };
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

function joinText(item: G2BItem) {
  return Object.values(item)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => String(v))
    .join(" ");
}

function containsKeyword(text: string, keyword: string) {
  if (!text || !keyword) return false;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  if (["ai", "vm", "gpu", "llm", "k8s"].includes(lowerKeyword)) {
    const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }

  return lowerText.includes(lowerKeyword);
}

function parseDate(value: string) {
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

function isExpired(dueDate: string | null, rawText: string) {
  if (!dueDate) return false;

  const keep = EXPIRED_KEEP_KEYWORDS.some((kw) => rawText.includes(kw));
  if (keep) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueDate}T00:00:00`);
  return due < today;
}

function classifyScore(score: number) {
  if (score >= 70) return "추천";
  if (score >= 40) return "검토";
  return "관찰";
}

function matchNotice(item: G2BItem) {
  const title = getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]);
  const agency = getString(item, ["dminsttNm", "ntceInsttNm", "demandInsttNm", "insttNm"]);
  const productName = getString(item, ["prdctClsfcNoNm", "dtilPrdctClsfcNoNm", "itemNm", "prdctNm"]);
  const rawText = joinText(item);
  const titleText = `${title} ${productName}`;
  const allText = `${title} ${agency} ${productName} ${rawText}`;

  const hasHardExclude = EXCLUDE_KEYWORDS.some((kw) => allText.includes(kw));
  const hasStrongTechKeyword = STRONG_TECH_RESCUE_KEYWORDS.some((kw) =>
    containsKeyword(allText, kw),
  );

  if (hasHardExclude && !hasStrongTechKeyword) {
    return {
      excluded: true,
      score: 0,
      products: [],
      keywords: [],
      reason: "체험학습/항공권/임차 등 명확한 무관 키워드 포함",
    };
  }

  let score = 0;
  const matchedProducts = new Set<string>();
  const matchedKeywords = new Set<string>();

  for (const [product, groups] of Object.entries(PRODUCT_KEYWORDS)) {
    for (const kw of groups.strong) {
      if (containsKeyword(titleText, kw)) {
        score += 45;
        matchedProducts.add(product);
        matchedKeywords.add(kw);
      } else if (containsKeyword(allText, kw)) {
        score += 25;
        matchedProducts.add(product);
        matchedKeywords.add(kw);
      }
    }

    if (product === "CONCERTO AI") {
      continue;
    }

    for (const kw of groups.weak) {
      if (containsKeyword(titleText, kw)) {
        score += 18;
        matchedProducts.add(product);
        matchedKeywords.add(kw);
      } else if (containsKeyword(allText, kw)) {
        score += 8;
        matchedProducts.add(product);
        matchedKeywords.add(kw);
      }
    }
  }

  for (const kw of GENERAL_IT_KEYWORDS) {
    if (containsKeyword(titleText, kw)) {
      score += 12;
      matchedKeywords.add(kw);
    } else if (containsKeyword(allText, kw)) {
      score += 5;
      matchedKeywords.add(kw);
    }
  }

  if (matchedProducts.size === 0 && matchedKeywords.size > 0) {
    matchedProducts.add("검토 필요");
  }

  let finalScore = Math.min(score, 100);

  if (hasHardExclude && hasStrongTechKeyword) {
    finalScore = Math.max(20, Math.min(finalScore, 39));
  }

  const level = classifyScore(finalScore);

  return {
    excluded: false,
    score: finalScore,
    products: Array.from(matchedProducts),
    keywords: Array.from(matchedKeywords),
    reason:
      matchedKeywords.size > 0
        ? `[${level}] ${Array.from(matchedKeywords).slice(0, 5).join(", ")} 키워드 기준 검토 후보`
        : "",
  };
}

function toNoticeRow(item: G2BItem, match: ReturnType<typeof matchNotice>) {
  const bidNtceNo = getString(item, ["bidNtceNo", "bidNo", "ntceNo"]);
  const bidNtceOrd = getString(item, ["bidNtceOrd", "bidOrd", "ntceOrd"]) || "0";
  const title = getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]) || "제목 없음";
  const agency = getString(item, ["dminsttNm", "ntceInsttNm", "demandInsttNm", "insttNm"]);
  const originalUrl =
    getString(item, ["bidNtceDtlUrl", "bidNtceUrl", "ntceSpecDocUrl1", "ntceSpecDocUrl2"]) || "";
  const budget = getString(item, ["asignBdgtAmt", "presmptPrce", "bssamt", "bdgtAmt", "bidPrce"]);
  const dueDate = parseDate(getString(item, ["bidClseDt", "opengDt", "bidBeginDt", "bidNtceDt"]));
  const noticeDate = parseDate(getString(item, ["bidNtceDt", "rgstDt"]));

  return {
    external_id: `${bidNtceNo || title}-${bidNtceOrd}`,
    title,
    agency,
    source: "나라장터",
    original_url: originalUrl,
    budget,
    due_date: dueDate,
    notice_date: noticeDate,
    products: match.products,
    match_score: match.score,
    keywords: match.keywords,
    summary: match.reason,
    status: "open",
    source_type: "g2b",
    raw_data: item,
  };
}

async function fetchG2BPage(
  baseUrl: string,
  endpoint: string,
  serviceKey: string,
  pageNo: number,
  dateRange: { from: string; to: string }
) {
  const url = buildG2BUrl(baseUrl, endpoint, serviceKey, pageNo, dateRange);

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let json: any = null;
  let parseError: string | null = null;

  try {
    json = JSON.parse(text);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const header = json?.response?.header ?? {};
  const body = json?.response?.body ?? {};
  const items = parseItems(json);

  return {
    endpoint,
    pageNo,
    status: res.status,
    contentType: res.headers.get("content-type"),
    resultCode: header?.resultCode ?? null,
    resultMsg: header?.resultMsg ?? null,
    totalCount: body?.totalCount ?? null,
    parsedItemCount: items.length,
    firstItemKeys: items[0] ? Object.keys(items[0]).slice(0, 30) : [],
    firstItemSample: slimItemSample(items[0] ?? null),
    requestUrlWithoutKey: maskUrl(url),
    parseError,
    items,
  };
}

type EndpointStat = {
  endpoint: string;
  totalCount: number;
  totalPages: number;
  fetchedPages: number;
  parsedItemCount: number;
  resultCode: string | null;
  resultMsg: string | null;
  pagesTruncated?: boolean;
  warning?: string;
};

function parseTotalCount(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function calcTotalPages(totalCount: number): number {
  if (totalCount <= 0) return 1;
  return Math.ceil(totalCount / NUM_OF_ROWS);
}

async function fetchAllPagesForEndpoint(
  baseUrl: string,
  serviceKey: string,
  endpoint: string,
  dateRange: { from: string; to: string },
  endpointDebugs: Array<Record<string, unknown>>,
  errors: string[],
): Promise<{ items: G2BItem[]; stat: EndpointStat }> {
  const items: G2BItem[] = [];
  let parsedItemCount = 0;
  let fetchedPages = 0;
  let resultCode: string | null = null;
  let resultMsg: string | null = null;
  let totalCount = 0;
  let calculatedTotalPages = 1;
  let pagesToFetch = 1;
  let pagesTruncated = false;
  let warning: string | undefined;

  const firstPage = await fetchG2BPage(baseUrl, endpoint, serviceKey, 1, dateRange);
  resultCode = firstPage.resultCode;
  resultMsg = firstPage.resultMsg;
  totalCount = parseTotalCount(firstPage.totalCount);
  calculatedTotalPages = calcTotalPages(totalCount);
  pagesToFetch = calculatedTotalPages;

  endpointDebugs.push({
    endpoint: firstPage.endpoint,
    pageNo: 1,
    resultCode: firstPage.resultCode,
    resultMsg: firstPage.resultMsg,
    totalCount: firstPage.totalCount,
    parsedItemCount: firstPage.parsedItemCount,
    firstItemSample: firstPage.firstItemSample,
    requestUrlWithoutKey: firstPage.requestUrlWithoutKey,
  });

  const firstPageFailed =
    (firstPage.resultCode != null && firstPage.resultCode !== "00") ||
    firstPage.parseError != null ||
    firstPage.status >= 400;

  if (firstPageFailed) {
    const detail = firstPage.parseError
      ? `parse: ${firstPage.parseError}`
      : `${firstPage.resultCode ?? "HTTP"}: ${firstPage.resultMsg ?? firstPage.status}`;
    errors.push(`${endpoint} p1: ${detail}`);
    return {
      items,
      stat: {
        endpoint,
        totalCount,
        totalPages: calculatedTotalPages,
        fetchedPages: 0,
        parsedItemCount: 0,
        resultCode,
        resultMsg,
      },
    };
  }

  if (calculatedTotalPages > SAFETY_MAX_PAGES) {
    pagesTruncated = true;
    pagesToFetch = SAFETY_MAX_PAGES;
    warning = `totalPages ${calculatedTotalPages} exceeds safetyMaxPages ${SAFETY_MAX_PAGES}; capped at ${SAFETY_MAX_PAGES}`;
    errors.push(`${endpoint}: ${warning}`);
  }

  const appendPageItems = (page: Awaited<ReturnType<typeof fetchG2BPage>>) => {
    items.push(...page.items);
    parsedItemCount += page.parsedItemCount;
    fetchedPages += 1;
  };

  appendPageItems(firstPage);

  for (let pageNo = 2; pageNo <= pagesToFetch; pageNo += 1) {
    try {
      const page = await fetchG2BPage(baseUrl, endpoint, serviceKey, pageNo, dateRange);

      if (page.resultCode != null && page.resultCode !== "00") {
        errors.push(`${endpoint} p${pageNo}: ${page.resultCode}: ${page.resultMsg ?? "API 오류"}`);
        endpointDebugs.push({
          endpoint: page.endpoint,
          pageNo: page.pageNo,
          resultCode: page.resultCode,
          resultMsg: page.resultMsg,
          parsedItemCount: 0,
          error: true,
        });
        continue;
      }

      if (page.parseError != null || page.status >= 400) {
        const detail =
          page.parseError ?? `HTTP ${page.status}: ${page.resultMsg ?? "request failed"}`;
        errors.push(`${endpoint} p${pageNo}: ${detail}`);
        endpointDebugs.push({
          endpoint: page.endpoint,
          pageNo: page.pageNo,
          resultCode: page.resultCode,
          resultMsg: page.resultMsg,
          parsedItemCount: 0,
          error: detail,
        });
        continue;
      }

      appendPageItems(page);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${endpoint} p${pageNo}: ${message}`);
      endpointDebugs.push({
        endpoint,
        pageNo,
        resultCode: null,
        resultMsg: null,
        parsedItemCount: 0,
        error: message,
      });
    }
  }

  return {
    items,
    stat: {
      endpoint,
      totalCount,
      totalPages: calculatedTotalPages,
      fetchedPages,
      parsedItemCount,
      resultCode,
      resultMsg,
      ...(pagesTruncated ? { pagesTruncated: true, warning } : {}),
    },
  };
}

async function handleSync() {
  const { supabaseUrl, serviceRoleKey, g2bServiceKey, g2bBaseUrl, missing } = getEnv();

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "환경변수가 없습니다.",
        missing,
      },
      { status: 500 }
    );
  }

  const dateRange = getDateRange(INQUIRY_DAYS);
  const endpointDebugs: Array<Record<string, unknown>> = [];
  const endpointStats: EndpointStat[] = [];
  const errors: string[] = [];
  const allItems: G2BItem[] = [];

  for (const endpoint of ENDPOINTS) {
    const { items, stat } = await fetchAllPagesForEndpoint(
      g2bBaseUrl!,
      g2bServiceKey!,
      endpoint,
      dateRange,
      endpointDebugs,
      errors,
    );
    allItems.push(...items);
    endpointStats.push(stat);
  }
  const fetchedCount = allItems.length;

  if (fetchedCount === 0) {
    return NextResponse.json({
      ok: false,
      checkedEndpoints: [...ENDPOINTS],
      fetchedCount: 0,
      uniqueFetchedCount: 0,
      matchedCount: 0,
      savedCount: 0,
      recommendedCount: 0,
      reviewCount: 0,
      watchCount: 0,
      expiredSkippedCount: 0,
      excludedCount: 0,
      endpointStats,
      productCounts: {},
      errors,
      endpointDebugs,
      sampleSavedItems: [],
      topMatchedSamples: [],
      dateRange,
      message: "수집된 공고가 0건입니다. endpointDebugs와 errors를 확인하세요.",
    });
  }

  const uniqueMap = new Map<string, G2BItem>();

  for (const item of allItems) {
    const bidNtceNo = getString(item, ["bidNtceNo", "bidNo", "ntceNo"]);
    const bidNtceOrd = getString(item, ["bidNtceOrd", "bidOrd", "ntceOrd"]) || "0";
    const title = getString(item, ["bidNtceNm", "bidNm", "ntceNm", "bsnsNm"]);
    const key = `${bidNtceNo || title}-${bidNtceOrd}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, item);
  }

  const uniqueItems = Array.from(uniqueMap.values());
  const rows: ReturnType<typeof toNoticeRow>[] = [];
  let excludedCount = 0;
  let expiredSkippedCount = 0;

  for (const item of uniqueItems) {
    const match = matchNotice(item);
    const rawText = joinText(item);
    const dueDate = parseDate(getString(item, ["bidClseDt", "opengDt", "bidBeginDt", "bidNtceDt"]));

    if (match.excluded) {
      excludedCount += 1;
      continue;
    }

    if (isExpired(dueDate, rawText)) {
      expiredSkippedCount += 1;
      continue;
    }

    if (match.score >= 20) {
      rows.push(toNoticeRow(item, match));
    }
  }

  rows.sort((a, b) => {
    const levelRank = (score: number) => (score >= 70 ? 0 : score >= 40 ? 1 : 2);
    const rankDiff = levelRank(a.match_score) - levelRank(b.match_score);
    if (rankDiff !== 0) return rankDiff;
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    return String(a.due_date ?? "9999-12-31").localeCompare(String(b.due_date ?? "9999-12-31"));
  });

  const productCounts: Record<string, number> = {};
  for (const row of rows) {
    for (const product of row.products ?? []) {
      productCounts[product] = (productCounts[product] ?? 0) + 1;
    }
  }

  let savedCount = 0;
  const saveErrors: string[] = [];

  if (rows.length > 0) {
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("notices")
      .upsert(rows, { onConflict: "external_id" })
      .select("id, external_id, title, match_score, products");

    if (error) {
      saveErrors.push(
        [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | "),
      );
    } else {
      savedCount = data?.length ?? rows.length;
    }
  }

  const recommendedCount = rows.filter((row) => row.match_score >= 70).length;
  const reviewCount = rows.filter((row) => row.match_score >= 40 && row.match_score < 70).length;
  const watchCount = rows.filter((row) => row.match_score >= 20 && row.match_score < 40).length;

  const toMatchedSample = (row: (typeof rows)[number]) => ({
    external_id: row.external_id,
    title: row.title,
    agency: row.agency,
    match_score: row.match_score,
    match_grade: classifyScore(row.match_score),
    products: row.products,
    keywords: row.keywords,
    due_date: row.due_date,
    summary: row.summary,
  });

  const allErrors = [...errors, ...saveErrors];
  const allEndpointsEmpty = endpointStats.every((stat) => stat.parsedItemCount === 0);

  return NextResponse.json({
    ok: allErrors.length === 0 && !allEndpointsEmpty,
    checkedEndpoints: [...ENDPOINTS],
    fetchedCount,
    uniqueFetchedCount: uniqueItems.length,
    matchedCount: rows.length,
    savedCount,
    recommendedCount,
    reviewCount,
    watchCount,
    expiredSkippedCount,
    excludedCount,
    endpointStats,
    productCounts,
    errors: allErrors,
    endpointDebugs,
    sampleSavedItems: rows.slice(0, 10).map(toMatchedSample),
    topMatchedSamples: rows.slice(0, 10).map(toMatchedSample),
    dateRange,
    message:
      savedCount > 0
        ? `나라장터 공고 ${savedCount}건 저장 (수집 ${fetchedCount} · 고유 ${uniqueItems.length} · 후보 ${rows.length})`
        : rows.length > 0
          ? "매칭 후보는 있으나 Supabase 저장에 실패했거나 저장 결과가 0건입니다."
          : `수집 ${fetchedCount}건 · 매칭 후보 없음 (마감 제외 ${expiredSkippedCount} · 제외 ${excludedCount})`,
  });
}

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}
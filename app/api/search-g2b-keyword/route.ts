import { NextRequest, NextResponse } from "next/server";
import { extractG2bHeader } from "@/lib/g2b/api";
import {
  G2B_ENDPOINTS,
  G2B_NUM_OF_ROWS,
  G2B_PAGE_END,
  G2B_PAGE_START,
} from "@/lib/g2b/constants";
import { getG2bInquiryDateRangeForDays } from "@/lib/g2b/dateRange";
import { getG2bAgency, getG2bField, getG2bTitle } from "@/lib/g2b/fields";
import { parseG2bDate } from "@/lib/g2b/mapNotice";
import { extractG2bTotalCount, parseG2BItems } from "@/lib/g2b/parseItems";
import {
  G2B_KEYWORD_SEARCH_PARAM_CANDIDATES,
  type G2bKeywordSearchPageResult,
  type G2bKeywordSearchParam,
} from "@/lib/g2b/searchKeywordTest";

export const runtime = "nodejs";

const SEARCH_TEST_INQUIRY_DAYS = 30;

const KEYWORD_SCAN_FIELDS = [
  "bidNtceNm",
  "bidNm",
  "ntceNm",
  "bsnsNm",
  "dminsttNm",
  "ntceInsttNm",
  "prdctClsfcNoNm",
  "dtilPrdctClsfcNoNm",
] as const;

type KeywordHitSample = {
  title: string;
  agency: string;
  dueDate: string;
  matchedTextPreview: string;
};

type ParamEndpointSummary = {
  endpoint: string;
  totalParsedItems: number;
  keywordHitCount: number;
  hasItems: boolean;
  pages: G2bKeywordSearchPageResult[];
};

type ParamSearchSummary = {
  searchParam: G2bKeywordSearchParam;
  totalParsedItems: number;
  keywordHitCount: number;
  keywordHitSamples: KeywordHitSample[];
  ignoredParamLikely: boolean;
  hasItems: boolean;
  endpoints: ParamEndpointSummary[];
};

type SearchG2bKeywordResponse = {
  ok: boolean;
  keyword: string;
  dateRange: { from: string; to: string };
  checkedEndpoints: string[];
  searchParamCandidates: readonly G2bKeywordSearchParam[];
  /** keywordHitCount > 0 인 파라미터 */
  workingSearchParams: G2bKeywordSearchParam[];
  /** keywordHitCount가 가장 높은 파라미터 */
  bestSearchParam: G2bKeywordSearchParam | null;
  keywordHitCount: number;
  keywordHitSamples: KeywordHitSample[];
  ignoredParamLikely: boolean;
  paramResults: ParamSearchSummary[];
  errors: string[];
  message: string;
};

type PageFetchWithItems = {
  page: G2bKeywordSearchPageResult;
  items: Record<string, unknown>[];
};

function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.G2B_SERVICE_KEY?.trim()) missing.push("G2B_SERVICE_KEY");
  if (!process.env.G2B_API_BASE_URL?.trim()) missing.push("G2B_API_BASE_URL");
  return missing;
}

function maskServiceKey(url: URL): string {
  const masked = new URL(url.toString());
  if (masked.searchParams.has("serviceKey")) {
    masked.searchParams.set("serviceKey", "***");
  }
  return masked.toString();
}

function getItemDueDate(item: Record<string, unknown>): string {
  const raw = getG2bField(item, ["bidClseDt", "opengDt", "bidClseTm"]);
  return parseG2bDate(raw) ?? "-";
}

function buildItemSearchHaystack(item: Record<string, unknown>): string {
  const fieldTexts = KEYWORD_SCAN_FIELDS.map((field) => getG2bField(item, [field])).filter(Boolean);
  return `${fieldTexts.join(" ")} ${JSON.stringify(item)}`.toLowerCase();
}

function buildMatchedTextPreview(item: Record<string, unknown>, keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();

  for (const field of KEYWORD_SCAN_FIELDS) {
    const value = getG2bField(item, [field]);
    if (value && value.toLowerCase().includes(lowerKeyword)) {
      return `${field}: ${value}`.slice(0, 240);
    }
  }

  const raw = JSON.stringify(item);
  const idx = raw.toLowerCase().indexOf(lowerKeyword);
  if (idx >= 0) {
    return raw.slice(Math.max(0, idx - 60), idx + keyword.length + 60).slice(0, 240);
  }

  return "";
}

function itemContainsKeyword(item: Record<string, unknown>, keyword: string): boolean {
  if (!keyword.trim()) return false;
  return buildItemSearchHaystack(item).includes(keyword.toLowerCase());
}

function toKeywordHitSample(item: Record<string, unknown>, keyword: string): KeywordHitSample {
  return {
    title: getG2bTitle(item) || getG2bField(item, ["bidNtceNm", "bidNm", "ntceNm"]) || "(제목 없음)",
    agency: getG2bAgency(item),
    dueDate: getItemDueDate(item),
    matchedTextPreview: buildMatchedTextPreview(item, keyword),
  };
}

function isIgnoredParamLikely(keywordHitCount: number, totalParsedItems: number): boolean {
  return keywordHitCount === 0 && totalParsedItems >= G2B_NUM_OF_ROWS;
}

async function fetchKeywordPageWithItems(
  baseUrl: string,
  serviceKey: string,
  endpoint: string,
  pageNo: number,
  searchParam: G2bKeywordSearchParam,
  keyword: string,
  dateRange: { inqryBgnDt: string; inqryEndDt: string },
): Promise<PageFetchWithItems> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = new URL(`${normalizedBase}/${endpoint}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(G2B_NUM_OF_ROWS));
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", dateRange.inqryBgnDt);
  url.searchParams.set("inqryEndDt", dateRange.inqryEndDt);
  url.searchParams.set("type", "json");
  url.searchParams.set(searchParam, keyword);

  const requestUrlWithoutKey = maskServiceKey(url);

  const buildPage = (
    header: ReturnType<typeof extractG2bHeader>,
    parsed: unknown,
    items: Record<string, unknown>[],
    error: string | null,
  ): G2bKeywordSearchPageResult => {
    const firstItem = items[0] ?? null;
    return {
      endpoint,
      pageNo,
      searchParam,
      requestUrlWithoutKey,
      resultCode: header?.resultCode ?? null,
      resultMsg: header?.resultMsg ?? null,
      totalCount: extractG2bTotalCount(parsed),
      parsedItemCount: items.length,
      hasItems: items.length > 0,
      error,
      firstItemKeys: firstItem ? Object.keys(firstItem).slice(0, 30) : [],
      firstItemSample: firstItem,
    };
  };

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json, text/plain, */*" },
    });

    if (!response.ok) {
      return {
        page: buildPage(null, null, [], `HTTP ${response.status} ${response.statusText}`),
        items: [],
      };
    }

    const rawText = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      return { page: buildPage(null, null, [], "JSON 파싱 실패"), items: [] };
    }

    const header = extractG2bHeader(parsed);
    const items = parseG2BItems(parsed);

    if (header?.resultCode && header.resultCode !== "00") {
      return {
        page: buildPage(
          header,
          parsed,
          [],
          `${header.resultCode}: ${header.resultMsg ?? "API 오류"}`,
        ),
        items: [],
      };
    }

    return { page: buildPage(header, parsed, items, null), items };
  } catch (error) {
    return {
      page: buildPage(
        null,
        null,
        [],
        error instanceof Error ? error.message : String(error),
      ),
      items: [],
    };
  }
}

function collectKeywordHits(
  items: Record<string, unknown>[],
  keyword: string,
  samples: KeywordHitSample[],
  maxSamples: number,
): number {
  let hitCount = 0;
  for (const item of items) {
    if (!itemContainsKeyword(item, keyword)) continue;
    hitCount += 1;
    if (samples.length < maxSamples) {
      samples.push(toKeywordHitSample(item, keyword));
    }
  }
  return hitCount;
}

function emptyResponse(partial: Partial<SearchG2bKeywordResponse> & Pick<SearchG2bKeywordResponse, "ok" | "message">): SearchG2bKeywordResponse {
  return {
    ok: partial.ok,
    keyword: partial.keyword ?? "",
    dateRange: partial.dateRange ?? { from: "", to: "" },
    checkedEndpoints: partial.checkedEndpoints ?? Object.values(G2B_ENDPOINTS),
    searchParamCandidates: G2B_KEYWORD_SEARCH_PARAM_CANDIDATES,
    workingSearchParams: partial.workingSearchParams ?? [],
    bestSearchParam: partial.bestSearchParam ?? null,
    keywordHitCount: partial.keywordHitCount ?? 0,
    keywordHitSamples: partial.keywordHitSamples ?? [],
    ignoredParamLikely: partial.ignoredParamLikely ?? false,
    paramResults: partial.paramResults ?? [],
    errors: partial.errors ?? [],
    message: partial.message,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse<SearchG2bKeywordResponse>> {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim() ?? "";

  if (!keyword) {
    return NextResponse.json(
      emptyResponse({
        ok: false,
        errors: ["keyword 쿼리 파라미터가 필요합니다. 예: /api/search-g2b-keyword?keyword=가상화"],
        message: "keyword가 없습니다.",
      }),
    );
  }

  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    return NextResponse.json(
      emptyResponse({
        ok: false,
        keyword,
        errors: [`환경변수 누락: ${missing.join(", ")}`],
        message: "필수 환경변수가 없어 테스트를 중단했습니다.",
      }),
    );
  }

  const serviceKey = process.env.G2B_SERVICE_KEY!.trim();
  const baseUrl = process.env.G2B_API_BASE_URL!.trim();
  const dateRange = getG2bInquiryDateRangeForDays(SEARCH_TEST_INQUIRY_DAYS);
  const checkedEndpoints = Object.values(G2B_ENDPOINTS);
  const errors: string[] = [];
  const paramResults: ParamSearchSummary[] = [];

  for (const searchParam of G2B_KEYWORD_SEARCH_PARAM_CANDIDATES) {
    const endpointSummaries: ParamEndpointSummary[] = [];
    let paramTotal = 0;
    let paramKeywordHits = 0;
    const paramSamples: KeywordHitSample[] = [];

    for (const endpoint of checkedEndpoints) {
      const pages: G2bKeywordSearchPageResult[] = [];
      let endpointTotal = 0;
      let endpointKeywordHits = 0;

      for (let pageNo = G2B_PAGE_START; pageNo <= G2B_PAGE_END; pageNo++) {
        const { page, items } = await fetchKeywordPageWithItems(
          baseUrl,
          serviceKey,
          endpoint,
          pageNo,
          searchParam,
          keyword,
          dateRange,
        );

        pages.push(page);
        endpointTotal += page.parsedItemCount;
        endpointKeywordHits += collectKeywordHits(items, keyword, paramSamples, 10);

        if (page.error) {
          errors.push(`${searchParam} · ${endpoint} p${pageNo}: ${page.error}`);
        }
      }

      paramTotal += endpointTotal;
      paramKeywordHits += endpointKeywordHits;
      endpointSummaries.push({
        endpoint,
        totalParsedItems: endpointTotal,
        keywordHitCount: endpointKeywordHits,
        hasItems: endpointTotal > 0,
        pages,
      });
    }

    paramResults.push({
      searchParam,
      totalParsedItems: paramTotal,
      keywordHitCount: paramKeywordHits,
      keywordHitSamples: paramSamples.slice(0, 10),
      ignoredParamLikely: isIgnoredParamLikely(paramKeywordHits, paramTotal),
      hasItems: paramTotal > 0,
      endpoints: endpointSummaries,
    });
  }

  const workingSearchParams = paramResults
    .filter((result) => result.keywordHitCount > 0)
    .map((result) => result.searchParam);

  const bestResult =
    paramResults
      .filter((result) => result.keywordHitCount > 0)
      .sort((a, b) => {
        if (b.keywordHitCount !== a.keywordHitCount) {
          return b.keywordHitCount - a.keywordHitCount;
        }
        return b.totalParsedItems - a.totalParsedItems;
      })[0] ?? null;

  const bestSearchParam = bestResult?.searchParam ?? null;
  const keywordHitCount = bestResult?.keywordHitCount ?? 0;
  const keywordHitSamples = bestResult?.keywordHitSamples.slice(0, 10) ?? [];
  const ignoredParamLikely = paramResults.some((result) => result.ignoredParamLikely);
  const hasRealHits = workingSearchParams.length > 0;

  return NextResponse.json(
    emptyResponse({
      ok: hasRealHits || errors.length === 0,
      keyword,
      dateRange: dateRange.label,
      workingSearchParams,
      bestSearchParam,
      keywordHitCount,
      keywordHitSamples,
      ignoredParamLikely,
      paramResults,
      errors,
      message: hasRealHits
        ? `keyword 실제 포함: ${workingSearchParams.join(", ")}` +
          (bestSearchParam
            ? ` (최다 hit: ${bestSearchParam}, ${keywordHitCount}건)`
            : "")
        : ignoredParamLikely
          ? "parsedItemCount는 있으나 keyword가 포함된 공고가 없습니다. 검색 파라미터가 무시된 것으로 보입니다."
          : errors.length > 0
            ? "호출 오류가 있습니다. errors와 paramResults를 확인하세요."
            : "모든 파라미터에서 keyword 포함 공고가 0건입니다.",
    }),
  );
}

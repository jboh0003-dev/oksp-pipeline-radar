import { G2B_NUM_OF_ROWS } from "@/lib/g2b/constants";
import { extractG2bHeader, type G2bApiHeader } from "@/lib/g2b/api";
import { extractG2bTotalCount, parseG2BItems } from "@/lib/g2b/parseItems";

/** 나라장터 공고명 검색 파라미터 후보 */
export const G2B_KEYWORD_SEARCH_PARAM_CANDIDATES = [
  "bidNtceNm",
  "ntceNm",
  "bidNm",
  "searchWrd",
  "keyword",
] as const;

export type G2bKeywordSearchParam = (typeof G2B_KEYWORD_SEARCH_PARAM_CANDIDATES)[number];

export type G2bKeywordSearchPageResult = {
  endpoint: string;
  pageNo: number;
  searchParam: G2bKeywordSearchParam;
  requestUrlWithoutKey: string;
  resultCode: string | null;
  resultMsg: string | null;
  totalCount: string | null;
  parsedItemCount: number;
  hasItems: boolean;
  error: string | null;
  firstItemKeys: string[];
  firstItemSample: Record<string, unknown> | null;
};

function maskServiceKey(url: URL): string {
  const masked = new URL(url.toString());
  if (masked.searchParams.has("serviceKey")) {
    masked.searchParams.set("serviceKey", "***");
  }
  return masked.toString();
}

export async function fetchG2bKeywordSearchPage(
  baseUrl: string,
  serviceKey: string,
  endpoint: string,
  pageNo: number,
  searchParam: G2bKeywordSearchParam,
  keyword: string,
  dateRange: { inqryBgnDt: string; inqryEndDt: string },
): Promise<G2bKeywordSearchPageResult> {
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

  const baseResult = (
    header: G2bApiHeader | null,
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
      return baseResult(null, null, [], `HTTP ${response.status} ${response.statusText}`);
    }

    const rawText = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      return baseResult(null, null, [], "JSON 파싱 실패");
    }

    const header = extractG2bHeader(parsed);
    const items = parseG2BItems(parsed);

    if (header?.resultCode && header.resultCode !== "00") {
      return baseResult(
        header,
        parsed,
        [],
        `${header.resultCode}: ${header.resultMsg ?? "API 오류"}`,
      );
    }

    return baseResult(header, parsed, items, null);
  } catch (error) {
    return baseResult(
      null,
      null,
      [],
      error instanceof Error ? error.message : String(error),
    );
  }
}

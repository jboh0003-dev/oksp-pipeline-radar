import { G2B_NUM_OF_ROWS } from "@/lib/g2b/constants";
import { getG2bInquiryDateRange } from "@/lib/g2b/dateRange";
import { extractG2bTotalCount, parseG2BItems } from "@/lib/g2b/parseItems";

export type G2bApiHeader = {
  resultCode?: string;
  resultMsg?: string;
};

export type G2bEndpointDebug = {
  endpoint: string;
  pageNo: number;
  resultCode: string | null;
  resultMsg: string | null;
  totalCount: string | null;
  parsedItemCount: number;
  firstItemKeys: string[];
  firstItemSample: Record<string, unknown> | null;
};

export type G2bFetchResult = {
  endpoint: string;
  pageNo: number;
  header: G2bApiHeader | null;
  items: Record<string, unknown>[];
  error: string | null;
  debug: G2bEndpointDebug;
};

export function extractG2bHeader(parsed: unknown): G2bApiHeader | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const root = parsed as Record<string, unknown>;
  const response = root.response;
  if (response && typeof response === "object") {
    const header = (response as { header?: G2bApiHeader }).header;
    if (header) return header;
  }

  if (root.header && typeof root.header === "object") {
    return root.header as G2bApiHeader;
  }

  return null;
}

function buildEndpointDebug(
  endpoint: string,
  pageNo: number,
  header: G2bApiHeader | null,
  parsed: unknown,
  items: Record<string, unknown>[],
): G2bEndpointDebug {
  const firstItem = items[0] ?? null;
  return {
    endpoint,
    pageNo,
    resultCode: header?.resultCode ?? null,
    resultMsg: header?.resultMsg ?? null,
    totalCount: extractG2bTotalCount(parsed),
    parsedItemCount: items.length,
    firstItemKeys: firstItem ? Object.keys(firstItem).slice(0, 30) : [],
    firstItemSample: firstItem,
  };
}

export async function fetchG2bPage(
  baseUrl: string,
  serviceKey: string,
  endpoint: string,
  pageNo: number,
): Promise<G2bFetchResult> {
  const { inqryBgnDt, inqryEndDt } = getG2bInquiryDateRange();
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = new URL(`${normalizedBase}/${endpoint}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(G2B_NUM_OF_ROWS));
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", inqryBgnDt);
  url.searchParams.set("inqryEndDt", inqryEndDt);
  url.searchParams.set("type", "json");

  const emptyDebug = (header: G2bApiHeader | null, parsed: unknown = null): G2bEndpointDebug =>
    buildEndpointDebug(endpoint, pageNo, header, parsed, []);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json, text/plain, */*" },
    });

    if (!response.ok) {
      return {
        endpoint,
        pageNo,
        header: null,
        items: [],
        error: `HTTP ${response.status} ${response.statusText}`,
        debug: emptyDebug(null),
      };
    }

    const rawText = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      return {
        endpoint,
        pageNo,
        header: null,
        items: [],
        error: "JSON 파싱 실패",
        debug: emptyDebug(null),
      };
    }

    const header = extractG2bHeader(parsed);
    const items = parseG2BItems(parsed);
    const debug = buildEndpointDebug(endpoint, pageNo, header, parsed, items);

    if (header?.resultCode && header.resultCode !== "00") {
      return {
        endpoint,
        pageNo,
        header,
        items: [],
        error: `${header.resultCode}: ${header.resultMsg ?? "API 오류"}`,
        debug,
      };
    }

    return {
      endpoint,
      pageNo,
      header,
      items,
      error: null,
      debug,
    };
  } catch (error) {
    return {
      endpoint,
      pageNo,
      header: null,
      items: [],
      error: error instanceof Error ? error.message : String(error),
      debug: emptyDebug(null),
    };
  }
}

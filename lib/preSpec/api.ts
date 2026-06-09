/**
 * 조달청 나라장터 사전규격정보서비스 (HrcspSsstndrdInfoService) 호출 모듈.
 *
 * 1차 수집 대상:
 *  - 용역 (getPublicPrcureThngInfoServcPPSSrch)
 *  - 물품 (getPublicPrcureThngInfoThngPPSSrch)
 *
 * 이후 확장:
 *  - 공사 (getPublicPrcureThngInfoCnstwkPPSSrch)
 *  - 외자 (getPublicPrcureThngInfoFrgcptPPSSrch)
 *
 * 주의:
 *  - public data API 의 정확한 endpoint 경로는 운영 환경에서 한 번 응답을 보고 미세 조정.
 *  - response.body.items.item 이 단일 객체일 수도 배열일 수도 있어 toArray 로 normalize.
 *  - serviceKey 는 G2B_SERVICE_KEY 환경변수를 재사용.
 *  - Concurrency 는 부담을 줄이기 위해 3 으로 제한 (외부 API 안정성 우선).
 */

const DEFAULT_BASE_URL =
  process.env.G2B_PRESPEC_BASE_URL ??
  "http://apis.data.go.kr/1230000/HrcspSsstndrdInfoService";

export type PreSpecCategory = "servc" | "thng" | "cnstwk" | "frgcpt";

const ENDPOINT_BY_CATEGORY: Record<PreSpecCategory, string> = {
  servc: "getPublicPrcureThngInfoServcPPSSrch",
  thng: "getPublicPrcureThngInfoThngPPSSrch",
  cnstwk: "getPublicPrcureThngInfoCnstwkPPSSrch",
  frgcpt: "getPublicPrcureThngInfoFrgcptPPSSrch",
};

export const DEFAULT_PRE_SPEC_CATEGORIES: PreSpecCategory[] = ["servc", "thng"];

export const PRE_SPEC_NUM_OF_ROWS = 100;

export type PreSpecFetchPage = {
  category: PreSpecCategory;
  endpoint: string;
  pageNo: number;
  totalCount: number | null;
  items: Record<string, unknown>[];
  resultCode: string | null;
  resultMsg: string | null;
  error: string | null;
};

export type PreSpecFetchOptions = {
  /** 조회 시작일 (yyyymmdd). */
  inqryBgnDt: string;
  /** 조회 종료일 (yyyymmdd). */
  inqryEndDt: string;
  /** 한 카테고리당 최대 페이지 수. (totalCount 가 더 작으면 더 일찍 멈춤) */
  maxPagesPerCategory?: number;
  /** 사용할 카테고리. 기본 ["servc","thng"]. */
  categories?: PreSpecCategory[];
  /** 페이지 동시 호출 수 제한. 기본 3. */
  concurrency?: number;
};

export type PreSpecFetchResult = {
  items: Record<string, unknown>[];
  pages: PreSpecFetchPage[];
  totalsByCategory: Partial<Record<PreSpecCategory, number>>;
  errors: string[];
};

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function buildUrl(
  baseUrl: string,
  endpoint: string,
  serviceKey: string,
  pageNo: number,
  inqryBgnDt: string,
  inqryEndDt: string,
): string {
  const normalized = baseUrl.replace(/\/$/, "");
  const u = new URL(`${normalized}/${endpoint}`);
  u.searchParams.set("serviceKey", serviceKey);
  u.searchParams.set("pageNo", String(pageNo));
  u.searchParams.set("numOfRows", String(PRE_SPEC_NUM_OF_ROWS));
  u.searchParams.set("inqryDiv", "1");
  u.searchParams.set("inqryBgnDt", inqryBgnDt);
  u.searchParams.set("inqryEndDt", inqryEndDt);
  u.searchParams.set("type", "json");
  return u.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const resp = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json, text/plain, */*" },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} · ${text.slice(0, 200)}`);
  }
  // 어떤 환경에선 XML/HTML 이 올 수 있다 — JSON 파싱 실패 시 그대로 throw.
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 파싱 실패 · 응답 일부: ${text.slice(0, 200)}`);
  }
}

function readHeader(parsed: unknown): { resultCode: string | null; resultMsg: string | null } {
  if (!parsed || typeof parsed !== "object") return { resultCode: null, resultMsg: null };
  const root = parsed as Record<string, unknown>;
  const response =
    (root.response as Record<string, unknown> | undefined) ??
    (root as Record<string, unknown>);
  const header = response.header as Record<string, unknown> | undefined;
  return {
    resultCode: typeof header?.resultCode === "string" ? header.resultCode : null,
    resultMsg: typeof header?.resultMsg === "string" ? header.resultMsg : null,
  };
}

function readTotalCount(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const response = (root.response as Record<string, unknown> | undefined) ?? root;
  const body = response.body as Record<string, unknown> | undefined;
  const total = body?.totalCount;
  if (typeof total === "number") return total;
  if (typeof total === "string") {
    const n = Number(total);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readItems(parsed: unknown): Record<string, unknown>[] {
  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as Record<string, unknown>;
  const response = (root.response as Record<string, unknown> | undefined) ?? root;
  const body = response.body as Record<string, unknown> | undefined;
  const items = body?.items;
  // items 가 { item: [...] } 또는 [...] 또는 단일 객체일 수 있음
  if (!items) return [];
  if (Array.isArray(items)) return items as Record<string, unknown>[];
  if (typeof items === "object") {
    const inner = (items as Record<string, unknown>).item;
    return toArray(inner) as Record<string, unknown>[];
  }
  return [];
}

async function fetchOnePage(
  baseUrl: string,
  serviceKey: string,
  category: PreSpecCategory,
  pageNo: number,
  inqryBgnDt: string,
  inqryEndDt: string,
): Promise<PreSpecFetchPage> {
  const endpoint = ENDPOINT_BY_CATEGORY[category];
  const url = buildUrl(baseUrl, endpoint, serviceKey, pageNo, inqryBgnDt, inqryEndDt);
  try {
    const parsed = await fetchJson(url);
    const { resultCode, resultMsg } = readHeader(parsed);
    const items = readItems(parsed);
    const totalCount = readTotalCount(parsed);
    return {
      category,
      endpoint,
      pageNo,
      totalCount,
      items,
      resultCode,
      resultMsg,
      error: resultCode && resultCode !== "00" ? `${resultCode} · ${resultMsg ?? ""}` : null,
    };
  } catch (err) {
    return {
      category,
      endpoint,
      pageNo,
      totalCount: null,
      items: [],
      resultCode: null,
      resultMsg: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Promise.allSettled + concurrency 제한 — n 개씩 병렬, 작업이 끝나는 대로 다음을 시작. */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        // task 안에서 throw 하지 않도록 했지만, 만일을 위해 fallback.
        // @ts-expect-error 가능한 한 호출자 타입을 그대로 유지
        results[idx] = err;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

export async function fetchPreSpecAnnouncements(
  serviceKey: string,
  options: PreSpecFetchOptions,
): Promise<PreSpecFetchResult> {
  const baseUrl = DEFAULT_BASE_URL;
  const categories = options.categories ?? DEFAULT_PRE_SPEC_CATEGORIES;
  const maxPagesPerCategory = options.maxPagesPerCategory ?? 5;
  const concurrency = options.concurrency ?? 3;
  const errors: string[] = [];
  const totalsByCategory: Partial<Record<PreSpecCategory, number>> = {};
  const allPages: PreSpecFetchPage[] = [];
  const allItems: Record<string, unknown>[] = [];

  // 1) 각 카테고리의 1페이지를 먼저 받아 totalCount 를 알아낸다 (병렬 OK).
  const firstPages = await Promise.all(
    categories.map((cat) =>
      fetchOnePage(baseUrl, serviceKey, cat, 1, options.inqryBgnDt, options.inqryEndDt),
    ),
  );
  for (const p of firstPages) {
    allPages.push(p);
    if (p.error) errors.push(`[${p.category}/p${p.pageNo}] ${p.error}`);
    if (p.totalCount != null) totalsByCategory[p.category] = p.totalCount;
    allItems.push(...p.items);
  }

  // 2) totalCount 기반으로 추가 페이지 task 생성 → concurrency 제한 병렬 실행.
  const moreTasks: (() => Promise<PreSpecFetchPage>)[] = [];
  for (const p of firstPages) {
    if (p.error) continue;
    const total = p.totalCount ?? 0;
    const totalPages = Math.min(
      maxPagesPerCategory,
      Math.max(1, Math.ceil(total / PRE_SPEC_NUM_OF_ROWS)),
    );
    for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
      const cat = p.category;
      moreTasks.push(() =>
        fetchOnePage(baseUrl, serviceKey, cat, pageNo, options.inqryBgnDt, options.inqryEndDt),
      );
    }
  }

  if (moreTasks.length > 0) {
    const morePages = await runWithConcurrency(moreTasks, concurrency);
    for (const p of morePages) {
      allPages.push(p);
      if (p.error) errors.push(`[${p.category}/p${p.pageNo}] ${p.error}`);
      allItems.push(...p.items);
    }
  }

  return {
    items: allItems,
    pages: allPages,
    totalsByCategory,
    errors,
  };
}

/** 오늘 / 오늘-N일 의 yyyymmdd 문자열 한 쌍 반환 (KST 기준). */
export function getInquiryRangeYyyymmdd(daysBack: number): {
  inqryBgnDt: string;
  inqryEndDt: string;
} {
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${dd}0000`;
  };
  const end = new Date();
  // 한국시간 보정 (UTC+9)
  end.setHours(end.getHours() + 9);
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return { inqryBgnDt: fmt(start), inqryEndDt: fmt(end) };
}

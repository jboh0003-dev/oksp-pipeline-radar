/**
 * 조달청 나라장터 사전규격정보서비스 (HrcspSsstndrdInfoService) 호출 모듈.
 *
 * 실제 endpoint (probe 결과 검증 완료):
 *   base : http://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService
 *   ⚠️ 입찰공고는 /ad/ , 사전규격은 /ao/ — 경로가 다르다.
 *
 * Operations:
 *   - getPublicPrcureThngInfoServcPPSSrch  (용역)
 *   - getPublicPrcureThngInfoThngPPSSrch   (물품)
 *   - getPublicPrcureThngInfoCnstwkPPSSrch (공사)
 *   - getPublicPrcureThngInfoFrgcptPPSSrch (외자)
 *
 * 필수 파라미터:
 *   serviceKey, pageNo, numOfRows, inqryDiv, inqryEndDt
 *
 * 응답 구조 (실제 응답 예):
 *   { response: { header: { resultCode, resultMsg }, body: { totalCount, pageNo, numOfRows, items: [...] } } }
 *
 *   items 가 단일 객체로 올 수도 있음 → toArray 로 normalize.
 *
 * 1차 수집 대상: 용역 + 물품 (concurrency 3)
 * 이후 확장: 공사, 외자
 */

const DEFAULT_BASE_URL =
  process.env.G2B_PRESPEC_BASE_URL ??
  "http://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService";

export type PreSpecCategory = "servc" | "thng" | "cnstwk" | "frgcpt";

const ENDPOINT_BY_CATEGORY: Record<PreSpecCategory, string> = {
  servc: "getPublicPrcureThngInfoServcPPSSrch",
  thng: "getPublicPrcureThngInfoThngPPSSrch",
  cnstwk: "getPublicPrcureThngInfoCnstwkPPSSrch",
  frgcpt: "getPublicPrcureThngInfoFrgcptPPSSrch",
};

export const PRE_SPEC_CATEGORY_LABEL: Record<PreSpecCategory, string> = {
  servc: "용역",
  thng: "물품",
  cnstwk: "공사",
  frgcpt: "외자",
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
  /** 페이지 단위 수집 시간 (ms) — 디버그/성능 진단용. */
  durationMs?: number;
  error: string | null;
};

export type PreSpecFetchOptions = {
  /** 조회 시작일 (yyyymmddHHMM, 12자리). */
  inqryBgnDt: string;
  /** 조회 종료일 (yyyymmddHHMM). */
  inqryEndDt: string;
  /** 한 카테고리당 최대 페이지 수. */
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
  /** 첫 페이지의 첫 아이템 sample — 디버깅용 (운영용 응답에서는 빈 객체일 수 있음). */
  firstItemSample: Record<string, unknown> | null;
  /** 첫 페이지에서 본 키 목록 — 필드 매핑 확장 시 참고. */
  firstItemKeys: string[];
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
    // public data API 가 200 이 아닌 응답을 줄 때 본문에 의미 있는 메시지가 있는 경우가 많다.
    throw new Error(`HTTP ${resp.status} · ${text.slice(0, 200)}`);
  }
  // XML 응답이 섞여 올 수 있다 — JSON 파싱 실패 시 명확한 에러로 throw.
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`사전규격공고 응답 파싱 중 오류가 발생했습니다: ${text.slice(0, 200)}`);
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
  if (!items) return [];
  // 실제 응답: items 가 곧장 배열인 경우가 많다.
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
  const startedAt = Date.now();
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
      durationMs: Date.now() - startedAt,
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
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Promise.all + concurrency 제한 — 작업이 끝나는 대로 다음을 시작. */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await tasks[idx]();
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

  const firstItemSample = allItems[0] ?? null;
  const firstItemKeys = firstItemSample ? Object.keys(firstItemSample).slice(0, 30) : [];

  // 개발 환경에서만 첫 응답 sample 을 console 에 남긴다.
  // 운영(production) 에서는 노이즈를 줄이기 위해 stop.
  if (process.env.NODE_ENV !== "production" && firstItemSample) {
    // eslint-disable-next-line no-console
    console.log("[PRE_SPEC_ITEMS_SAMPLE]", {
      totalsByCategory,
      firstItemKeys,
      firstItem: firstItemSample,
    });
  }

  return {
    items: allItems,
    pages: allPages,
    totalsByCategory,
    firstItemSample,
    firstItemKeys,
    errors,
  };
}

/**
 * KST 기준 오늘 / 오늘-N일 의 yyyymmddHHMM (12자리) 한 쌍 반환.
 * (사전규격 API 는 14자리 yyyymmddHHMMSS 도 받지만 12자리만으로 충분히 동작.)
 */
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
  // KST 기준으로 만들기 — UTC 에 9시간 더하면 KST 의 "지금".
  end.setHours(end.getHours() + 9);
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return { inqryBgnDt: fmt(start), inqryEndDt: fmt(end) };
}

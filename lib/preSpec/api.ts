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
 * 참고 fallback (현 시점에서는 G2B 공식이 위 endpoint 만 노출하지만 다른 G2B 크롤러 프로젝트에서
 * 발견된 후보들을 함께 정의해 두고 한 번씩 시도하도록 만든다 — 운영에서 한 endpoint 가 죽어도
 * 다른 후보로 흘러가게 한다):
 *   - getPublicPrcureThngInfoServc / getPublicPrcureThngInfoCnstwk (구버전)
 *
 * 호출 안정성 (3차 고도화):
 *   - lib/g2b/client + lib/g2b/fetchPaged 를 사용 (timeout / retry / resultCode / JSON 파싱 통합).
 *   - 한 endpoint 의 실패가 전체 수집을 막지 않음 — page.error 로 기록하고 다른 endpoint 는 계속.
 *   - 페이지 별 결과를 PreSpecFetchPage 로 그대로 노출 → 호출부에서 CollectionError 로 매핑.
 */

import { resolvePreSpecBaseUrl } from "@/lib/g2b/baseUrl";
import { fetchG2bPaged, type G2bPagedPage } from "@/lib/g2b/fetchPaged";

export type PreSpecCategory = "servc" | "thng" | "cnstwk" | "frgcpt";

/**
 * 카테고리별 endpoint 후보. 운영 endpoint 가 첫 번째이고, fallback 후보가 그 뒤.
 * 첫 번째 후보가 데이터를 정상적으로 반환했다면 추가 후보는 호출하지 않는다.
 */
const ENDPOINT_CANDIDATES_BY_CATEGORY: Record<PreSpecCategory, string[]> = {
  servc: ["getPublicPrcureThngInfoServcPPSSrch", "getPublicPrcureThngInfoServc"],
  thng: ["getPublicPrcureThngInfoThngPPSSrch", "getPublicPrcureThngInfoThng"],
  cnstwk: ["getPublicPrcureThngInfoCnstwkPPSSrch", "getPublicPrcureThngInfoCnstwk"],
  frgcpt: ["getPublicPrcureThngInfoFrgcptPPSSrch"],
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
  /** 호출별 timeout(ms). 기본 15s. */
  timeoutMs?: number;
  /** retry 횟수. 기본 3. */
  retries?: number;
};

export type PreSpecFetchResult = {
  /** raw 아이템들에 (sourceApi, sourceEndpoint) 정보를 부착해 반환. */
  items: Array<Record<string, unknown> & { __sourceApi?: string; __sourceEndpoint?: string }>;
  pages: PreSpecFetchPage[];
  totalsByCategory: Partial<Record<PreSpecCategory, number>>;
  /** 첫 페이지의 첫 아이템 sample — 디버깅용. */
  firstItemSample: Record<string, unknown> | null;
  firstItemKeys: string[];
  /** 사람이 읽기 쉬운 페이지 단위 에러 메시지(legacy 호환). */
  errors: string[];
  /** 페이지 단위 에러 raw — collectionErrors.ts 로 매핑할 수 있도록 구조화된 형태. */
  pageErrors: Array<{
    category: PreSpecCategory;
    endpoint: string;
    pageNo: number;
    message: string;
    detail?: string;
  }>;
};

/** g2bPagedPage → PreSpecFetchPage. */
function toPreSpecPage(category: PreSpecCategory, p: G2bPagedPage): PreSpecFetchPage {
  return {
    category,
    endpoint: p.endpoint,
    pageNo: p.pageNo,
    totalCount: p.totalCount,
    items: p.items,
    resultCode: p.resultCode,
    resultMsg: p.resultMsg,
    durationMs: p.durationMs,
    error: p.error,
  };
}

async function fetchOneCategoryWithFallback(
  serviceKey: string,
  category: PreSpecCategory,
  options: PreSpecFetchOptions,
): Promise<{
  items: Array<Record<string, unknown> & { __sourceApi?: string; __sourceEndpoint?: string }>;
  pages: PreSpecFetchPage[];
  totalCount: number | null;
}> {
  const candidates = ENDPOINT_CANDIDATES_BY_CATEGORY[category];
  const sourceApi = `사전규격(${PRE_SPEC_CATEGORY_LABEL[category]})`;
  const baseParams = {
    inqryDiv: "1",
    inqryBgnDt: options.inqryBgnDt,
    inqryEndDt: options.inqryEndDt,
  };
  const allPages: PreSpecFetchPage[] = [];
  let lastTotalCount: number | null = null;
  const baseUrl = resolvePreSpecBaseUrl();

  for (const endpoint of candidates) {
    const result = await fetchG2bPaged({
      baseUrl,
      endpoint,
      logRequest: true,
      sourceApi: `${sourceApi}/${endpoint}`,
      serviceKey,
      baseParams,
      numOfRows: PRE_SPEC_NUM_OF_ROWS,
      maxPages: options.maxPagesPerCategory ?? 5,
      concurrency: options.concurrency ?? 3,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
    });
    const mapped = result.pages.map((p) => toPreSpecPage(category, p));
    allPages.push(...mapped);
    lastTotalCount = result.totalCount ?? lastTotalCount;

    // 데이터를 받았다면 fallback 추가 호출은 하지 않는다.
    const itemCount = result.items.length;
    if (itemCount > 0) {
      const enriched = result.items.map((it) =>
        Object.assign({}, it, { __sourceApi: sourceApi, __sourceEndpoint: endpoint }),
      );
      return { items: enriched, pages: allPages, totalCount: lastTotalCount };
    }
    // 모든 페이지가 정상 응답인데 데이터 0건 (= EMPTY_ITEMS) 인 경우도 fallback 시도하지 않는다 —
    // 단순히 그 endpoint 결과가 0건일 뿐이다.
    const allOk = result.pages.every((p) => !p.error);
    if (allOk) {
      return { items: [], pages: allPages, totalCount: lastTotalCount };
    }
    // 그 외(에러로 인한 0건)는 다음 후보로 진행.
  }

  return { items: [], pages: allPages, totalCount: lastTotalCount };
}

export async function fetchPreSpecAnnouncements(
  serviceKey: string,
  options: PreSpecFetchOptions,
): Promise<PreSpecFetchResult> {
  const categories = options.categories ?? DEFAULT_PRE_SPEC_CATEGORIES;
  const errors: string[] = [];
  const seenErrorMessages = new Set<string>();
  const pageErrors: PreSpecFetchResult["pageErrors"] = [];
  const totalsByCategory: Partial<Record<PreSpecCategory, number>> = {};
  const allPages: PreSpecFetchPage[] = [];
  const allItems: PreSpecFetchResult["items"] = [];

  // 카테고리는 병렬 — Promise.all 안에서 동시 실행. 한 카테고리가 실패해도 다른 카테고리에 영향 X.
  const tasks = categories.map((cat) =>
    fetchOneCategoryWithFallback(serviceKey, cat, options).then((r) => ({ cat, r })),
  );
  const results = await Promise.all(tasks);
  for (const { cat, r } of results) {
    allPages.push(...r.pages);
    if (r.totalCount != null) totalsByCategory[cat] = r.totalCount;
    allItems.push(...r.items);
    for (const p of r.pages) {
      if (p.error) {
        const message = `[${cat}/${p.endpoint}/p${p.pageNo}] ${p.error}`;
        // 같은 endpoint 가 여러 페이지에서 동일하게 실패하면 메시지가 중복 저장된다 → 한 번만 남긴다.
        const dedupeKey = message.replace(/\bp\d+\b/g, "p*");
        if (seenErrorMessages.has(dedupeKey)) continue;
        seenErrorMessages.add(dedupeKey);
        errors.push(message);
        pageErrors.push({
          category: cat,
          endpoint: p.endpoint,
          pageNo: p.pageNo,
          message: p.error,
        });
      }
    }
  }

  const firstItemSample = allItems[0] ?? null;
  const firstItemKeys = firstItemSample ? Object.keys(firstItemSample).slice(0, 30) : [];

  if (process.env.NODE_ENV !== "production" && firstItemSample) {
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
    pageErrors,
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

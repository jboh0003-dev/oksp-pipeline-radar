/**
 * 입찰공고 원문 / 검색 URL 생성 helper.
 *
 *  - 정확한 원문 URL 이 없을 때, 사용자가 적어도 나라장터 검색 페이지로 이동할 수 있도록
 *    검색 fallback 을 만들어 준다.
 *  - 입찰: bidNtceNo + bidNtceOrd 가 있으면 상세 페이지 직링크 시도 가능.
 *
 * 사전규격공고 URL 빌더는 이 파일이 아니라 `lib/preSpec/detailUrl.ts` 에 있다.
 *  - 사전규격은 *검증된 deep-link 와 검색 URL 을 분리* 해서 관리해야 하기 때문 (사용자 신뢰 유지).
 *  - `buildPreSpecDetailUrl` 같은 legacy helper 는 의도적으로 이 파일에서 제거했다 —
 *    "공고명 클릭 = 검색 페이지" 가 되는 잘못된 동작을 다시 들어오지 않게 하기 위해.
 *
 * 화면에서:
 *   - kind==="exact" → 버튼 라벨 "원문"
 *   - kind==="search" → 버튼 라벨 "검색"
 *   - kind==="none"   → 버튼 비활성화
 */

export type SourceUrlInfo = {
  url?: string;
  /**
   * exact  : 정확한 상세 페이지로 이동할 수 있다고 보장 (또는 강한 추정).
   * search : 검색 결과 페이지 fallback. 사용자가 다시 한 번 클릭이 필요할 수 있음.
   * none   : URL 을 만들 수 없음 (식별자도 없는 케이스).
   */
  kind: "exact" | "search" | "none";
  label: string;
};

const G2B_BID_DETAIL_BASE = "https://www.g2b.go.kr/pn/pnp/pnpe/commBidPbancDtls.do";
const G2B_BID_SEARCH_BASE = "https://www.g2b.go.kr/pn/pnp/pnpd/searchBidNtce.do";

/**
 * URL 이 http(s) 로 시작하는 검증된 외부 링크인지 판정.
 * - null/빈 문자열/내부 경로/javascript: 등은 모두 거부.
 * - 화면에 노출하기 전에 반드시 통과시켜야 한다 (404 가능 URL 차단).
 */
export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * 입찰공고 원문 URL.
 *
 *  - 우선 직접 제공된 originalUrl 이 있으면 그대로 사용 (exact).
 *  - 없다면 bidNtceNo / bidNtceOrd 로 검색 페이지 URL 생성 (search fallback).
 *  - 둘 다 없다면 "none".
 */
export function buildBidSourceUrl(input: {
  originalUrl?: string | null;
  bidNtceNo?: string | null;
  bidNtceOrd?: string | null;
}): SourceUrlInfo {
  const direct = (input.originalUrl ?? "").trim();
  if (/^https?:\/\//i.test(direct)) {
    return { url: direct, kind: "exact", label: "원문" };
  }

  const bidNtceNo = (input.bidNtceNo ?? "").trim();
  const bidNtceOrd = (input.bidNtceOrd ?? "").trim();
  if (bidNtceNo) {
    // bidNtceOrd 까지 있으면 상세 페이지 직링크를 시도 — 다만 G2B 사이트 패턴이 시기별로 바뀔 수 있어
    // 안전하게 검색 페이지로 fallback. (사용자가 한 번 더 클릭은 필요)
    const params = new URLSearchParams();
    params.set("bidNtceNo", bidNtceNo);
    if (bidNtceOrd) params.set("bidNtceOrd", bidNtceOrd);
    return {
      url: `${G2B_BID_SEARCH_BASE}?${params.toString()}`,
      kind: "search",
      label: "검색",
    };
  }

  if (direct) {
    // http(s) 가 아닌 raw 텍스트라도 들어 있으면 그대로 표기.
    return { url: undefined, kind: "none", label: "원문없음" };
  }
  return { url: undefined, kind: "none", label: "원문없음" };
}

/** 첨부 또는 규격서 URL 등이 http(s) 인지 검증 후 통일된 형태로 반환. */
export function normalizeHttpUrl(value: unknown): string | undefined {
  if (!isValidHttpUrl(value)) return undefined;
  return value.trim();
}

export const G2B_DEFAULT_BID_DETAIL_BASE = G2B_BID_DETAIL_BASE;

/**
 * 입찰공고 / 사전규격공고의 "원문 URL" 또는 "검색 fallback URL" 생성 helper.
 *
 *  - 정확한 원문 URL 이 없을 때, 사용자가 적어도 나라장터 검색 페이지로 이동할 수 있도록
 *    검색 fallback 을 만들어 준다.
 *  - 입찰: bidNtceNo + bidNtceOrd 가 있으면 상세 페이지 직링크 시도 가능.
 *  - 사전규격: bfSpecRgstNo 또는 preSpecRegNo 가 있으면 검색 페이지 fallback.
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

/**
 * 사전규격공고 원문 URL.
 *
 * 정책 (404 방지):
 *  - API 가 검증된 상세 URL 필드(detailUrl / originalUrl / specDetailUrl) 를 직접 줄 때만
 *    "exact" 로 반환.
 *  - bfSpecRgstNo / preSpecRegNo / preStdRegNo / publicPreSpecNo 만 있는 경우엔
 *    절대 임의 상세 URL 을 만들지 않는다. (R26BD... 같은 R코드는 물론, 숫자형 preStdRegNo 도
 *    G2B 에서 검증된 공개 상세 URL 패턴이 없으므로 추측해서 만들지 않는다 — 404 방지.)
 *  - 이전엔 PNZAPreStdtSearch.do?searchPreStdRegNo=... 으로 fallback 을 만들었는데 G2B 에서
 *    해당 경로가 404 가 떠서 전부 깨졌다. 검증된 패턴이 아니면 차라리 비활성화한다.
 *  - 그 대신 화면 측에서 buildPreSpecSearchTarget 으로 사전규격공고 검색 페이지로 fallback.
 *
 * 화면 처리:
 *  - kind === "exact" : "원문" 버튼 활성
 *  - kind === "none"  : 화면에서 "검색" 또는 "원문없음" 으로 분기
 */
export function buildPreSpecSourceUrl(input: {
  bfSpecRgstNo?: string | null;
  preSpecRegNo?: string | null;
  detailUrl?: string | null;
  originalUrl?: string | null;
  specDetailUrl?: string | null;
}): SourceUrlInfo {
  const candidates = [input.detailUrl, input.originalUrl, input.specDetailUrl];
  for (const c of candidates) {
    if (isValidHttpUrl(c)) {
      return { url: c.trim(), kind: "exact", label: "원문" };
    }
  }
  return { url: undefined, kind: "none", label: "원문없음" };
}

/** 첨부 또는 규격서 URL 등이 http(s) 인지 검증 후 통일된 형태로 반환. */
export function normalizeHttpUrl(value: unknown): string | undefined {
  if (!isValidHttpUrl(value)) return undefined;
  return value.trim();
}

/**
 * 사전규격공고 "검색" 버튼 fallback target.
 *
 *  - 정확한 원문/상세 URL 을 모를 때, 사용자가 나라장터에서 직접 찾아갈 수 있도록
 *    "사전규격공고 진입 URL" 을 새 탭으로 열어준다.
 *  - URL 은 G2B 메인(`https://www.g2b.go.kr/`) 이 아니라 사전규격공고 목록/검색
 *    페이지로 직접 이동하는 link 패턴을 사용한다. 메인으로만 보내면 사전규격
 *    화면까지 사용자가 한참 들어가야 해서 의미가 없었다.
 *  - 임의의 ?keyword=... 형태(예: `https://www.g2b.go.kr/?keyword=...`) 는 G2B 가
 *    해석하지 않아 결과적으로 메인만 뜬다 — 사용 금지.
 *  - 검색어는 호출 측에서 클립보드에 복사해 G2B 검색창에 바로 붙여넣을 수 있게 한다.
 *  - 검색어 우선순위: 등록번호(R코드 포함) > 사전규격명 > 기관명.
 *
 * @returns query 후보가 모두 비어 있으면 null. 그 외엔 query/url/label.
 */
export function buildPreSpecSearchTarget(input: {
  preSpecRegNo?: string | null;
  bfSpecRgstNo?: string | null;
  title?: string | null;
  orgName?: string | null;
}): { query: string; url: string; label: string } | null {
  // 우선순위: 등록번호 (preSpecRegNo / bfSpecRgstNo, R코드든 숫자든) > 사전규격명 > 기관명.
  // R26BD... 같은 R코드도 그대로 검색어로 사용 (사용자가 G2B 검색창에 붙여넣어 검색).
  const candidates = [
    input.preSpecRegNo,
    input.bfSpecRgstNo,
    input.title,
    input.orgName,
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const trimmed = c.trim();
    if (!trimmed) continue;
    return {
      query: trimmed,
      url: G2B_PRE_SPEC_SEARCH_URL,
      label: "검색",
    };
  }
  return null;
}

/**
 * G2B 사전규격공고 진입 URL.
 *  - 메인이 아니라 사전규격공고 목록/검색 페이지로 곧장 이동하는 link 라우트.
 *  - 클릭 시 사용자는 한 단계만 검색창에 붙여넣으면 결과를 볼 수 있다.
 */
const G2B_PRE_SPEC_SEARCH_URL =
  "https://www.g2b.go.kr/link/PRCA001_04/single/?flag=cnrtSl&srch=0002";

export const G2B_DEFAULT_BID_DETAIL_BASE = G2B_BID_DETAIL_BASE;

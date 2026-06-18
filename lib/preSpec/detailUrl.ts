/**
 * 사전규격공고 상세 URL 해석기.
 *
 * 핵심 원칙:
 *  - "공고명 클릭 = 상세조회 진입" 보장이 안 되는 URL 은 절대 detailUrl 로 반환하지 않는다.
 *  - 검증 안 된 URL 은 searchUrl 에 담고, 화면은 별도 "나라장터 검색" 버튼으로 분리해야 한다.
 *  - 추측 URL 금지 — VERIFIED_DETAIL_URL_BUILDERS 에 등록된 패턴만 사용한다.
 *
 * 차세대 G2B (2025+ 리뉴얼) 검증 결과:
 *  - 레거시 :8143 포트 (preStdDtl.do 등)        : 응답 시간 초과 (서비스 종료).
 *  - https://www.g2b.go.kr/ep/preparation/...   : 404 ("요청하신 페이지를 찾을 수 없습니다").
 *  - https://www.g2b.go.kr/pn/pnp/pnpe/...      : 404.
 *  - https://www.g2b.go.kr/link/PRCA001_04/...  : 200 이지만 *목록/검색 화면* — 상세 아님.
 *  - 즉, 현재 공식 deep-link 가 존재하지 않는다.
 *
 * 결론:
 *  - 모든 항목은 method='search-fallback' / verified=false 로 처리된다.
 *  - 향후 G2B 가 deep-link 를 공개하거나 사용자가 DevTools 로 검증된 패턴을 발견하면
 *    VERIFIED_DETAIL_URL_BUILDERS 배열에 builder 함수를 추가하면 된다.
 *  - 검증 단계 없이 패턴을 추가하지 마라 — 사용자가 기능을 신뢰할 수 없게 된다.
 */

export type PreSpecDetailUrlMethod =
  | "verified-detail" // 검증된 상세 URL — 공고명 클릭으로 새 탭 오픈.
  | "search-fallback" // 등록번호는 있지만 상세 URL 모름 — 별도 검색 버튼만 노출.
  | "unsupported";    // 등록번호도 없음 — 진입 페이지 안내만.

export type PreSpecDetailUrlInfo = {
  /**
   * 검증된 상세 URL — null 이면 공고명 클릭 비활성.
   * 화면은 detailUrl !== null 일 때만 공고명을 클릭형으로 만들어야 한다.
   */
  detailUrl: string | null;
  /**
   * 나라장터 사전규격공고 검색/목록 URL — 항상 채워진다.
   * 별도 "나라장터 검색" 버튼이 이 URL 을 사용한다.
   */
  searchUrl: string;
  /** UI 분기 키 + DB detail_url_method 컬럼 값. */
  method: PreSpecDetailUrlMethod;
  /** 사용자/관리자에게 보여줄 한 줄 사유 (badge title 등). */
  reason: string;
  /** DB detail_url_verified 컬럼 값. method === 'verified-detail' 일 때만 true. */
  verified: boolean;
};

/**
 * 나라장터 사전규격공고 link 라우트 (검색/목록 SPA).
 *
 * 이 URL 은 "상세 URL 이 아니다" — 검증 결과 사전규격 검색 화면으로만 연결된다.
 * 따라서 detailUrl 로 절대 사용하지 않고, "나라장터 검색" 버튼 전용으로만 사용한다.
 */
export const G2B_PRE_SPEC_SEARCH_URL =
  "https://www.g2b.go.kr/link/PRCA001_04/single/?flag=cnrtSl&srch=0002";

/** http(s) URL 검증. null/빈 문자열/내부 경로/javascript: 등은 모두 거부. */
export function isVerifiedHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * 검증된 상세 URL builder 등록 슬롯.
 *
 * 등록 조건 (사용자/관리자가 반드시 검증해야 함):
 *   1) 실제 나라장터에서 등록번호로 검색 후 사업명을 클릭한다.
 *   2) 새 탭으로 열린 페이지가 "사전규격상세조회" 인지 확인한다 (페이지 텍스트 포함 검사).
 *   3) URL 이 변경되거나 (= deep-link 가능) Network 탭에서 GET 요청을 확인한다.
 *   4) 그 패턴을 R26BD 형식, 숫자형 ID 양쪽 모두에서 재현한다.
 *   5) 위 4 단계가 모두 성공해야 builder 추가.
 *
 * 현재 (2025-06 G2B 리뉴얼 시점):
 *   - 검증된 패턴이 발견되지 않아 *빈 배열* 을 유지한다.
 *   - 절대 추측 패턴을 추가하지 마라 — 추가하면 사용자가 잘못된 페이지로 안내됨.
 */
const VERIFIED_DETAIL_URL_BUILDERS: ReadonlyArray<(regNo: string) => string | null> = [];

/** stable link URL 위에 등록번호 query 를 안전하게 추가한다. 단, 이 URL 은 *검색* 용. */
function buildSearchUrl(regNo: string | null): string {
  if (!regNo) return G2B_PRE_SPEC_SEARCH_URL;
  const sep = G2B_PRE_SPEC_SEARCH_URL.includes("?") ? "&" : "?";
  const enc = encodeURIComponent(regNo);
  return `${G2B_PRE_SPEC_SEARCH_URL}${sep}bfSpecRegNo=${enc}&srchPreStdRgstNo=${enc}`;
}

export type ResolvePreSpecDetailUrlInput = {
  /** API 가 직접 준 detailUrl 후보 — http(s) 검증을 통과해야 verified 로 인정. */
  apiDetailUrl?: string | null;
  /** 사전규격등록번호 (bfSpecRgstNo / preSpecRegNo / preStdRegNo / publicPreSpecNo). */
  preSpecRegNo?: string | null;
};

/**
 * 사전규격 항목의 상세/검색 URL 정보를 해석한다.
 *
 * 우선순위:
 *  1) API 가 직접 준 detailUrl 이 http(s) 검증 통과 → verified-detail.
 *  2) 등록번호가 있으면 VERIFIED_DETAIL_URL_BUILDERS 에 등록된 패턴 시도 → verified-detail.
 *  3) 등록번호만 있고 검증된 패턴이 없으면 → search-fallback (detailUrl=null).
 *  4) 등록번호도 없으면 → unsupported (detailUrl=null, 검색 진입 페이지만 안내).
 *
 * 반드시 지켜야 할 규칙:
 *  - method='search-fallback' 일 때 detailUrl 은 *반드시 null* 이다.
 *  - 화면은 verified === true 일 때만 공고명을 클릭형으로 만든다.
 *  - 그 외에는 "상세링크 확인 필요" 배지 + 별도 "나라장터 검색" 버튼만 제공한다.
 */
export function resolvePreSpecDetailUrl(
  input: ResolvePreSpecDetailUrlInput,
): PreSpecDetailUrlInfo {
  const apiUrl = (input.apiDetailUrl ?? "").trim();
  const regNoRaw = (input.preSpecRegNo ?? "").trim();
  const regNo = regNoRaw.length > 0 ? regNoRaw : null;
  const searchUrl = buildSearchUrl(regNo);

  if (isVerifiedHttpUrl(apiUrl)) {
    return {
      detailUrl: apiUrl,
      searchUrl,
      method: "verified-detail",
      verified: true,
      reason: "API 응답에 직접 상세 URL 이 포함되어 있어 검증된 deep-link 로 사용.",
    };
  }

  if (regNo) {
    for (const build of VERIFIED_DETAIL_URL_BUILDERS) {
      let candidate: string | null = null;
      try {
        candidate = build(regNo);
      } catch {
        candidate = null;
      }
      if (candidate && isVerifiedHttpUrl(candidate)) {
        return {
          detailUrl: candidate.trim(),
          searchUrl,
          method: "verified-detail",
          verified: true,
          reason: "검증된 G2B 사전규격 상세 URL 패턴 매칭 성공.",
        };
      }
    }

    return {
      detailUrl: null,
      searchUrl,
      method: "search-fallback",
      verified: false,
      reason:
        "차세대 G2B SPA 가 사전규격 상세 deep-link 를 공식 지원하지 않아 직접 진입 불가. " +
        "별도 '나라장터 검색' 버튼에서 등록번호로 검색해 주세요.",
    };
  }

  return {
    detailUrl: null,
    searchUrl: G2B_PRE_SPEC_SEARCH_URL,
    method: "unsupported",
    verified: false,
    reason:
      "사전규격등록번호가 비어 있어 검색 URL 도 식별 불가. 나라장터 사전규격공고 진입 페이지로 안내.",
  };
}

/**
 * 화면 toast/타이틀 문구 — 상수로 두어 코드 일관성 유지.
 */
export const PRE_SPEC_DETAIL_URL_NEEDS_VERIFICATION_MESSAGE =
  "이 사전규격은 차세대 G2B SPA 가 직접 진입 deep-link 를 공식 지원하지 않습니다. " +
  "오른쪽 '나라장터 검색' 버튼으로 등록번호 검색 페이지를 열어 주세요.";

export const PRE_SPEC_DETAIL_URL_UNSUPPORTED_MESSAGE =
  "사전규격등록번호가 없어 검색 페이지로 이동할 수도 없습니다. 나라장터 사전규격공고에서 직접 확인해 주세요.";

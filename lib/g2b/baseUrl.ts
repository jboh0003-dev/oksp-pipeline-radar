/**
 * 나라장터(공공데이터포털) Open API base URL 해석기.
 *
 * 공식 문서 기준 주소:
 *   입찰공고   http://apis.data.go.kr/1230000/ad/BidPublicInfoService
 *   사전규격   http://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService
 *
 * 환경변수가 있으면 그 값을 그대로 우선하고, 없을 때만 공식 HTTP 주소를 사용한다.
 * 프로토콜을 강제로 변경하거나 TLS 검증을 비활성화하지 않는다.
 */

/** 공식 입찰공고 base URL. */
export const G2B_BID_BASE_URL = "http://apis.data.go.kr/1230000/ad/BidPublicInfoService";

/** 공식 사전규격 base URL. */
export const G2B_PRE_SPEC_BASE_URL =
  "http://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService";

/**
 * 환경변수의 base URL을 우선하고, 비어 있거나 파싱할 수 없으면 공식 주소를 사용한다.
 * trailing slash만 제거하며 protocol/hostname/pathname은 변경하지 않는다.
 */
export function normalizeG2bBaseUrl(raw: string | undefined | null, fallback: string): string {
  const candidate = (raw ?? "").trim();
  if (!candidate) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    console.warn("[g2b/baseUrl] base URL 파싱 실패 — 공식 주소로 대체합니다.", {
      fallbackHost: new URL(fallback).host,
    });
    return fallback;
  }

  return parsed.toString().replace(/\/$/, "");
}

/** 입찰공고 base URL — G2B_API_BASE_URL 우선, 없으면 공식 주소. */
export function resolveBidBaseUrl(): string {
  return normalizeG2bBaseUrl(process.env.G2B_API_BASE_URL, G2B_BID_BASE_URL);
}

/** 사전규격 base URL — G2B_PRESPEC_BASE_URL 우선, 없으면 공식 주소. */
export function resolvePreSpecBaseUrl(): string {
  return normalizeG2bBaseUrl(process.env.G2B_PRESPEC_BASE_URL, G2B_PRE_SPEC_BASE_URL);
}

/**
 * 요청 URL에서 비밀값과 query 전체를 제외한 로그용 요약.
 */
export function describeG2bRequest(
  url: string,
): { protocol: string; hostname: string; pathname: string } {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    };
  } catch {
    return {
      protocol: "(unparsable)",
      hostname: "(unparsable)",
      pathname: "(unparsable)",
    };
  }
}

/** 로그/디버그 응답에 URL 을 그대로 실어야 할 때 serviceKey 만 마스킹한다. */
export function maskServiceKey(url: string): string {
  return url.replace(/(serviceKey=)[^&]*/i, "$1***");
}

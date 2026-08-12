import { NextRequest, NextResponse } from "next/server";
import { resolvePreSpecBaseUrl } from "@/lib/g2b/baseUrl";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";
import { parseG2bResponse } from "@/lib/g2b/normalize";
import {
  PRE_SPEC_NUM_OF_ROWS,
  getInquiryRangeYyyymmdd,
} from "@/lib/preSpec/api";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";

/**
 * GET /api/debug-prespec
 *
 * 사전규격 (HrcspSsstndrdInfoService) API 호출이 실제로 어디서 막히는지를 한 번에 진단하는
 * 임시/진단용 엔드포인트.
 *
 * 인증:
 *   - 의도적으로 인증 게이트를 두지 않는다 (로그인 / requireAdmin / CRON_SECRET 모두 적용 X).
 *     사전규격 API 원본 응답을 누구나(개발자 / 운영자) 브라우저로 바로 확인할 수 있어야 한다.
 *   - 그 대신 응답에서 민감정보(ServiceKey 원문)는 절대 노출하지 않는다 — 마스킹된 형태만.
 *
 * 노출 정책 (보안):
 *   - ServiceKey 는 마스킹("abcd…wxyz") + length / source / looksEncoded 메타만 노출.
 *   - URL 출력에서도 serviceKey 파라미터는 별도로 마스킹 후 표시.
 *   - 원본 response body 는 첫 1000자까지만.
 *
 * 응답 예:
 *   {
 *     endpoint: "...HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch",
 *     url: "....serviceKey=****&..."   ← 마스킹된 URL
 *     serviceKey: { present: true, source: "NARA_PRESPEC_API_KEY", length: 88, masked: "abcd…wxyz", looksEncoded: false },
 *     httpStatus: 200,
 *     resultCode: "00",
 *     resultMsg: "NORMAL SERVICE.",
 *     totalCount: 14,
 *     itemsCount: 14,
 *     firstItem: { ... },
 *     firstItemKeys: [...],
 *     rawBodyFirst1000: "...",
 *     attempts, durationMs, error?: null | "..."
 *   }
 *
 * 호출 예:
 *   curl http://localhost:3000/api/debug-prespec
 *   curl 'http://localhost:3000/api/debug-prespec?endpoint=getPublicPrcureThngInfoThngPPSSrch&days=30'
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_BASE_URL = resolvePreSpecBaseUrl();

const ALLOWED_ENDPOINTS = new Set<string>([
  // 운영 endpoint
  "getPublicPrcureThngInfoServcPPSSrch",
  "getPublicPrcureThngInfoThngPPSSrch",
  "getPublicPrcureThngInfoCnstwkPPSSrch",
  "getPublicPrcureThngInfoFrgcptPPSSrch",
  // legacy fallback
  "getPublicPrcureThngInfoServc",
  "getPublicPrcureThngInfoThng",
  "getPublicPrcureThngInfoCnstwk",
]);

/** URL 의 serviceKey 파라미터 값을 마스킹. */
function maskServiceKeyInUrl(url: string): string {
  return url.replace(/(serviceKey=)[^&]+/i, "$1****");
}

/** "yyyymmddHHMM" 12자리 검증 (dateRange 헬퍼와 같은 형식). */
function isValid12DigitDate(value: string | null): value is string {
  return typeof value === "string" && /^\d{12}$/.test(value);
}

export async function GET(request: NextRequest) {
  // 의도적으로 인증 게이트 없음 — 사전규격 API 원본 응답을 누구나 바로 확인할 수 있어야 한다.
  // 민감정보(ServiceKey 원문)는 응답에서 마스킹 처리되며, raw body 도 1000자로 제한.
  const url = new URL(request.url);
  const endpointParam =
    url.searchParams.get("endpoint")?.trim() ||
    "getPublicPrcureThngInfoServcPPSSrch";
  const endpoint = ALLOWED_ENDPOINTS.has(endpointParam)
    ? endpointParam
    : "getPublicPrcureThngInfoServcPPSSrch";

  const daysRaw = url.searchParams.get("days");
  const daysParsed = daysRaw ? Number(daysRaw) : 7;
  const days = Number.isFinite(daysParsed)
    ? Math.max(1, Math.min(90, Math.floor(daysParsed)))
    : 7;

  // inqryBgnDt/inqryEndDt 를 직접 지정한 경우 우선 사용 (날짜 범위 디버그용).
  let inqryBgnDt: string;
  let inqryEndDt: string;
  const customBgn = url.searchParams.get("inqryBgnDt");
  const customEnd = url.searchParams.get("inqryEndDt");
  if (isValid12DigitDate(customBgn) && isValid12DigitDate(customEnd)) {
    inqryBgnDt = customBgn;
    inqryEndDt = customEnd;
  } else {
    const range = getInquiryRangeYyyymmdd(days);
    inqryBgnDt = range.inqryBgnDt;
    inqryEndDt = range.inqryEndDt;
  }

  const numOfRows = (() => {
    const raw = url.searchParams.get("numOfRows");
    if (!raw) return Math.min(20, PRE_SPEC_NUM_OF_ROWS); // 디버그라 기본 20건
    const n = Number(raw);
    if (!Number.isFinite(n)) return 20;
    return Math.max(1, Math.min(PRE_SPEC_NUM_OF_ROWS, Math.floor(n)));
  })();

  const startedAt = Date.now();
  const keyResolution = resolvePreSpecServiceKey();

  if (!keyResolution.present) {
    return NextResponse.json(
      {
        ok: false,
        diagnosis: "API_KEY_MISSING",
        endpoint,
        baseUrl: DEFAULT_BASE_URL,
        serviceKey: {
          present: false,
          source: null,
          masked: null,
          checkedEnvVars: keyResolution.checkedEnvVars,
        },
        message:
          "사전규격 ServiceKey 가 설정되지 않았습니다. " +
          "NARA_PRESPEC_API_KEY (또는 G2B_PRESPEC_SERVICE_KEY, 또는 G2B_SERVICE_KEY) " +
          "환경변수를 .env.local 및 Vercel Environment Variables 에 등록해 주세요.",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  // 호출용 URL 빌드 (lib/g2b/client.ts 의 buildG2bUrl 사용 — encoding 일관 처리).
  const fullUrl = buildG2bUrl(DEFAULT_BASE_URL, endpoint, {
    inqryDiv: "1",
    inqryBgnDt,
    inqryEndDt,
    pageNo: 1,
    numOfRows,
    serviceKey: keyResolution.key,
    type: "json",
  });
  const maskedUrl = maskServiceKeyInUrl(fullUrl);

  const result = await fetchG2bApi(fullUrl, {
    label: "debug-prespec",
    timeoutMs: 15_000,
    retries: 1, // 디버그라 1회만 시도 (실패 케이스 빠르게 보고싶음).
  });

  const debug = result.debug;

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      diagnosis: result.errorKind,
      endpoint,
      baseUrl: DEFAULT_BASE_URL,
      url: maskedUrl,
      serviceKey: {
        present: true,
        source: keyResolution.source,
        length: keyResolution.length,
        masked: keyResolution.masked,
        looksEncoded: keyResolution.looksEncoded,
      },
      httpStatus: debug.status,
      resultCode: debug.resultCode,
      resultMsg: debug.resultMsg,
      totalCount: debug.totalCount,
      itemsCount: 0,
      attempts: debug.attempts,
      durationMs: debug.durationMs,
      error: result.error,
      inqryBgnDt,
      inqryEndDt,
      hint: hintForKind(result.errorKind, debug.resultCode, debug.resultMsg),
    });
  }

  const parsed = parseG2bResponse(result.data);
  const items = parsed.items;
  // 샘플 3건 — items 가 적으면 들어있는 만큼만 (1건 / 0건 케이스 구분 가능).
  // 각 item 의 raw JSON 을 그대로 노출해 사전규격등록번호(bfSpecRgstNo) / 품명 /
  // 배정예산액 / 규격서 파일 필드 존재 여부를 한눈에 검증할 수 있게 한다.
  const itemsSample = items.slice(0, 3);
  const firstItem = items[0] ?? null;
  const firstItemKeys = firstItem ? Object.keys(firstItem).slice(0, 30) : [];

  return NextResponse.json({
    ok: true,
    diagnosis: items.length > 0 ? "OK" : "EMPTY_ITEMS",
    endpoint,
    baseUrl: DEFAULT_BASE_URL,
    url: maskedUrl,
    serviceKey: {
      present: true,
      source: keyResolution.source,
      length: keyResolution.length,
      masked: keyResolution.masked,
      looksEncoded: keyResolution.looksEncoded,
    },
    httpStatus: debug.status,
    resultCode: parsed.header?.resultCode ?? null,
    resultMsg: parsed.header?.resultMsg ?? null,
    totalCount: parsed.totalCount,
    pageNo: 1,
    numOfRows,
    itemsCount: items.length,
    /** 사전규격 응답 첫 3건 — 디버그용 표본. 인증/파싱이 정상이면 여기서 등록번호/품명 확인 가능. */
    itemsSample,
    /** legacy 호환 — itemsSample[0] 와 같음. */
    firstItem,
    firstItemKeys,
    rawBodyFirst1000: result.raw.slice(0, 1000),
    attempts: debug.attempts,
    durationMs: debug.durationMs,
    inqryBgnDt,
    inqryEndDt,
    hint:
      items.length === 0
        ? `0건. days 또는 inqryBgnDt/inqryEndDt 범위를 늘려보세요. (현재: ${inqryBgnDt} ~ ${inqryEndDt})`
        : null,
  });
}

function hintForKind(
  kind: string,
  resultCode: string | null,
  resultMsg: string | null,
): string {
  switch (kind) {
    case "API_KEY_MISSING":
      if (resultCode === "30")
        return "G2B 응답이 SERVICE KEY IS NOT REGISTERED 입니다. 공공데이터포털에서 사전규격(HrcspSsstndrdInfoService) 활용신청 상태를 다시 확인해 주세요. (입찰공고용 키와 별개일 수 있음)";
      if (resultCode === "31")
        return "DEADLINE 또는 일일 호출 한도 초과. 공공데이터포털에서 활용기간/한도를 확인해 주세요.";
      return "401/403 — ServiceKey 인증 실패. NARA_PRESPEC_API_KEY 또는 G2B_SERVICE_KEY 값을 다시 확인해 주세요.";
    case "API_TIMEOUT":
      return "요청 timeout. G2B 일시 장애 가능. retries 를 늘려서 재시도해 보세요.";
    case "API_RESPONSE_ERROR":
      if (resultCode === "12")
        return `${resultMsg ?? "API 일시 오류"}. G2B 측 오류 가능. 시간을 두고 재시도해 주세요.`;
      return `엔드포인트/파라미터 오류 가능. resultCode=${resultCode ?? "-"} · resultMsg=${resultMsg ?? "-"}`;
    case "JSON_PARSE_ERROR":
      return "응답이 JSON 이 아님 (XML/HTML 등). type=json 파라미터 또는 endpoint URL 을 확인해 주세요.";
    default:
      return "알 수 없는 오류. rawBody 와 url 을 함께 확인해 주세요.";
  }
}

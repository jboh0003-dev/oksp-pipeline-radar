import { extractAttachments, summarizeAttachments } from "@/lib/attachments";
import { matchPreSpec } from "@/lib/preSpec/match";
import type {
  PreSpecAnnouncement,
  PreSpecRecommendation,
  PreSpecStatus,
} from "@/lib/preSpec/types";
import { buildPreSpecSourceUrl } from "@/lib/sourceUrl";

/**
 * G2B 사전규격 raw item → PreSpecAnnouncement 정규화.
 *
 * 실제 응답 필드 (probe 검증 결과):
 *   bsnsDivNm           : 업무 구분명 (일반용역/물품/공사/외자)
 *   refNo               : 참조번호
 *   prdctClsfcNoNm      : 사전규격명/사업명/품명 ★ 대표 제목
 *   orderInsttNm        : 발주기관명
 *   rlDminsttNm         : 실수요기관명 (= demand)
 *   asignBdgtAmt        : 배정예산액
 *   rcptDt              : 접수일시 (= 공개일)
 *   opninRgstClseDt     : 의견등록마감일시 ★
 *   ofclTelNo, ofclNm   : 담당자
 *   swBizObjYn          : SW 사업 대상 여부 (Y/N)
 *   dlvrTmlmtDt         : 납품기한
 *   bfSpecRgstNo        : 사전규격등록번호 ★ unique key
 *   specDocFileUrl1~5   : 규격서 다운로드 URL ★
 *   prdctDtlList        : 품목 상세 ([1^코드^품명] 형태)
 *   bidNtceNoList       : 연결된 입찰공고번호(콤마 구분) ★ linkedBidNo
 *   rgstDt, chgDt       : 등록/변경일시
 *
 * 다른 사이트에서 사용된 다양한 필드명도 fallback 후보로 같이 둔다.
 */

export const PRE_SPEC_NEW_TTL_MS = 24 * 60 * 60 * 1000;

/** value 가 의미 있는(빈 문자열 아닌) 값일 때만 첫 매칭 후보 반환. */
function pickFirst(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (v == null) continue;
    if (typeof v === "number") return String(v);
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    }
  }
  return undefined;
}

/** 콤마 / 비숫자 문자가 섞인 문자열을 안전하게 정수 변환. 실패 시 0. */
function parseAmount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return 0;
  const s = value.trim();
  if (!s) return 0;
  // 외자처럼 소수점이 들어오는 경우(예: "116992.05") 도 안전하게 처리.
  // 숫자/소수점만 남기고, 정수부만 사용.
  const cleaned = s.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * 다양한 형태의 일시를 ISO yyyy-mm-dd 로 변환.
 *  - "20260609"
 *  - "2026-06-09"
 *  - "2026/06/09"
 *  - "2026-06-09 18:00"
 *  - "2026-06-09 18:00:00"
 *  - "2026-06-09T18:00:00"
 * 실패하거나 빈 값이면 undefined.
 */
export function parseG2bDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  // 처음 8자리 숫자만 취해 yyyy-mm-dd 로 변환 시도.
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    if (
      Number(y) >= 1900 &&
      Number(m) >= 1 &&
      Number(m) <= 12 &&
      Number(d) >= 1 &&
      Number(d) <= 31
    ) {
      return `${y}-${m}-${d}`;
    }
  }
  return undefined;
}

const TITLE_KEYS = [
  "prdctClsfcNoNm",
  "bidNtceNm",
  "bsnsNm",
  "preSpecNm",
  "bfSpecNm",
  "specNm",
  "title",
] as const;

const BUSINESS_KEYS = ["bsnsNm", "bidNtceNm", "prdctClsfcNoNm", "preSpecNm"] as const;

const ORG_KEYS = [
  "orderInsttNm",
  "dminsttNm",
  "ntceInsttNm",
  "dmndInsttNm",
  "rlDminsttNm",
  "orgName",
] as const;

const DEMAND_KEYS = ["rlDminsttNm", "dminsttNm", "dmndInsttNm", "demandOrgName"] as const;

const BUDGET_KEYS = [
  "asignBdgtAmt",
  "bdgtAmt",
  "budget",
  "presmptPrce",
  "presmptAmt",
  "allocatedBudget",
] as const;

const OPEN_DATE_KEYS = [
  "rcptDt",
  "rlsDt",
  "opninRgstDt",
  "ntceDt",
  "rgstDt",
  "openDate",
] as const;

const OPINION_DEADLINE_KEYS = [
  "opninRgstClseDt",
  "opninEndDt",
  "rlsEndDt",
  "opnnAcptdEdate",
  "rcptEdate",
  "clseDt",
  "deadline",
  "opinionDeadline",
] as const;

const REG_NO_KEYS = ["bfSpecRgstNo", "preSpecRegNo", "spcfctRgstNo", "specRgstNo", "rgstNo"] as const;

/** 규격서 후보 키 — specDocFileUrl1~5 + 일반 fileUrl 후보. */
const SPEC_FILE_KEYS = [
  "specDocFileUrl1",
  "specDocFileUrl2",
  "specDocFileUrl3",
  "specDocFileUrl4",
  "specDocFileUrl5",
  "specDocFileUrl",
  "atchFileUrl",
  "rqstFileUrl",
  "fileUrl",
  "ntceSpecDocUrl",
] as const;

/** http(s) URL 인지 검증. */
function isValidHttpUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

/** specDocFileUrl1~5 중 첫 번째로 채워진 http URL 반환. */
function pickSpecFileUrl(item: Record<string, unknown>): string | undefined {
  for (const key of SPEC_FILE_KEYS) {
    const v = item[key];
    if (typeof v === "string" && isValidHttpUrl(v)) return v.trim();
  }
  return undefined;
}

/** bidNtceNoList 가 있을 때 첫 번째 입찰공고번호만 추출 (linkedBidNo). */
function pickLinkedBidNo(item: Record<string, unknown>): string | undefined {
  const raw = item.bidNtceNoList ?? item.linkedBidNo;
  if (typeof raw !== "string") return undefined;
  const first = raw.split(",").map((s) => s.trim()).filter(Boolean)[0];
  return first || undefined;
}

/**
 * 사전규격 원문 페이지 URL — lib/sourceUrl 의 buildPreSpecSourceUrl 위임.
 *
 * 정책 (404 방지):
 *  - API raw 가 detailUrl / originalUrl 을 http(s) 형태로 직접 줄 때만 URL 반환.
 *  - bfSpecRgstNo 만으로 임의 검색 URL 을 만들지 않는다 — 이전 방식은 G2B 에서 404 났다.
 *  - 결과가 undefined 이면 화면은 "원문없음" 비활성 라벨로 표시한다.
 */
function buildSourceUrl(
  raw: Record<string, unknown>,
  bfSpecRgstNo: string | undefined,
): string | undefined {
  const detailUrl = pickFirst(raw, ["detailUrl", "ntceUrl", "ntceDtlUrl", "preSpecUrl"]);
  const originalUrl = pickFirst(raw, ["originalUrl", "orgnlUrl", "sourceUrl"]);
  return buildPreSpecSourceUrl({
    bfSpecRgstNo,
    detailUrl,
    originalUrl,
  }).url;
}

function getAnnouncementKey(item: Record<string, unknown>, fallback: string): string {
  const reg = pickFirst(item, REG_NO_KEYS);
  if (reg) return reg;
  const name = pickFirst(item, TITLE_KEYS);
  const org = pickFirst(item, ORG_KEYS);
  const due = pickFirst(item, OPINION_DEADLINE_KEYS);
  return [name, org, due].filter(Boolean).join("|") || fallback;
}

/**
 * 의견마감일 + 오늘 기준으로 status 결정.
 *  - 마감일 없음 → "확인필요"
 *  - 오늘 < 마감일 - 3일 → 진행중
 *  - 0~3일 이내 → 마감임박
 *  - 마감 지남 → 마감
 */
function getStatus(opinionDeadline: string | undefined, today: Date): PreSpecStatus {
  if (!opinionDeadline) return "확인필요";
  // 의견마감일은 보통 23:59 까지로 본다.
  const due = new Date(`${opinionDeadline}T23:59:59+09:00`);
  if (Number.isNaN(due.getTime())) return "확인필요";
  const todayMs = today.getTime();
  const diffDays = Math.floor((due.getTime() - todayMs) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "마감";
  if (diffDays <= 3) return "마감임박";
  return "진행중";
}

/**
 * 추천 등급 결정 — 사전규격 전용 룰.
 *  - 점수 합 ≥ 6 + 진행중/마감임박 → 핵심검토
 *  - 점수 합 ≥ 3 + 진행중           → 의견제출검토
 *  - 점수 합 ≥ 1                     → 영업확인필요
 *  - 점수 0 + 매칭 키워드 0          → 제외
 *  - 그 외                          → 참고
 *  - 부정 신호 누적 시 한 단계 다운그레이드.
 */
function getRecommendation(
  scoreSum: number,
  hasAnyKeyword: boolean,
  status: PreSpecStatus,
  negativeWeight: number,
): PreSpecRecommendation {
  let base: PreSpecRecommendation;
  if (scoreSum >= 6 && (status === "진행중" || status === "마감임박")) {
    base = "핵심검토";
  } else if (scoreSum >= 3 && status === "진행중") {
    base = "의견제출검토";
  } else if (scoreSum >= 1) {
    base = "영업확인필요";
  } else if (!hasAnyKeyword) {
    base = "제외";
  } else {
    base = "참고";
  }
  if (negativeWeight >= 2) {
    if (base === "핵심검토") return "영업확인필요";
    if (base === "의견제출검토") return "참고";
    if (base === "영업확인필요") return "참고";
  }
  return base;
}

export type NormalizeOptions = {
  /** 상태 계산 기준 시각 (default: now). */
  now?: Date;
  /** 어느 API endpoint 에서 받은 데이터인지 (디버깅). */
  sourceApi?: string;
  sourceEndpoint?: string;
};

export function normalizePreSpecItem(
  raw: Record<string, unknown>,
  fallbackKey: string,
  opts: NormalizeOptions = {},
): PreSpecAnnouncement {
  const now = opts.now ?? new Date();
  const announcementKey = getAnnouncementKey(raw, fallbackKey);

  const title = pickFirst(raw, TITLE_KEYS) ?? "(제목 없음)";
  const businessName = pickFirst(raw, BUSINESS_KEYS);

  const orgName = pickFirst(raw, ORG_KEYS) ?? "(기관 미상)";
  const demandOrgName = pickFirst(raw, DEMAND_KEYS);

  const budget = parseAmount(pickFirst(raw, BUDGET_KEYS));

  const openDate = parseG2bDate(pickFirst(raw, OPEN_DATE_KEYS));
  const opinionDeadline = parseG2bDate(pickFirst(raw, OPINION_DEADLINE_KEYS));

  const preSpecRegNo = pickFirst(raw, REG_NO_KEYS);

  // 첨부 / RFP / 규격서 / 과업지시서 — 통합 helper.
  const attachments = extractAttachments(raw);
  const att = summarizeAttachments(attachments);

  // 규격서 URL: 첨부 분석에서 찾은 게 있으면 그것, 없으면 specDocFileUrl1~5 후보.
  // pickSpecFileUrl 은 이미 http(s) 검증을 통과한 값만 반환하므로 추가 검증 불필요.
  const specFileUrl = att.specDocUrl ?? pickSpecFileUrl(raw);
  const fileUrl = specFileUrl;
  const sourceUrl = buildSourceUrl(raw, preSpecRegNo);

  // fileName: 첨부 목록의 첫 번째 항목의 이름을 대표 파일명으로 사용 (matching/표시 용).
  // 첨부가 비어 있어도 raw 의 직접 fileName 후보는 추출.
  const fileName =
    attachments[0]?.name ??
    pickFirst(raw, ["atchFileNm", "fileName", "fileNm", "specDocFileNm", "specFileNm"]);

  const linkedBidNo = pickLinkedBidNo(raw);

  // 매칭 텍스트 — title / businessName / orgName / fileName 기준 (스펙 요구).
  // 추가로 prdctDtlList / refNo / bsnsDivNm / 첨부 전체 파일명도 포함해서 누락 줄인다.
  const attachmentNames = attachments.map((a) => a.name).filter(Boolean).join(" ");
  const matchBody = [
    title,
    businessName,
    orgName,
    demandOrgName,
    fileName,
    attachmentNames,
    pickFirst(raw, ["prdctDtlList"]),
    pickFirst(raw, ["refNo"]),
    pickFirst(raw, ["bsnsDivNm"]),
  ]
    .filter(Boolean)
    .join("\n");

  const m = matchPreSpec(title, matchBody);

  const status = getStatus(opinionDeadline, now);
  const scoreSum = Object.values(m.productScores).reduce((a, b) => a + (b ?? 0), 0);
  const recommendation = getRecommendation(
    scoreSum,
    m.products.length > 0 || m.matchedKeywords.length > 0,
    status,
    m.negativeWeight,
  );

  return {
    sourceType: "PRE_SPEC",
    announcementKey,
    preSpecRegNo,
    bsnsDivLabel: pickFirst(raw, ["bsnsDivNm"]),
    title,
    businessName,
    orgName,
    demandOrgName,
    budget,
    openDate,
    opinionDeadline,
    fileName,
    fileUrl,
    specFileUrl,
    sourceUrl,
    raw,
    products: m.products,
    primaryProduct: m.primaryProduct,
    productScores: m.productScores,
    matchedKeywords: m.matchedKeywords,
    matchReason: m.matchReason,
    department: "미매칭",
    namedType: "-",
    region: undefined,
    status,
    recommendation,
    isNew: false,
    newAt: null,
    feedbackCount: 0,
    customer: null,
    // 사전규격 → 입찰공고 연결: 이미 연결된 경우 bidNtceNoList 에서 첫 번째 추출.
    // TODO: linkedStatus 는 추후 입찰공고 DB 와 join 해서 채울 수 있다.
    linkedBidNo,
    linkedBidTitle: undefined,
    linkedStatus: linkedBidNo ? "입찰공고등록" : undefined,

    // 첨부 / 분류
    attachments,
    hasRfp: att.hasRfp,
    hasSpecDoc: att.hasSpecDoc,
    hasTaskDoc: att.hasTaskDoc,

    // 출처 식별
    sourceApi: opts.sourceApi,
    sourceEndpoint: opts.sourceEndpoint,
  };
}

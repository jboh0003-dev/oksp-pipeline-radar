import { matchPreSpec } from "@/lib/preSpec/match";
import type {
  PreSpecAnnouncement,
  PreSpecRecommendation,
  PreSpecStatus,
} from "@/lib/preSpec/types";

/**
 * G2B 사전규격 raw item → PreSpecAnnouncement 정규화.
 *
 * 사전규격 API 응답은 endpoint(물품/용역/공사/외자) 별로 필드명이 약간 다르고,
 * 같은 endpoint 안에서도 항목 누락이 잦다. 따라서 여러 후보 필드를 ?? 로 차례대로 시도하고,
 * 알 수 없는 값은 비워둔다.
 */

export const PRE_SPEC_NEW_TTL_MS = 24 * 60 * 60 * 1000;

function readString(item: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    }
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function readBudget(item: Record<string, unknown>): number {
  const candidates = [
    "asignBdgtAmt",
    "presmptPrce",
    "presmptAmt",
    "budget",
    "allocatedBudget",
    "bdgtAmt",
  ];
  for (const k of candidates) {
    const v = item[k];
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      // 1,234,567 / "12억 3천" / 숫자만 → 숫자만 추출
      const digits = v.replace(/[^\d]/g, "");
      if (digits.length > 0) {
        const n = Number(digits);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return 0;
}

/** 다양한 형태의 일자(yyyymmdd / yyyy-mm-dd / yyyy.mm.dd / "yyyy-MM-dd HH:mm:ss") → "yyyy-mm-dd". */
function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const s = value.trim();
  if (!s) return undefined;
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return undefined;
}

function getAnnouncementKey(item: Record<string, unknown>, fallback: string): string {
  const reg = readString(item, "bfSpecRgstNo", "preSpecRegNo", "spcfctRgstNo", "rgstNo");
  if (reg) return reg;
  const name = readString(item, "prdctClsfcNoNm", "bsnsNm", "preSpecNm", "bidNtceNm", "title");
  const org = readString(item, "dminsttNm", "ntceInsttNm", "orderInsttNm", "orgName");
  const due = readString(item, "opnnAcptdEdate", "rcptDt", "rgstDt");
  return [name, org, due].filter(Boolean).join("|") || fallback;
}

/**
 * 의견마감일 + 오늘 날짜 비교로 status 결정.
 *  - 마감 지남 → "마감"
 *  - 3일 이내 → "마감임박"
 *  - 그 외     → "진행중"
 *  - 마감일 없음 → "확인필요"
 */
function getStatus(opinionDeadline: string | undefined, today: Date): PreSpecStatus {
  if (!opinionDeadline) return "확인필요";
  const due = new Date(`${opinionDeadline}T23:59:59+09:00`);
  if (Number.isNaN(due.getTime())) return "확인필요";
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "마감";
  if (diffDays <= 3) return "마감임박";
  return "진행중";
}

/**
 * 추천 등급 결정 — 사전규격 전용 룰.
 *  - 점수 합 ≥ 6 + 진행중/마감임박 → 핵심검토
 *  - 점수 합 ≥ 3 + 진행중           → 의견제출검토 (사전규격 단계에서 우리 의견 넣을 만함)
 *  - 점수 합 ≥ 1                     → 영업확인필요
 *  - 점수 0 + 키워드 매칭 0          → 제외
 *  - 그 외                          → 참고
 *  - 부정 신호(하드웨어 납품) 누적이 크면 한 단계 다운그레이드
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

  // 부정 신호 다운그레이드.
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
};

export function normalizePreSpecItem(
  raw: Record<string, unknown>,
  fallbackKey: string,
  opts: NormalizeOptions = {},
): PreSpecAnnouncement {
  const now = opts.now ?? new Date();
  const announcementKey = getAnnouncementKey(raw, fallbackKey);

  const title =
    readString(raw, "prdctClsfcNoNm", "bsnsNm", "preSpecNm", "bidNtceNm", "title") ?? "(제목 없음)";
  const businessName = readString(raw, "bsnsNm", "businessName");

  const orgName =
    readString(raw, "ntceInsttNm", "dminsttNm", "orderInsttNm", "orgName") ?? "(기관 미상)";
  const demandOrgName = readString(raw, "dminsttNm", "demandOrgName");

  const budget = readBudget(raw);

  const openDate = normalizeDate(readString(raw, "rgstDt", "opnNtceDt", "registDt", "openDate"));
  const opinionDeadline = normalizeDate(
    readString(raw, "opnnAcptdEdate", "opinionDeadline", "rcptEdate", "opnnEndDt"),
  );

  const fileName = readString(raw, "atchFileNm", "specDocFileNm", "fileName");
  const fileUrl = readString(
    raw,
    "atchFileUrl",
    "specDocFileUrl",
    "rqstFileUrl",
    "fileUrl",
  );
  const specFileUrl = readString(raw, "specDocFileUrl", "specFileUrl", "atchFileUrl");
  const sourceUrl = readString(raw, "linkUrl", "sourceUrl", "ntceUrl");

  const summaryText = readString(raw, "prdctClsfcNoNm", "bsnsNm", "preSpecNm", "ntceMthdNm") ?? "";
  const matchBody = `${summaryText}\n${title}\n${orgName}`;
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
    preSpecRegNo: readString(raw, "bfSpecRgstNo", "preSpecRegNo", "spcfctRgstNo"),
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
  };
}

import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/** 사전규격 추천 — CONTRABASS / 인프라·클라우드 관련 (완화). */
export const PRE_SPEC_CONTRABASS_KEYWORDS = [
  "클라우드",
  "가상화",
  "서버",
  "인프라",
  "정보자원",
  "전산자원",
  "시스템 고도화",
  "통합관리",
  "운영관리",
  "자원관리",
  "망분리",
  "VDI",
  "VMware",
  "VM웨어",
  "하이퍼바이저",
  "프라이빗 클라우드",
  "IaaS",
  "데이터센터",
  "OpenStack",
  "오픈스택",
  "HCI",
  "클라우드 전환",
  "클라우드 마이그레이션",
  "정보시스템",
] as const;

/** 사전규격 추천 — VIOLA / 플랫폼 관련 (완화). */
export const PRE_SPEC_VIOLA_KEYWORDS = [
  "쿠버네티스",
  "Kubernetes",
  "K8S",
  "컨테이너",
  "PaaS",
  "플랫폼",
  "클라우드 네이티브",
  "DevOps",
  "CI/CD",
  "MSA",
  "애플리케이션 현대화",
  "마이크로서비스",
] as const;

/** 공통 관심 키워드 — 추천공고 완화 매칭. */
export const PRE_SPEC_COMMON_KEYWORDS = [
  "AI",
  "빅데이터",
  "데이터 플랫폼",
  "통합 플랫폼",
  "포털",
  "관제",
  "자동화",
  "관리시스템",
  "정보시스템",
  "업무시스템",
  "유지관리",
  "고도화",
  "구축",
] as const;

const lower = (s: string) => s.toLowerCase();

function findKeywordHits(haystack: string, words: readonly string[]): string[] {
  const hay = lower(haystack);
  const out: string[] = [];
  for (const w of words) {
    if (hay.includes(lower(w))) out.push(w);
  }
  return out;
}

/** 매칭·필터에 쓸 검색 텍스트 (제목 + 기관 + 키워드 + 사업명). */
export function getPreSpecSearchableText(item: PreSpecAnnouncement): string {
  return [
    item.title,
    item.businessName ?? "",
    item.orgName,
    item.demandOrgName ?? "",
    ...(item.matchedKeywords ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

export function getPreSpecMatchScore(item: PreSpecAnnouncement): number {
  const scores = item.productScores ?? {};
  let max = 0;
  for (const v of Object.values(scores)) {
    if (typeof v === "number" && v > max) max = v;
  }
  return max;
}

export function isPreSpecContrabassRelated(item: PreSpecAnnouncement): boolean {
  if (item.products.includes("CONTRABASS")) return true;
  const text = getPreSpecSearchableText(item);
  return findKeywordHits(text, PRE_SPEC_CONTRABASS_KEYWORDS).length > 0;
}

export function isPreSpecViolaRelated(item: PreSpecAnnouncement): boolean {
  if (item.products.includes("VIOLA")) return true;
  const text = getPreSpecSearchableText(item);
  return findKeywordHits(text, PRE_SPEC_VIOLA_KEYWORDS).length > 0;
}

/**
 * 완화된 추천공고 기준 — 사전규격은 입찰보다 넓게 노출.
 * CONTRABASS/VIOLA/공통 키워드 중 하나라도 hit 이면 추천.
 */
export function isPreSpecRecommended(item: PreSpecAnnouncement): boolean {
  if (item.recommendation === "제외") return false;
  if (isPreSpecContrabassRelated(item) || isPreSpecViolaRelated(item)) return true;
  const text = getPreSpecSearchableText(item);
  if (findKeywordHits(text, PRE_SPEC_COMMON_KEYWORDS).length > 0) return true;
  if (Array.isArray(item.matchedKeywords) && item.matchedKeywords.length > 0) return true;
  return getPreSpecMatchScore(item) >= 1;
}

/** @deprecated use isPreSpecRecommended */
export function isPreSpecKeywordMatched(item: PreSpecAnnouncement): boolean {
  return isPreSpecRecommended(item);
}

export function isPreSpecProductLineRelated(item: PreSpecAnnouncement): boolean {
  return isPreSpecContrabassRelated(item) || isPreSpecViolaRelated(item);
}

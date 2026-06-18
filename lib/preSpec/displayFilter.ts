import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/** 화면 기본 표시 — 제품 strong 매칭 1회(≥3점) 이상. */
export const PRE_SPEC_MATCH_SCORE_THRESHOLD = 3;

export function getPreSpecMatchScore(item: PreSpecAnnouncement): number {
  const scores = item.productScores ?? {};
  let max = 0;
  for (const v of Object.values(scores)) {
    if (typeof v === "number" && v > max) max = v;
  }
  return max;
}

/**
 * 입찰공고와 동일 — 관련 키워드/제품에 매칭된 사전규격만 기본 노출.
 *
 * 조건 (하나라도 충족):
 *  - products.length ≥ 1
 *  - matchedKeywords.length ≥ 1
 *  - match_score(max productScores) ≥ PRE_SPEC_MATCH_SCORE_THRESHOLD
 */
export function isPreSpecKeywordMatched(item: PreSpecAnnouncement): boolean {
  if (Array.isArray(item.products) && item.products.length > 0) return true;
  if (Array.isArray(item.matchedKeywords) && item.matchedKeywords.length > 0) {
    return true;
  }
  return getPreSpecMatchScore(item) >= PRE_SPEC_MATCH_SCORE_THRESHOLD;
}

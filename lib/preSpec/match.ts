import type { PreSpecProduct } from "@/lib/preSpec/types";
import {
  PRE_SPEC_COMMON_KEYWORDS,
  PRE_SPEC_CONTRABASS_KEYWORDS,
  PRE_SPEC_VIOLA_KEYWORDS,
} from "@/lib/preSpec/displayFilter";

/**
 * 사전규격 전용 제품 키워드 — 완화 정책 (2026-06).
 *
 *  - 사전규격은 상세 정보가 적어 매칭을 입찰공고보다 넓게 잡는다.
 *  - CMP 는 /pre-spec 화면에서 사용하지 않으나 legacy 데이터 호환을 위해 tier 는 유지.
 *  - 제외는 명백한 무관 공고만 (사무용품·청소·식자재 등).
 */

type Tier = {
  strong: string[];
  weak: string[];
  titleBoost?: boolean;
};

export const PRE_SPEC_KEYWORD_TIERS: Record<PreSpecProduct, Tier> = {
  CONTRABASS: {
    titleBoost: true,
    strong: [...PRE_SPEC_CONTRABASS_KEYWORDS],
    weak: ["스토리지", "네트워크", "서버 구축", "전산"],
  },
  VIOLA: {
    titleBoost: true,
    strong: [...PRE_SPEC_VIOLA_KEYWORDS],
    weak: ["플랫폼 구축", "앱"],
  },
  CMP: {
    titleBoost: false,
    strong: ["CMP", "멀티클라우드", "하이브리드 클라우드"],
    weak: ["비용관리"],
  },
  TROMBONE: {
    titleBoost: false,
    strong: [],
    weak: ["배포관리", "형상관리"],
  },
  LEGATO: {
    titleBoost: false,
    strong: ["VMware 전환", "탈 VMware"],
    weak: ["워크로드 전환"],
  },
};

/** 명백한 무관 공고만 제외 — 애매하면 노출. */
export const EXCLUSION_HARD = [
  "수학여행",
  "체험학습",
  "여행",
  "급식",
  "식자재",
  "식재료",
  "청소",
  "사무용품",
  "소모품",
  "인쇄",
  "행사대행",
  "행사 용역",
  "시설공사",
  "전기공사",
  "소방공사",
  "토목공사",
  "건축공사",
  "차량 구매",
  "버스 구매",
] as const;

export function shouldKeepDespiteExclusion(scores: Partial<Record<PreSpecProduct, number>>): boolean {
  for (const k of ["CONTRABASS", "VIOLA"] as PreSpecProduct[]) {
    if ((scores[k] ?? 0) >= 1) return true;
  }
  return false;
}

const lower = (s: string) => s.toLowerCase();

function findHits(haystack: string, words: readonly string[]): string[] {
  const hay = lower(haystack);
  const out: string[] = [];
  for (const w of words) {
    if (!w) continue;
    if (hay.includes(lower(w))) out.push(w);
  }
  return out;
}

export type MatchResult = {
  products: PreSpecProduct[];
  primaryProduct: PreSpecProduct | null;
  productScores: Partial<Record<PreSpecProduct, number>>;
  matchedKeywords: string[];
  matchReason: string;
  negativeWeight: number;
  exclusionHits: string[];
  exclusionOverridden: boolean;
};

export function matchPreSpec(
  title: string,
  body: string,
  titleAndBusiness?: string,
): MatchResult {
  const text = `${title}\n${body}`;
  const titleLower = lower(title);
  const scores: Partial<Record<PreSpecProduct, number>> = {};
  const allMatched = new Set<string>();
  const reasons: string[] = [];

  for (const [prodKey, tier] of Object.entries(PRE_SPEC_KEYWORD_TIERS) as [
    PreSpecProduct,
    Tier,
  ][]) {
    if (prodKey === "CMP" || prodKey === "TROMBONE" || prodKey === "LEGATO") continue;

    let s = 0;
    const strongHits = findHits(text, tier.strong);
    const weakHits = findHits(text, tier.weak);
    s += strongHits.length * 3;
    s += weakHits.length * 1;
    if (tier.titleBoost) {
      for (const sw of tier.strong) {
        if (titleLower.includes(lower(sw))) {
          s += 2;
          break;
        }
      }
    }
    if (s > 0) {
      scores[prodKey] = s;
      [...strongHits, ...weakHits].forEach((kw) => allMatched.add(kw));
      reasons.push(`${prodKey}(${s})`);
    }
  }

  const commonHits = findHits(text, PRE_SPEC_COMMON_KEYWORDS);
  commonHits.forEach((kw) => allMatched.add(kw));
  if (commonHits.length > 0) {
    reasons.push(`COMMON(${commonHits.length})`);
  }

  const exclusionTarget = titleAndBusiness ?? title;
  const exclusionHits = findHits(exclusionTarget, EXCLUSION_HARD);
  const exclusionOverridden =
    exclusionHits.length > 0 &&
    (shouldKeepDespiteExclusion(scores) || commonHits.length > 0);

  let products = (Object.keys(scores) as PreSpecProduct[]).sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0),
  );
  products = products.filter((p) => p === "CONTRABASS" || p === "VIOLA");
  const primaryProduct = products[0] ?? null;

  return {
    products,
    primaryProduct,
    productScores: scores,
    matchedKeywords: Array.from(allMatched),
    matchReason: reasons.join(" · "),
    negativeWeight: 0,
    exclusionHits,
    exclusionOverridden,
  };
}

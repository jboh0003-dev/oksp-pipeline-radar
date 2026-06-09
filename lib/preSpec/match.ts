import type { PreSpecProduct } from "@/lib/preSpec/types";

/**
 * 사전규격 전용 제품 키워드.
 *  - 입찰공고와 같은 제품군이지만, 사전규격은 더 앞단이라 추천 임계값이 낮다 (약한 매칭도 "검토" 대상).
 *  - CMP / TROMBONE / LEGATO 도 카드/필터로 노출하기 위해 별도 항목 유지.
 *
 * 점수 정책:
 *  - strong 1회 매칭: +3
 *  - weak 1회 매칭  : +1
 *  - title 에 strong 매칭: 추가 +2 (titleBoost)
 */

type Tier = {
  strong: string[];
  weak: string[];
  titleBoost?: boolean;
};

export const PRE_SPEC_KEYWORD_TIERS: Record<PreSpecProduct, Tier> = {
  CONTRABASS: {
    titleBoost: true,
    strong: [
      "클라우드",
      "프라이빗 클라우드",
      "가상화",
      "서버 가상화",
      "VMware",
      "VM웨어",
      "OpenStack",
      "오픈스택",
      "IaaS",
      "HCI",
      "x86",
      "인프라",
      "시스템 구축",
      "통합관리",
    ],
    weak: ["VM", "정보시스템", "데이터센터"],
  },
  VIOLA: {
    titleBoost: true,
    strong: [
      "Kubernetes",
      "쿠버네티스",
      "K8S",
      "컨테이너",
      "PaaS",
      "MSA",
      "DevOps",
      "플랫폼",
      "클라우드 네이티브",
      "CI/CD",
    ],
    weak: ["애플리케이션 현대화"],
  },
  CMP: {
    titleBoost: true,
    strong: [
      "CMP",
      "클라우드 관리",
      "멀티 클라우드",
      "멀티클라우드",
      "하이브리드 클라우드",
      "자원관리",
      "비용관리",
      "운영관리",
      "모니터링",
    ],
    weak: ["통합 관리", "자원 관리"],
  },
  TROMBONE: {
    titleBoost: true,
    strong: ["DevOps", "CI/CD"],
    weak: ["배포관리", "형상관리", "Git", "변경관리"],
  },
  LEGATO: {
    titleBoost: true,
    strong: ["마이그레이션", "VMware 전환", "탈 VMware", "VM 전환", "윈백"],
    weak: ["워크로드 전환"],
  },
};

const HARDWARE_NEGATIVE = [
  "장비확충",
  "장비 구매",
  "장비구매",
  "전산장비 구매",
  "납품",
  "단순 유지보수",
  "교체",
  "증설",
];

const lower = (s: string) => s.toLowerCase();

/** 텍스트에서 키워드를 단순 substring(case-insensitive) 매칭으로 찾기. */
function findHits(haystack: string, words: string[]): string[] {
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
  /** 부정 신호(하드웨어 납품 등) 가중치 — 추천 등급 다운그레이드. */
  negativeWeight: number;
};

export function matchPreSpec(
  title: string,
  body: string,
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

  const negativeHits = findHits(text, HARDWARE_NEGATIVE);
  const negativeWeight = negativeHits.length;

  // 점수 ≥ 1 인 제품을 모두 채택, primary 는 점수 최대.
  const products = (Object.keys(scores) as PreSpecProduct[]).sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0),
  );
  const primaryProduct = products[0] ?? null;

  return {
    products,
    primaryProduct,
    productScores: scores,
    matchedKeywords: Array.from(allMatched),
    matchReason: reasons.join(" · "),
    negativeWeight,
  };
}

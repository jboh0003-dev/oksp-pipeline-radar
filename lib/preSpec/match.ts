import type { PreSpecProduct } from "@/lib/preSpec/types";

/**
 * 사전규격 전용 제품 키워드 — 사용자 정책 (2026-06) 으로 좁게 재정의.
 *
 * 정책:
 *  - "인프라" / "통합관리" / "운영관리" / "모니터링" 같은 *너무 일반적인* 단어는 strong 에서 제거.
 *    → 기존에는 "여행", "교육", "일반용역" 사업 제목에도 매칭되어 영업 후보로 잘못 노출됐다.
 *  - 사용자 요구 키워드만 남긴다 (CONTRABASS / VIOLA / CMP).
 *  - TROMBONE / LEGATO 는 카드/필터 노출을 위해 슬롯은 유지하되 *제품 매칭 후보*가 되지 않도록
 *    titleBoost 만 끄고 strong 키워드도 user 명시 범위만 유지.
 *
 * 점수 정책:
 *  - strong 1회 매칭: +3
 *  - weak 1회 매칭  : +1
 *  - title 에 strong 매칭: 추가 +2 (titleBoost)
 *
 * ★ 강한 제외 키워드 (EXCLUSION_HARD):
 *   - 제목/사업명에 들어 있으면 *기본적으로* 제외 (recommendation === "제외").
 *   - 단, 강한 제품 키워드 (CONTRABASS/VIOLA/CMP strong) 가 같이 매칭되면 제외하지 않고 검토.
 *   - 이는 normalize.ts 의 getRecommendation 단계에서 적용된다.
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
      "가상화",
      "서버 가상화",
      "클라우드 인프라",
      "프라이빗 클라우드",
      "하이퍼바이저",
      "VMware",
      "VM웨어",
      "VDI",
      "OpenStack",
      "오픈스택",
      "IaaS",
      "클라우드",
      "클라우드 관리",
      "클라우드 전환",
      "클라우드 마이그레이션",
      "인프라 전환",
      "인프라 고도화",
      "정보시스템 인프라",
      "정보자원 통합",
      "시스템 고도화",
      "노후 서버",
    ],
    weak: ["HCI", "x86 서버", "프라이빗", "데이터센터 통합", "스토리지", "네트워크"],
  },
  VIOLA: {
    titleBoost: true,
    strong: [
      "Kubernetes",
      "쿠버네티스",
      "K8S",
      "컨테이너",
      "컨테이너 플랫폼",
      "PaaS",
      "플랫폼 구축",
      "MSA",
      "DevOps",
      "CI/CD",
      "클라우드 네이티브",
      "애플리케이션 현대화",
    ],
    weak: ["마이크로서비스"],
  },
  CMP: {
    titleBoost: true,
    strong: [
      "CMP",
      "멀티클라우드",
      "멀티 클라우드",
      "하이브리드 클라우드",
      "클라우드 관리 플랫폼",
      "클라우드 운영관리",
      "클라우드 자원관리",
      "클라우드 비용관리",
      "통합관제",
      "운영관리",
    ],
    weak: ["통합관리", "자원관리", "비용관리"],
  },
  TROMBONE: {
    titleBoost: false,
    strong: ["DevOps", "CI/CD"],
    weak: ["배포관리", "형상관리", "Git", "변경관리"],
  },
  LEGATO: {
    titleBoost: false,
    strong: ["VMware 전환", "탈 VMware", "VM 전환", "윈백"],
    weak: ["워크로드 전환"],
  },
};

/**
 * 강한 제외 키워드 (EXCLUSION_HARD) — 사용자 정책.
 *
 *  - 제목/사업명 안에 substring 으로 등장하면 *제외 후보* 로 마킹된다.
 *  - 다만 강한 제품 키워드 (CONTRABASS/VIOLA/CMP strong) 도 같이 매칭되면 제외하지 않는다.
 *  - 이 동작은 normalize.ts 의 getRecommendation() 에서 적용.
 *
 *  여행/체험학습/급식/식자재/청소/경비/인쇄/홍보물/행사/축제/체육복/교복 등 비영업 대상.
 *  CCTV/프린터/복합기/단순 PC/노트북 구매 등 단순 H/W 구매.
 *  공사/전기공사/소방공사/차량/버스 등 우리 영업 대상이 아닌 공공조달.
 */
export const EXCLUSION_HARD = [
  // 교육/체험/생활 비영업
  "수학여행",
  "체험학습",
  "수련회",
  "여행",
  "교복",
  "체육복",
  // 식자재/급식
  "급식",
  "식자재",
  "식재료",
  "농산물",
  // 시설/유지보수 (비영업)
  "청소",
  "경비",
  "방역",
  "소독",
  // 인쇄/홍보/행사
  "인쇄",
  "홍보물",
  "현수막",
  "행사",
  "축제",
  "포럼",
  "시상",
  // 단순 구매/물품
  "단순 물품 구매",
  "단순 물품",
  "사무용품",
  "소모품",
  "단순 장비 납품",
  "CCTV",
  "프린터",
  "복합기",
  "노트북 구매",
  "노트북구매",
  "PC 구매",
  "PC구매",
  "데스크톱 구매",
  "데스크톱구매",
  "모니터 구매",
  "모니터구매",
  // 차량/운송
  "차량",
  "버스",
  "셔틀",
  // 토목/건축/공사 (별도 사업영역)
  "전기공사",
  "소방공사",
  "통신공사",
  "건축공사",
  "토목공사",
  "조경공사",
  "도로공사",
] as const;

/**
 * 제외 keyword 가 hit 되었지만 *강한 제품 매칭* 이 같이 있을 때, 제외를 해제할지 판단.
 * - 단순히 "exclusion 1건이라도" 를 우선 적용하면 "노트북 구매 → 클라우드 마이그레이션 동시 추진"
 *   같은 복합 사업이 사라지므로, *강한 제품 strong 매칭이 1건 이상이면* 제외 해제.
 */
export function shouldKeepDespiteExclusion(scores: Partial<Record<PreSpecProduct, number>>): boolean {
  // 핵심 3개 제품 중 strong 점수 (>=3) 가 1개라도 있으면 keep.
  for (const k of ["CONTRABASS", "VIOLA", "CMP"] as PreSpecProduct[]) {
    if ((scores[k] ?? 0) >= 3) return true;
  }
  return false;
}

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
  /** 강한 제외 키워드 hit 목록 (제목/사업명 기준). */
  exclusionHits: string[];
  /** exclusionHits 가 있어도 강한 제품 매칭이 있어 제외하지 않을 때 true. */
  exclusionOverridden: boolean;
};

/**
 * 제품 매칭은 *전체 텍스트* 기준으로 수행한다 (title + body).
 * 제외 키워드는 *제목 + 사업명 우선* 으로 수행 — 본문 깊이 매장된 단어로 사업이 잘못 제외되는 것 방지.
 *
 * @param title 사전규격명 (= prdctClsfcNoNm).
 * @param body 매칭 보조 텍스트 (사업명, 첨부 파일명, 품목 상세 등).
 * @param titleAndBusiness 제외 키워드 검사 대상 텍스트 (보통 title + businessName).
 *                         생략 시 title 만 검사.
 */
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

  // 강한 제외 키워드 — 제목/사업명 우선 검사 (본문에 우연히 들어간 단어로 잘못 제외되지 않게).
  const exclusionTarget = titleAndBusiness ?? title;
  const exclusionHits = findHits(exclusionTarget, [...EXCLUSION_HARD]);
  const exclusionOverridden = exclusionHits.length > 0 && shouldKeepDespiteExclusion(scores);

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
    exclusionHits,
    exclusionOverridden,
  };
}

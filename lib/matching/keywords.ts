/**
 * 제품 매칭 키워드 룰 — 코드에 박혀 있던 strong/weak 배열을 한 곳에 모아 정리.
 *
 * 룰 구조:
 *  - product : 어느 제품 카드에 점수를 줄지 (또는 undefined: 단순 negative/exclude)
 *  - type    : strong/normal/weak/exclude/negative
 *  - weight  : 매칭됐을 때 더할 점수. (negative 는 음수 양수 모두 의미는 호출부가 해석)
 *
 * 점수 정책 (lib/matching/scoring 의 기본 룰):
 *   strong  : +3   (titleBoost: 제목에 strong 매칭 추가 +2, 한 번만)
 *   normal  : +2
 *   weak    : +1
 *   negative: 누적 → 추천 등급 다운그레이드 (점수 자체엔 영향 없음)
 *   exclude : 매칭되면 후보에서 즉시 제외
 *
 * 너무 광범위한 키워드(정보시스템 / 시스템 구축 / 데이터센터 등) 는 weak 또는 normal 로 두고
 * strong 키워드와 함께 잡힐 때만 점수가 커지도록 한다 — strong 가 한 개라도 잡히면 weak 가
 * 같은 제품에서 추가 점수를 받는 식. (scoring.ts 참고)
 */

export type ProductKey = "CONTRABASS" | "VIOLA" | "CMP";

export type KeywordRuleType = "strong" | "normal" | "weak" | "exclude" | "negative";

export type KeywordRule = {
  /** 검색할 키워드. case-insensitive substring 매칭. */
  keyword: string;
  /** 매칭 시 가산 점수 (negative 는 음수가 아닌 절대값). */
  weight: number;
  /** strong/normal/weak: 점수, exclude: 후보 제외, negative: 등급 다운그레이드. */
  type: KeywordRuleType;
  /** 어느 제품에 점수를 줄지. negative/exclude 는 product 없음. */
  product?: ProductKey;
};

/* -------------------------------------------------------------- */
/* 제품별 키워드                                                   */
/* -------------------------------------------------------------- */

/**
 * CONTRABASS — VMware / 가상화 / 프라이빗 클라우드 / OpenStack / IaaS / HCI / x86 / 인프라.
 */
const CONTRABASS_RULES: KeywordRule[] = [
  // 강한 신호
  { keyword: "VMware", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "VM웨어", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "프라이빗 클라우드", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "서버 가상화", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "OpenStack", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "오픈스택", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "IaaS", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "HCI", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "탈 VMware", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "탈VMware", weight: 3, type: "strong", product: "CONTRABASS" },
  { keyword: "윈백", weight: 3, type: "strong", product: "CONTRABASS" },
  // 보통 신호
  { keyword: "가상화", weight: 2, type: "normal", product: "CONTRABASS" },
  { keyword: "클라우드 인프라", weight: 2, type: "normal", product: "CONTRABASS" },
  { keyword: "클라우드 구축", weight: 2, type: "normal", product: "CONTRABASS" },
  { keyword: "클라우드 전환", weight: 2, type: "normal", product: "CONTRABASS" },
  { keyword: "데이터센터 클라우드", weight: 2, type: "normal", product: "CONTRABASS" },
  { keyword: "x86", weight: 2, type: "normal", product: "CONTRABASS" },
  { keyword: "인프라 구축", weight: 2, type: "normal", product: "CONTRABASS" },
  // 약한 신호 — 단독으로는 의미 약함, strong 함께 있을 때 가중 (scoring 단계에서 처리)
  { keyword: "VM", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "KVM", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "데이터센터", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "전산센터", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "클라우드", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "인프라", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "정보시스템", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "시스템 구축", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "차세대 시스템", weight: 1, type: "weak", product: "CONTRABASS" },
  { keyword: "정보화 사업", weight: 1, type: "weak", product: "CONTRABASS" },
];

/**
 * VIOLA — Kubernetes / 쿠버네티스 / 컨테이너 / PaaS / MSA / DevOps / CI/CD / 클라우드 네이티브.
 */
const VIOLA_RULES: KeywordRule[] = [
  // 강한 신호
  { keyword: "Kubernetes", weight: 3, type: "strong", product: "VIOLA" },
  { keyword: "쿠버네티스", weight: 3, type: "strong", product: "VIOLA" },
  { keyword: "K8S", weight: 3, type: "strong", product: "VIOLA" },
  { keyword: "PaaS", weight: 3, type: "strong", product: "VIOLA" },
  { keyword: "컨테이너", weight: 3, type: "strong", product: "VIOLA" },
  { keyword: "클라우드 네이티브", weight: 3, type: "strong", product: "VIOLA" },
  // 보통 신호
  { keyword: "MSA", weight: 2, type: "normal", product: "VIOLA" },
  { keyword: "DevOps", weight: 2, type: "normal", product: "VIOLA" },
  { keyword: "CI/CD", weight: 2, type: "normal", product: "VIOLA" },
  { keyword: "애플리케이션 플랫폼", weight: 2, type: "normal", product: "VIOLA" },
  { keyword: "플랫폼 구축", weight: 2, type: "normal", product: "VIOLA" },
  { keyword: "애플리케이션 현대화", weight: 2, type: "normal", product: "VIOLA" },
  // 약한 신호 — 너무 일반적이라 strong 와 같이 잡힐 때만 의미.
  { keyword: "통합 플랫폼", weight: 1, type: "weak", product: "VIOLA" },
  { keyword: "개발 플랫폼", weight: 1, type: "weak", product: "VIOLA" },
  { keyword: "운영 플랫폼", weight: 1, type: "weak", product: "VIOLA" },
  { keyword: "데이터 플랫폼", weight: 1, type: "weak", product: "VIOLA" },
  { keyword: "업무 플랫폼", weight: 1, type: "weak", product: "VIOLA" },
  { keyword: "디지털 플랫폼", weight: 1, type: "weak", product: "VIOLA" },
];

/**
 * CMP — 클라우드 관리 / 멀티 클라우드 / 하이브리드 클라우드 / 자원·비용·운영관리 / 모니터링.
 */
const CMP_RULES: KeywordRule[] = [
  // 강한 신호
  { keyword: "CMP", weight: 3, type: "strong", product: "CMP" },
  { keyword: "멀티클라우드", weight: 3, type: "strong", product: "CMP" },
  { keyword: "멀티 클라우드", weight: 3, type: "strong", product: "CMP" },
  { keyword: "하이브리드 클라우드", weight: 3, type: "strong", product: "CMP" },
  { keyword: "클라우드 포털", weight: 3, type: "strong", product: "CMP" },
  // 보통 신호
  { keyword: "클라우드 관리", weight: 2, type: "normal", product: "CMP" },
  { keyword: "비용관리", weight: 2, type: "normal", product: "CMP" },
  { keyword: "운영관리", weight: 2, type: "normal", product: "CMP" },
  { keyword: "자원관리", weight: 2, type: "normal", product: "CMP" },
  // 약한 신호
  { keyword: "모니터링", weight: 1, type: "weak", product: "CMP" },
  { keyword: "통합관리", weight: 1, type: "weak", product: "CMP" },
];

/* -------------------------------------------------------------- */
/* negative / exclude                                              */
/* -------------------------------------------------------------- */

/**
 * 하드웨어 납품 / 단순 구매 / 단순 유지보수 시그널.
 *  - 점수 자체에는 영향 없음.
 *  - 누적 weight 가 임계 이상이면 추천 등급을 한 단계 다운그레이드 (scoring.ts 에서 처리).
 */
const NEGATIVE_RULES: KeywordRule[] = [
  // 강한 신호 (weight 3)
  { keyword: "장비확충", weight: 3, type: "negative" },
  { keyword: "장비 구매", weight: 3, type: "negative" },
  { keyword: "장비구매", weight: 3, type: "negative" },
  { keyword: "전산장비 구매", weight: 3, type: "negative" },
  { keyword: "전산장비구매", weight: 3, type: "negative" },
  { keyword: "납품", weight: 3, type: "negative" },
  // 보통 신호 (weight 2)
  { keyword: "서버 구매", weight: 2, type: "negative" },
  { keyword: "서버구매", weight: 2, type: "negative" },
  { keyword: "스토리지 구매", weight: 2, type: "negative" },
  { keyword: "스토리지구매", weight: 2, type: "negative" },
  { keyword: "노트북 구매", weight: 2, type: "negative" },
  { keyword: "노트북구매", weight: 2, type: "negative" },
  { keyword: "PC 구매", weight: 2, type: "negative" },
  { keyword: "PC구매", weight: 2, type: "negative" },
  { keyword: "단순 유지보수", weight: 2, type: "negative" },
  { keyword: "CCTV", weight: 2, type: "negative" },
  { keyword: "UPS", weight: 2, type: "negative" },
  { keyword: "프린터", weight: 2, type: "negative" },
  { keyword: "네트워크 장비", weight: 2, type: "negative" },
  { keyword: "스위치", weight: 2, type: "negative" },
  // 약한 신호 (weight 1)
  { keyword: "교체", weight: 1, type: "negative" },
  { keyword: "증설", weight: 1, type: "negative" },
];

/**
 * 매칭 후보에서 즉시 제외되는 키워드 — "체험학습" / "차량 임차" 등 영업 대상이 아님이 명백한 카테고리.
 */
const EXCLUDE_RULES: KeywordRule[] = [
  { keyword: "체험학습", weight: 0, type: "exclude" },
  { keyword: "현장학습", weight: 0, type: "exclude" },
  { keyword: "수학여행", weight: 0, type: "exclude" },
  { keyword: "항공권", weight: 0, type: "exclude" },
  { keyword: "버스 임차", weight: 0, type: "exclude" },
  { keyword: "차량 임차", weight: 0, type: "exclude" },
  { keyword: "급식", weight: 0, type: "exclude" },
  { keyword: "청소", weight: 0, type: "exclude" },
  { keyword: "단순 인쇄", weight: 0, type: "exclude" },
  { keyword: "의류", weight: 0, type: "exclude" },
  { keyword: "사무용품", weight: 0, type: "exclude" },
  { keyword: "소모품", weight: 0, type: "exclude" },
  { keyword: "교육장비", weight: 0, type: "exclude" },
  { keyword: "단순 홈페이지", weight: 0, type: "exclude" },
  { keyword: "단순 장비 구매", weight: 0, type: "exclude" },
];

/* -------------------------------------------------------------- */
/* exports                                                         */
/* -------------------------------------------------------------- */

/** 모든 룰을 합친 단일 배열. lib/matching/scoring 가 이 배열을 사용한다. */
export const KEYWORD_RULES: KeywordRule[] = [
  ...CONTRABASS_RULES,
  ...VIOLA_RULES,
  ...CMP_RULES,
  ...NEGATIVE_RULES,
  ...EXCLUDE_RULES,
];

export const PRODUCT_KEYS: ProductKey[] = ["CONTRABASS", "VIOLA", "CMP"];

/** 룰 type 별 helper. */
export function getRulesByType(type: KeywordRuleType): KeywordRule[] {
  return KEYWORD_RULES.filter((r) => r.type === type);
}

/** 특정 제품의 룰만. */
export function getProductRules(product: ProductKey): KeywordRule[] {
  return KEYWORD_RULES.filter((r) => r.product === product);
}

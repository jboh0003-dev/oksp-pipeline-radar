export const G2B_ENDPOINTS = {
  servc: "getBidPblancListInfoServc",
  thng: "getBidPblancListInfoThng",
} as const;

/** 키워드(bidNtceNm) 기반 수집 — 복구 전까지 비활성 */
export const G2B_KEYWORD_SYNC_ENABLED = false;

export const G2B_PAGE_START = 1;
export const G2B_PAGE_END = 3;
export const G2B_KEYWORD_PAGE_START = 1;
export const G2B_KEYWORD_PAGE_END = 5;

/** 나라장터 공고명(bidNtceNm) 검색용 수집 키워드 */
export const G2B_SEARCH_KEYWORDS = [
  "가상화",
  "서버 가상화",
  "VMware",
  "VM",
  "클라우드",
  "프라이빗 클라우드",
  "클라우드 전환",
  "OpenStack",
  "IaaS",
  "HCI",
  "CMP",
  "클라우드 관리",
  "통합관리",
  "멀티클라우드",
  "하이브리드 클라우드",
  "Kubernetes",
  "쿠버네티스",
  "K8S",
  "PaaS",
  "컨테이너",
  "클라우드 네이티브",
  "스토리지",
  "SDS",
  "오브젝트 스토리지",
  "백업",
  "DevOps",
  "CI/CD",
  "형상관리",
  "AI",
  "인공지능",
  "GPU",
  "LLM",
  "MLOps",
  "생성형 AI",
  "AI 인프라",
  "정보시스템",
  "전산",
  "서버",
  "데이터센터",
  "인프라",
  "시스템 구축",
  "고도화",
  "유지관리",
] as const;
export const G2B_NUM_OF_ROWS = 100;
export const G2B_INQUIRY_DAYS = 60;

/** 공고명 검색 파라미터 (나라장터 입찰공고 API) */
export const G2B_TITLE_SEARCH_PARAM = "bidNtceNm";
export const MATCH_SCORE_THRESHOLD = 20;

/** 마감일이 지났어도 저장·표시 예외 */
export const REOPEN_KEYWORDS = [
  "재공고",
  "정정",
  "변경",
  "연장",
  "추가모집",
  "추가 공고",
  "긴급",
] as const;

/** 포함 시 저장 제외 */
export const EXCLUDE_KEYWORDS = [
  "체험학습",
  "현장학습",
  "수학여행",
  "항공권",
  "버스 임차",
  "차량 임차",
  "급식",
  "청소",
  "단순 인쇄",
  "의류",
] as const;

/** 일반 IT/인프라 후보 (낮은 점수) */
export const GENERAL_IT_KEYWORDS = [
  "정보시스템",
  "전산",
  "서버",
  "스토리지",
  "네트워크",
  "데이터센터",
  "인프라",
  "통합관리",
  "유지관리",
  "고도화",
  "플랫폼",
  "클라우드 전환",
  "정보화",
  "시스템 구축",
  "소프트웨어",
  "솔루션",
  "가상화",
  "백업",
  "보안관제",
  "운영관리",
] as const;

export type KeywordTier = {
  strong: string[];
  weak: string[];
  titleBoost?: boolean;
};

export const PRODUCT_KEYWORD_TIERS: Record<string, KeywordTier> = {
  CONTRABASS: {
    titleBoost: true,
    strong: [
      "클라우드",
      "프라이빗 클라우드",
      "서버 가상화",
      "VMware",
      "OpenStack",
      "IaaS",
      "HCI",
      "탈 VMware",
      "윈백",
    ],
    weak: ["VM", "KVM"],
  },
  "CONTRABASS Legato": {
    titleBoost: true,
    strong: ["마이그레이션", "VM 전환", "워크로드 전환", "VMware 전환", "하이퍼바이저 전환"],
    weak: [],
  },
  "CONTRABASS SDS+": {
    titleBoost: true,
    strong: [
      "SDS",
      "소프트웨어 정의 스토리지",
      "오브젝트 스토리지",
      "블록 스토리지",
      "파일 스토리지",
    ],
    weak: [],
  },
  "OKESTRO CMP": {
    titleBoost: true,
    strong: ["CMP", "멀티클라우드", "하이브리드 클라우드", "클라우드 포털"],
    weak: ["클라우드 관리", "자원관리"],
  },
  VIOLA: {
    titleBoost: true,
    strong: ["Kubernetes", "K8S", "쿠버네티스", "컨테이너", "클라우드 네이티브"],
    weak: ["PaaS", "MSA", "애플리케이션 현대화"],
  },
  TROMBONE: {
    titleBoost: true,
    strong: ["DevOps", "CI/CD"],
    weak: ["배포관리", "형상관리", "Git", "소스코드", "변경관리", "개발환경"],
  },
  "CONCERTO AI": {
    titleBoost: true,
    strong: [
      "AI",
      "인공지능",
      "GPU",
      "LLM",
      "MLOps",
      "생성형 AI",
      "모델 배포",
      "추론",
      "AI 인프라",
    ],
    weak: [],
  },
};

export const PRODUCT_KEYWORDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(PRODUCT_KEYWORD_TIERS).map(([product, tier]) => [
    product,
    [...tier.strong, ...tier.weak],
  ]),
);

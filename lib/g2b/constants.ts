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

/**
 * 나라장터 공고명(bidNtceNm) 검색용 수집 키워드.
 * sync-g2b / search-g2b-keyword 등 키워드 검색 기반 수집 경로에서 사용한다.
 * (collect-g2b-keywords 는 keyword 검색 대신 4개 endpoint 의 공고를 모두 가져온 뒤
 *  자체 PRODUCT_KEYWORD_MAP 으로 post-filter 한다.)
 */
export const G2B_SEARCH_KEYWORDS = [
  // CONTRABASS 군
  "가상화",
  "서버 가상화",
  "VMware",
  "VM웨어",
  "VM",
  "클라우드",
  "프라이빗 클라우드",
  "클라우드 전환",
  "클라우드 인프라",
  "OpenStack",
  "오픈스택",
  "IaaS",
  "HCI",
  "CMP",
  "클라우드 관리",
  "멀티클라우드",
  "하이브리드 클라우드",
  "데이터센터",
  "전산센터",
  "인프라 구축",
  "시스템 구축",
  "차세대 시스템",
  "정보화 사업",
  "정보시스템",
  // VIOLA 군
  "Kubernetes",
  "쿠버네티스",
  "K8S",
  "PaaS",
  "컨테이너",
  "클라우드 네이티브",
  "DevOps",
  "플랫폼 구축",
  "애플리케이션 플랫폼",
  "통합 플랫폼",
  "개발 플랫폼",
  "운영 플랫폼",
  "통합관리",
  // 공통/광범위
  "AI 플랫폼",
  "데이터 플랫폼",
  "업무 플랫폼",
  "디지털 플랫폼",
  // 보조 (인프라·고도화·유지관리)
  "스토리지",
  "SDS",
  "오브젝트 스토리지",
  "백업",
  "CI/CD",
  "형상관리",
  "AI",
  "인공지능",
  "GPU",
  "LLM",
  "MLOps",
  "생성형 AI",
  "AI 인프라",
  "전산",
  "서버",
  "인프라",
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

/**
 * 하드웨어 납품성 / 단순 구매 / 단순 유지보수 시그널.
 * 매칭 점수 자체는 그대로 두고, 추천 등급을 다운그레이드 또는 "제외후보" 로 분류할 때 사용.
 *
 * weight 의미:
 *  - 3: 단일 매칭만으로도 강한 하드웨어 납품성. 즉시 "제외후보".
 *  - 2: 보통 신호. 누적되면 "제외후보", 단독이면 한 단계 다운그레이드.
 *  - 1: 약한 신호. 한두 개 정도라면 영향이 미미.
 *
 * 주의: "서버" 같이 단독 사용으로는 양가성이 큰 표현은 여기에 포함하지 않는다.
 *       반드시 "서버 구매" 처럼 구매/납품/장비 맥락이 분명한 표현만 다룬다.
 */
export const NEGATIVE_KEYWORDS = [
  // 강한 신호 — 하드웨어 납품 / 장비 구매가 거의 확실
  { keyword: "장비확충", weight: 3 },
  { keyword: "장비 구매", weight: 3 },
  { keyword: "장비구매", weight: 3 },
  { keyword: "전산장비 구매", weight: 3 },
  { keyword: "전산장비구매", weight: 3 },
  { keyword: "납품", weight: 3 },
  // 보통 신호 — 누적되면 제외후보
  { keyword: "서버 구매", weight: 2 },
  { keyword: "서버구매", weight: 2 },
  { keyword: "스토리지 구매", weight: 2 },
  { keyword: "스토리지구매", weight: 2 },
  { keyword: "노트북 구매", weight: 2 },
  { keyword: "노트북구매", weight: 2 },
  { keyword: "PC 구매", weight: 2 },
  { keyword: "PC구매", weight: 2 },
  { keyword: "단순 유지보수", weight: 2 },
  { keyword: "CCTV", weight: 2 },
  { keyword: "UPS", weight: 2 },
  { keyword: "프린터", weight: 2 },
  { keyword: "네트워크 장비", weight: 2 },
  { keyword: "스위치", weight: 2 },
  // 약한 신호 — 단독이면 영향 적음
  { keyword: "교체", weight: 1 },
  { keyword: "증설", weight: 1 },
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
      "가상화",
      "VMware",
      "VM웨어",
      "OpenStack",
      "오픈스택",
      "IaaS",
      "HCI",
      "탈 VMware",
      "윈백",
      "클라우드 인프라",
      "클라우드 구축",
      "데이터센터 클라우드",
      // 광범위 키워드 — NEGATIVE_KEYWORDS 로 등급 보정 전제
      "정보시스템",
      "데이터센터",
      "전산센터",
      "인프라 구축",
      "시스템 구축",
      "차세대 시스템",
      "정보화 사업",
      "AI 플랫폼",
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
    strong: [
      "Kubernetes",
      "K8S",
      "쿠버네티스",
      "컨테이너",
      "클라우드 네이티브",
      "PaaS",
      "DevOps",
      "플랫폼 구축",
      "애플리케이션 플랫폼",
      // 광범위 키워드 — NEGATIVE_KEYWORDS 로 등급 보정 전제
      "통합 플랫폼",
      "개발 플랫폼",
      "운영 플랫폼",
      "데이터 플랫폼",
      "업무 플랫폼",
      "디지털 플랫폼",
    ],
    weak: ["MSA", "애플리케이션 현대화"],
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

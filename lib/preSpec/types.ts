/**
 * 사전규격공고(Pre-spec) 화면 표준 타입.
 *
 * 입찰공고(Notice)와 별개로 정의 — 사전규격은 입찰 등록 *이전* 단계라
 * 마감일 의미(의견마감일), 매칭 우선순위, 추천 등급 라벨이 다르다.
 *
 * 향후 사전규격 → 실제 입찰공고 연결 추적을 위해 linkedBidNo 등 자리만 만들어둔다.
 */

export type PreSpecStatus = "진행중" | "마감임박" | "마감" | "확인필요";

export type PreSpecRecommendation =
  | "핵심검토"
  | "의견제출검토"
  | "영업확인필요"
  | "참고"
  | "제외";

export type PreSpecProduct = "CONTRABASS" | "VIOLA" | "CMP" | "TROMBONE" | "LEGATO";

export type PreSpecCustomer = {
  customerName: string;
  /** 공공 / 금융 / 커머셜 / 광역 / 미매칭 */
  territory: string;
  /** Named / Non Named / 미매칭 / "-" */
  accountType: string;
  region?: string | null;
  regionGroup?: string | null;
};

export type PreSpecAnnouncement = {
  /** 사전규격이라는 점을 구별하는 sourceType. */
  sourceType: "PRE_SPEC";
  /** 화면 dedup 용 공고 unique key. */
  announcementKey: string;

  /** 사전규격등록번호. */
  preSpecRegNo?: string;
  /** 업무구분 라벨 — 일반용역/물품/공사/외자 그대로 표시. */
  bsnsDivLabel?: string;
  /** 사전규격명/사업명/품명. */
  title: string;
  /** 별도 사업명 (있을 때). */
  businessName?: string;

  /** 공고기관명. */
  orgName: string;
  /** 수요기관명 (있을 때). */
  demandOrgName?: string;

  /** 배정예산액 (원 단위 정수). 알 수 없으면 0. */
  budget: number;
  /** 사람이 읽기 쉬운 라벨(예: "12억 3,000만 원"). UI 가 다시 계산하므로 옵셔널. */
  budgetLabel?: string;

  /** 공개일 (ISO yyyy-mm-dd). */
  openDate?: string;
  /** 의견접수마감일 (ISO yyyy-mm-dd). */
  opinionDeadline?: string;

  /** 첨부파일명. */
  fileName?: string;
  /** 원문 페이지 / 첨부파일 다운로드 URL. */
  fileUrl?: string;
  /** 규격서 다운로드 URL (있으면 별도 버튼). */
  specFileUrl?: string;
  /** 사전규격 원문 페이지 URL. */
  sourceUrl?: string;

  /** 의견 등록 건수 (API 가 줄 때만). */
  opinionCount?: number;

  /** 진단/디버깅용 원본. JSON serializable. */
  raw?: Record<string, unknown>;

  /** 매칭된 제품 목록 (배열). 카드 카운트는 이 배열 기반. */
  products: PreSpecProduct[];
  /** 대표 제품 — primaryProduct 기반 분류 표시는 가능. */
  primaryProduct?: PreSpecProduct | null;
  /** 제품별 매칭 점수 — 디버깅 / 추후 확장. */
  productScores?: Partial<Record<PreSpecProduct, number>>;

  /** 매칭에 사용된 키워드들. */
  matchedKeywords: string[];
  /** 매칭 사유 한 줄 설명. */
  matchReason?: string;

  /** 담당본부. 미매칭이면 "미매칭". */
  department: string;
  /** Named 표기. */
  namedType?: "Named" | "Non Named" | "-";

  /** 지역. */
  region?: string;

  /** 진행 중 / 마감 임박 / 마감 / 확인 필요. */
  status: PreSpecStatus;
  /** 추천 등급. */
  recommendation: PreSpecRecommendation;

  /** 신규 표시 여부 (24h). */
  isNew: boolean;
  /** firstSeenAt (epoch ms). */
  newAt?: number | null;

  /** 피드백 건수 — 화면에서 lookup. */
  feedbackCount?: number;

  /** 사전규격 → 입찰공고 연결 (TODO: 1차에서는 비어있다). */
  linkedBidNo?: string;
  linkedBidTitle?: string;
  linkedStatus?: "미연결" | "입찰공고등록" | "낙찰" | "계약";

  /** 매칭된 고객사 (선택). */
  customer?: PreSpecCustomer | null;
};

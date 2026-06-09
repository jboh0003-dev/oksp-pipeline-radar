/**
 * 영업대표 피드백(공고 단위) — 1차는 localStorage 기반 단일 사용자 저장.
 *
 * 요구사항(회의):
 *  - 한 공고에 대해 전체 평가, 제품별 평가(CONTRABASS / VIOLA), 키워드별 평가, 담당본부 평가,
 *    자유 메모, 작성자를 남길 수 있어야 한다.
 *  - 모달 재오픈 시 이전 내용이 그대로 복원되어야 한다.
 *  - 테이블 행에 "피드백" 버튼이 있고, 이미 피드백이 있으면 작은 카운트 표시.
 *  - 상단 필터에 "피드백 있음" 옵션을 둔다.
 *
 * 저장 모델:
 *  - localStorage key  : `csg2b:announcementFeedbacks`
 *  - 마지막 작성자 캐시 : `csg2b:lastFeedbackAuthor`
 *  - 데이터 형태       : AnnouncementFeedback[]  (announcementKey 단위 1건)
 *
 * 추후 다중 사용자/공유가 필요하면 같은 모양 그대로 API + DB 로 옮길 수 있게 설계.
 */

export type FeedbackRating = "good" | "bad" | "neutral";

/** 피드백이 어느 소스에서 왔는지. 기존 입찰공고 데이터와의 호환을 위해 default = "BID". */
export type FeedbackSourceType = "BID" | "PRE_SPEC";

export type KeywordFeedback = {
  keyword: string;
  rating: FeedbackRating;
};

export type AnnouncementFeedback = {
  id: string;
  announcementKey: string;
  /** 어떤 소스의 공고인지. 미지정시 "BID" 로 간주. */
  sourceType?: FeedbackSourceType;
  noticeId?: string;
  noticeTitle?: string;
  rating: FeedbackRating;
  productFeedback?: Partial<Record<"CONTRABASS" | "VIOLA" | "CMP", FeedbackRating>>;
  departmentFeedback?: FeedbackRating;
  /** 영업이 "올바른 본부는 ~ 이다" 로 정정한 값. 미입력은 undefined. */
  correctDepartment?: string;
  keywordFeedback?: KeywordFeedback[];
  memo: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "csg2b:announcementFeedbacks";
const AUTHOR_KEY = "csg2b:lastFeedbackAuthor";

function safeRead(): AnnouncementFeedback[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AnnouncementFeedback =>
        !!item &&
        typeof item === "object" &&
        typeof (item as { announcementKey?: unknown }).announcementKey === "string",
    );
  } catch {
    return [];
  }
}

function safeWrite(list: AnnouncementFeedback[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 시크릿 모드 / 쿼터 초과 등은 조용히 무시
  }
}

/** 모든 피드백 — 화면 진입 시 한 번 읽고 useMemo 로 announcementKey 기준 인덱싱해서 사용. */
export function loadAllFeedbacks(
  sourceType?: FeedbackSourceType,
): AnnouncementFeedback[] {
  const all = safeRead();
  if (!sourceType) return all;
  // sourceType 미지정 데이터(과거 데이터)는 "BID" 로 간주.
  return all.filter((f) => (f.sourceType ?? "BID") === sourceType);
}

/** announcementKey → feedback 인덱스. 테이블 행마다 빠르게 lookup 하기 위함. */
export function buildFeedbackMap(
  list: AnnouncementFeedback[],
): Map<string, AnnouncementFeedback> {
  const map = new Map<string, AnnouncementFeedback>();
  for (const item of list) {
    if (item.announcementKey) map.set(item.announcementKey, item);
  }
  return map;
}

/**
 * upsert — (announcementKey, sourceType) 기준 1건 저장. 이미 있으면 updatedAt 만 갱신,
 * 없으면 createdAt 도 셋업.
 *
 * 같은 announcementKey 라도 sourceType 이 다르면 별도 row 로 본다 — 1차에선 거의 일어나지
 * 않지만 사전규격→입찰공고 연결 추적을 위해 안전한 분리.
 *
 * 반환값: 저장 후의 (sourceType 으로 필터된) 목록 (재렌더 시 useState 갱신용).
 */
export function saveFeedback(
  partial: Omit<AnnouncementFeedback, "id" | "createdAt" | "updatedAt">,
): AnnouncementFeedback[] {
  const list = safeRead();
  const now = new Date().toISOString();
  const sourceType: FeedbackSourceType = partial.sourceType ?? "BID";
  const idx = list.findIndex(
    (item) =>
      item.announcementKey === partial.announcementKey &&
      (item.sourceType ?? "BID") === sourceType,
  );
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...partial,
      sourceType,
      updatedAt: now,
    };
  } else {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${sourceType}-${partial.announcementKey}-${Date.now()}`;
    list.push({
      ...partial,
      sourceType,
      id: newId,
      createdAt: now,
      updatedAt: now,
    });
  }
  safeWrite(list);
  return loadAllFeedbacks(sourceType);
}

/** 단건 삭제. sourceType 미지정 시 같은 key 의 모든 sourceType 을 지운다. */
export function deleteFeedback(
  announcementKey: string,
  sourceType?: FeedbackSourceType,
): AnnouncementFeedback[] {
  const list = safeRead().filter((item) => {
    if (item.announcementKey !== announcementKey) return true;
    if (!sourceType) return false;
    return (item.sourceType ?? "BID") !== sourceType;
  });
  safeWrite(list);
  return loadAllFeedbacks(sourceType);
}

/** 마지막 작성자 — 다음 모달에 미리 채워준다. */
export function loadLastAuthor(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLastAuthor(author: string) {
  if (typeof window === "undefined") return;
  try {
    if (author.trim()) {
      window.localStorage.setItem(AUTHOR_KEY, author.trim());
    }
  } catch {
    // ignore
  }
}

/** CSV 내보내기용 — 한 줄당 한 피드백. 한국어 헤더로 영업이 바로 열어볼 수 있게. */
export function feedbacksToCsv(list: AnnouncementFeedback[]): string {
  const header = [
    "구분",
    "공고키",
    "공고명",
    "전체평가",
    "CONTRABASS",
    "VIOLA",
    "CMP",
    "담당본부 평가",
    "올바른 본부",
    "키워드 피드백",
    "메모",
    "작성자",
    "작성일",
    "수정일",
  ];
  const sourceLabel: Record<FeedbackSourceType, string> = {
    BID: "입찰공고",
    PRE_SPEC: "사전규격공고",
  };
  const rows = list.map((f) => {
    const pf = f.productFeedback ?? {};
    const kw = (f.keywordFeedback ?? [])
      .map((k) => `${k.keyword}:${k.rating}`)
      .join(" | ");
    return [
      sourceLabel[(f.sourceType ?? "BID") as FeedbackSourceType] ?? "입찰공고",
      f.announcementKey,
      f.noticeTitle ?? "",
      f.rating,
      pf.CONTRABASS ?? "",
      pf.VIOLA ?? "",
      pf.CMP ?? "",
      f.departmentFeedback ?? "",
      f.correctDepartment ?? "",
      kw,
      f.memo,
      f.author ?? "",
      f.createdAt,
      f.updatedAt,
    ];
  });
  return [header, ...rows]
    .map((row) =>
      row
        .map((v) => {
          const s = String(v ?? "");
          // CSV 안전 — 따옴표/콤마/줄바꿈 포함 시 quote.
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
}

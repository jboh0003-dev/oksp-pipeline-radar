import type { Notice } from "@/data/sampleNotices";
import { getBudgetSortKey } from "@/lib/budget";
import { formatAccountTypeLabel } from "@/lib/customerMatching";
import { isMissingDueDate } from "@/lib/noticeVisibility";

/**
 * 테이블 헤더 클릭으로 정렬할 수 있는 컬럼 목록.
 * UI 텍스트와 1:1 매핑된다.
 */
export type SortColumn =
  | "fit" // 추천
  | "product" // 제품
  | "title" // 공고명
  | "agency" // 기관/고객사
  | "territory" // 담당본부
  | "named" // NAMED
  | "region" // 지역
  | "noticeDate" // 게시일
  | "deadline" // 마감일
  | "budget"; // 예산

export type SortDirection = "asc" | "desc";

export type SortState = {
  column: SortColumn;
  direction: SortDirection;
};

/**
 * 사용자가 진입했을 때 가장 먼저 보고 싶은 정렬은 "추천 등급(점수) 높은 순".
 * 기존 sortNoticesByOption 의 fit_desc 와 동일한 의미를 갖는다.
 */
export const DEFAULT_SORT_STATE: SortState = { column: "fit", direction: "desc" };

/**
 * 컬럼별 첫 클릭 시의 자연스러운 방향.
 * - 점수/날짜류는 "큰 값 위로" 가 자연스럽다 → desc
 * - 마감일은 "임박한 것 위로" → asc
 * - 텍스트류는 가나다순 → asc
 */
const NATURAL_DIRECTION: Record<SortColumn, SortDirection> = {
  fit: "desc",
  product: "asc",
  title: "asc",
  agency: "asc",
  territory: "asc",
  named: "asc",
  region: "asc",
  noticeDate: "desc",
  deadline: "asc",
  budget: "desc",
};

/**
 * 헤더 클릭 토글 정책.
 * - 같은 컬럼 클릭: 방향만 토글
 * - 다른 컬럼 클릭: 그 컬럼의 NATURAL_DIRECTION 으로 전환
 */
export function toggleSortState(
  current: SortState,
  next: SortColumn,
): SortState {
  if (current.column === next) {
    return {
      column: next,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { column: next, direction: NATURAL_DIRECTION[next] };
}

function deadlineSortKey(deadline: string): string {
  if (isMissingDueDate(deadline)) return "";
  return deadline.includes("T") ? deadline.slice(0, 10) : deadline;
}

function noticeDateSortKey(noticeDate: string | null | undefined): string {
  if (!noticeDate) return "";
  const trimmed = noticeDate.trim();
  if (!trimmed) return "";
  return trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
}

function productSortKey(notice: Notice): string {
  // 표시 라벨 기준으로 비교 ("CONTRABASS" / "VIOLA" / "")
  const products = notice.relatedProducts;
  if (products.includes("VIOLA")) return "VIOLA";
  if (products.length > 0) return "CONTRABASS";
  return "";
}

/**
 * NAMED 정렬 우선순위. Named=0, Non Named=1, 그 외/미매칭=2 로 두어
 * asc 시 Named 가 위로 오도록 한다.
 */
function namedSortRank(notice: Notice): number {
  const label = formatAccountTypeLabel(notice.customer?.accountType);
  if (label === "Named") return 0;
  if (label === "Non Named") return 1;
  return 2;
}

function regionSortKey(notice: Notice): string {
  // 지역(시·도) 우선, 없으면 region_group, 둘 다 없으면 빈 문자열
  return notice.customer?.region ?? notice.customer?.regionGroup ?? "";
}

/** 컬럼 값이 "비어있다" 고 판단되는지. 비어 있으면 정렬 방향과 무관하게 항상 맨 아래. */
function isEmptyForColumn(notice: Notice, column: SortColumn): boolean {
  switch (column) {
    case "fit":
      return false; // 0 도 유효한 값
    case "product":
      return productSortKey(notice).length === 0;
    case "title":
      return !notice.title.trim();
    case "agency":
      return !notice.agency.trim();
    case "territory":
      return !(notice.customer?.territory ?? "").trim();
    case "named":
      return namedSortRank(notice) === 2;
    case "region":
      return regionSortKey(notice).length === 0;
    case "noticeDate":
      return !noticeDateSortKey(notice.noticeDate);
    case "deadline":
      return !deadlineSortKey(notice.deadline);
    case "budget":
      return getBudgetSortKey(notice.budget) <= 0;
  }
}

/** 두 notice 의 컬럼 값을 비교. (asc 기준 기본 비교, 호출부에서 방향을 곱함) */
function compareByColumn(a: Notice, b: Notice, column: SortColumn): number {
  switch (column) {
    case "fit":
      return a.fitScore - b.fitScore;
    case "product":
      return productSortKey(a).localeCompare(productSortKey(b));
    case "title":
      return a.title.localeCompare(b.title);
    case "agency":
      return a.agency.localeCompare(b.agency);
    case "territory":
      return (a.customer?.territory ?? "").localeCompare(b.customer?.territory ?? "");
    case "named":
      return namedSortRank(a) - namedSortRank(b);
    case "region":
      return regionSortKey(a).localeCompare(regionSortKey(b));
    case "noticeDate":
      return noticeDateSortKey(a.noticeDate).localeCompare(noticeDateSortKey(b.noticeDate));
    case "deadline":
      return deadlineSortKey(a.deadline).localeCompare(deadlineSortKey(b.deadline));
    case "budget":
      return getBudgetSortKey(a.budget) - getBudgetSortKey(b.budget);
  }
}

/**
 * sortState 에 따라 notices 를 정렬해 새 배열을 반환한다.
 * - 비어있는 값(예: 마감일이 없거나 고객사 매칭 안 됨)은 방향과 무관하게 항상 맨 뒤.
 * - 동률일 때는 fitScore desc 로 안정화.
 */
export function sortNoticesByState<T extends Notice>(
  notices: T[],
  state: SortState,
): T[] {
  const dir = state.direction === "asc" ? 1 : -1;
  return [...notices].sort((a, b) => {
    const aEmpty = isEmptyForColumn(a, state.column);
    const bEmpty = isEmptyForColumn(b, state.column);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    const primary = compareByColumn(a, b, state.column) * dir;
    if (primary !== 0) return primary;

    // tiebreaker: 추천 점수 desc → 동일 시 마감일 asc
    if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
    const ad = deadlineSortKey(a.deadline);
    const bd = deadlineSortKey(b.deadline);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.localeCompare(bd);
  });
}

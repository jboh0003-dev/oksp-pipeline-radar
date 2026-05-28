import type { Notice } from "@/data/sampleNotices";
import { REOPEN_KEYWORDS } from "@/lib/g2b/constants";
import type { MatchGrade } from "@/lib/noticeGrades";

const TEST_URL_PATTERNS = ["example.com"];

export type DueStatus = "진행 중" | "마감 지남" | "마감일 확인 필요";

export type NoticeViewTab = "active" | "expired" | "all";

/**
 * 이번 버전 매칭 대상 제품. (CONTRABASS-family + VIOLA)
 * 기존 DB에 남아 있는 TROMBONE / OKESTRO CMP / CONCERTO AI는 제외.
 */
export const MATCHED_PRODUCT_NAMES = new Set([
  "CONTRABASS",
  "CONTRABASS Legato",
  "CONTRABASS SDS+",
  "VIOLA",
]);

const REVIEW_NEEDED_LABEL = "검토 필요";

export function getKstTodayDateString(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function hasReopenKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return REOPEN_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function normalizeDeadlineDay(deadline: string): string {
  const trimmed = deadline.trim();
  if (!trimmed) return "";
  return trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
}

export function isMissingDueDate(deadline: string): boolean {
  const day = normalizeDeadlineDay(deadline);
  return !day || day === "-";
}

export function isPastDueDate(deadline: string, now = new Date()): boolean {
  const dueDay = normalizeDeadlineDay(deadline);
  if (!dueDay) return false;
  const today = getKstTodayDateString(now);
  return dueDay < today;
}

export function getDueStatus(deadline: string, now = new Date()): DueStatus {
  if (isMissingDueDate(deadline)) return "마감일 확인 필요";
  if (isPastDueDate(deadline, now)) return "마감 지남";
  return "진행 중";
}

export function isActiveOrUnknownDue(deadline: string, now = new Date()): boolean {
  const status = getDueStatus(deadline, now);
  return status === "진행 중" || status === "마감일 확인 필요";
}

export function hasRealProductMatch(notice: Notice): boolean {
  return notice.relatedProducts.some((product) => MATCHED_PRODUCT_NAMES.has(product));
}

export function isReviewNeededOnly(notice: Notice): boolean {
  return (
    notice.relatedProducts.length === 1 && notice.relatedProducts[0] === REVIEW_NEEDED_LABEL
  );
}

export function matchesViewTab(
  notice: Notice,
  tab: NoticeViewTab,
  includeExpiredInActive: boolean,
  now = new Date(),
): boolean {
  const status = getDueStatus(notice.deadline, now);

  if (tab === "expired") return status === "마감 지남";
  if (tab === "all") return true;

  if (status === "진행 중" || status === "마감일 확인 필요") return true;
  if (includeExpiredInActive && status === "마감 지남") return true;
  return false;
}

export function isTestNoticeUrl(sourceUrl: string): boolean {
  const lower = sourceUrl.toLowerCase();
  return TEST_URL_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** 화면·후보 집계에 포함할 공고인지 */
export function isNoticeVisible(notice: Notice, now = new Date()): boolean {
  if (isTestNoticeUrl(notice.sourceUrl)) {
    return false;
  }
  if (!isPastDueDate(notice.deadline, now)) {
    return true;
  }
  const haystack = [notice.title, notice.summary ?? "", ...notice.keywords].join(" ");
  return hasReopenKeyword(haystack);
}

function compareDeadline(a: string, b: string): number {
  const aMissing = isMissingDueDate(a);
  const bMissing = isMissingDueDate(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return normalizeDeadlineDay(a).localeCompare(normalizeDeadlineDay(b));
}

/** 진행 중 우선 → match_score 내림차순 → 마감일 가까운 순 */
export function sortNoticesForDashboard(notices: Notice[], now = new Date()): Notice[] {
  return [...notices].sort((a, b) => {
    const aRank = isActiveOrUnknownDue(a.deadline, now) ? 0 : 1;
    const bRank = isActiveOrUnknownDue(b.deadline, now) ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return compareDeadline(a.deadline, b.deadline);
  });
}

/** match_score 높은 순 → 마감일 가까운 순 */
export function sortNoticesForDisplay(notices: Notice[]): Notice[] {
  return sortNoticesForDashboard(notices);
}

export type DashboardSummaryCounts = {
  activeTotal: number;
  contrabass: number;
  viola: number;
};

const CONTRABASS_FAMILY_NAMES = new Set([
  "CONTRABASS",
  "CONTRABASS Legato",
  "CONTRABASS SDS+",
]);

function hasContrabassFamily(notice: Notice): boolean {
  return notice.relatedProducts.some((p) => CONTRABASS_FAMILY_NAMES.has(p));
}

function hasViola(notice: Notice): boolean {
  return notice.relatedProducts.includes("VIOLA");
}

export function countDashboardSummary(notices: Notice[], now = new Date()): DashboardSummaryCounts {
  const counts: DashboardSummaryCounts = {
    activeTotal: 0,
    contrabass: 0,
    viola: 0,
  };

  for (const notice of notices) {
    if (getDueStatus(notice.deadline, now) !== "진행 중") continue;
    if (!hasRealProductMatch(notice)) continue;

    counts.activeTotal += 1;
    if (hasContrabassFamily(notice)) counts.contrabass += 1;
    if (hasViola(notice)) counts.viola += 1;
  }

  return counts;
}

export function countByGrade(notices: Notice[]): Record<MatchGrade, number> {
  const counts: Record<MatchGrade, number> = { 추천: 0, 검토: 0, 관찰: 0 };
  for (const notice of notices) {
    const score = notice.fitScore;
    if (score >= 70) counts.추천 += 1;
    else if (score >= 40) counts.검토 += 1;
    else if (score >= 20) counts.관찰 += 1;
  }
  return counts;
}

import type { Notice } from "@/data/sampleNotices";
import { REOPEN_KEYWORDS } from "@/lib/g2b/constants";
import type { MatchGrade } from "@/lib/noticeGrades";

const TEST_URL_PATTERNS = ["example.com"];

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

export function isPastDueDate(deadline: string, now = new Date()): boolean {
  const today = getKstTodayDateString(now);
  const dueDay = deadline.includes("T") ? deadline.slice(0, 10) : deadline;
  return dueDay < today;
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

/** match_score 높은 순 → 마감일 가까운 순 */
export function sortNoticesForDisplay(notices: Notice[]): Notice[] {
  return [...notices].sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.deadline.localeCompare(b.deadline);
  });
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

import type { Notice } from "@/data/sampleNotices";

/** @deprecated 화면에서는 lib/noticeGrades 사용 */
export type FitLevel = "높음" | "검토" | "낮음";

/** @deprecated lib/noticeGrades.getMatchGrade 사용 */
export function getFitLevel(score: number): FitLevel {
  if (score >= 90) return "높음";
  if (score >= 70) return "검토";
  return "낮음";
}

export function parseDeadline(deadline: string): Date {
  const [year, month, day] = deadline.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59);
}

export function getDaysUntilDeadline(deadline: string, now = new Date()): number {
  const end = parseDeadline(deadline);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.ceil((endDay.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

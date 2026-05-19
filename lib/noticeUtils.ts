import type { Notice } from "@/data/sampleNotices";

/** 마감일이 이 일수 이내면 '마감 임박'으로 표시 */
export const DEADLINE_URGENT_DAYS = 7;

export type FitLevel = "높음" | "검토" | "낮음";

export function getFitLevel(score: number): FitLevel {
  if (score >= 90) return "높음";
  if (score >= 70) return "검토";
  return "낮음";
}

export function getFitLevelStyle(level: FitLevel) {
  switch (level) {
    case "높음":
      return {
        badge: "bg-[#E8F3FF] text-[#1B64DA] ring-[#C9E2FF]",
        bar: "bg-[#3182F6]",
      };
    case "검토":
      return {
        badge: "bg-[#FFF4E0] text-[#E68600] ring-[#FFE0A3]",
        bar: "bg-[#FFB020]",
      };
    case "낮음":
      return {
        badge: "bg-[#F2F4F6] text-[#6B7684] ring-[#E5E8EB]",
        bar: "bg-[#ADB5BD]",
      };
  }
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

export function isDeadlineImminent(deadline: string, now = new Date()): boolean {
  const days = getDaysUntilDeadline(deadline, now);
  return days >= 0 && days <= DEADLINE_URGENT_DAYS;
}

export function getAverageFitScore(notices: Notice[]): number {
  if (notices.length === 0) return 0;
  const sum = notices.reduce((acc, notice) => acc + notice.fitScore, 0);
  return Math.round(sum / notices.length);
}

export function countImminentDeadlines(notices: Notice[], now = new Date()): number {
  return notices.filter((notice) => isDeadlineImminent(notice.deadline, now)).length;
}

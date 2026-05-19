import { REOPEN_KEYWORDS } from "@/lib/g2b/constants";
import { getKstTodayDateString } from "@/lib/noticeVisibility";

export function hasReopenKeywordInText(...texts: string[]): boolean {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return REOPEN_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function isDueDateExpired(dueDate: string, now = new Date()): boolean {
  const today = getKstTodayDateString(now);
  const dueDay = dueDate.includes("T") ? dueDate.slice(0, 10) : dueDate;
  return dueDay < today;
}

export function shouldKeepDespiteExpiredDueDate(
  dueDate: string,
  title: string,
  summary: string,
  now = new Date(),
): boolean {
  if (!isDueDateExpired(dueDate, now)) {
    return true;
  }
  return hasReopenKeywordInText(title, summary);
}

import { G2B_INQUIRY_DAYS } from "@/lib/g2b/constants";

function getKstDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

export function getG2bInquiryDateRangeForDays(days: number) {
  const now = new Date();
  const endParts = getKstDateParts(now);
  const inqryEndDt = `${endParts.year}${endParts.month}${endParts.day}2359`;

  const beginDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const beginParts = getKstDateParts(beginDate);
  const inqryBgnDt = `${beginParts.year}${beginParts.month}${beginParts.day}0000`;

  return {
    inqryBgnDt,
    inqryEndDt,
    label: { from: inqryBgnDt, to: inqryEndDt },
  };
}

export function getG2bInquiryDateRange() {
  return getG2bInquiryDateRangeForDays(G2B_INQUIRY_DAYS);
}

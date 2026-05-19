import { getG2bAgency, getG2bField, getG2bTitle } from "@/lib/g2b/fields";
import type { NoticeMatch } from "@/lib/g2b/match";
import { getExternalId } from "@/lib/g2b/match";

export type NoticeUpsertRow = {
  external_id: string;
  title: string;
  agency: string;
  source: string;
  original_url: string;
  budget: string;
  due_date: string;
  notice_date: string | null;
  products: string[];
  match_score: number;
  keywords: string[];
  summary: string;
  status: string;
  source_type: string;
  raw_data: Record<string, unknown>;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function parseG2bDate(value: string): string | null {
  const digits = digitsOnly(value);
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function parseG2bTimestamp(value: string): string | null {
  const digits = digitsOnly(value);
  if (digits.length < 8) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const hour = digits.length >= 10 ? digits.slice(8, 10) : "00";
  const minute = digits.length >= 12 ? digits.slice(10, 12) : "00";
  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}

export function mapG2bItemToNotice(
  item: Record<string, unknown>,
  match: NoticeMatch,
): NoticeUpsertRow | null {
  const externalId = getExternalId(item);
  if (!externalId) return null;

  const title = getG2bTitle(item);
  const agency = getG2bAgency(item);
  const budget =
    getG2bField(item, ["asignBdgtAmt", "presmptPrce", "bssamt", "bdgtAmt"]) || "-";
  const dueDateRaw = getG2bField(item, ["bidClseDt", "opengDt", "bidClseTm"]);
  const noticeDateRaw = getG2bField(item, ["bidNtceDt", "rgstDt"]);

  const dueDate = parseG2bDate(dueDateRaw) ?? new Date().toISOString().slice(0, 10);
  const noticeDate = noticeDateRaw ? parseG2bTimestamp(noticeDateRaw) : null;

  return {
    external_id: externalId,
    title: title || "제목 없음",
    agency,
    source: "나라장터",
    original_url: getG2bField(item, ["bidNtceUrl", "bidNtceDtlUrl", "ntceUrl"]),
    budget,
    due_date: dueDate,
    notice_date: noticeDate,
    products: match.products,
    match_score: match.matchScore,
    keywords: match.keywords,
    summary: match.summary,
    status: "open",
    source_type: "g2b",
    raw_data: item,
  };
}

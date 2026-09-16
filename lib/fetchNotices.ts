import { sampleNotices, type Notice, type NoticeCustomerInfo } from "@/data/sampleNotices";
import { extractAttachments, summarizeAttachments } from "@/lib/attachments";
import { parseApiResponse } from "@/lib/apiResponse";
import { evaluateMatchGrade } from "@/lib/noticeGrades";
import { buildNegativeSearchText, detectNegativeSignals } from "@/lib/noticeMatching";
import { isNoticeVisible, sortNoticesForDisplay } from "@/lib/noticeVisibility";
import { buildBidSourceUrl } from "@/lib/sourceUrl";
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type NoticeRow,
} from "@/lib/supabase";

type CustomerMatchPayload = {
  customerName: string;
  accountType: string | null;
  territory: string | null;
  regionGroup: string | null;
  region: string | null;
  matchType: "exact" | "normalized" | "alias" | "contains" | "fuzzy";
};

type CustomerMatchData = {
  matches?: Record<string, CustomerMatchPayload>;
};

async function fetchMatchedCustomers(
  agencies: string[],
): Promise<{ matches: Record<string, CustomerMatchPayload>; error: string | null }> {
  const unique = [...new Set(agencies.filter((a) => a && a.trim().length > 0))];
  if (unique.length === 0) return { matches: {}, error: null };

  try {
    const res = await fetch("/api/customer-accounts/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agencies: unique }),
      cache: "no-store",
    });
    const parsed = await parseApiResponse<CustomerMatchData>(res, {
      route: "/api/customer-accounts/match",
      params: { agencyCount: unique.length },
    });
    if (!parsed.ok) {
      console.warn("[fetchNotices] /api/customer-accounts/match 실패:", {
        status: parsed.status,
        error: parsed.error,
        detail: parsed.detail,
      });
      return { matches: {}, error: parsed.error };
    }
    return { matches: parsed.data.matches ?? {}, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[fetchNotices] /api/customer-accounts/match 호출 예외:", err);
    return { matches: {}, error: message };
  }
}

export type NoticeDataSource = "supabase" | "sample";

export type FetchNoticesResult = {
  notices: Notice[];
  source: NoticeDataSource;
  error: string | null;
  /** 고객사 매칭 API 호출 실패 시 사용자 안내용 (공고 목록 자체는 유지). */
  matchError: string | null;
};

const DISPLAY_SOURCE_TYPES = new Set(["g2b", "g2b_keyword", "g2b_active_core"]);
export const DISPLAY_FETCH_LIMIT = 1000;
const DISPLAY_SOURCE_OR_FILTER =
  "source_type.eq.g2b,source_type.eq.g2b_keyword,source_type.eq.g2b_active_core,source_type.is.null,source_type.eq.";

function isDisplayableSourceType(sourceType: string | null | undefined): boolean {
  return sourceType == null || sourceType === "" || DISPLAY_SOURCE_TYPES.has(sourceType);
}

function isTestNotice(row: NoticeRow): boolean {
  const url = (row.original_url ?? "").toLowerCase();
  return url.includes("example.com");
}

function getKstTodayDateString(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatDueDate(value: string): string {
  return value.includes("T") ? value.slice(0, 10) : value;
}

function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;

  const dashedMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashedMatch) return `${dashedMatch[1]}-${dashedMatch[2]}-${dashedMatch[3]}`;

  return null;
}

function pickRawValue(
  raw: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown {
  if (!raw || typeof raw !== "object") return null;
  for (const key of keys) {
    const value = (raw as Record<string, unknown>)[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function resolveNoticeDate(row: NoticeRow): string | null {
  const candidates: unknown[] = [
    row.notice_date,
    pickRawValue(row.raw_data, ["rgstDt", "bidNtceDt", "ntceDt", "regDt", "registDt"]),
    row.created_at,
  ];

  for (const candidate of candidates) {
    const date = toDateOnly(candidate);
    if (date) return date;
  }
  return null;
}

function parseStringArray(value: string[] | string | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // fall through
      }
    }
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function formatError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [e.message, e.details, e.hint, e.code ? `code: ${e.code}` : undefined].filter(
      Boolean,
    );
    if (parts.length > 0) return parts.join(" | ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function rawDataToText(rawData: Record<string, unknown> | null | undefined): string {
  if (!rawData) return "";
  try {
    return JSON.stringify(rawData);
  } catch {
    return "";
  }
}

function mapRowToNotice(
  row: NoticeRow,
  matches: Record<string, CustomerMatchPayload>,
): Notice {
  const fitScore = row.match_score ?? 0;
  const dueRaw = row.due_date;
  const keywords = parseStringArray(row.keywords);

  const negativeText = buildNegativeSearchText({
    title: row.title,
    agency: row.agency,
    summary: row.summary,
    keywords,
    rawData: rawDataToText(row.raw_data),
  });
  const { weight: negativeWeight } = detectNegativeSignals(negativeText);

  const matched = row.agency ? matches[row.agency.trim()] : undefined;
  let customer: NoticeCustomerInfo | undefined;
  if (matched) {
    customer = {
      customerName: matched.customerName,
      accountType: matched.accountType,
      territory: matched.territory,
      regionGroup: matched.regionGroup,
      region: matched.region,
      matchType: matched.matchType,
    };
  }

  const attachments = extractAttachments(row.raw_data ?? null);
  const att = summarizeAttachments(attachments);

  const rawData = (row.raw_data ?? null) as Record<string, unknown> | null;
  const bidNtceNo =
    rawData && typeof rawData["bidNtceNo"] === "string"
      ? (rawData["bidNtceNo"] as string)
      : null;
  const bidNtceOrd =
    rawData && typeof rawData["bidNtceOrd"] === "string"
      ? (rawData["bidNtceOrd"] as string)
      : null;
  const sourceUrlInfo = buildBidSourceUrl({
    originalUrl: row.original_url,
    bidNtceNo,
    bidNtceOrd,
  });

  return {
    id: String(row.id),
    externalId: row.external_id ?? null,
    title: row.title,
    agency: row.agency,
    deadline: dueRaw ? formatDueDate(String(dueRaw)) : "",
    noticeDate: resolveNoticeDate(row),
    budget: row.budget ?? "-",
    relatedProducts: parseStringArray(row.products),
    fitScore,
    matchGrade: evaluateMatchGrade(fitScore, negativeWeight),
    keywords,
    summary: row.summary ?? undefined,
    sourceUrl: sourceUrlInfo.url ?? row.original_url ?? "https://www.g2b.go.kr/",
    customer,
    attachments,
    hasRfp: att.hasRfp,
    hasSpecDoc: att.hasSpecDoc,
    hasTaskDoc: att.hasTaskDoc,
  };
}

function filterVisibleSample(): Notice[] {
  return sortNoticesForDisplay(sampleNotices.filter((notice) => isNoticeVisible(notice)));
}

export async function fetchNotices(): Promise<FetchNoticesResult> {
  const configError = getSupabaseConfigError();
  if (configError) {
    console.error("[fetchNotices] Supabase config error:", configError);
    return { notices: filterVisibleSample(), source: "sample", error: configError, matchError: null };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    const message = "Supabase 클라이언트를 생성하지 못했습니다.";
    console.error("[fetchNotices]", message);
    return { notices: filterVisibleSample(), source: "sample", error: message, matchError: null };
  }

  try {
    const todayKst = getKstTodayDateString();
    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .eq("status", "open")
      .gte("due_date", todayKst)
      .or(DISPLAY_SOURCE_OR_FILTER)
      .order("match_score", { ascending: false, nullsFirst: false })
      .order("due_date", { ascending: true })
      .limit(DISPLAY_FETCH_LIMIT);

    if (error) {
      console.error("[fetchNotices] Supabase select error:", error);
      throw error;
    }

    const rows = ((data ?? []) as NoticeRow[]).filter(
      (row) => isDisplayableSourceType(row.source_type) && !isTestNotice(row),
    );

    const agencies = rows.map((r) => (r.agency ?? "").trim()).filter((a) => a.length > 0);
    const { matches, error: matchError } = await fetchMatchedCustomers(agencies);

    const notices = sortNoticesForDisplay(rows.map((row) => mapRowToNotice(row, matches)));

    return {
      notices,
      source: "supabase",
      error: null,
      matchError,
    };
  } catch (error) {
    const message = formatError(error);
    console.error("[fetchNotices] Supabase request failed:", error);
    return { notices: filterVisibleSample(), source: "sample", error: message, matchError: null };
  }
}

import { sampleNotices, type Notice } from "@/data/sampleNotices";
import { getMatchGrade } from "@/lib/noticeGrades";
import { isNoticeVisible, sortNoticesForDisplay } from "@/lib/noticeVisibility";
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type NoticeRow,
} from "@/lib/supabase";

export type NoticeDataSource = "supabase" | "sample";

export type FetchNoticesResult = {
  notices: Notice[];
  source: NoticeDataSource;
  error: string | null;
};

/** 화면에 표시할 source_type: g2b, g2b_keyword, g2b_active_core, null·빈 문자열 */
const DISPLAY_SOURCE_TYPES = new Set(["g2b", "g2b_keyword", "g2b_active_core"]);

/** Supabase에서 가져올 최대 건수 (화면 필터 후에도 100건 이상 노출 가능하도록 여유) */
export const DISPLAY_FETCH_LIMIT = 250;

const DISPLAY_SOURCE_OR_FILTER =
  "source_type.eq.g2b,source_type.eq.g2b_keyword,source_type.eq.g2b_active_core,source_type.is.null,source_type.eq.";

function isDisplayableSourceType(sourceType: string | null | undefined): boolean {
  return sourceType == null || sourceType === "" || DISPLAY_SOURCE_TYPES.has(sourceType);
}

function isTestNotice(row: NoticeRow): boolean {
  const url = (row.original_url ?? "").toLowerCase();
  return url.includes("example.com");
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

function mapRowToNotice(row: NoticeRow): Notice {
  const fitScore = row.match_score ?? 0;
  const dueRaw = row.due_date;
  return {
    id: String(row.id),
    title: row.title,
    agency: row.agency,
    deadline: dueRaw ? formatDueDate(String(dueRaw)) : "",
    noticeDate: resolveNoticeDate(row),
    budget: row.budget ?? "-",
    relatedProducts: parseStringArray(row.products),
    fitScore,
    matchGrade: getMatchGrade(fitScore),
    keywords: parseStringArray(row.keywords),
    summary: row.summary ?? undefined,
    sourceUrl: row.original_url ?? "https://www.g2b.go.kr/",
  };
}

function filterVisibleSample(): Notice[] {
  return sortNoticesForDisplay(sampleNotices.filter((notice) => isNoticeVisible(notice)));
}

export async function fetchNotices(): Promise<FetchNoticesResult> {
  const configError = getSupabaseConfigError();
  if (configError) {
    console.error("[fetchNotices] Supabase config error:", configError);
    return { notices: filterVisibleSample(), source: "sample", error: configError };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    const message = "Supabase 클라이언트를 생성하지 못했습니다.";
    console.error("[fetchNotices]", message);
    return { notices: filterVisibleSample(), source: "sample", error: message };
  }

  try {
    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .eq("status", "open")
      .or(DISPLAY_SOURCE_OR_FILTER)
      .order("match_score", { ascending: false, nullsFirst: false })
      .order("due_date", { ascending: true })
      .limit(DISPLAY_FETCH_LIMIT);

    if (error) {
      console.error("[fetchNotices] Supabase select error:", error);
      throw error;
    }

    const rows = (data ?? []) as NoticeRow[];

    const notices = sortNoticesForDisplay(
      rows
        .filter((row) => isDisplayableSourceType(row.source_type) && !isTestNotice(row))
        .map(mapRowToNotice),
    );

    return {
      notices,
      source: "supabase",
      error: null,
    };
  } catch (error) {
    const message = formatError(error);
    console.error("[fetchNotices] Supabase request failed:", error);
    return { notices: filterVisibleSample(), source: "sample", error: message };
  }
}

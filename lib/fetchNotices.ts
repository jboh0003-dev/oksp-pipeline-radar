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

function isTestNotice(row: NoticeRow): boolean {
  const url = (row.original_url ?? "").toLowerCase();
  return url.includes("example.com");
}

function formatDueDate(value: string): string {
  return value.includes("T") ? value.slice(0, 10) : value;
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
  return {
    id: String(row.id),
    title: row.title,
    agency: row.agency,
    deadline: formatDueDate(row.due_date),
    budget: row.budget ?? "-",
    relatedProducts: parseStringArray(row.products),
    fitScore,
    matchGrade: getMatchGrade(fitScore),
    keywords: parseStringArray(row.keywords),
    summary: row.summary ?? undefined,
    sourceUrl: row.original_url ?? "https://www.g2b.go.kr/",
  };
}

function sortRowsForDisplay(rows: NoticeRow[]): NoticeRow[] {
  return [...rows].sort((a, b) => {
    const aG2b = a.source_type === "g2b" ? 0 : 1;
    const bG2b = b.source_type === "g2b" ? 0 : 1;
    if (aG2b !== bG2b) return aG2b - bG2b;
    return String(a.due_date).localeCompare(String(b.due_date));
  });
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
      .order("due_date", { ascending: true });

    if (error) {
      console.error("[fetchNotices] Supabase select error:", error);
      throw error;
    }

    const notices = sortNoticesForDisplay(
      sortRowsForDisplay((data ?? []).filter((row) => !isTestNotice(row)))
        .map(mapRowToNotice)
        .filter((notice) => isNoticeVisible(notice)),
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

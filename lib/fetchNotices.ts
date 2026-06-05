import { sampleNotices, type Notice, type NoticeCustomerInfo } from "@/data/sampleNotices";
import { evaluateMatchGrade } from "@/lib/noticeGrades";
import { buildNegativeSearchText, detectNegativeSignals } from "@/lib/noticeMatching";
import { isNoticeVisible, sortNoticesForDisplay } from "@/lib/noticeVisibility";
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type NoticeRow,
} from "@/lib/supabase";

/**
 * 서버 라우트(`/api/customer-accounts/match`)를 통해 매칭 결과만 받는다.
 * 고객사 마스터 전체가 브라우저에 노출되지 않도록, 화면에 보이는 공고들의
 * 기관명 목록만 서버에 보내고 매칭된 항목만 응답으로 받는다.
 */
type CustomerMatchPayload = {
  customerName: string;
  accountType: string | null;
  territory: string | null;
  regionGroup: string | null;
  region: string | null;
  matchType: "exact" | "normalized" | "contains";
};

async function fetchMatchedCustomers(
  agencies: string[],
): Promise<Record<string, CustomerMatchPayload>> {
  const unique = [...new Set(agencies.filter((a) => a && a.trim().length > 0))];
  if (unique.length === 0) return {};

  try {
    const res = await fetch("/api/customer-accounts/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agencies: unique }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[fetchNotices] /api/customer-accounts/match 실패:", res.status);
      return {};
    }
    const json = (await res.json()) as { matches?: Record<string, CustomerMatchPayload> };
    return json.matches ?? {};
  } catch (err) {
    console.warn("[fetchNotices] /api/customer-accounts/match 호출 예외:", err);
    return {};
  }
}

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

  // 하드웨어 납품성 / 단순 구매 시그널을 검사해 등급을 다운그레이드.
  // 점수(match_score)는 그대로 유지하고, matchGrade 만 negativeWeight 를 반영해 결정.
  const negativeText = buildNegativeSearchText({
    title: row.title,
    agency: row.agency,
    summary: row.summary,
    keywords,
    rawData: rawDataToText(row.raw_data),
  });
  const { weight: negativeWeight } = detectNegativeSignals(negativeText);

  // 내부 고객사 매칭은 서버에서 이미 처리되어 매칭된 항목만 내려왔다.
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

  return {
    id: String(row.id),
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
    sourceUrl: row.original_url ?? "https://www.g2b.go.kr/",
    customer,
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

    const rows = ((data ?? []) as NoticeRow[]).filter(
      (row) => isDisplayableSourceType(row.source_type) && !isTestNotice(row),
    );

    // 화면에 보일 후보 공고들의 기관명만 추려 서버 라우트에 보내고
    // 매칭된 항목만 응답으로 받는다. 고객사 마스터 자체는 브라우저에 노출되지 않는다.
    const agencies = rows.map((r) => (r.agency ?? "").trim()).filter((a) => a.length > 0);
    const matches = await fetchMatchedCustomers(agencies);

    const notices = sortNoticesForDisplay(rows.map((row) => mapRowToNotice(row, matches)));

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

import {
  mapPreSpecDbRowToAnnouncement,
  type PreSpecDbRow,
} from "@/lib/preSpec/fromDbRow";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";
import { getClientSupabaseDebugInfo } from "@/lib/supabaseDebug";
import { getSupabaseClient, getSupabaseConfigError } from "@/lib/supabase";

/** 입찰공고 fetchNotices 와 동일 — 화면 페이지네이션 전체 커버용 상한. */
export const PRE_SPEC_DISPLAY_FETCH_LIMIT = 1000;

export type PreSpecDataSource = "supabase" | "empty";

export type FetchPreSpecNoticesResult = {
  items: PreSpecAnnouncement[];
  source: PreSpecDataSource;
  error: string | null;
  /** Supabase 쿼리 raw row 수 (매핑 전). */
  rowCount: number;
};

export type PreSpecFetchDebugContext = {
  email?: string | null;
  role?: string | null;
  viewMode?: string;
  productFilter?: string;
  territoryFilter?: string;
  budgetFilter?: string;
};

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

/**
 * 사전규격공고 목록 — Supabase `pre_spec_notices` 에서 읽기 (입찰공고 fetchNotices 와 동일 패턴).
 *
 *  - 클라이언트 anon key + 로그인 세션 JWT 로 RLS 통과 SELECT.
 *  - G2B 외부 API / service role 은 사용하지 않는다.
 *  - raw_data 위에 normalize 를 재실행해 status / recommendation / products 를 최신 룰로 계산.
 */
export async function fetchPreSpecNotices(
  debug?: PreSpecFetchDebugContext,
): Promise<FetchPreSpecNoticesResult> {
  const configError = getSupabaseConfigError();
  if (configError) {
    console.error("[fetchPreSpecNotices] Supabase config error:", configError);
    return { items: [], source: "empty", error: configError, rowCount: 0 };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    const message = "Supabase 클라이언트를 생성하지 못했습니다.";
    console.error("[fetchPreSpecNotices]", message);
    return { items: [], source: "empty", error: message, rowCount: 0 };
  }

  const env = getClientSupabaseDebugInfo();
  console.log("[fetchPreSpecNotices] query start", {
    nodeEnv: env.nodeEnv,
    supabaseProjectRef: env.projectRef,
    supabaseMaskedUrl: env.maskedUrl,
    hasAnonKey: env.hasAnonKey,
    email: debug?.email ?? "(anonymous)",
    role: debug?.role ?? "(unknown)",
    table: "public.pre_spec_notices",
    limit: PRE_SPEC_DISPLAY_FETCH_LIMIT,
    filters: {
      viewMode: debug?.viewMode,
      productFilter: debug?.productFilter,
      territoryFilter: debug?.territoryFilter,
      budgetFilter: debug?.budgetFilter,
    },
  });

  try {
    const { data, error, count } = await supabase
      .from("pre_spec_notices")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(PRE_SPEC_DISPLAY_FETCH_LIMIT);

    if (error) {
      console.error("[fetchPreSpecNotices] Supabase select error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return {
        items: [],
        source: "empty",
        error: formatError(error),
        rowCount: 0,
      };
    }

    const rows = (data ?? []) as PreSpecDbRow[];
    const items = rows.map(mapPreSpecDbRowToAnnouncement);

    console.log("[fetchPreSpecNotices] query result", {
      nodeEnv: env.nodeEnv,
      supabaseProjectRef: env.projectRef,
      rowCount: rows.length,
      exactCount: count,
      mappedCount: items.length,
    });

    return {
      items,
      source: items.length > 0 ? "supabase" : "empty",
      error: null,
      rowCount: rows.length,
    };
  } catch (error) {
    const message = formatError(error);
    console.error("[fetchPreSpecNotices] request failed:", error);
    return { items: [], source: "empty", error: message, rowCount: 0 };
  }
}

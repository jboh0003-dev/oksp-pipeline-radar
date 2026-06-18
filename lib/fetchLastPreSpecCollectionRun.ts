import {
  getSupabaseClient,
  getSupabaseConfigError,
} from "@/lib/supabase";
import {
  normalizeCollectionRunRow,
  type LastCollectionRunResult,
} from "@/lib/fetchLastCollectionRun";

export type { LastCollectionRunResult };

/**
 * 사전규격 수집 이력 — collection_runs 에서 최근 1건.
 *
 * source 후보 (마이그레이션 호환):
 *  - pre_spec              : 표준 (cron auto / manual 공통)
 *  - cron:collect-g2b:prespec:* : legacy cron
 *  - manual:pre-spec       : legacy manual
 */
const PRESPEC_SOURCE_FILTER =
  "source.eq.pre_spec,source.like.cron:collect-g2b:prespec%,source.eq.manual:pre-spec";

function formatSupabaseError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code ? `code: ${e.code}` : undefined].filter(
      Boolean,
    );
    if (parts.length > 0) return parts.join(" | ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function fetchLastPreSpecCollectionRun(): Promise<LastCollectionRunResult> {
  const configError = getSupabaseConfigError();
  if (configError) {
    return { run: null, error: configError };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { run: null, error: "Supabase 클라이언트를 생성하지 못했습니다." };
  }

  try {
    const { data, error } = await supabase
      .from("collection_runs")
      .select("*")
      .or(PRESPEC_SOURCE_FILTER)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      return { run: null, error: formatSupabaseError(error) };
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return { run: null, error: null };
    return { run: normalizeCollectionRunRow(rows[0]), error: null };
  } catch (error) {
    return { run: null, error: formatSupabaseError(error) };
  }
}

/** 사전규격 수집 중 가장 최근 *성공* (ok=true) row. */
export async function fetchLastSuccessfulPreSpecRun(): Promise<LastCollectionRunResult> {
  const configError = getSupabaseConfigError();
  if (configError) return { run: null, error: configError };

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { run: null, error: "Supabase 클라이언트를 생성하지 못했습니다." };
  }

  try {
    const { data, error } = await supabase
      .from("collection_runs")
      .select("*")
      .or(PRESPEC_SOURCE_FILTER)
      .eq("ok", true)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) return { run: null, error: formatSupabaseError(error) };

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return { run: null, error: null };
    return { run: normalizeCollectionRunRow(rows[0]), error: null };
  } catch (error) {
    return { run: null, error: formatSupabaseError(error) };
  }
}

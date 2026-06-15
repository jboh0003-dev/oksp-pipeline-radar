import {
  getSupabaseClient,
  getSupabaseConfigError,
  type CollectionRunRow,
} from "@/lib/supabase";

export type LastCollectionRunResult = {
  /** 가장 최근 collection_runs row. 한 건도 없거나 조회 실패 시 null. */
  run: CollectionRunRow | null;
  /**
   * 조회 자체가 실패한 경우의 에러 메시지.
   * 예) 테이블 미생성, RLS, 환경변수 누락.
   * UI 에서는 "이력 없음" 과 "조회 실패" 를 구분해서 보여주려고 별도 필드로 둔다.
   */
  error: string | null;
};

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

function pickStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function normalizeRow(raw: Record<string, unknown>): CollectionRunRow {
  const rawMode = pickString(raw.mode);
  const mode: CollectionRunRow["mode"] =
    rawMode === "auto" || rawMode === "manual" ? rawMode : (rawMode ?? null);

  return {
    id: String(raw.id ?? ""),
    source: pickString(raw.source),
    mode,
    started_at: pickString(raw.started_at) ?? "",
    finished_at: pickString(raw.finished_at),
    ok: typeof raw.ok === "boolean" ? raw.ok : Boolean(raw.ok),
    target_count: pickNumber(raw.target_count),
    page_start: pickNumber(raw.page_start),
    page_end: pickNumber(raw.page_end),
    fetched_count: pickNumber(raw.fetched_count),
    matched_count: pickNumber(raw.matched_count),
    saved_count: pickNumber(raw.saved_count),
    inserted_count: pickNumber(raw.inserted_count),
    updated_count: pickNumber(raw.updated_count),
    skipped_expired_count: pickNumber(raw.skipped_expired_count),
    skipped_no_product_count: pickNumber(raw.skipped_no_product_count),
    errors: pickStringArray(raw.errors),
    // warnings / message 컬럼이 아직 마이그레이션 안 된 환경에서도
    // undefined 가 들어가도록 안전하게 추출.
    warnings: pickStringArray(raw.warnings),
    message: pickString(raw.message),
    created_at: pickString(raw.created_at),
  };
}

/**
 * collection_runs 테이블에서 가장 최근 1건을 가져온다.
 * - finished_at 우선, finished_at 이 null 인 row 는 created_at 기준으로 fallback 정렬.
 * - 일부 컬럼(warnings/message)이 마이그레이션되지 않은 환경에서도 깨지지 않도록
 *   `select('*')` 로 가져오고 클라이언트에서 키 존재 여부에 안전하게 매핑한다.
 */
export async function fetchLastCollectionRun(): Promise<LastCollectionRunResult> {
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
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      return { run: null, error: formatSupabaseError(error) };
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return { run: null, error: null };
    return { run: normalizeRow(rows[0]), error: null };
  } catch (error) {
    return { run: null, error: formatSupabaseError(error) };
  }
}

/**
 * collection_runs 에서 가장 최근 "성공"한 (ok=true) row 1건.
 *  - 화면의 "마지막 성공 수집" 표시 / stale 판정에 쓴다.
 *  - last attempt 와 별개로 추적하므로, 마지막 시도가 실패하더라도
 *    "데이터의 신선도" 는 마지막 성공 기준으로 계산할 수 있다.
 */
export async function fetchLastSuccessfulRun(): Promise<LastCollectionRunResult> {
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
      .eq("ok", true)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) return { run: null, error: formatSupabaseError(error) };

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return { run: null, error: null };
    return { run: normalizeRow(rows[0]), error: null };
  } catch (error) {
    return { run: null, error: formatSupabaseError(error) };
  }
}

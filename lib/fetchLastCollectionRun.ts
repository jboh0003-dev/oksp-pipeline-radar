import {
  getSupabaseClient,
  getSupabaseConfigError,
  type CollectionRunRow,
} from "@/lib/supabase";

export type LastCollectionRunResult = {
  /** 가장 최근 입찰공고 collection_runs row. 한 건도 없거나 조회 실패 시 null. */
  run: CollectionRunRow | null;
  /** 조회 자체가 실패한 경우의 에러 메시지. */
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

export function normalizeCollectionRunRow(raw: Record<string, unknown>): CollectionRunRow {
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
    warnings: pickStringArray(raw.warnings),
    message: pickString(raw.message),
    created_at: pickString(raw.created_at),
  };
}

/**
 * 메인 입찰공고 화면의 신선도에는 입찰 수집 이력만 사용한다.
 *
 * 기존 구현은 source 구분 없이 collection_runs 최신 1건을 읽어서,
 * 사전규격(pre_spec) 수집이 성공하면 입찰 자동수집이 실패해도 메인 화면을
 * "정상/최신"으로 오인할 수 있었다.
 */
function isBidCollectionSource(raw: Record<string, unknown>): boolean {
  const source = pickString(raw.source);
  if (!source) return false;
  if (source === "manual:collect-now") return true;
  if (!source.startsWith("cron:collect-g2b:")) return false;
  return !source.includes(":prespec");
}

async function fetchRecentBidRun(successOnly: boolean): Promise<LastCollectionRunResult> {
  const configError = getSupabaseConfigError();
  if (configError) return { run: null, error: configError };

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { run: null, error: "Supabase 클라이언트를 생성하지 못했습니다." };
  }

  try {
    let query = supabase
      .from("collection_runs")
      .select("*")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (successOnly) query = query.eq("ok", true);

    const { data, error } = await query;
    if (error) return { run: null, error: formatSupabaseError(error) };

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const row = rows.find(isBidCollectionSource);
    if (!row) return { run: null, error: null };
    return { run: normalizeCollectionRunRow(row), error: null };
  } catch (error) {
    return { run: null, error: formatSupabaseError(error) };
  }
}

/** 가장 최근 입찰공고 수집 시도 1건. */
export async function fetchLastCollectionRun(): Promise<LastCollectionRunResult> {
  return fetchRecentBidRun(false);
}

/** 가장 최근 성공한 입찰공고 수집 1건. */
export async function fetchLastSuccessfulRun(): Promise<LastCollectionRunResult> {
  return fetchRecentBidRun(true);
}

import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RESPONSE_SCHEMA_VERSION = 1;

/**
 * 수동 수집(Manual Collect) 엔드포인트.
 *
 * - 화면의 "지금 수집" 버튼이 호출한다.
 * - 자동수집(cron) 과 동일한 runCollect 로직을 재사용한다.
 * - 인증을 요구하지 않으므로(브라우저에서 직접 호출) Vercel Cron 만큼 빈번하게 호출되지 않도록
 *   1) 모듈 레벨 lock 으로 동시 실행을 1건으로 제한,
 *   2) 마지막 성공 후 60초 cool-down 을 둔다.
 * - 결과는 collection_runs 에 mode='manual' 로 기록한다.
 *
 * 보안 노트:
 *   CRON_SECRET 은 브라우저에 노출하면 안 되므로 이 엔드포인트는 secret 을 요구하지 않는다.
 *   대신 lock + cool-down 으로 abuse 를 막는다. 향후 사용자 인증을 도입하면
 *   여기서도 isAuthenticated 검사를 추가할 수 있다.
 */

const COOLDOWN_MS = 60 * 1000;

let isRunning = false;
let lastFinishedAt = 0;

const MANUAL_DEFAULTS = {
  targetCount: 100,
  lookbackDays: 30,
  pageStart: 1,
  pageEnd: 20,
} as const;

type ManualResult = {
  schemaVersion: number;
  ok: boolean;
  collectOk: boolean;
  message: string | null;
  mode: "manual";
  startedAt: string;
  finishedAt: string;
  targetCount: number;
  lookbackDays: number;
  pageStart: number;
  pageEnd: number;
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  insertedCount: number;
  updatedCount: number;
  activeProductMatchedCount: number;
  skippedExpiredCount: number;
  skippedNoProductCount: number;
  errors: string[];
  warnings: string[];
};

type CollectionRunInsertRow = {
  source: string;
  mode: "manual";
  started_at: string;
  finished_at: string;
  ok: boolean;
  target_count: number;
  page_start: number;
  page_end: number | null;
  fetched_count: number;
  matched_count: number;
  saved_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_expired_count: number;
  skipped_no_product_count: number;
  errors: string[];
  warnings: string[];
  message: string | null;
};

async function recordRun(row: CollectionRunInsertRow): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return "Supabase admin client 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)";
  }

  // 1차: 신규 컬럼 포함 그대로 insert.
  const firstAttempt = await supabase.from("collection_runs").insert(row as never);
  if (!firstAttempt.error) return null;

  const isMissingColumn =
    firstAttempt.error.message?.includes("mode") ||
    firstAttempt.error.message?.includes("inserted_count") ||
    firstAttempt.error.message?.includes("updated_count") ||
    firstAttempt.error.code === "42703";

  if (!isMissingColumn) {
    const e = firstAttempt.error;
    return [e.message, e.code, e.details, e.hint].filter(Boolean).join(" | ");
  }

  // 2차: 마이그레이션 전 환경 fallback. 신규 컬럼 제거 후 재시도.
  const { mode: _mode, inserted_count: _ic, updated_count: _uc, ...legacyRow } = row;
  void _mode;
  void _ic;
  void _uc;
  const retry = await supabase.from("collection_runs").insert(legacyRow as never);
  if (retry.error) {
    const e = retry.error;
    return [e.message, e.code, e.details, e.hint].filter(Boolean).join(" | ");
  }
  return null;
}

async function handleManual(_request: NextRequest) {
  if (isRunning) {
    return NextResponse.json(
      {
        ok: false,
        error: "이미 다른 수집이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 409 },
    );
  }

  const sinceLast = Date.now() - lastFinishedAt;
  if (lastFinishedAt > 0 && sinceLast < COOLDOWN_MS) {
    const remainingSec = Math.ceil((COOLDOWN_MS - sinceLast) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: `방금 수집이 완료됐습니다. ${remainingSec}초 후 다시 시도해 주세요.`,
      },
      { status: 429 },
    );
  }

  isRunning = true;
  const startedAt = new Date().toISOString();

  let body: CollectResponse | null = null;
  let runtimeError: string | null = null;
  try {
    const r = await runCollect({
      targetCount: MANUAL_DEFAULTS.targetCount,
      lookbackDays: MANUAL_DEFAULTS.lookbackDays,
      pageStart: MANUAL_DEFAULTS.pageStart,
      pageEnd: MANUAL_DEFAULTS.pageEnd,
    });
    body = r.body;
  } catch (err) {
    runtimeError = err instanceof Error ? err.message : String(err);
  } finally {
    isRunning = false;
    lastFinishedAt = Date.now();
  }

  const finishedAt = new Date().toISOString();

  const targetCount = body?.targetCount ?? MANUAL_DEFAULTS.targetCount;
  const lookbackDays = MANUAL_DEFAULTS.lookbackDays;
  const pageStart = body?.pageStart ?? MANUAL_DEFAULTS.pageStart;
  const pageEnd = body?.pageEnd ?? MANUAL_DEFAULTS.pageEnd;
  const fetchedCount = body?.fetchedCount ?? 0;
  const matchedCount = body?.matchedCount ?? 0;
  const savedCount = body?.savedCount ?? 0;
  const insertedCount = body?.insertedCount ?? 0;
  const updatedCount = body?.updatedCount ?? 0;
  const activeProductMatchedCount = body?.activeProductMatchedCount ?? 0;
  const skippedExpiredCount = body?.skippedExpiredCount ?? 0;
  const skippedNoProductCount = body?.skippedNoProductCount ?? 0;
  const errors = [...(body?.errors ?? [])];
  if (runtimeError) errors.push(`runCollect 예외: ${runtimeError}`);

  const ok = errors.length === 0;
  const collectOk = body?.ok ?? false;

  const warnings: string[] = [
    `mode=manual · pages ${pageStart}-${pageEnd} · lookback ${lookbackDays}일 · target ${targetCount}`,
  ];

  let message: string | null = null;
  if (ok && activeProductMatchedCount < targetCount) {
    message = "목표 건수에는 도달하지 못했지만, 수동 수집은 정상 실행되었습니다.";
  }

  const result: ManualResult = {
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    ok,
    collectOk,
    message,
    mode: "manual",
    startedAt,
    finishedAt,
    targetCount,
    lookbackDays,
    pageStart,
    pageEnd,
    fetchedCount,
    matchedCount,
    savedCount,
    insertedCount,
    updatedCount,
    activeProductMatchedCount,
    skippedExpiredCount,
    skippedNoProductCount,
    errors,
    warnings,
  };

  const recordError = await recordRun({
    source: "manual:collect-now",
    mode: "manual",
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    ok: result.ok,
    target_count: result.targetCount,
    page_start: result.pageStart,
    page_end: result.pageEnd,
    fetched_count: result.fetchedCount,
    matched_count: result.matchedCount,
    saved_count: result.savedCount,
    inserted_count: result.insertedCount,
    updated_count: result.updatedCount,
    skipped_expired_count: result.skippedExpiredCount,
    skipped_no_product_count: result.skippedNoProductCount,
    errors: result.errors,
    warnings: result.warnings,
    message: result.message,
  });

  if (recordError) {
    result.warnings.push(`collection_runs 기록 실패: ${recordError}`);
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return handleManual(request);
}

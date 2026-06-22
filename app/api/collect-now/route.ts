import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { adminFailResponse, requireAdmin } from "@/lib/apiAuth";
import { jsonFail, withApiRoute } from "@/lib/apiResponse";
import { getMissingSyncEnvVars, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RESPONSE_SCHEMA_VERSION = 2;

/**
 * 수동 수집(Manual Collect) 엔드포인트.
 *
 * - 화면의 "지금 수집" 버튼이 호출한다 (admin 사용자만 보임).
 * - 자동수집(cron) 과 동일한 runCollect 로직을 재사용한다.
 * - admin 인증 필요: Authorization: Bearer <Supabase access_token>.
 *   profile.role !== 'admin' 이면 403.
 * - 추가로 abuse 방지를 위해
 *   1) 모듈 레벨 lock 으로 동시 실행을 1건으로 제한,
 *   2) 마지막 성공 후 60초 cool-down 을 둔다.
 * - 결과는 collection_runs 에 mode='manual' 로 기록한다.
 *
 * GET /api/collect-now : POST 호출 전에 환경 점검(env / cool-down / lock 상태)을 위한 진단용.
 *  - GET 도 admin 만 호출 가능.
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
  /** 수동수집 자체의 성공 여부 (errors 가 없으면 true). DB 로그 실패는 별도 loggedToDb 로 본다. */
  ok: boolean;
  /** runCollect 내부 ok 값 (errors==0 && targetReached). */
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
  /** collection_runs 에 row 가 정상 기록되었는지. */
  loggedToDb: boolean;
  /** loggedToDb=false 일 때, 마지막 fallback 까지도 실패한 사유. */
  dbLogError: string | null;
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

/**
 * collection_runs 에 1건 insert.
 *
 * 환경별 마이그레이션 진행 정도가 다를 수 있어 progressive fallback 으로 시도한다:
 *   1) full payload  (mode + inserted/updated + warnings + message)
 *   2) drop {mode, inserted_count, updated_count}
 *   3) drop additionally {warnings, message}
 *   4) bare minimum (id 자동 생성, source/started_at/finished_at/ok/errors 만)
 *
 * 모든 단계가 실패해야 비로소 dbLogError 를 채워서 호출부에 알려준다.
 * 한 단계라도 성공하면 어떤 단계로 기록했는지 phase 를 반환한다.
 */
async function recordRun(
  row: CollectionRunInsertRow,
): Promise<{ ok: true; phase: "full" | "legacy" | "minimal" | "bare" } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Supabase admin client 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    };
  }

  type AnyRecord = Record<string, unknown>;
  const errorsLog: string[] = [];

  const tryInsert = async (label: string, payload: AnyRecord) => {
    const { error } = await supabase.from("collection_runs").insert(payload as never);
    if (!error) return null;
    const formatted = [error.message, error.code, error.details, error.hint]
      .filter(Boolean)
      .join(" | ");
    errorsLog.push(`[${label}] ${formatted}`);
    return formatted;
  };

  // 1) full
  const fullErr = await tryInsert("full", row as unknown as AnyRecord);
  if (!fullErr) return { ok: true, phase: "full" };

  // 2) drop new columns: mode / inserted_count / updated_count
  const { mode: _mode, inserted_count: _ic, updated_count: _uc, ...legacyRow } = row;
  void _mode;
  void _ic;
  void _uc;
  const legacyErr = await tryInsert("legacy", legacyRow as unknown as AnyRecord);
  if (!legacyErr) return { ok: true, phase: "legacy" };

  // 3) drop additionally warnings / message
  const {
    warnings: _w,
    message: _m,
    ...minimalRow
  } = legacyRow as unknown as AnyRecord & { warnings?: unknown; message?: unknown };
  void _w;
  void _m;
  const minimalErr = await tryInsert("minimal", minimalRow);
  if (!minimalErr) return { ok: true, phase: "minimal" };

  // 4) bare: 가장 오래된 컬럼 셋. saved/fetched/matched 는 numeric 으로만 유지.
  const bareRow: AnyRecord = {
    source: row.source,
    started_at: row.started_at,
    finished_at: row.finished_at,
    ok: row.ok,
    fetched_count: row.fetched_count,
    matched_count: row.matched_count,
    saved_count: row.saved_count,
    errors: row.errors,
  };
  const bareErr = await tryInsert("bare", bareRow);
  if (!bareErr) return { ok: true, phase: "bare" };

  return { ok: false, error: errorsLog.join(" || ") };
}

async function handleManual(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);

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

  // 환경변수 사전 점검 — runCollect 가 던지는 errors[] 에도 포함되지만, 진단성을 위해 먼저 한 번 확인.
  const missingEnv = getMissingSyncEnvVars();
  if (missingEnv.length > 0) {
    console.error(
      "[/api/collect-now] missing required env vars:",
      missingEnv.join(", "),
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
    console.error("[/api/collect-now] runCollect threw:", runtimeError);
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

  const insertResult = await recordRun({
    source: "manual:collect-now",
    mode: "manual",
    started_at: startedAt,
    finished_at: finishedAt,
    ok,
    target_count: targetCount,
    page_start: pageStart,
    page_end: pageEnd,
    fetched_count: fetchedCount,
    matched_count: matchedCount,
    saved_count: savedCount,
    inserted_count: insertedCount,
    updated_count: updatedCount,
    skipped_expired_count: skippedExpiredCount,
    skipped_no_product_count: skippedNoProductCount,
    errors,
    warnings,
    message,
  });

  let loggedToDb = false;
  let dbLogError: string | null = null;
  if (insertResult.ok) {
    loggedToDb = true;
    if (insertResult.phase !== "full") {
      warnings.push(
        `collection_runs 기록은 성공했지만 일부 컬럼은 누락되어 ${insertResult.phase} fallback 으로 저장됨. ` +
          `Supabase SQL Editor 에서 supabase/collection_runs.sql 을 실행해 mode/inserted_count/updated_count 컬럼을 추가해 주세요.`,
      );
    }
  } else {
    dbLogError = insertResult.error;
    warnings.push(`collection_runs 기록 실패 (모든 fallback 실패): ${insertResult.error}`);
    console.error("[/api/collect-now] recordRun failed all attempts:", insertResult.error);
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
    loggedToDb,
    dbLogError,
  };

  return NextResponse.json(result);
}

/**
 * GET /api/collect-now : 환경 점검용. 클릭 전에 시스템 준비 상태를 보고 싶을 때 사용.
 * (실제 수집은 트리거하지 않는다.)
 *
 * admin 만 호출 가능.
 */
async function handleEnvProbe(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);

  const missingEnv = getMissingSyncEnvVars();
  const supabase = getSupabaseAdmin();

  let collectionRunsAccessible = false;
  let collectionRunsError: string | null = null;
  if (supabase) {
    const { error } = await supabase.from("collection_runs").select("id").limit(1);
    if (error) {
      collectionRunsError = [error.message, error.code, error.details, error.hint]
        .filter(Boolean)
        .join(" | ");
    } else {
      collectionRunsAccessible = true;
    }
  } else {
    collectionRunsError = "Supabase admin client 생성 실패 (env 누락)";
  }

  const cooldownRemainingMs = Math.max(0, COOLDOWN_MS - (Date.now() - lastFinishedAt));

  return NextResponse.json({
    ok: true,
    data: {
      ready: missingEnv.length === 0 && collectionRunsAccessible,
      missingEnv,
      isRunning,
      cooldownRemainingMs: lastFinishedAt > 0 ? cooldownRemainingMs : 0,
      collectionRunsAccessible,
      collectionRunsError,
      defaults: MANUAL_DEFAULTS,
    },
  });
}

export async function POST(request: NextRequest) {
  return withApiRoute("/api/collect-now POST", () => handleManual(request));
}

export async function GET(request: NextRequest) {
  return withApiRoute("/api/collect-now GET", () => handleEnvProbe(request));
}

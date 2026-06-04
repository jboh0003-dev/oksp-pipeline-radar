import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 응답 스키마 버전. 클라이언트가 cron 응답 형태(ok / collectOk / targetReached 등)를
// 식별할 때 사용. 응답 구조가 바뀌면 이 값도 함께 올린다.
const CRON_RESPONSE_SCHEMA_VERSION = 2;

const DEFAULTS = {
  targetCount: 30,
  lookbackDays: 30,
  pageStart: 1,
  pageEnd: 3,
} as const;

type CronResult = {
  /** 응답 스키마 버전. */
  schemaVersion: number;
  /**
   * 자동수집 "실행" 성공 여부.
   * - 인증 통과
   * - runCollect()가 예외 없이 끝남
   * - 치명적 errors[] 가 비어있음
   * 이 세 가지만 충족하면 true. savedCount/targetCount 는 영향을 주지 않는다.
   */
  ok: boolean;
  /**
   * runCollect() 내부 판정값. (errors == 0 && targetReached)
   * 영업/품질 모니터링용. ok 와는 별개이며 dashboard 신호로는 사용하지 않는 것을 권장.
   */
  collectOk: boolean;
  /**
   * activeProductMatchedCount >= targetCount 충족 여부.
   * false 라도 ok 는 true 가 될 수 있다.
   */
  targetReached: boolean;
  /** 사람이 읽기 위한 안내 메시지 (목표 미달성 등). */
  message: string | null;
  startedAt: string;
  finishedAt: string;
  targetCount: number;
  pageStart: number;
  pageEnd: number | null;
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  activeProductMatchedCount: number;
  skippedExpiredCount: number;
  skippedNoProductCount: number;
  /** 치명적 오류만. 비어있을 때 ok=true. */
  errors: string[];
  /**
   * 부수 경고. 수집은 되었으나 알아둘 만한 사항.
   * 예) collection_runs 기록 실패, targetCount 미달성.
   * 여기에만 들어가는 항목은 ok 판정에 영향을 주지 않는다.
   */
  warnings: string[];
};

type CollectionRunRow = {
  source: string;
  started_at: string;
  finished_at: string;
  ok: boolean;
  target_count: number;
  page_start: number;
  page_end: number | null;
  fetched_count: number;
  matched_count: number;
  saved_count: number;
  skipped_expired_count: number;
  skipped_no_product_count: number;
  errors: string[];
};

/**
 * Authorization: Bearer <CRON_SECRET> 또는 x-cron-secret: <CRON_SECRET>
 * 둘 중 하나라도 일치하면 통과. 둘 다 일치하지 않으면 401.
 */
function isAuthorized(request: NextRequest, expected: string): boolean {
  const bearerHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const bearerMatch = bearerHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1].trim() === expected) {
    return true;
  }

  const cronSecretHeader =
    request.headers.get("x-cron-secret") ?? request.headers.get("X-Cron-Secret") ?? "";
  if (cronSecretHeader.trim() === expected) {
    return true;
  }

  return false;
}

/**
 * collection_runs 테이블이 만들어져 있을 때만 기록한다.
 * 테이블이 없거나 권한 문제로 실패해도 cron 응답은 그대로 반환하며,
 * 그 사실은 warnings에만 누적시켜 ok 플래그에는 영향이 없게 한다.
 */
async function recordRun(row: CollectionRunRow): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return "Supabase admin client 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)";
  }

  const { error } = await supabase.from("collection_runs").insert(row as never);

  if (error) {
    return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
  }
  return null;
}

async function handleCron(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET 환경변수가 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }

  if (!isAuthorized(request, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  // runCollect 가 예외를 던지더라도 cron 응답은 안정적으로 내려가도록 try/catch 로 감싼다.
  let body: CollectResponse | null = null;
  let runtimeError: string | null = null;
  try {
    const r = await runCollect({
      targetCount: DEFAULTS.targetCount,
      lookbackDays: DEFAULTS.lookbackDays,
      pageStart: DEFAULTS.pageStart,
      pageEnd: DEFAULTS.pageEnd,
    });
    body = r.body;
  } catch (err) {
    runtimeError = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date().toISOString();

  const targetCount = body?.targetCount ?? DEFAULTS.targetCount;
  const pageStart = body?.pageStart ?? DEFAULTS.pageStart;
  const pageEnd = body?.pageEnd ?? DEFAULTS.pageEnd;
  const fetchedCount = body?.fetchedCount ?? 0;
  const matchedCount = body?.matchedCount ?? 0;
  const savedCount = body?.savedCount ?? 0;
  const activeProductMatchedCount = body?.activeProductMatchedCount ?? 0;
  const skippedExpiredCount = body?.skippedExpiredCount ?? 0;
  const skippedNoProductCount = body?.skippedNoProductCount ?? 0;
  const collectErrors = [...(body?.errors ?? [])];
  if (runtimeError) {
    collectErrors.push(`runCollect 예외: ${runtimeError}`);
  }

  const targetReached = activeProductMatchedCount >= targetCount;
  const collectOk = body?.ok ?? false;

  // ok = "자동수집 실행 성공 여부".
  // errors 가 비어 있으면 savedCount=0 이라도 자동수집 자체는 정상으로 본다.
  const ok = collectErrors.length === 0;

  const warnings: string[] = [];
  let message: string | null = null;
  if (ok && !targetReached) {
    message = "목표 건수에는 도달하지 못했지만, 수집은 정상 실행되었습니다.";
    warnings.push(
      `targetCount 미달성 (active=${activeProductMatchedCount}, target=${targetCount})`,
    );
  }

  const result: CronResult = {
    schemaVersion: CRON_RESPONSE_SCHEMA_VERSION,
    ok,
    collectOk,
    targetReached,
    message,
    startedAt,
    finishedAt,
    targetCount,
    pageStart,
    pageEnd,
    fetchedCount,
    matchedCount,
    savedCount,
    activeProductMatchedCount,
    skippedExpiredCount,
    skippedNoProductCount,
    errors: collectErrors,
    warnings,
  };

  const recordError = await recordRun({
    source: "cron:collect-g2b",
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    ok: result.ok, // collection_runs 에도 "자동수집 실행 성공 여부" 를 그대로 기록.
    target_count: result.targetCount,
    page_start: result.pageStart,
    page_end: result.pageEnd,
    fetched_count: result.fetchedCount,
    matched_count: result.matchedCount,
    saved_count: result.savedCount,
    skipped_expired_count: result.skippedExpiredCount,
    skipped_no_product_count: result.skippedNoProductCount,
    errors: result.errors,
  });

  if (recordError) {
    result.warnings.push(`collection_runs 기록 실패: ${recordError}`);
  }

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

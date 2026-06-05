import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 응답 스키마 버전. 클라이언트가 cron 응답 형태(ok / collectOk / targetReached / slot 등)를
// 식별할 때 사용. 응답 구조가 바뀌면 이 값도 함께 올린다.
const CRON_RESPONSE_SCHEMA_VERSION = 3;

/**
 * 자동수집 슬롯 정의.
 *
 * - morning : 한국시간 08:30 (UTC 23:30) — 1~20 페이지
 * - noon    : 한국시간 12:30 (UTC 03:30) — 21~40 페이지
 *
 * 두 슬롯 모두 lookbackDays 30, targetCount 100 으로 동일 정책.
 * 하루 2회로 페이지 범위만 분담해 누적 커버리지를 넓힌다.
 */
type Slot = "morning" | "noon";

const SLOT_PROFILES: Record<Slot, { pageStart: number; pageEnd: number }> = {
  morning: { pageStart: 1, pageEnd: 20 },
  noon: { pageStart: 21, pageEnd: 40 },
};

const DEFAULTS = {
  targetCount: 100,
  lookbackDays: 30,
} as const;

/**
 * slot 결정 우선순위:
 *  1) `?slot=morning|noon` query string (vercel.json cron 정의에서 명시)
 *  2) UTC hour 기준 fallback (Vercel cron 디스패치가 약간 늦어지거나 query 가 빠진 경우)
 *  3) 그 외 수동 호출 등 → "morning" 기본
 */
function pickSlot(request: NextRequest): { slot: Slot; reason: "query" | "utc-hour" | "default" } {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("slot");
  if (fromQuery === "morning" || fromQuery === "noon") {
    return { slot: fromQuery, reason: "query" };
  }

  const utcHour = new Date().getUTCHours();
  // 23:30 UTC = morning slot, 03:30 UTC = noon slot.
  // 디스패치 지연/타임존 grace 를 위해 인접 시각도 같은 슬롯으로 매핑.
  if (utcHour === 23 || utcHour === 0) {
    return { slot: "morning", reason: "utc-hour" };
  }
  if (utcHour === 3 || utcHour === 4) {
    return { slot: "noon", reason: "utc-hour" };
  }
  return { slot: "morning", reason: "default" };
}

type CronResult = {
  schemaVersion: number;
  /** 자동수집 "실행" 성공 여부. 인증 통과 + runCollect 정상 종료 + errors[] 비어있음. */
  ok: boolean;
  /** runCollect 내부 판정값. (errors == 0 && targetReached) — 영업/품질 지표용. */
  collectOk: boolean;
  /** activeProductMatchedCount >= targetCount 충족 여부. */
  targetReached: boolean;
  /** 사람이 읽기 위한 안내 메시지 (목표 미달성 등). */
  message: string | null;
  /** 이번 실행에 사용된 slot. */
  slot: Slot;
  startedAt: string;
  finishedAt: string;
  targetCount: number;
  lookbackDays: number;
  pageStart: number;
  pageEnd: number | null;
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  activeProductMatchedCount: number;
  skippedExpiredCount: number;
  skippedNoProductCount: number;
  errors: string[];
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
  warnings: string[];
  message: string | null;
};

/**
 * Authorization: Bearer <CRON_SECRET> 또는 x-cron-secret: <CRON_SECRET>.
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
 * 실패해도 cron 응답은 그대로 반환하며, 사실은 warnings 에만 누적시켜 ok 에 영향이 없게 한다.
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

  const { slot, reason: slotReason } = pickSlot(request);
  const profile = SLOT_PROFILES[slot];
  const startedAt = new Date().toISOString();

  // runCollect 가 예외를 던지더라도 cron 응답은 안정적으로 내려가도록 try/catch 로 감싼다.
  let body: CollectResponse | null = null;
  let runtimeError: string | null = null;
  try {
    const r = await runCollect({
      targetCount: DEFAULTS.targetCount,
      lookbackDays: DEFAULTS.lookbackDays,
      pageStart: profile.pageStart,
      pageEnd: profile.pageEnd,
    });
    body = r.body;
  } catch (err) {
    runtimeError = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date().toISOString();

  const targetCount = body?.targetCount ?? DEFAULTS.targetCount;
  // CollectResponse 에는 lookbackDays 가 들어있지 않다. 우리가 호출 시 넘긴 값을 그대로 기록.
  const lookbackDays = DEFAULTS.lookbackDays;
  const pageStart = body?.pageStart ?? profile.pageStart;
  const pageEnd = body?.pageEnd ?? profile.pageEnd;
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
  // slot/range 가시성을 위해 항상 첫 줄에 실행 컨텍스트를 남긴다.
  warnings.push(
    `slot=${slot} · pages ${pageStart}-${pageEnd ?? "-"} · lookback ${lookbackDays}일 · target ${targetCount} (slotSource=${slotReason})`,
  );

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
    slot,
    startedAt,
    finishedAt,
    targetCount,
    lookbackDays,
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

  // collection_runs.source 에 slot 을 인코딩해 화면 카드가 슬롯을 식별할 수 있게 한다.
  // (예: "cron:collect-g2b:morning"). 기존 컬럼 재사용으로 스키마 변경 불필요.
  const recordError = await recordRun({
    source: `cron:collect-g2b:${slot}`,
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    ok: result.ok,
    target_count: result.targetCount,
    page_start: result.pageStart,
    page_end: result.pageEnd,
    fetched_count: result.fetchedCount,
    matched_count: result.matchedCount,
    saved_count: result.savedCount,
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

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSupabaseDebugInfo } from "@/lib/supabaseDebug";
import {
  DEFAULT_PRE_SPEC_CATEGORIES,
  fetchPreSpecAnnouncements,
  getInquiryRangeYyyymmdd,
} from "@/lib/preSpec/api";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import { upsertPreSpecNotices, type PreSpecUpsertSummary } from "@/lib/preSpec/persist";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 응답 스키마 버전. 클라이언트가 cron 응답 형태(ok / collectOk / targetReached / slot 등)를
// 식별할 때 사용. 응답 구조가 바뀌면 이 값도 함께 올린다.
const CRON_RESPONSE_SCHEMA_VERSION = 3;

/**
 * 자동수집 슬롯 정의.
 *
 *  - daily     : 한국시간 08:30 (UTC 23:30) — 1~40 페이지 (현재 운영 기준)
 *  - morning   : (legacy) 1~20 페이지 — 과거 morning 슬롯 호출 호환
 *  - afternoon : (legacy) 21~40 페이지 — 과거 afternoon 슬롯 호출 호환
 *  - noon      : (legacy) 21~40 페이지 — 과거 noon 슬롯 호출 호환
 *
 * 운영은 매일 1회(daily) 로 단순화했고, legacy 슬롯은 호출되더라도 안전하게 동작하도록 유지.
 * 모든 슬롯이 lookbackDays 30, targetCount 100 동일.
 */
type Slot = "daily" | "morning" | "afternoon" | "noon";

const SLOT_PROFILES: Record<Slot, { pageStart: number; pageEnd: number }> = {
  daily: { pageStart: 1, pageEnd: 40 },
  morning: { pageStart: 1, pageEnd: 20 },
  afternoon: { pageStart: 21, pageEnd: 40 },
  // legacy 호환.
  noon: { pageStart: 21, pageEnd: 40 },
};

const DEFAULTS = {
  targetCount: 100,
  lookbackDays: 30,
} as const;

/**
 * slot 결정 우선순위:
 *  1) `?slot=daily|morning|afternoon|noon` query string (vercel.json cron 정의에서 명시)
 *  2) UTC hour 기준 fallback (Vercel cron 디스패치가 약간 늦어지거나 query 가 빠진 경우)
 *  3) 그 외 수동 호출 등 → "daily" 기본
 */
function pickSlot(request: NextRequest): {
  slot: Slot;
  reason: "query" | "utc-hour" | "default";
} {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("slot");
  if (
    fromQuery === "daily" ||
    fromQuery === "morning" ||
    fromQuery === "afternoon" ||
    fromQuery === "noon"
  ) {
    return { slot: fromQuery, reason: "query" };
  }

  const utcHour = new Date().getUTCHours();
  // 23:30 UTC = daily slot (KST 08:30).
  if (utcHour === 23 || utcHour === 0) {
    return { slot: "daily", reason: "utc-hour" };
  }
  // 05:00 UTC = afternoon slot (legacy).
  if (utcHour === 5 || utcHour === 6) {
    return { slot: "afternoon", reason: "utc-hour" };
  }
  // 03~04 UTC = noon slot (legacy).
  if (utcHour === 3 || utcHour === 4) {
    return { slot: "afternoon", reason: "utc-hour" };
  }
  return { slot: "daily", reason: "default" };
}

type CronResult = {
  schemaVersion: number;
  /** 자동수집 "실행" 성공 여부. 입찰 + 사전규격 모두 errors[] 비어있음. */
  ok: boolean;
  /** runCollect 내부 판정값. (errors == 0 && targetReached) — 영업/품질 지표용. */
  collectOk: boolean;
  /** activeProductMatchedCount >= targetCount 충족 여부. */
  targetReached: boolean;
  /** 사람이 읽기 위한 안내 메시지 (목표 미달성 등). */
  message: string | null;
  /** 이번 실행에 사용된 slot. */
  slot: Slot;
  /** 실행 방식. cron 라우트는 항상 "auto". */
  mode: "auto";
  /** 이번 실행에서 수집한 대상. cron 은 항상 "all". */
  target: "all" | "bid" | "prespec";
  startedAt: string;
  finishedAt: string;
  targetCount: number;
  lookbackDays: number;
  pageStart: number;
  pageEnd: number | null;
  // 입찰공고 결과.
  bid: {
    ok: boolean;
    fetchedCount: number;
    matchedCount: number;
    savedCount: number;
    insertedCount: number;
    updatedCount: number;
    activeProductMatchedCount: number;
    skippedExpiredCount: number;
    skippedNoProductCount: number;
    errors: string[];
  };
  // 사전규격공고 결과.
  prespec: {
    ok: boolean;
    fetchedCount: number;
    matchedCount: number;
    insertedCount: number;
    updatedCount: number;
    urlPatched: number;
    skipped: number;
    serviceKeySource: string | null;
    tableMissing: boolean;
    errors: string[];
  };
  // 합계 (입찰 + 사전규격).
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

type CollectionRunRow = {
  source: string;
  mode: "auto" | "manual";
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
 *
 * 환경별 마이그레이션 진행 정도가 달라도 견디도록 progressive fallback 으로 시도한다:
 *   1) full payload  (mode + inserted/updated + warnings + message)
 *   2) drop {mode, inserted_count, updated_count}
 *   3) drop additionally {warnings, message}
 *   4) bare minimum (source/started_at/finished_at/ok/errors/fetched/matched/saved 만)
 */
async function recordRun(
  row: CollectionRunRow,
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

  // 4) bare minimum
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

/**
 * 입찰공고 수집 wrapper. 실패해도 throw 하지 않고 body=null + runtimeError 형태로 반환.
 */
async function runBidCollect(
  pageStart: number,
  pageEnd: number,
): Promise<{ body: CollectResponse | null; runtimeError: string | null }> {
  try {
    const r = await runCollect({
      targetCount: DEFAULTS.targetCount,
      lookbackDays: DEFAULTS.lookbackDays,
      pageStart,
      pageEnd,
    });
    return { body: r.body, runtimeError: null };
  } catch (err) {
    return {
      body: null,
      runtimeError: err instanceof Error ? err.message : String(err),
    };
  }
}

type PreSpecCollectResult = {
  /** 정규화 + dedup 끝난 항목 수. */
  matchedCount: number;
  /** raw items 수 (dedup 전). */
  fetchedCount: number;
  upsert: PreSpecUpsertSummary | null;
  /** 단일 fatal 메시지 (활용 안 됐을 때 등). */
  errors: string[];
  /** durationMs. */
  durationMs: number;
  /** 사용된 ServiceKey 의 출처 env var 이름. 진단용. */
  serviceKeySource: string | null;
};

/**
 * 사전규격공고 수집 + DB upsert.
 *
 *  - ServiceKey 가 없으면 errors 에 기록하고 즉시 반환.
 *  - 페이지 단위 에러는 errors 에 모두 누적.
 *  - 정규화 실패는 errors 에 누적 후 다음 항목으로 진행.
 *  - 마지막에 pre_spec_notices 테이블에 upsert.
 */
async function runPreSpecCollect(): Promise<PreSpecCollectResult> {
  const startedAt = Date.now();
  const result: PreSpecCollectResult = {
    matchedCount: 0,
    fetchedCount: 0,
    upsert: null,
    errors: [],
    durationMs: 0,
    serviceKeySource: null,
  };

  const keyResolution = resolvePreSpecServiceKey();
  if (!keyResolution.present) {
    result.errors.push(
      "사전규격 ServiceKey 누락 (NARA_PRESPEC_API_KEY / G2B_PRESPEC_SERVICE_KEY / G2B_SERVICE_KEY 중 하나 필요)",
    );
    result.durationMs = Date.now() - startedAt;
    return result;
  }
  result.serviceKeySource = keyResolution.source;

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(7);

  let raw;
  try {
    raw = await fetchPreSpecAnnouncements(keyResolution.key, {
      inqryBgnDt,
      inqryEndDt,
      categories: DEFAULT_PRE_SPEC_CATEGORIES,
      maxPagesPerCategory: 5,
      concurrency: 3,
    });
  } catch (err) {
    result.errors.push(
      `사전규격 fetchPreSpecAnnouncements 예외: ${err instanceof Error ? err.message : String(err)}`,
    );
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  result.fetchedCount = raw.items.length;
  for (const e of raw.errors) result.errors.push(`사전규격 수집 페이지 에러: ${e}`);

  // 정규화 + dedup.
  const items: PreSpecAnnouncement[] = [];
  const seen = new Set<string>();
  let i = 0;
  for (const rawItem of raw.items) {
    const fallback = `pre-spec-${i++}`;
    let norm: PreSpecAnnouncement;
    try {
      const meta = rawItem as { __sourceApi?: string; __sourceEndpoint?: string };
      norm = normalizePreSpecItem(rawItem, fallback, {
        sourceApi: meta.__sourceApi,
        sourceEndpoint: meta.__sourceEndpoint,
      });
    } catch (err) {
      result.errors.push(
        `사전규격 정규화 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    if (!norm.announcementKey || seen.has(norm.announcementKey)) continue;
    seen.add(norm.announcementKey);
    items.push(norm);
  }
  result.matchedCount = items.length;

  // DB upsert. 테이블이 없거나 RLS 차단이어도 errors 에만 누적.
  try {
    result.upsert = await upsertPreSpecNotices(items);
    for (const e of result.upsert.errors) result.errors.push(`사전규격 DB 저장: ${e}`);
  } catch (err) {
    result.errors.push(
      `사전규격 upsert 예외: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  result.durationMs = Date.now() - startedAt;
  return result;
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

  const serverDebug = getServerSupabaseDebugInfo();
  console.log("[/api/cron/collect-g2b] start", {
    nodeEnv: serverDebug.nodeEnv,
    supabaseProjectRef: serverDebug.serviceUrl.projectRef,
    supabaseMaskedUrl: serverDebug.serviceUrl.maskedUrl,
    hasServiceRoleKey: serverDebug.hasServiceRoleKey,
    slot,
    slotReason,
    scheduleNote: "KST 08:30 = UTC 23:30 (vercel.json 30 23 * * *)",
  });

  // 입찰공고와 사전규격을 병렬 실행 — 한쪽이 실패해도 다른쪽은 계속 시도.
  const [bidResult, preSpecResult] = await Promise.all([
    runBidCollect(profile.pageStart, profile.pageEnd),
    runPreSpecCollect(),
  ]);
  const body: CollectResponse | null = bidResult.body;
  const runtimeError: string | null = bidResult.runtimeError;

  const finishedAt = new Date().toISOString();

  const targetCount = body?.targetCount ?? DEFAULTS.targetCount;
  const lookbackDays = DEFAULTS.lookbackDays;
  const pageStart = body?.pageStart ?? profile.pageStart;
  const pageEnd = body?.pageEnd ?? profile.pageEnd;

  // 입찰공고 분.
  const bidFetchedCount = body?.fetchedCount ?? 0;
  const bidMatchedCount = body?.matchedCount ?? 0;
  const bidSavedCount = body?.savedCount ?? 0;
  const bidInsertedCount = body?.insertedCount ?? 0;
  const bidUpdatedCount = body?.updatedCount ?? 0;
  const activeProductMatchedCount = body?.activeProductMatchedCount ?? 0;
  const skippedExpiredCount = body?.skippedExpiredCount ?? 0;
  const skippedNoProductCount = body?.skippedNoProductCount ?? 0;
  const bidErrors = [...(body?.errors ?? [])];
  if (runtimeError) bidErrors.push(`runCollect 예외: ${runtimeError}`);
  const bidOk = bidErrors.length === 0;

  // 사전규격공고 분.
  const preSpecOk = preSpecResult.errors.length === 0;
  const preSpecInserted = preSpecResult.upsert?.inserted ?? 0;
  const preSpecUpdated = preSpecResult.upsert?.updated ?? 0;
  const preSpecUrlPatched = preSpecResult.upsert?.urlPatched ?? 0;
  const preSpecSkipped = preSpecResult.upsert?.skipped ?? 0;
  const preSpecTableMissing = preSpecResult.upsert?.tableMissing ?? false;

  // 합계 (입찰 + 사전규격).
  const fetchedCount = bidFetchedCount + preSpecResult.fetchedCount;
  const matchedCount = bidMatchedCount + preSpecResult.matchedCount;
  const savedCount = bidSavedCount + preSpecInserted + preSpecUpdated;
  const insertedCount = bidInsertedCount + preSpecInserted;
  const updatedCount = bidUpdatedCount + preSpecUpdated;
  const collectErrors = [...bidErrors, ...preSpecResult.errors];

  const targetReached = activeProductMatchedCount >= targetCount;
  const collectOk = (body?.ok ?? false) && preSpecOk;

  // ok = "자동수집 실행 성공 여부".
  // 입찰/사전규격 양쪽이 모두 errors[]==0 이면 ok=true.
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
    mode: "auto",
    target: "all",
    startedAt,
    finishedAt,
    targetCount,
    lookbackDays,
    pageStart,
    pageEnd,
    bid: {
      ok: bidOk,
      fetchedCount: bidFetchedCount,
      matchedCount: bidMatchedCount,
      savedCount: bidSavedCount,
      insertedCount: bidInsertedCount,
      updatedCount: bidUpdatedCount,
      activeProductMatchedCount,
      skippedExpiredCount,
      skippedNoProductCount,
      errors: bidErrors,
    },
    prespec: {
      ok: preSpecOk,
      fetchedCount: preSpecResult.fetchedCount,
      matchedCount: preSpecResult.matchedCount,
      insertedCount: preSpecInserted,
      updatedCount: preSpecUpdated,
      urlPatched: preSpecUrlPatched,
      skipped: preSpecSkipped,
      serviceKeySource: preSpecResult.serviceKeySource,
      tableMissing: preSpecTableMissing,
      errors: preSpecResult.errors,
    },
    fetchedCount,
    matchedCount,
    savedCount,
    insertedCount,
    updatedCount,
    activeProductMatchedCount,
    skippedExpiredCount,
    skippedNoProductCount,
    errors: collectErrors,
    warnings,
  };

  if (preSpecTableMissing) {
    warnings.push(
      "pre_spec_notices 테이블이 없습니다. supabase/pre_spec_notices.sql 을 실행해 주세요. " +
        "(테이블이 없어도 cron 자동수집은 계속 동작하며, 사전규격 화면은 API fresh fetch 로 표시됩니다.)",
    );
  }

  // collection_runs 에 입찰/사전규격 각각 1건씩 기록.
  //  - source 컬럼에 target 을 인코딩 ("cron:collect-g2b:bid:daily", "cron:collect-g2b:prespec:daily").
  //  - 화면의 "최근 수집" 카드는 source 가 "cron:collect-g2b:bid" 인 row 만 읽어 기존 동작과 호환.
  const bidInsert = await recordRun({
    source: `cron:collect-g2b:bid:${slot}`,
    mode: "auto",
    started_at: startedAt,
    finished_at: finishedAt,
    ok: bidOk,
    target_count: targetCount,
    page_start: pageStart,
    page_end: pageEnd,
    fetched_count: bidFetchedCount,
    matched_count: bidMatchedCount,
    saved_count: bidSavedCount,
    inserted_count: bidInsertedCount,
    updated_count: bidUpdatedCount,
    skipped_expired_count: skippedExpiredCount,
    skipped_no_product_count: skippedNoProductCount,
    errors: bidErrors,
    warnings: [`target=bid · slot=${slot} · slotSource=${slotReason}`],
    message: bidOk ? null : "입찰공고 수집 중 일부 실패",
  });

  // 화면의 "최근 수집" 카드 호환성을 위해 기존 source key 도 함께 기록 (입찰만).
  // 신규 화면은 :bid:slot, 구 화면은 :slot 패턴을 읽으므로 둘 다 채운다.
  const legacyBidInsert = await recordRun({
    source: `cron:collect-g2b:${slot}`,
    mode: "auto",
    started_at: startedAt,
    finished_at: finishedAt,
    ok: bidOk,
    target_count: targetCount,
    page_start: pageStart,
    page_end: pageEnd,
    fetched_count: bidFetchedCount,
    matched_count: bidMatchedCount,
    saved_count: bidSavedCount,
    inserted_count: bidInsertedCount,
    updated_count: bidUpdatedCount,
    skipped_expired_count: skippedExpiredCount,
    skipped_no_product_count: skippedNoProductCount,
    errors: bidErrors,
    warnings: [
      `slot=${slot} · pages ${pageStart}-${pageEnd ?? "-"} · lookback ${lookbackDays}일 · target ${targetCount} (slotSource=${slotReason})`,
    ],
    message: bidOk ? null : "입찰공고 수집 중 일부 실패",
  });

  const preSpecInsert = await recordRun({
    source: `cron:collect-g2b:prespec:${slot}`,
    mode: "auto",
    started_at: startedAt,
    finished_at: finishedAt,
    ok: preSpecOk,
    target_count: 0,
    page_start: 1,
    page_end: null,
    fetched_count: preSpecResult.fetchedCount,
    matched_count: preSpecResult.matchedCount,
    saved_count: preSpecInserted + preSpecUpdated,
    inserted_count: preSpecInserted,
    updated_count: preSpecUpdated,
    skipped_expired_count: 0,
    skipped_no_product_count: 0,
    errors: preSpecResult.errors,
    warnings: [
      `target=prespec · serviceKeySource=${preSpecResult.serviceKeySource ?? "(none)"} · urlPatched=${preSpecUrlPatched} · skipped=${preSpecSkipped}${preSpecTableMissing ? " · tableMissing" : ""}`,
    ],
    message: preSpecOk
      ? null
      : preSpecTableMissing
        ? "사전규격 DB 저장 실패 — pre_spec_notices 테이블 미생성"
        : "사전규격 수집 중 일부 실패",
  });

  // 표준 source=pre_spec (SQL 검증·화면 조회용). legacy cron:collect-g2b:prespec:* 와 병행 기록.
  const preSpecStandardInsert = await recordRun({
    source: "pre_spec",
    mode: "auto",
    started_at: startedAt,
    finished_at: finishedAt,
    ok: preSpecOk,
    target_count: 0,
    page_start: 1,
    page_end: null,
    fetched_count: preSpecResult.fetchedCount,
    matched_count: preSpecResult.matchedCount,
    saved_count: preSpecInserted + preSpecUpdated,
    inserted_count: preSpecInserted,
    updated_count: preSpecUpdated,
    skipped_expired_count: 0,
    skipped_no_product_count: 0,
    errors: preSpecResult.errors,
    warnings: [
      `slot=${slot} · cron=collect-g2b · serviceKeySource=${preSpecResult.serviceKeySource ?? "(none)"}`,
    ],
    message: preSpecOk ? null : "사전규격 자동 수집 중 일부 실패",
  });

  console.log("[/api/cron/collect-g2b] prespec done", {
    nodeEnv: serverDebug.nodeEnv,
    supabaseProjectRef: serverDebug.serviceUrl.projectRef,
    ok: preSpecOk,
    fetched: preSpecResult.fetchedCount,
    matched: preSpecResult.matchedCount,
    inserted: preSpecInserted,
    updated: preSpecUpdated,
    tableMissing: preSpecTableMissing,
    errorCount: preSpecResult.errors.length,
  });

  for (const ins of [bidInsert, legacyBidInsert, preSpecInsert, preSpecStandardInsert]) {
    if (!ins.ok) {
      result.warnings.push(`collection_runs 기록 실패 (모든 fallback 실패): ${ins.error}`);
      console.error("[/api/cron/collect-g2b] recordRun failed:", ins.error);
    } else if (ins.phase !== "full") {
      result.warnings.push(
        `collection_runs ${ins.phase} fallback 으로 저장됨. ` +
          `Supabase SQL Editor 에서 supabase/collection_runs.sql 을 실행해 mode/inserted_count/updated_count 컬럼을 추가해 주세요.`,
      );
    }
  }

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

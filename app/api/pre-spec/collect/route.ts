import { NextRequest, NextResponse } from "next/server";
import { adminFailResponse, requireAdmin } from "@/lib/apiAuth";
import { makeCollectionError, type CollectionError } from "@/lib/collectionErrors";
import {
  DEFAULT_PRE_SPEC_CATEGORIES,
  fetchPreSpecAnnouncements,
  getInquiryRangeYyyymmdd,
  type PreSpecCategory,
} from "@/lib/preSpec/api";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import { upsertPreSpecNotices } from "@/lib/preSpec/persist";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/pre-spec/collect
 *
 * 사용자 정책 (2026-06):
 *  - "API fetch 성공 + normalize 성공 + 1건 이상 들어왔으면" → ok: true.
 *  - 부분 실패 (일부 페이지 에러 / 일부 row normalize 실패 / DB upsert 실패) 는
 *    error 가 아니라 *warnings* 로 분리해서 반환한다.
 *  - "진짜 실패" 만 ok: false:
 *      - API key 누락
 *      - 모든 fetch 실패 (모든 페이지가 errors 로만 끝남)
 *      - 정규화 결과가 0건이고 fetch 페이지 에러도 있음
 *
 * 응답 스키마 (사용자 명세):
 *   {
 *     ok: true | false,
 *     source: "pre_spec",
 *     fetchedCount: number,         // raw API items count
 *     normalizedCount: number,      // normalize + dedup 후 우리 모델 수
 *     upsertedCount: number,        // DB 에 inserted + updated 수 (실패 시 -1)
 *     matchedCount: number,         // products|matchedKeywords > 0 인 수
 *     excludedCount: number,        // recommendation === "제외" 인 수
 *     items: PreSpecAnnouncement[], // 화면에서 즉시 사용
 *     warnings: string[],           // 부분 실패 / 부가 안내
 *     error: string | null,         // ok=false 일 때만 채워짐
 *     ...meta (inqryBgnDt, days, cats, durationMs, serviceKeySource)
 *   }
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_CATS: PreSpecCategory[] = ["servc", "thng", "cnstwk", "frgcpt"];

function parseCats(raw: string | null): PreSpecCategory[] {
  if (!raw) return DEFAULT_PRE_SPEC_CATEGORIES;
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean) as PreSpecCategory[];
  const filtered = parts.filter((p): p is PreSpecCategory => ALLOWED_CATS.includes(p));
  return filtered.length > 0 ? filtered : DEFAULT_PRE_SPEC_CATEGORIES;
}

function parseInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);

  const startedAt = Date.now();
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days"), 7, 1, 90);
  const cats = parseCats(url.searchParams.get("cats"));
  const maxPagesPerCategory = parseInt(url.searchParams.get("maxPages"), 5, 1, 50);

  // 사전규격 전용 키를 우선 사용 (NARA_PRESPEC_API_KEY > G2B_PRESPEC_SERVICE_KEY > G2B_SERVICE_KEY).
  // "입찰공고는 되는데 사전규격만 안 되는" 가장 흔한 원인 = 공공데이터포털 사전규격 신청 ServiceKey 가
  // 별도 발급된 케이스. 그래서 입찰공고용 키 한 개만 보고 있으면 사전규격은 인증 실패.
  const keyResolution = resolvePreSpecServiceKey();
  if (!keyResolution.present) {
    const err: CollectionError = makeCollectionError({
      scope: "PRE_SPEC",
      kind: "API_KEY_MISSING",
      message:
        "사전규격 ServiceKey 가 설정되지 않았습니다. " +
        "(.env.local 또는 Vercel Environment Variables 에 NARA_PRESPEC_API_KEY 또는 " +
        "G2B_PRESPEC_SERVICE_KEY 또는 G2B_SERVICE_KEY 중 하나를 등록해 주세요.)",
      detail: `검사한 env vars: ${keyResolution.checkedEnvVars.join(", ")}`,
    });
    return NextResponse.json(
      {
        ok: false,
        source: "pre_spec",
        fetchedCount: 0,
        normalizedCount: 0,
        upsertedCount: -1,
        matchedCount: 0,
        excludedCount: 0,
        items: [],
        totalsByCategory: {},
        warnings: [],
        error: err.message,
        errors: ["missing_service_key"],
        collectionErrors: [err],
        serviceKeySource: null,
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
  const serviceKey = keyResolution.key;

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(days);

  const collectionErrors: CollectionError[] = [];
  let result;
  try {
    result = await fetchPreSpecAnnouncements(serviceKey, {
      inqryBgnDt,
      inqryEndDt,
      categories: cats,
      maxPagesPerCategory,
      concurrency: 3,
    });
  } catch (err) {
    const ce = makeCollectionError({
      scope: "PRE_SPEC",
      kind: "UNKNOWN_ERROR",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        source: "pre_spec",
        fetchedCount: 0,
        normalizedCount: 0,
        upsertedCount: -1,
        matchedCount: 0,
        excludedCount: 0,
        items: [],
        totalsByCategory: {},
        warnings: [],
        error: ce.message,
        errors: ["fetch_failed"],
        collectionErrors: [ce],
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  // 페이지 단위 에러 → CollectionError 로 변환.
  for (const pe of result.pageErrors) {
    const lowered = pe.message.toLowerCase();
    const kind = lowered.includes("timeout")
      ? "API_TIMEOUT"
      : lowered.includes("json")
        ? "JSON_PARSE_ERROR"
        : "API_RESPONSE_ERROR";
    collectionErrors.push(
      makeCollectionError({
        scope: "PRE_SPEC",
        kind,
        endpoint: `${pe.category}/${pe.endpoint}`,
        pageNo: pe.pageNo,
        message: pe.message,
      }),
    );
  }

  // 정규화 + dedup (announcementKey 기준)
  const seen = new Set<string>();
  const items: PreSpecAnnouncement[] = [];
  let normalizeFailed = 0;
  let dedupCollisions = 0;
  let i = 0;
  for (const raw of result.items) {
    const fallback = `pre-spec-${i++}`;
    let norm: PreSpecAnnouncement;
    try {
      const meta = raw as { __sourceApi?: string; __sourceEndpoint?: string };
      norm = normalizePreSpecItem(raw, fallback, {
        sourceApi: meta.__sourceApi,
        sourceEndpoint: meta.__sourceEndpoint,
      });
    } catch (err) {
      // 단건 정규화 실패는 errors 에 기록하고 계속.
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`[normalize] ${message}`);
      collectionErrors.push(
        makeCollectionError({
          scope: "PRE_SPEC",
          kind: "NORMALIZE_ERROR",
          message: `정규화 실패: ${message}`,
        }),
      );
      normalizeFailed += 1;
      continue;
    }
    if (!norm.announcementKey) {
      normalizeFailed += 1;
      continue;
    }
    if (seen.has(norm.announcementKey)) {
      dedupCollisions += 1;
      continue;
    }
    seen.add(norm.announcementKey);
    items.push(norm);
  }

  /**
   * 단계별 공공 카운터 — 사용자 요청 (2026-06):
   *  - apiRawCount     : G2B API 가 모든 카테고리 페이지에서 모은 raw 항목 수.
   *  - normalizedCount : 정규화 성공 + dedup 후 unique 항목 수 (= items.length).
   *  - matchedCount    : 매칭 키워드/제품 1건 이상인 항목 수 (영업적 의미 후보).
   *  - upsertAttempted : DB upsert 에 시도한 row 수 (= dedup 후 동일).
   *  - upsertInserted  : DB 에 새로 INSERT 된 row 수.
   *  - upsertUpdated   : 기존 external_id 가 매칭되어 UPDATE 된 row 수.
   *  - upsertSkipped   : RLS / SELECT 실패 / INSERT 실패 등으로 보류된 row 수.
   *  - errorCount      : page 에러 + normalize 에러 + upsert 에러 합.
   *
   * 모든 값은 console.log 와 응답 body 둘 다 노출 → 사용자가 dev tools / vercel logs 양쪽에서 추적.
   */
  const apiRawCount = result.items.length;
  const normalizedCount = items.length;
  const matchedCount = items.filter(
    (it) =>
      (Array.isArray(it.products) && it.products.length > 0) ||
      (Array.isArray(it.matchedKeywords) && it.matchedKeywords.length > 0),
  ).length;

  const durationMs = Date.now() - startedAt;

  /**
   * 내부 상세 페이지(/pre-spec/[id]) 가 DB 에서 raw_data 를 읽어 매칭 재계산을 하므로,
   * 클라이언트 수집 응답 흐름 안에서 *동기적으로* upsert + collection_runs 기록까지 끝낸다.
   *
   *  - 사용자 요구사항: API 원본/정규화/매칭/upsert 시도/저장 성공 건수를 수집 단위로 기록해야 함.
   *  - 동기 await 으로 처리하더라도 일반적으로 1~5 초 안에 끝남 (수십 건 단위 upsert).
   *  - 테이블이 없거나 RLS 차단이면 upsertPreSpecNotices 가 errors 만 반환하고 throw 하지 않음.
   *  - 환경 변수가 없으면 supabase admin client 자체가 null 이라 noop 으로 처리.
   *  - cron 이 동일 데이터를 다시 upsert 해도 external_id unique 제약 + URL 정책으로 idempotent.
   */
  let upsertSummary: {
    attempted: number;
    inserted: number;
    updated: number;
    urlPatched: number;
    skipped: number;
    tableMissing: boolean;
    errors: string[];
  } = {
    attempted: 0,
    inserted: 0,
    updated: 0,
    urlPatched: 0,
    skipped: 0,
    tableMissing: false,
    errors: [],
  };

  if (items.length > 0) {
    try {
      const s = await upsertPreSpecNotices(items);
      upsertSummary = {
        attempted: s.attempted,
        inserted: s.inserted,
        updated: s.updated,
        urlPatched: s.urlPatched,
        skipped: s.skipped,
        tableMissing: s.tableMissing,
        errors: s.errors,
      };
      if (s.tableMissing) {
        console.warn(
          "[/api/pre-spec/collect] pre_spec_notices table missing — detail page (/pre-spec/[id]) will fall back to localStorage only. Run supabase/pre_spec_notices.sql to enable DB-backed detail.",
        );
      } else if (s.errors.length > 0) {
        console.warn("[/api/pre-spec/collect] upsert had errors:", s.errors);
      }
    } catch (e) {
      console.warn(
        "[/api/pre-spec/collect] upsert exception:",
        e instanceof Error ? e.message : String(e),
      );
      upsertSummary.errors.push(
        `upsert 예외: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 단계별 공공 로그 — vercel logs / dev console 어디서든 한 줄로 카운터 추적 가능.
  console.log(
    `[/api/pre-spec/collect] counts ` +
      `api_raw=${apiRawCount} ` +
      `normalized=${normalizedCount} ` +
      `dedup_collisions=${dedupCollisions} ` +
      `normalize_failed=${normalizeFailed} ` +
      `matched=${matchedCount} ` +
      `upsert_attempted=${upsertSummary.attempted} ` +
      `inserted=${upsertSummary.inserted} ` +
      `updated=${upsertSummary.updated} ` +
      `url_patched=${upsertSummary.urlPatched} ` +
      `skipped=${upsertSummary.skipped} ` +
      `table_missing=${upsertSummary.tableMissing} ` +
      `errors=${upsertSummary.errors.length + result.errors.length} ` +
      `duration_ms=${durationMs} ` +
      `days=${days} cats=${cats.join("+")} maxPagesPerCategory=${maxPagesPerCategory}`,
  );

  // collection_runs 에도 기록 (manual 수집 가시성 위해 — 사용자 요구사항).
  // 테이블 없거나 INSERT 실패해도 응답에 영향 없음 (best-effort).
  void recordManualPreSpecRun({
    startedAt,
    durationMs,
    counts: {
      apiRawCount,
      normalizedCount,
      matchedCount,
      upsertAttempted: upsertSummary.attempted,
      upsertInserted: upsertSummary.inserted,
      upsertUpdated: upsertSummary.updated,
      upsertSkipped: upsertSummary.skipped,
      urlPatched: upsertSummary.urlPatched,
      dedupCollisions,
      normalizeFailed,
    },
    errors: [...result.errors, ...upsertSummary.errors],
    serviceKeySource: keyResolution.source,
    days,
    cats,
    maxPagesPerCategory,
    tableMissing: upsertSummary.tableMissing,
  }).catch((e) => {
    console.warn(
      "[/api/pre-spec/collect] recordManualPreSpecRun (best-effort) exception:",
      e instanceof Error ? e.message : String(e),
    );
  });

  // 추천/제외 카운트 — 화면 통계와 정합성 확보용.
  const excludedCount = items.filter((it) => it.recommendation === "제외").length;

  /**
   * ok / warnings / error 결정 규칙 (사용자 정책 2026-06):
   *
   *  1. API 인증/네트워크 자체 실패 → 위에서 이미 ok:false 로 즉시 return.
   *  2. 정규화 후 normalizedCount > 0  → 무조건 ok:true.
   *     - 일부 페이지 에러 / 일부 row 정규화 실패 / DB upsert 실패 / collection_runs 기록 실패는
   *       *모두 warnings* 로 분류 — 사용자 화면에는 "수집 완료, 일부 경고 있음" 으로 표시.
   *  3. normalizedCount == 0 이고 페이지 에러도 0 → ok:true (조건에 맞는 결과 없음, 정상).
   *  4. normalizedCount == 0 이고 페이지 에러가 있음 → ok:false (실질적으로 다 실패).
   */
  const warnings: string[] = [];
  const fetchPageErrors = [...result.errors];
  for (const e of fetchPageErrors) warnings.push(`수집 페이지 에러: ${e}`);
  if (normalizeFailed > 0) {
    warnings.push(
      `${normalizeFailed}건의 항목이 정규화 단계에서 누락되었습니다 (포맷 변종).`,
    );
  }
  if (upsertSummary.tableMissing) {
    warnings.push(
      "DB 의 pre_spec_notices 테이블이 없어 화면에서만 표시됩니다. supabase/pre_spec_notices.sql 을 한 번 실행해 주세요.",
    );
  }
  for (const e of upsertSummary.errors) {
    warnings.push(`DB 저장 경고: ${e}`);
  }

  let ok: boolean;
  let topLevelError: string | null = null;
  if (normalizedCount > 0) {
    ok = true;
  } else if (fetchPageErrors.length === 0) {
    ok = true; // 결과 0건 + 에러 0건 = "조건에 맞는 결과 없음" 정상 케이스.
  } else {
    ok = false;
    topLevelError =
      `사전규격 API 가 ${fetchPageErrors.length}건의 페이지 에러로 데이터를 가져오지 못했습니다.`;
  }

  return NextResponse.json({
    ok,
    source: "pre_spec",

    // ★ 사용자 요구 응답 스키마 (2026-06).
    fetchedCount: apiRawCount,
    normalizedCount,
    upsertedCount: upsertSummary.tableMissing
      ? -1
      : upsertSummary.inserted + upsertSummary.updated,
    matchedCount,
    excludedCount,

    items,
    warnings,
    error: topLevelError,

    // 화면 통계 / cron 호환을 위한 부가 필드 (legacy 호환).
    totalsByCategory: result.totalsByCategory,
    collectionErrors,
    message:
      ok && normalizedCount === 0
        ? "조건에 맞는 사전규격공고가 없습니다."
        : ok && warnings.length > 0
          ? "사전규격 수집은 완료되었지만 일부 항목은 제외되었습니다."
          : ok
            ? "사전규격 수집이 완료되었습니다."
            : null,
    inqryBgnDt,
    inqryEndDt,
    days,
    cats,
    serviceKeySource: keyResolution.source,
    serviceKeyMasked: keyResolution.masked,
    debug: {
      firstItemKeys: result.firstItemKeys,
      firstItemSample: result.firstItemSample,
      pageCount: result.pages.length,
    },
    counts: {
      apiRawCount,
      normalizedCount,
      matchedCount,
      excludedCount,
      dedupCollisions,
      normalizeFailed,
      upsertAttempted: upsertSummary.attempted,
      upsertInserted: upsertSummary.inserted,
      upsertUpdated: upsertSummary.updated,
      upsertSkipped: upsertSummary.skipped,
      urlPatched: upsertSummary.urlPatched,
      tableMissing: upsertSummary.tableMissing,
    },
    durationMs,
  });
}

/**
 * 수동 수집 1건을 collection_runs 테이블에 기록 (사용자 요구사항 — 수집 가시성).
 *
 *  - 테이블이 없거나 admin client 가 없으면 noop.
 *  - mode='manual' / source='pre_spec' 으로 자동수집(cron) 과 구분.
 *  - 컬럼이 마이그레이션 진행 정도에 따라 부족할 수 있어 progressive fallback 으로 시도한다.
 */
async function recordManualPreSpecRun(input: {
  startedAt: number;
  durationMs: number;
  counts: {
    apiRawCount: number;
    normalizedCount: number;
    matchedCount: number;
    upsertAttempted: number;
    upsertInserted: number;
    upsertUpdated: number;
    upsertSkipped: number;
    urlPatched: number;
    dedupCollisions: number;
    normalizeFailed: number;
  };
  errors: string[];
  serviceKeySource: string | null;
  days: number;
  cats: PreSpecCategory[];
  maxPagesPerCategory: number;
  tableMissing: boolean;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const finishedIso = new Date(input.startedAt + input.durationMs).toISOString();
  const startedIso = new Date(input.startedAt).toISOString();
  const ok = input.errors.length === 0 && !input.tableMissing;
  const message =
    `pre-spec manual collect: ` +
    `api_raw=${input.counts.apiRawCount} ` +
    `normalized=${input.counts.normalizedCount} ` +
    `matched=${input.counts.matchedCount} ` +
    `upserted(I/U/S)=${input.counts.upsertInserted}/${input.counts.upsertUpdated}/${input.counts.upsertSkipped}`;

  const fullRow: Record<string, unknown> = {
    source: "pre_spec",
    mode: "manual",
    started_at: startedIso,
    finished_at: finishedIso,
    ok,
    target_count: 0,
    page_start: 1,
    page_end: input.maxPagesPerCategory,
    fetched_count: input.counts.apiRawCount,
    matched_count: input.counts.matchedCount,
    saved_count: input.counts.upsertInserted + input.counts.upsertUpdated,
    inserted_count: input.counts.upsertInserted,
    updated_count: input.counts.upsertUpdated,
    skipped_expired_count: 0,
    skipped_no_product_count: 0,
    errors: input.errors,
    warnings: [
      `target=prespec · serviceKeySource=${input.serviceKeySource ?? "(none)"} · ` +
        `days=${input.days} · cats=${input.cats.join("+")} · ` +
        `urlPatched=${input.counts.urlPatched} · ` +
        `dedupCollisions=${input.counts.dedupCollisions} · ` +
        `normalizeFailed=${input.counts.normalizeFailed}` +
        (input.tableMissing ? " · tableMissing" : ""),
    ],
    message,
  };

  // 1) full payload 시도.
  const { error: fullErr } = await supabase
    .from("collection_runs")
    .insert(fullRow as never);
  if (!fullErr) return;

  // 2) drop new columns: mode / inserted_count / updated_count.
  const { mode: _mode, inserted_count: _ic, updated_count: _uc, ...legacyRow } = fullRow as {
    mode: unknown;
    inserted_count: unknown;
    updated_count: unknown;
    [k: string]: unknown;
  };
  void _mode;
  void _ic;
  void _uc;
  const { error: legacyErr } = await supabase
    .from("collection_runs")
    .insert(legacyRow as never);
  if (!legacyErr) return;

  // 3) drop additionally warnings / message.
  const { warnings: _w, message: _m, ...minimalRow } = legacyRow as {
    warnings: unknown;
    message: unknown;
    [k: string]: unknown;
  };
  void _w;
  void _m;
  const { error: minimalErr } = await supabase
    .from("collection_runs")
    .insert(minimalRow as never);
  if (!minimalErr) return;

  // 4) bare minimum fallback (collection_runs 자체가 없는 환경).
  const bareRow: Record<string, unknown> = {
    source: fullRow.source,
    started_at: fullRow.started_at,
    finished_at: fullRow.finished_at,
    ok: fullRow.ok,
    fetched_count: fullRow.fetched_count,
    matched_count: fullRow.matched_count,
    saved_count: fullRow.saved_count,
    errors: fullRow.errors,
  };
  const { error: bareErr } = await supabase
    .from("collection_runs")
    .insert(bareRow as never);
  if (bareErr) {
    console.warn(
      "[/api/pre-spec/collect] collection_runs 모든 fallback INSERT 실패 (테이블 없음 또는 권한 없음): ",
      bareErr.message,
    );
  }
}

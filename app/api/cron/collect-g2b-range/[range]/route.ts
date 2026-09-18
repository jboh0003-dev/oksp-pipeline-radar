import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOOKBACK_DAYS = 30;
/**
 * Cron 슬롯은 1~40을 5페이지씩 8개 lane 으로 나눈다.
 * 40은 더 이상 조회 상한이 아니다. 각 lane 은 +40 간격으로 계속 진행해
 * 나라장터 totalCount 기준 마지막 페이지까지 담당한다.
 *
 * 예) lane 1-5 => 1-5, 41-45, 81-85 ...
 */
const BASE_PAGE_SPAN = 40;
const MAX_RANGE_SIZE = 5;

function isAuthorized(request: NextRequest, expected: string): boolean {
  const bearer = request.headers.get("authorization") ?? "";
  if (bearer === `Bearer ${expected}`) return true;
  return (request.headers.get("x-cron-secret") ?? "").trim() === expected;
}

function parseRange(request: NextRequest): { start: number; end: number } | null {
  const match = request.nextUrl.pathname.match(/\/collect-g2b-range\/(\d+)-(\d+)\/?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 1 || end < start || end > BASE_PAGE_SPAN) return null;
  if (end - start + 1 > MAX_RANGE_SIZE) return null;
  return { start, end };
}

type Aggregate = {
  fetchedPages: number;
  fetchedCount: number;
  matchedCount: number;
  savedCount: number;
  insertedCount: number;
  updatedCount: number;
  activeProductMatchedCount: number;
  skippedExpiredCount: number;
  skippedNoProductCount: number;
  maxAvailablePage: number;
};

function emptyAggregate(): Aggregate {
  return {
    fetchedPages: 0,
    fetchedCount: 0,
    matchedCount: 0,
    savedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    activeProductMatchedCount: 0,
    skippedExpiredCount: 0,
    skippedNoProductCount: 0,
    maxAvailablePage: 0,
  };
}

function addBody(aggregate: Aggregate, body: CollectResponse) {
  aggregate.fetchedPages += body.fetchedPages ?? 0;
  aggregate.fetchedCount += body.fetchedCount ?? 0;
  aggregate.matchedCount += body.matchedCount ?? 0;
  aggregate.savedCount += body.savedCount ?? 0;
  aggregate.insertedCount += body.insertedCount ?? 0;
  aggregate.updatedCount += body.updatedCount ?? 0;
  aggregate.activeProductMatchedCount += body.activeProductMatchedCount ?? 0;
  aggregate.skippedExpiredCount += body.skippedExpiredCount ?? 0;
  aggregate.skippedNoProductCount += body.skippedNoProductCount ?? 0;
  aggregate.maxAvailablePage = Math.max(
    aggregate.maxAvailablePage,
    body.maxAvailablePage ?? 0,
  );
}

async function recordRun(args: {
  start: number;
  end: number;
  startedAt: string;
  finishedAt: string;
  aggregate: Aggregate;
  errors: string[];
  lastPageAttempted: number;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "Supabase admin client unavailable";

  const payload = {
    source: `cron:collect-g2b:range:${String(args.start).padStart(2, "0")}-${String(args.end).padStart(2, "0")}`,
    mode: "auto",
    started_at: args.startedAt,
    finished_at: args.finishedAt,
    ok: args.errors.length === 0,
    target_count: 1,
    page_start: args.start,
    page_end: args.lastPageAttempted,
    fetched_count: args.aggregate.fetchedCount,
    matched_count: args.aggregate.matchedCount,
    saved_count: args.aggregate.savedCount,
    inserted_count: args.aggregate.insertedCount,
    updated_count: args.aggregate.updatedCount,
    skipped_expired_count: args.aggregate.skippedExpiredCount,
    skipped_no_product_count: args.aggregate.skippedNoProductCount,
    errors: args.errors,
    warnings: [
      `dynamic-lane=${args.start}-${args.end} · lookback=${LOOKBACK_DAYS}일 · fixed 40-page cap removed · totalCount driven`,
    ],
    message: `자동수집 lane ${args.start}-${args.end} · 마지막 시도 p${args.lastPageAttempted}`,
  };

  const { error } = await supabase.from("collection_runs").insert(payload as never);
  if (!error) return null;
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
}

async function handle(request: NextRequest) {
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

  const range = parseRange(request);
  if (!range) {
    return NextResponse.json(
      { ok: false, error: "잘못된 page range 입니다. 예: /api/cron/collect-g2b-range/1-5" },
      { status: 400 },
    );
  }

  const startedAt = new Date().toISOString();
  const basePages = Array.from(
    { length: range.end - range.start + 1 },
    (_, i) => range.start + i,
  );
  const aggregate = emptyAggregate();
  const errors: string[] = [];
  let round = 0;
  let lastPageAttempted = range.end;
  let discoveredMaxPage = 0;

  /**
   * 40페이지 고정 상한을 없애고, 동일 lane 이 +40 간격으로 마지막 페이지까지 계속 담당한다.
   *
   * 예)
   *   1-5  lane -> 1-5, 41-45, 81-85 ...
   *   6-10 lane -> 6-10, 46-50, 86-90 ...
   *
   * 각 page 응답의 나라장터 totalCount 를 이용해 maxAvailablePage 를 계산한다.
   * totalCount 가 일시적으로 누락된 경우에는 "해당 round 에 조회된 공고가 0건"일 때
   * pagination 끝으로 판단한다. 따라서 코드상 40페이지 상한은 더 이상 없다.
   */
  while (true) {
    const offset = round * BASE_PAGE_SPAN;
    const roundPages = basePages
      .map((page) => page + offset)
      .filter((page) => discoveredMaxPage <= 0 || page <= discoveredMaxPage);

    if (roundPages.length === 0) break;

    const roundResults = await Promise.allSettled(
      roundPages.map(async (page) => {
        const result = await runCollect({
          targetCount: 1,
          lookbackDays: LOOKBACK_DAYS,
          pageStart: page,
          pageEnd: page,
        });
        return { page, body: result.body };
      }),
    );

    let roundFetchedCount = 0;

    for (let i = 0; i < roundResults.length; i += 1) {
      const result = roundResults[i];
      const page = roundPages[i];
      lastPageAttempted = Math.max(lastPageAttempted, page);

      if (result.status === "rejected") {
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push(`page ${page} runCollect 예외: ${message}`);
        continue;
      }

      roundFetchedCount += result.value.body.fetchedCount ?? 0;
      discoveredMaxPage = Math.max(
        discoveredMaxPage,
        result.value.body.maxAvailablePage ?? 0,
      );
      addBody(aggregate, result.value.body);

      for (const error of result.value.body.errors ?? []) {
        errors.push(`page ${page}: ${error}`);
      }
    }

    if (discoveredMaxPage > 0) {
      const nextLaneStart = range.start + (round + 1) * BASE_PAGE_SPAN;
      if (nextLaneStart > discoveredMaxPage) break;
    } else if (roundFetchedCount === 0) {
      // totalCount 메타데이터가 없는 비정상 응답에서도 빈 페이지 이후로 무한 순회하지 않는다.
      break;
    }

    round += 1;
  }

  const finishedAt = new Date().toISOString();
  const dbLogError = await recordRun({
    start: range.start,
    end: range.end,
    startedAt,
    finishedAt,
    aggregate,
    errors,
    lastPageAttempted,
  });

  const ok = errors.length === 0;
  console.log("[/api/cron/collect-g2b-range] done", {
    range: `${range.start}-${range.end}`,
    ok,
    fetchedPages: aggregate.fetchedPages,
    fetched: aggregate.fetchedCount,
    matched: aggregate.matchedCount,
    maxAvailablePage: aggregate.maxAvailablePage,
    lastPageAttempted,
    inserted: aggregate.insertedCount,
    updated: aggregate.updatedCount,
    errorCount: errors.length,
    dbLogError,
  });

  return NextResponse.json({
    ok,
    range,
    startedAt,
    finishedAt,
    fetchedPages: aggregate.fetchedPages,
    fetchedCount: aggregate.fetchedCount,
    matchedCount: aggregate.matchedCount,
    savedCount: aggregate.savedCount,
    insertedCount: aggregate.insertedCount,
    updatedCount: aggregate.updatedCount,
    activeProductMatchedCount: aggregate.activeProductMatchedCount,
    maxAvailablePage: aggregate.maxAvailablePage,
    lastPageAttempted,
    errors,
    dbLogError,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

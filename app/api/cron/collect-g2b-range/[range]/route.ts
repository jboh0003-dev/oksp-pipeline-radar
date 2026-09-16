import { NextRequest, NextResponse } from "next/server";
import { runCollect, type CollectResponse } from "@/app/api/collect-g2b-keywords/route";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOOKBACK_DAYS = 30;
const MAX_PAGE = 40;
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
  if (start < 1 || end < start || end > MAX_PAGE) return null;
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
}

async function recordRun(args: {
  start: number;
  end: number;
  startedAt: string;
  finishedAt: string;
  aggregate: Aggregate;
  errors: string[];
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
    page_end: args.end,
    fetched_count: args.aggregate.fetchedCount,
    matched_count: args.aggregate.matchedCount,
    saved_count: args.aggregate.savedCount,
    inserted_count: args.aggregate.insertedCount,
    updated_count: args.aggregate.updatedCount,
    skipped_expired_count: args.aggregate.skippedExpiredCount,
    skipped_no_product_count: args.aggregate.skippedNoProductCount,
    errors: args.errors,
    warnings: [
      `sharded-range=${args.start}-${args.end} · lookback=${LOOKBACK_DAYS}일 · page-parallel timeout isolation`,
    ],
    message: `자동수집 page ${args.start}-${args.end}`,
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
  const pages = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
  const aggregate = emptyAggregate();
  const errors: string[] = [];

  // 5페이지를 한 runCollect 안에서 직렬 처리하면 외부 API 지연 시 300초를 넘길 수 있다.
  // 각 페이지를 독립 실행해 동시에 처리하면 한 페이지 장애가 다른 페이지를 막지 않고,
  // 전체 wall-clock 시간을 페이지 수만큼 누적하지 않는다.
  const pageResults = await Promise.allSettled(
    pages.map(async (page) => {
      const result = await runCollect({
        targetCount: 1,
        lookbackDays: LOOKBACK_DAYS,
        pageStart: page,
        pageEnd: page,
      });
      return { page, body: result.body };
    }),
  );

  for (let i = 0; i < pageResults.length; i += 1) {
    const result = pageResults[i];
    const page = pages[i];
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`page ${page} runCollect 예외: ${message}`);
      continue;
    }

    addBody(aggregate, result.value.body);
    for (const error of result.value.body.errors ?? []) {
      errors.push(`page ${page}: ${error}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const dbLogError = await recordRun({
    start: range.start,
    end: range.end,
    startedAt,
    finishedAt,
    aggregate,
    errors,
  });

  const ok = errors.length === 0;
  console.log("[/api/cron/collect-g2b-range] done", {
    range: `${range.start}-${range.end}`,
    ok,
    fetchedPages: aggregate.fetchedPages,
    fetched: aggregate.fetchedCount,
    matched: aggregate.matchedCount,
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
    errors,
    dbLogError,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

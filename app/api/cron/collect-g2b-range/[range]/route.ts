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

async function recordRun(args: {
  start: number;
  end: number;
  startedAt: string;
  finishedAt: string;
  body: CollectResponse | null;
  errors: string[];
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "Supabase admin client unavailable";

  const body = args.body;
  const { error } = await supabase.from("collection_runs").insert({
    source: `cron:collect-g2b:range:${String(args.start).padStart(2, "0")}-${String(args.end).padStart(2, "0")}`,
    started_at: args.startedAt,
    finished_at: args.finishedAt,
    ok: args.errors.length === 0,
    target_count: body?.targetCount ?? 1,
    page_start: args.start,
    page_end: args.end,
    fetched_count: body?.fetchedCount ?? 0,
    matched_count: body?.matchedCount ?? 0,
    saved_count: body?.savedCount ?? 0,
    skipped_expired_count: body?.skippedExpiredCount ?? 0,
    skipped_no_product_count: body?.skippedNoProductCount ?? 0,
    errors: args.errors,
    warnings: [
      `sharded-range=${args.start}-${args.end} · lookback=${LOOKBACK_DAYS}일 · Vercel timeout isolation`,
    ],
  } as never);

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
  let body: CollectResponse | null = null;
  let runtimeError: string | null = null;

  try {
    const result = await runCollect({
      targetCount: 1,
      lookbackDays: LOOKBACK_DAYS,
      pageStart: range.start,
      pageEnd: range.end,
    });
    body = result.body;
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : String(error);
  }

  const finishedAt = new Date().toISOString();
  const errors = [...(body?.errors ?? [])];
  if (runtimeError) errors.push(`runCollect 예외: ${runtimeError}`);

  const dbLogError = await recordRun({
    start: range.start,
    end: range.end,
    startedAt,
    finishedAt,
    body,
    errors,
  });

  const ok = errors.length === 0;
  console.log("[/api/cron/collect-g2b-range] done", {
    range: `${range.start}-${range.end}`,
    ok,
    fetched: body?.fetchedCount ?? 0,
    matched: body?.matchedCount ?? 0,
    saved: body?.savedCount ?? 0,
    errorCount: errors.length,
    dbLogError,
  });

  return NextResponse.json({
    ok,
    range,
    startedAt,
    finishedAt,
    fetchedCount: body?.fetchedCount ?? 0,
    matchedCount: body?.matchedCount ?? 0,
    savedCount: body?.savedCount ?? 0,
    insertedCount: body?.insertedCount ?? 0,
    updatedCount: body?.updatedCount ?? 0,
    activeProductMatchedCount: body?.activeProductMatchedCount ?? 0,
    errors,
    dbLogError,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

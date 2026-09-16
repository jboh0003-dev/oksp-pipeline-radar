import { NextRequest, NextResponse } from "next/server";
import { addDaysYmd, collectCompetitiveAwards, kstTodayYmd } from "@/lib/g2b/competitiveAwards";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest, expected: string): boolean {
  const bearer = request.headers.get("authorization") ?? "";
  if (bearer === `Bearer ${expected}`) return true;
  return (request.headers.get("x-cron-secret") ?? "").trim() === expected;
}

async function writeRunLog(input: {
  startedAt: string;
  completedAt: string;
  startDate: string;
  endDate: string;
  ok: boolean;
  requestCount: number;
  fetchedCount: number;
  verifiedCount: number;
  dedupedCount: number;
  insertedCount: number;
  updatedCount: number;
  retriedTaskCount: number;
  failedTaskCount: number;
  companyCounts: Record<string, number>;
  errors: string[];
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from("competitive_award_collection_runs").insert({
    started_at: input.startedAt,
    completed_at: input.completedAt,
    start_date: input.startDate,
    end_date: input.endDate,
    ok: input.ok,
    request_count: input.requestCount,
    fetched_count: input.fetchedCount,
    verified_count: input.verifiedCount,
    deduped_count: input.dedupedCount,
    inserted_count: input.insertedCount,
    updated_count: input.updatedCount,
    retried_task_count: input.retriedTaskCount,
    failed_task_count: input.failedTaskCount,
    company_counts: input.companyCounts,
    errors: input.errors,
  } as never);
  if (error) console.error("[/api/cron/collect-competitive-awards] run log failed", error);
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) return NextResponse.json({ ok: false, error: "CRON_SECRET 환경변수가 설정되어 있지 않습니다." }, { status: 500 });
  if (!isAuthorized(request, expectedSecret)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const startedAt = new Date().toISOString();
  const endDate = kstTodayYmd();
  const startDate = addDaysYmd(endDate, -93);
  try {
    const result = await collectCompetitiveAwards({ startDate, endDate, persist: true, concurrency: 6 });
    const completedAt = new Date().toISOString();
    await writeRunLog({
      startedAt,
      completedAt,
      startDate,
      endDate,
      ok: result.ok,
      requestCount: result.requestCount,
      fetchedCount: result.fetchedCount,
      verifiedCount: result.verifiedCount,
      dedupedCount: result.dedupedCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      retriedTaskCount: result.retriedTaskCount,
      failedTaskCount: result.failedTaskCount,
      companyCounts: result.companyCounts,
      errors: result.errors,
    });
    console.log("[/api/cron/collect-competitive-awards] done", {
      ok: result.ok,
      startDate,
      endDate,
      requestCount: result.requestCount,
      fetchedCount: result.fetchedCount,
      dedupedCount: result.dedupedCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      retriedTaskCount: result.retriedTaskCount,
      failedTaskCount: result.failedTaskCount,
      companyCounts: result.companyCounts,
      errorCount: result.errors.length,
    });
    return NextResponse.json({
      ok: result.ok,
      startDate,
      endDate,
      requestCount: result.requestCount,
      fetchedCount: result.fetchedCount,
      verifiedCount: result.verifiedCount,
      dedupedCount: result.dedupedCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      retriedTaskCount: result.retriedTaskCount,
      failedTaskCount: result.failedTaskCount,
      companyCounts: result.companyCounts,
      errors: result.errors,
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await writeRunLog({
      startedAt,
      completedAt,
      startDate,
      endDate,
      ok: false,
      requestCount: 0,
      fetchedCount: 0,
      verifiedCount: 0,
      dedupedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      retriedTaskCount: 0,
      failedTaskCount: 1,
      companyCounts: {},
      errors: [message],
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

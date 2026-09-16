import { NextRequest, NextResponse } from "next/server";
import { collectCompetitiveAwards, kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") ?? "2023-01-01";
  const endDate = url.searchParams.get("end") ?? kstTodayYmd();
  try {
    const result = await collectCompetitiveAwards({ startDate, endDate, persist: true, concurrency: 6 });
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
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 20),
    }, { status: result.ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

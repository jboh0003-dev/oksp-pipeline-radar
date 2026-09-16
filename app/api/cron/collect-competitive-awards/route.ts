import { NextRequest, NextResponse } from "next/server";
import { addDaysYmd, collectCompetitiveAwards, kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest, expected: string): boolean {
  const bearer = request.headers.get("authorization") ?? "";
  if (bearer === `Bearer ${expected}`) return true;
  return (request.headers.get("x-cron-secret") ?? "").trim() === expected;
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) return NextResponse.json({ ok: false, error: "CRON_SECRET 환경변수가 설정되어 있지 않습니다." }, { status: 500 });
  if (!isAuthorized(request, expectedSecret)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const endDate = kstTodayYmd();
  const startDate = addDaysYmd(endDate, -62);
  try {
    const result = await collectCompetitiveAwards({ startDate, endDate, persist: true, concurrency: 6 });
    console.log("[/api/cron/collect-competitive-awards] done", {
      ok: result.ok,
      startDate,
      endDate,
      requestCount: result.requestCount,
      fetchedCount: result.fetchedCount,
      dedupedCount: result.dedupedCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
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
      errors: result.errors,
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

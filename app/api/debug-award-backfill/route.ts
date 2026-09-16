import { NextRequest, NextResponse } from "next/server";
import { collectCompetitiveAwards, kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") ?? "2023-01-01";
  const endDate = url.searchParams.get("end") ?? kstTodayYmd();
  const persist = url.searchParams.get("persist") !== "0";
  try {
    const result = await collectCompetitiveAwards({
      startDate,
      endDate,
      persist,
      concurrency: 6,
    });
    return NextResponse.json({
      ...result,
      rows: result.rows.slice(0, 50),
      returnedRows: Math.min(50, result.rows.length),
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

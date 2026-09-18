import { NextRequest, NextResponse } from "next/server";
import { collectCompetitiveAwards, kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOKEN = "pm-award-backfill-20260918-v1";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const endDate = kstTodayYmd();
  const result = await collectCompetitiveAwards({
    startDate: "2024-01-01",
    endDate,
    persist: true,
    concurrency: 6,
  });
  return NextResponse.json(result);
}

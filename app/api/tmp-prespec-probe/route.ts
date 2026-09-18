import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_PRE_SPEC_CATEGORIES, fetchPreSpecAnnouncements, getInquiryRangeYyyymmdd } from "@/lib/preSpec/api";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOKEN = "pm-prespec-probe-20260918-v1";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  }
  const days = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("days") ?? "7") || 7));
  const key = resolvePreSpecServiceKey();
  if (!key.present) return NextResponse.json({ ok:false, error:"key missing" }, { status:500 });
  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(days);
  const result = await fetchPreSpecAnnouncements(key.key, {
    inqryBgnDt,
    inqryEndDt,
    categories: DEFAULT_PRE_SPEC_CATEGORIES,
    maxPagesPerCategory: 1,
    concurrency: 4,
  });
  return NextResponse.json({
    ok:true,
    days,
    totalsByCategory: result.totalsByCategory,
    firstPageItems: result.items.length,
    errors: result.errors,
  });
}

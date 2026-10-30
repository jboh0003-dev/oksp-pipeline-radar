import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { collectCompetitiveAwards } from "@/lib/g2b/competitiveAwards";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  try {
    const payload = await request.json().catch(() => ({}));
    const year = Number(payload.year);
    const month = Number(payload.month);
    const persist = payload.persist === true;
    if (![2024,2025,2026].includes(year) || !Number.isInteger(month) || month < 1 || month > 12 || (year===2026 && month>10))
      return NextResponse.json({ok:false,error:"2024~2026년 10월 사이의 월을 지정하세요."},{status:400});
    const startDate = `${year}-${String(month).padStart(2,"0")}-01`;
    const endDay = new Date(Date.UTC(year,month,0)).getUTCDate();
    const endDate = `${year}-${String(month).padStart(2,"0")}-${String(endDay).padStart(2,"0")}`;
    const result = await collectCompetitiveAwards({startDate,endDate,persist,concurrency:4});
    // Never mark a partial/failed API pull as a completed data collection.
    return NextResponse.json({...result,rows:result.rows.slice(0,25),persisted:persist && result.ok},{status:result.ok?200:502});
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:502});
  }
}

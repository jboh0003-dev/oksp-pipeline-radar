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
    const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    if (!Number.isInteger(year) || year < 2024 || year > Number(today.slice(0,4)) || !Number.isInteger(month) || month < 1 || month > 12 || `${year}-${String(month).padStart(2,"0")}` > today.slice(0,7))
      return NextResponse.json({ok:false,error:"2024년 이후 현재까지의 월을 지정하세요."},{status:400});
    const startDate = `${year}-${String(month).padStart(2,"0")}-01`;
    const endDay = new Date(Date.UTC(year,month,0)).getUTCDate();
    const endDate = [`${year}-${String(month).padStart(2,"0")}-${String(endDay).padStart(2,"0")}`,today].sort()[0];
    const result = await collectCompetitiveAwards({startDate,endDate,persist,concurrency:4});
    // Never mark a partial/failed API pull as a completed data collection.
    return NextResponse.json({...result,rows:result.rows.slice(0,25),persisted:persist && result.ok},{status:result.ok?200:502});
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:502});
  }
}

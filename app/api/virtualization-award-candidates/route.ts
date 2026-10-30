import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ok:false,error:"DB unavailable"},{status:500});
  const rows: Record<string,unknown>[] = [];
  for(let offset=0;offset<10000;offset+=500) {
    const {data,error} = await db.from("virtualization_award_candidates")
      .select("external_key,bid_no,bid_ord,award_date,winner_name,winner_business_no,project,customer,amount,rate,category,classification,product_brand,matched_keywords,source_url")
      .gte("award_date","2024-01-01").lte("award_date","2026-10-30")
      .order("award_date",{ascending:false,nullsFirst:false})
      .range(offset,offset+499);
    if(error) return NextResponse.json({ok:false,error:"나라장터 가상화 낙찰 자료 조회 실패"},{status:503});
    rows.push(...(data??[]));
    if((data?.length??0)<500) break;
    if(offset===9500) return NextResponse.json({ok:false,error:"자료 1만 건 이상: 서버 페이지네이션 필요"},{status:422});
  }
  return NextResponse.json({ok:true,rows},{headers:{"Cache-Control":"no-store"}});
}

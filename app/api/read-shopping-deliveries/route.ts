import { NextRequest, NextResponse } from "next/server";
import { collectVirtualizationDeliveryMonth, VIRTUALIZATION_KEYWORDS } from "@/lib/g2b/virtualizationDeliveries";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ok:false},{status:404});
  const year=Number(req.nextUrl.searchParams.get("year"));
  const month=Number(req.nextUrl.searchParams.get("month"));
  const keyword=String(req.nextUrl.searchParams.get("keyword")||"가상화");
  if(![2024,2025,2026].includes(year)||!Number.isInteger(month)||month<1||month>12||(year===2026&&month>10)||
     !VIRTUALIZATION_KEYWORDS.some(k=>k===keyword)) return NextResponse.json({ok:false,error:"invalid month/keyword"},{status:400});
  try{
    const result=await collectVirtualizationDeliveryMonth(year,month,keyword,false);
    const rows=result.rows.map(({raw_data,updated_at,...record})=>record);
    return NextResponse.json({ok:true,year,month,keyword,fetched:result.fetched,matched:result.matched,reportedTotal:result.reportedTotal,rows,truncated:result.matched>rows.length}, {headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:502});
  }
}

import {NextRequest,NextResponse} from "next/server";
import {collectVirtualizationDeliveryMonth,VIRTUALIZATION_KEYWORDS} from "@/lib/g2b/virtualizationDeliveries";

export const dynamic="force-dynamic";
export const maxDuration=90;
// Temporary, read-only preview probe; not included in production.
export async function GET(request:NextRequest) {
  if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({ok:false},{status:404});
  const year=Number(request.nextUrl.searchParams.get("year"));
  const month=Number(request.nextUrl.searchParams.get("month"));
  const keyword=request.nextUrl.searchParams.get("keyword")??"가상화";
  if (![2024,2025,2026].includes(year)||!Number.isInteger(month)||month<1||month>12||(year===2026&&month>10)||
      !VIRTUALIZATION_KEYWORDS.some(item=>item===keyword))
    return NextResponse.json({ok:false,error:"invalid query"},{status:400});
  try {
    const data=await collectVirtualizationDeliveryMonth(year,month,keyword,false,1500);
    return NextResponse.json({
      ok:true,year,month,keyword,requests:data.requests,fetched:data.fetched,
      reportedTotal:data.reportedTotal,matched:data.matched,truncated:data.rows.length!==data.matched,
      rows:data.rows.map(({raw_data,updated_at,...item})=>item),
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({ok:false,year,month,keyword,
    error:error instanceof Error?error.message:String(error)},{status:502});}
}
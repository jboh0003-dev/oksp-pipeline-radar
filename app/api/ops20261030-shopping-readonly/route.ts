import {NextRequest,NextResponse} from "next/server";
import {collectVirtualizationDeliveryMonth,VIRTUALIZATION_KEYWORDS} from "@/lib/g2b/virtualizationDeliveries";

export const dynamic="force-dynamic";
export const maxDuration=240;
// Temporary PREVIEW-ONLY read-only G2B verification; deleted before production merge.
export async function GET(request:NextRequest) {
  if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({ok:false},{status:404});
  const year=Number(request.nextUrl.searchParams.get("year"));
  const monthRaw=request.nextUrl.searchParams.get("month");
  const keyword=request.nextUrl.searchParams.get("keyword")??"가상화";
  if (![2024,2025,2026].includes(year) ||
      !VIRTUALIZATION_KEYWORDS.some(item=>item===keyword))
    return NextResponse.json({ok:false,error:"invalid year/keyword"},{status:400});
  const monthList=monthRaw?[Number(monthRaw)]:
    Array.from({length:year===2026?10:12},(_,i)=>i+1);
  if(monthList.some(m=>!Number.isInteger(m)||m<1||m>12||(year===2026&&m>10)))
    return NextResponse.json({ok:false,error:"invalid month"},{status:400});
  const result=Array<{year:number;month:number;ok:boolean;fetched:number;matched:number;truncated:boolean;error:string|null;rows:Record<string,unknown>[]}>(monthList.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,monthList.length)},async()=>{
    while(cursor<monthList.length){
      const i=cursor++,month=monthList[i];
      try{
        const data=await collectVirtualizationDeliveryMonth(year,month,keyword,false,1500);
        result[i]={year,month,ok:data.ok&&data.matched===data.rows.length,
          fetched:data.fetched,matched:data.matched,truncated:data.rows.length!==data.matched,error:null,
          rows:data.rows.map(({raw_data,updated_at,...item})=>item)};
      }catch(error){
        result[i]={year,month,ok:false,fetched:0,matched:0,truncated:false,
          error:error instanceof Error?error.message:String(error),rows:[]};
      }
    }
  }));
  return NextResponse.json({
    ok:result.every(x=>x.ok),year,keyword,months:result,
    monthCount:result.length,successfulMonths:result.filter(x=>x.ok).length,
  },{headers:{"Cache-Control":"no-store"}});
}
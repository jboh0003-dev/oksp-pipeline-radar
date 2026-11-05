import { NextRequest, NextResponse } from "next/server";
import { collectVirtualizationAwardCandidatesMonth } from "@/lib/g2b/virtualizationAwardCandidates";
import { collectVirtualizationDeliveryMonth } from "@/lib/g2b/virtualizationDeliveries";
import { VIRTUALIZATION_BID_KEYWORD_GROUPS } from "@/lib/g2b/virtualizationAwardCandidates";
import { kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const keywords = VIRTUALIZATION_BID_KEYWORD_GROUPS.paas;

// Three months each day: 2024-01 through three months before today in ~11 days.
export async function GET(request: NextRequest, context: { params: Promise<{ slot: string }> }) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ok:false,error:"수집 설정 누락"},{status:503});
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ok:false},{status:401});
  const {slot:raw} = await context.params;
  if (!/^[012]$/.test(raw)) return NextResponse.json({ok:false},{status:400});
  const today = kstTodayYmd();
  const nowIndex = Number(today.slice(0,4))*12+Number(today.slice(5,7))-1;
  const startIndex = 2024*12;
  const historicalMonths = nowIndex-startIndex-2;
  if (historicalMonths <= 0) return NextResponse.json({ok:true,completed:0});
  const day = Math.floor(Date.now()/86400000);
  const index = (day*3+Number(raw))%historicalMonths;
  const year = 2024+Math.floor(index/12), month = index%12+1;
  let award: Awaited<ReturnType<typeof collectVirtualizationAwardCandidatesMonth>> | null = null;
  const failures:string[]=[];
  try { award=await collectVirtualizationAwardCandidatesMonth(year,month,true,"paas",true); failures.push(...award.errors); }
  catch(error) { failures.push(`낙찰: ${error instanceof Error?error.message:String(error)}`); }
  let cursor=0, matched=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(cursor<keywords.length){const keyword=keywords[cursor++];
      try{const result=await collectVirtualizationDeliveryMonth(year,month,keyword,true);matched+=result.matched;}
      catch(error){failures.push(`${keyword}: ${error instanceof Error?error.message:String(error)}`);}
    }
  }));
  return NextResponse.json({ok:failures.length===0,year,month,awardMatched:award?.matchedCount??0,deliveryMatched:matched,errors:failures},{status:failures.length?502:200});
}

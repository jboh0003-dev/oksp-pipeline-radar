import { NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const tasks = [
  {year:2024,month:10,keyword:"가상화"},
  {year:2025,month:4,keyword:"에이블스택"},
  {year:2025,month:11,keyword:"VMware"},
  {year:2026,month:8,keyword:"에이블스택"},
  {year:2026,month:9,keyword:"가상화"},
  {year:2026,month:10,keyword:"VIOLA"},
  {year:2026,month:10,keyword:"에이블스택"},
];
const base = "https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService";
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ok:false},{status:404});
  const key=process.env.G2B_SERVICE_KEY?.trim();
  if (!key) return NextResponse.json({ok:false,error:"key missing"},{status:500});
  const results=[];
  for (const t of tasks){
    const month=String(t.month).padStart(2,"0");
    const start=`${t.year}${month}01`,end=`${t.year}${month}${String(new Date(Date.UTC(t.year,t.month,0)).getUTCDate()).padStart(2,"0")}`;
    const url=buildG2bUrl(base,"getDlvrReqDtlInfoList",{
      serviceKey:key,type:"json",inqryDiv:1,inqryBgnDate:start,inqryEndDate:end,prdctIdntNoNm:t.keyword,pageNo:1,numOfRows:4,
    });
    const r=await fetchG2bApi(url,{timeoutMs:10000,retries:1,label:"shopping-readonly-verification"});
    const data=r.ok?r.data:null;
    const response=(data&&typeof data==="object"?(data as Record<string,unknown>).response:null) as Record<string,unknown>|null;
    const body=(response?.body??{}) as Record<string,unknown>;
    const raw=(body.items??{}) as Record<string,unknown>;
    const items=Array.isArray(raw)?raw:Array.isArray(raw.item)?raw.item:raw.item?[raw.item]:[];
    results.push({year:t.year,month:t.month,keyword:t.keyword,ok:r.ok,status:r.debug.status,resultCode:r.debug.resultCode,
      total:r.debug.totalCount,samples:items.slice(0,3).map((x:Record<string,unknown>)=>({
        date:x.dlvrReqRcptDate,request:x.dlvrReqNo,item:x.prdctIdntNoNm,supplier:x.corpNm,amount:x.prdctAmt,change:x.dlvrReqChgOrd
      })),error:r.ok?null:r.error.slice(0,120)});
  }
  return NextResponse.json({ok:results.every(x=>x.ok),results},{headers:{"Cache-Control":"no-store"}});
}

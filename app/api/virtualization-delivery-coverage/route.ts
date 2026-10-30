import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
export const dynamic="force-dynamic";
export async function GET(){
  const db=getSupabaseAdmin();
  if(!db)return NextResponse.json({ok:false,error:"database unavailable"},{status:503});
  const {data,error}=await db.from("virtualization_delivery_collection_coverage")
    .select("year,month,keyword,status,fetched_count,matched_count,checked_at")
    .gte("year",2024).lte("year",2026).order("year",{ascending:true}).order("month",{ascending:true});
  if(error)return NextResponse.json({ok:false,error:"coverage query failed"},{status:503});
  const rows=data??[];
  return NextResponse.json({ok:true,months:rows,baseline:{
    keyword:"가상화",expectedMonths:34,successfulMonths:rows.filter(r=>r.keyword==="가상화"&&r.status==="ok").length,
    failedMonths:rows.filter(r=>r.keyword==="가상화"&&r.status!=="ok").map(r=>r.year+"-"+String(r.month).padStart(2,"0")),
  }},{headers:{"Cache-Control":"no-store"}});
}
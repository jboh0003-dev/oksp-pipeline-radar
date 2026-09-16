import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "데이터베이스 연결을 확인할 수 없습니다." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("competitive_awards")
    .select("id,external_key,competitor,winner_name,winner_business_no,award_date,opening_at,bid_no,bid_ord,project,customer,amount,rate,category,source_label,source_url,source_type,evidence,collected_at,updated_at")
    .eq("source_type", "g2b_award")
    .order("award_date", { ascending: false, nullsFirst: false })
    .order("bid_no", { ascending: false });

  if (error) {
    console.error("[/api/competitive-awards] query failed", error);
    return NextResponse.json({ ok: false, error: "나라장터 낙찰 데이터 조회에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { addDaysYmd, kstTodayYmd } from "@/lib/g2b/competitiveAwards";
import { isRecentAward } from "@/lib/competitive/recentAwardFilter";

export const dynamic = "force-dynamic";
export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "데이터베이스 연결 실패" }, { status: 503 });
  const today = kstTodayYmd();
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await db.from("virtualization_award_candidates")
      .select("external_key,bid_no,bid_ord,award_date,winner_name,winner_business_no,project,customer,amount,category,classification,product_brand,matched_keywords,updated_at")
      .gte("award_date", addDaysYmd(today, -365)).lte("award_date", today)
      .order("award_date", { ascending: false }).range(offset, offset + 499);
    if (error) return NextResponse.json({ ok: false, error: "낙찰 자료 조회 실패" }, { status: 503 });
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
    if (offset === 9500) return NextResponse.json({ ok: false, error: "조회 한도 초과" }, { status: 422 });
  }
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isRecentAward(row, today)) continue;
    const key = [row.bid_no, row.bid_ord || "000", row.winner_business_no].join(":");
    if (!unique.has(key)) unique.set(key, { ...row, amount: Number(row.amount) });
  }
  return NextResponse.json({ ok: true, rows: [...unique.values()], asOf: today }, { headers: { "Cache-Control": "no-store" } });
}

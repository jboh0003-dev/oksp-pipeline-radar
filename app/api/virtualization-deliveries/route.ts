import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "DB connection unavailable" }, { status: 500 });
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await db.from("virtualization_delivery_items")
      .select("external_key,delivery_request_no,receipt_date,original_request_date,product_name,product_id,brand,supplier_name,supplier_business_no,customer_name,amount,classification,matched_keyword")
      .gte("receipt_date", "2024-01-01").lte("receipt_date", "2026-10-30")
      .order("receipt_date", { ascending: false }).range(offset, offset + 499);
    if (result.error) return NextResponse.json({ ok: false, error: "쇼핑몰 납품정보를 조회할 수 없습니다.", detail: result.error.message }, { status: 503 });
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) break;
    if (offset === 9500) return NextResponse.json({ ok: false, error: "납품자료가 10,000건 이상이어서 서버 페이지네이션 확장이 필요합니다." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store" } });
}

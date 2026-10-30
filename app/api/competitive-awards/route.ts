import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AwardRow = {
  customer?: string | null;
  project?: string | null;
  [key: string]: unknown;
};

function isActualAward(row: AwardRow): boolean {
  const customer = String(row.customer ?? "").trim();
  const project = String(row.project ?? "").replace(/\s+/g, " ").trim();

  // 특정 고객의 실제 낙찰/사업이 아닌 카탈로그·기본계약 등록은 경쟁 수주 건수에서 제외.
  if (customer === "각 수요기관") return false;
  if (!customer && /(제\s*3자\s*단가|3자단가|디지털서비스[_\s,]|상용SW\s*제3자단가)/i.test(project)) {
    return false;
  }
  return true;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "데이터베이스 연결을 확인할 수 없습니다." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("competitive_awards")
    .select("id,external_key,competitor,winner_name,winner_business_no,award_date,opening_at,bid_no,bid_ord,project,customer,amount,rate,category,source_label,source_url,source_type,evidence,match_type,matched_keyword,collected_at,updated_at")
    .eq("source_type", "g2b_award")
    .order("award_date", { ascending: false, nullsFirst: false })
    .order("bid_no", { ascending: false });

  if (error) {
    console.error("[/api/competitive-awards] query failed", error);
    return NextResponse.json({ ok: false, error: "나라장터 낙찰 데이터 조회에 실패했습니다." }, { status: 500 });
  }

  const rawRows = (data ?? []) as AwardRow[];
  // Product-name and winner-business-number lookups can return the same tender.
  // Identity = tender number + round + winner business number, regardless of lookup method.
  const uniqueAwards = new Map<string, AwardRow>();
  for (const row of rawRows) {
    const key = [String(row.bid_no ?? ""), String(row.bid_ord ?? "000"), String(row.winner_business_no ?? "")].join(":");
    const existing = uniqueAwards.get(key);
    if (!existing || (existing.match_type === "product" && row.match_type === "company")) {
      uniqueAwards.set(key, row);
    }
  }
  const rows = [...uniqueAwards.values()].filter(isActualAward);

  return NextResponse.json({
    ok: true,
    rows,
    rawCount: rawRows.length,
    excludedCatalogRegistrationCount: [...uniqueAwards.values()].filter((row) => !isActualAward(row)).length,
    duplicateLookupCount: rawRows.length - uniqueAwards.size,
  });
}
